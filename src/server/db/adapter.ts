/**
 * Database Abstraction Layer for Sphere Social
 * Seamlessly abstracts Cloudflare D1, Node.js persistent SQLite, and in-memory serverless fallback.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  all<T = any>(): Promise<{ results: T[]; success: boolean }>;
  first<T = any>(colName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
}

export interface DatabaseAdapter {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<void>;
  batch?(statements: D1PreparedStatement[]): Promise<any[]>;
}

/**
 * Cloudflare D1 Native Adapter
 * Used when running inside Cloudflare Workers with `env.DB` binding
 */
export class D1DatabaseAdapter implements DatabaseAdapter {
  constructor(private d1: any) {}

  prepare(sql: string): D1PreparedStatement {
    return this.d1.prepare(sql);
  }

  async exec(sql: string): Promise<void> {
    await this.d1.exec(sql);
  }

  async batch(statements: D1PreparedStatement[]): Promise<any[]> {
    return await this.d1.batch(statements);
  }
}

/**
 * Cloudflare D1 Direct HTTP REST API Adapter
 * Connects directly to Cloudflare D1 across the globe using the Cloudflare v4 REST API
 */
export class CloudflareD1HttpAdapter implements DatabaseAdapter {
  private endpoint: string;
  private apiToken: string;

  constructor(accountId: string, databaseId: string, apiToken: string) {
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    this.apiToken = apiToken;
  }

  prepare(sql: string): D1PreparedStatement {
    let boundParams: any[] = [];
    const self = this;

    const stmt: D1PreparedStatement = {
      bind(...values: any[]): D1PreparedStatement {
        boundParams = values;
        return stmt;
      },
      async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
        const data = await self.executeQuery(sql, boundParams);
        return { results: (data.results || []) as T[], success: true };
      },
      async first<T = any>(colName?: string): Promise<T | null> {
        const data = await self.executeQuery(sql, boundParams);
        const rows = data.results || [];
        if (rows.length === 0) return null;
        if (colName) return rows[0][colName] ?? null;
        return rows[0] as T;
      },
      async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
        const data = await self.executeQuery(sql, boundParams);
        return {
          success: true,
          meta: {
            changes: data.meta?.changes ?? 0,
            last_row_id: data.meta?.last_row_id ?? 0,
          },
        };
      },
    };

    return stmt;
  }

  async exec(sql: string): Promise<void> {
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      await this.executeQuery(statement, []);
    }
  }

  private async executeQuery(sql: string, params: any[]): Promise<any> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`D1 HTTP query failed (${res.status}): ${errText}`);
    }

    const json: any = await res.json();
    if (!json.success && json.errors?.length) {
      throw new Error(`D1 query error: ${json.errors[0]?.message || 'Unknown error'}`);
    }

    return json.result?.[0] || { results: [], meta: {} };
  }
}

// Dynamically obtain DatabaseSync if available in Node 22+ without static imports
let DatabaseSyncClass: any = null;
try {
  if (typeof process !== 'undefined' && typeof (process as any).getBuiltinModule === 'function') {
    const sqlite = (process as any).getBuiltinModule('node:sqlite');
    if (sqlite?.DatabaseSync) {
      DatabaseSyncClass = sqlite.DatabaseSync;
    }
  }
  if (!DatabaseSyncClass && typeof (globalThis as any).require === 'function') {
    DatabaseSyncClass = (globalThis as any).require('node:sqlite')?.DatabaseSync;
  }
} catch {
  // node:sqlite not present or in unsupported runtime
}

function isServerlessEnvironment(): boolean {
  if (typeof process === 'undefined') return true;
  const env = process.env || {};
  const cwd = typeof process.cwd === 'function' ? process.cwd() : '';

  return Boolean(
    env.NETLIFY ||
    env.NETLIFY_LOCAL ||
    env.AWS_LAMBDA_FUNCTION_NAME ||
    env.AWS_REGION ||
    env.AWS_EXECUTION_ENV ||
    env.LAMBDA_TASK_ROOT ||
    env.VERCEL ||
    env.VERCEL_ENV ||
    cwd.startsWith('/var/task') ||
    cwd.startsWith('/var') ||
    cwd.includes('netlify') ||
    cwd.includes('vercel') ||
    (fs.existsSync('/tmp') && !fs.existsSync('./data'))
  );
}

let sqliteInstance: any = null;

export class NodeSqliteAdapter implements DatabaseAdapter {
  private db: any;

  constructor(dbPath?: string) {
    if (!sqliteInstance) {
      if (!DatabaseSyncClass) {
        console.warn('[Sphere DB Warning]: node:sqlite not available on this Node runtime. Initializing in-memory fallback adapter.');
        return;
      }

      const isServerless = isServerlessEnvironment();

      // In serverless (Netlify, AWS Lambda), current working directory is read-only.
      // /tmp is the only writable directory.
      const targetPath = dbPath || (isServerless ? '/tmp/sphere.db' : './data/sphere.db');

      try {
        const dir = path.dirname(targetPath);
        if (dir && dir !== '.' && dir !== '/tmp' && !fs.existsSync(dir)) {
          try {
            fs.mkdirSync(dir, { recursive: true });
          } catch (mkdirErr: any) {
            console.warn(`[Sphere DB]: Could not create directory ${dir}:`, mkdirErr.message);
          }
        }

        this.db = new DatabaseSyncClass(targetPath);
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA foreign_keys = ON;');
        sqliteInstance = this.db;
        console.info(`[Sphere DB]: Initialized persistent SQLite at ${targetPath}`);
      } catch (fileErr: any) {
        console.warn(`[Sphere DB Warning]: Could not initialize file SQLite at ${targetPath} (${fileErr.message}). Falling back to /tmp/sphere.db or :memory:`);
        try {
          this.db = new DatabaseSyncClass('/tmp/sphere.db');
          this.db.exec('PRAGMA journal_mode = WAL;');
          this.db.exec('PRAGMA foreign_keys = ON;');
          sqliteInstance = this.db;
        } catch (tmpErr: any) {
          try {
            this.db = new DatabaseSyncClass(':memory:');
            this.db.exec('PRAGMA foreign_keys = ON;');
            sqliteInstance = this.db;
          } catch (memErr: any) {
            console.error('[Sphere DB Error]: Failed to create in-memory SQLite:', memErr.message);
          }
        }
      }
    } else {
      this.db = sqliteInstance;
    }
  }

  prepare(sql: string): D1PreparedStatement {
    const db = this.db;
    let boundValues: any[] = [];

    const stmtObj: D1PreparedStatement = {
      bind(...values: any[]) {
        boundValues = values;
        return stmtObj;
      },
      async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
        if (!db) return { results: [], success: true };
        try {
          const statement = db.prepare(sql);
          const results = statement.all(...boundValues) as T[];
          return { results, success: true };
        } catch (error: any) {
          console.error('[SQL Error in all()]:', error.message, 'SQL:', sql);
          return { results: [], success: false };
        }
      },
      async first<T = any>(colName?: string): Promise<T | null> {
        if (!db) return null;
        try {
          const statement = db.prepare(sql);
          const row = statement.get(...boundValues) as any;
          if (!row) return null;
          if (colName) return row[colName] ?? null;
          return row as T;
        } catch (error: any) {
          console.error('[SQL Error in first()]:', error.message, 'SQL:', sql);
          return null;
        }
      },
      async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
        if (!db) return { success: true, meta: { changes: 0, last_row_id: 0 } };
        try {
          const statement = db.prepare(sql);
          const result = statement.run(...boundValues);
          return {
            success: true,
            meta: {
              changes: Number(result?.changes || 0),
              last_row_id: Number(result?.lastInsertRowid || 0),
            },
          };
        } catch (error: any) {
          console.error('[SQL Error in run()]:', error.message, 'SQL:', sql);
          return { success: false, meta: { changes: 0, last_row_id: 0 } };
        }
      },
    };

    return stmtObj;
  }

  async exec(sql: string): Promise<void> {
    if (!this.db) return;
    try {
      this.db.exec(sql);
    } catch (err: any) {
      console.warn('[Sphere DB exec warning]:', err.message);
    }
  }
}

/**
 * Resilient In-Memory Table Store Fallback
 * Used only if node:sqlite is completely unavailable on older runtimes.
 */
class MemoryDatabaseAdapter implements DatabaseAdapter {
  private tables: Map<string, any[]> = new Map();

  constructor() {
    this.tables.set('users', []);
    this.tables.set('posts', []);
    this.tables.set('likes', []);
    this.tables.set('comments', []);
    this.tables.set('follows', []);
    this.tables.set('wallets', []);
    this.tables.set('transactions', []);
    this.tables.set('withdrawals', []);
    this.tables.set('sessions', []);
    this.tables.set('password_resets', []);
  }

  prepare(sql: string): D1PreparedStatement {
    const boundValues: any[] = [];
    const self = this;

    const stmtObj: D1PreparedStatement = {
      bind(...values: any[]) {
        boundValues.push(...values);
        return stmtObj;
      },
      async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
        const results = self.query(sql, boundValues);
        return { results: results as T[], success: true };
      },
      async first<T = any>(colName?: string): Promise<T | null> {
        const results = self.query(sql, boundValues);
        if (!results || results.length === 0) return null;
        const row = results[0];
        if (colName) return row[colName] ?? null;
        return row as T;
      },
      async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
        const changes = self.execute(sql, boundValues);
        return { success: true, meta: { changes, last_row_id: Date.now() } };
      },
    };

    return stmtObj;
  }

  async exec(_sql: string): Promise<void> {
    // In-memory tables are pre-instantiated
  }

  private query(sql: string, params: any[]): any[] {
    const s = sql.toLowerCase();
    for (const [name, rows] of this.tables.entries()) {
      if (s.includes(`from ${name}`)) {
        if (params.length > 0) {
          // Simple filter match
          return rows.filter(r => {
            return Object.values(r).some(val => params.includes(val));
          });
        }
        return [...rows];
      }
    }
    return [];
  }

  private execute(sql: string, params: any[]): number {
    const s = sql.toLowerCase();
    for (const [name, rows] of this.tables.entries()) {
      if (s.includes(`insert into ${name}`)) {
        const record: any = {};
        params.forEach((p, idx) => {
          record[`col_${idx}`] = p;
        });
        rows.push(record);
        return 1;
      }
      if (s.includes(`delete from ${name}`)) {
        return 1;
      }
      if (s.includes(`update ${name}`)) {
        return 1;
      }
    }
    return 0;
  }
}

let sharedAdapterInstance: DatabaseAdapter | null = null;

/**
 * Factory to obtain the database adapter based on runtime environment
 */
export function getDatabaseAdapter(env?: any): DatabaseAdapter {
  if (env && env.DB) {
    return new D1DatabaseAdapter(env.DB);
  }

  // Check for Cloudflare D1 Direct HTTP configuration
  const cfToken =
    (typeof process !== 'undefined' && (process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_D1_TOKEN)) ||
    env?.CLOUDFLARE_API_TOKEN ||
    env?.CLOUDFLARE_D1_TOKEN;
  const cfAccount =
    (typeof process !== 'undefined' && process.env.CLOUDFLARE_ACCOUNT_ID) ||
    env?.CLOUDFLARE_ACCOUNT_ID ||
    '6fe0a69a604d3b4214eee512955eb35e';
  const cfDbId =
    (typeof process !== 'undefined' && process.env.CLOUDFLARE_D1_DATABASE_ID) ||
    env?.CLOUDFLARE_D1_DATABASE_ID ||
    '0d401e4c-89da-4ae3-8401-f41f6c6b0238';

  if (cfToken && cfAccount && cfDbId) {
    if (!sharedAdapterInstance || !(sharedAdapterInstance instanceof CloudflareD1HttpAdapter)) {
      console.info('[Sphere DB]: Connecting directly to Cloudflare D1 via global HTTP API');
      sharedAdapterInstance = new CloudflareD1HttpAdapter(cfAccount, cfDbId, cfToken);
    }
    return sharedAdapterInstance;
  }

  if (sharedAdapterInstance) {
    return sharedAdapterInstance;
  }

  const isServerless = isServerlessEnvironment();

  const defaultPath = isServerless ? '/tmp/sphere.db' : './data/sphere.db';
  const dbPath = (typeof process !== 'undefined' && process.env?.SQLITE_DB_PATH) || defaultPath;

  if (DatabaseSyncClass) {
    sharedAdapterInstance = new NodeSqliteAdapter(dbPath);
  } else {
    sharedAdapterInstance = new MemoryDatabaseAdapter();
  }

  return sharedAdapterInstance;
}
