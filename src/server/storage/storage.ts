/**
 * Storage Abstraction Layer for Sphere Social
 * Designed around Cloudflare R2 with image-only enforcement.
 * Never stores media inside frontend code, git, Netlify bundles, or D1 blobs.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface StorageProvider {
  put(key: string, data: Uint8Array | Buffer, contentType: string): Promise<{ key: string; url: string }>;
  get(key: string): Promise<{ data: Uint8Array | Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateImageUpload(contentType: string, sizeBytes: number): { valid: boolean; error?: string } {
  // Enforce strictly NO videos as specified in requirements
  if (contentType.startsWith('video/')) {
    return {
      valid: false,
      error: 'Video uploads are not supported in this version. Image uploads only.',
    };
  }

  if (!ALLOWED_MIME_TYPES.has(contentType.toLowerCase())) {
    return {
      valid: false,
      error: `Unsupported format. Allowed image formats: JPG, PNG, WEBP, GIF.`,
    };
  }

  if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image size exceeds the 5MB maximum limit (${(sizeBytes / (1024 * 1024)).toFixed(1)}MB).`,
    };
  }

  return { valid: true };
}

/**
 * Cloudflare R2 S3 REST API Storage Adapter (AWS SigV4 via Web Crypto)
 * Enables direct R2 integration outside of Workers runtime using R2 API credentials
 */
export class CloudflareR2S3StorageProvider implements StorageProvider {
  constructor(
    private accountId: string,
    private accessKeyId: string,
    private secretAccessKey: string,
    private bucket: string,
    private publicBaseUrl?: string
  ) {}

  private async sha256(data: Uint8Array | string): Promise<string> {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
    return new Uint8Array(sig);
  }

  private async signRequest(method: string, key: string, payload: Uint8Array, contentType?: string): Promise<{ headers: Record<string, string>; url: string }> {
    const endpoint = `https://${this.accountId}.r2.cloudflarestorage.com`;
    const host = `${this.accountId}.r2.cloudflarestorage.com`;
    const now = new Date();
    const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateOnly = date.slice(0, 8);
    const region = 'auto';
    const service = 's3';

    const payloadHash = await this.sha256(payload);
    const canonicalUri = `/${this.bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;

    let canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${date}\n`;
    let signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    if (contentType) {
      canonicalHeaders = `content-type:${contentType}\n` + canonicalHeaders;
      signedHeaders = 'content-type;' + signedHeaders;
    }

    const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const scope = `${dateOnly}/${region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${await this.sha256(canonicalRequest)}`;

    const kSecret = new TextEncoder().encode('AWS4' + this.secretAccessKey);
    const kDate = await this.hmac(kSecret, dateOnly);
    const kRegion = await this.hmac(kDate, region);
    const kService = await this.hmac(kRegion, service);
    const kSigning = await this.hmac(kService, 'aws4_request');
    const signatureBytes = await this.hmac(kSigning, stringToSign);
    const signature = Array.from(signatureBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers: Record<string, string> = {
      host,
      'x-amz-date': date,
      'x-amz-content-sha256': payloadHash,
      Authorization: authHeader,
    };
    if (contentType) {
      headers['content-type'] = contentType;
    }

    return { headers, url: `${endpoint}${canonicalUri}` };
  }

  async put(key: string, data: Uint8Array | Buffer, contentType: string): Promise<{ key: string; url: string }> {
    const rawData = data instanceof Uint8Array ? data : new Uint8Array(data);
    const { headers, url } = await this.signRequest('PUT', key, rawData, contentType);

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: rawData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[R2 S3 Put Error]:', response.status, errText);
      throw new Error(`Failed to upload to Cloudflare R2: ${response.status} ${response.statusText}`);
    }

    const publicUrl = this.getPublicUrl(key);
    return { key, url: publicUrl };
  }

  async get(key: string): Promise<{ data: Uint8Array | Buffer; contentType: string } | null> {
    const { headers, url } = await this.signRequest('GET', key, new Uint8Array(0));
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Failed to read from Cloudflare R2: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    return { data: new Uint8Array(arrayBuffer), contentType };
  }

  async delete(key: string): Promise<void> {
    const { headers, url } = await this.signRequest('DELETE', key, new Uint8Array(0));
    await fetch(url, {
      method: 'DELETE',
      headers,
    });
  }

  getPublicUrl(key: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    }
    return `/api/storage/${key}`;
  }
}

/**
 * Cloudflare R2 Storage Adapter
 * Used when running in Cloudflare Workers with `env.R2`
 */
export class CloudflareR2StorageProvider implements StorageProvider {
  constructor(private r2: any, private publicBaseUrl?: string) {}

  async put(key: string, data: Uint8Array | Buffer, contentType: string): Promise<{ key: string; url: string }> {
    await this.r2.put(key, data, {
      httpMetadata: { contentType },
    });
    const url = this.getPublicUrl(key);
    return { key, url };
  }

  async get(key: string): Promise<{ data: Uint8Array | Buffer; contentType: string } | null> {
    const object = await this.r2.get(key);
    if (!object) return null;
    const arrayBuffer = await object.arrayBuffer();
    const contentType = object.httpMetadata?.contentType || 'image/jpeg';
    return { data: new Uint8Array(arrayBuffer), contentType };
  }

  async delete(key: string): Promise<void> {
    await this.r2.delete(key);
  }

  getPublicUrl(key: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    }
    return `/api/storage/${key}`;
  }
}

/**
 * Persistent Local Storage Provider
 * Persists files directly to the filesystem disk at `./data/uploads/`
 * Outside of source code, git, or database blobs.
 */
export class PersistentDiskStorageProvider implements StorageProvider {
  private uploadsDir: string;
  private memoryFallback: Map<string, { data: Uint8Array | Buffer; contentType: string }> = new Map();

  constructor(uploadsDir?: string) {
    const isServerless = Boolean(
      (typeof process !== 'undefined' && (
        process.env.NETLIFY ||
        process.env.AWS_LAMBDA_FUNCTION_NAME ||
        process.env.LAMBDA_TASK_ROOT ||
        process.env.VERCEL ||
        (typeof process.cwd === 'function' && process.cwd().includes('/var/task')) ||
        (fs.existsSync('/tmp') && !fs.existsSync('./data'))
      ))
    );

    this.uploadsDir = uploadsDir || (isServerless ? '/tmp/uploads' : './data/uploads');
    try {
      if (!fs.existsSync(this.uploadsDir)) {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
      }
    } catch (err: any) {
      console.warn('[Sphere Storage Notice]: Could not create uploads directory, using memory fallback:', err.message);
    }
  }

  async put(key: string, data: Uint8Array | Buffer, contentType: string): Promise<{ key: string; url: string }> {
    try {
      const filePath = path.join(this.uploadsDir, key);
      const metaPath = path.join(this.uploadsDir, `${key}.meta`);

      fs.writeFileSync(filePath, data);
      fs.writeFileSync(metaPath, JSON.stringify({ contentType, createdAt: Date.now() }));
    } catch {
      // Fallback to in-memory map
      this.memoryFallback.set(key, { data, contentType });
    }

    const url = this.getPublicUrl(key);
    return { key, url };
  }

  async get(key: string): Promise<{ data: Uint8Array | Buffer; contentType: string } | null> {
    try {
      const filePath = path.join(this.uploadsDir, key);
      const metaPath = path.join(this.uploadsDir, `${key}.meta`);

      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        let contentType = 'image/jpeg';
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            contentType = meta.contentType || contentType;
          } catch {
            // ignore
          }
        }
        return { data: buffer, contentType };
      }
    } catch {
      // fallback to memory
    }

    const inMemory = this.memoryFallback.get(key);
    if (inMemory) {
      return inMemory;
    }

    return null;
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = path.join(this.uploadsDir, key);
      const metaPath = path.join(this.uploadsDir, `${key}.meta`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    } catch {
      // ignore
    }
    this.memoryFallback.delete(key);
  }

  getPublicUrl(key: string): string {
    return `/api/storage/${key}`;
  }
}

export function getStorageProvider(env?: any): StorageProvider {
  const e = env || (typeof process !== 'undefined' ? process.env : {});

  // 1. Native Cloudflare Workers R2 binding
  if (e?.R2 && typeof e.R2.put === 'function') {
    return new CloudflareR2StorageProvider(e.R2, e.R2_PUBLIC_URL);
  }

  // 2. Real Cloudflare R2 S3 REST API (verified via Cloudflare S3 credentials)
  if (e?.R2_ACCESS_KEY_ID && e?.R2_SECRET_ACCESS_KEY && e?.R2_ACCOUNT_ID && e?.R2_BUCKET_NAME) {
    return new CloudflareR2S3StorageProvider(
      e.R2_ACCOUNT_ID,
      e.R2_ACCESS_KEY_ID,
      e.R2_SECRET_ACCESS_KEY,
      e.R2_BUCKET_NAME,
      e.R2_PUBLIC_URL
    );
  }

  // 3. Persistent disk storage fallback
  return new PersistentDiskStorageProvider();
}
