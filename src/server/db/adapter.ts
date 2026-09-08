/**
 * Database Abstraction Layer for Sphere Social
 * Seamlessly abstracts Cloudflare D1 and persistent SQLite
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
 * Node.js SQLite Persistent Adapter (using node:sqlite built-in)
 * Guarantees real persistence across server restarts without in-memory or localStorage hacks.
 */
let sqliteInstance: any = null;

export class NodeSqliteAdapter implements DatabaseAdapter {
  private db: any;

  constructor(dbPath: string = './data/sphere.db') {
    if (!sqliteInstance) {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new DatabaseSync(dbPath);
      // Enable WAL mode for better concurrency and performance
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA foreign_keys = ON;');
      sqliteInstance = this.db;
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
        try {
          const statement = db.prepare(sql);
          const results = statement.all(...boundValues) as T[];
          return { results, success: true };
        } catch (error: any) {
          console.error('[SQL Error in all()]:', error.message, 'SQL:', sql);
          throw error;
        }
      },
      async first<T = any>(colName?: string): Promise<T | null> {
        try {
          const statement = db.prepare(sql);
          const row = statement.get(...boundValues) as any;
          if (!row) return null;
          if (colName) return row[colName] ?? null;
          return row as T;
        } catch (error: any) {
          console.error('[SQL Error in first()]:', error.message, 'SQL:', sql);
          throw error;
        }
      },
      async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
        try {
          const statement = db.prepare(sql);
          const result = statement.run(...boundValues);
          return {
            success: true,
            meta: {
              changes: Number(result.changes || 0),
              last_row_id: Number(result.lastInsertRowid || 0),
            },
          };
        } catch (error: any) {
          console.error('[SQL Error in run()]:', error.message, 'SQL:', sql);
          throw error;
        }
      },
    };

    return stmtObj;
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }
}

/**
 * Factory to obtain the database adapter based on runtime environment
 */
export function getDatabaseAdapter(env?: any): DatabaseAdapter {
  if (env && env.DB) {
    return new D1DatabaseAdapter(env.DB);
  }
  const dbPath = (typeof process !== 'undefined' && process.env?.SQLITE_DB_PATH) || './data/sphere.db';
  return new NodeSqliteAdapter(dbPath);
}
