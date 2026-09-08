/**
 * Web Crypto standard cryptographic functions for authentication
 * Works natively in both Cloudflare Workers edge environment and Node.js.
 */

// Helper: convert string to Uint8Array
function strToBuf(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Helper: convert ArrayBuffer to base64url string
function bufToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Helper: convert base64url to Uint8Array
function base64UrlToBuf(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate a cryptographically secure random ID or token
 */
export function generateId(length: number = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 hex hash using standard Web Crypto
 */
export async function sha256Hash(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', strToBuf(str));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash password with PBKDF2 using SHA-256 and a random salt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    strToBuf(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');

  return `${saltHex}:${hashHex}`;
}

/**
 * Verify password against stored PBKDF2 hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const [saltHex, expectedHashHex] = parts;
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    strToBuf(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const computedHashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Constant-time comparison
  if (computedHashHex.length !== expectedHashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHashHex.length; i++) {
    diff |= computedHashHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Sign a JWT token using HMAC-SHA256
 */
export async function signJwt(payload: Record<string, any>, secret: string, expiresInSec: number = 86400 * 7): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSec,
  };

  const headerB64 = bufToBase64Url(strToBuf(JSON.stringify(header)));
  const payloadB64 = bufToBase64Url(strToBuf(JSON.stringify(fullPayload)));
  const dataToSign = `${headerB64}.${payloadB64}`;

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    strToBuf(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, strToBuf(dataToSign));
  const signatureB64 = bufToBase64Url(signature);

  return `${dataToSign}.${signatureB64}`;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyJwt<T = any>(token: string, secret: string): Promise<T | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const dataToSign = `${headerB64}.${payloadB64}`;

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      strToBuf(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = base64UrlToBuf(signatureB64);
    const isValid = await crypto.subtle.verify('HMAC', cryptoKey, signature, strToBuf(dataToSign));
    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlToBuf(payloadB64));
    const payload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }

    return payload as T;
  } catch {
    return null;
  }
}
