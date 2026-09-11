/**
 * Cloudflare Workers Entry Point for Sphere Social API
 * Pure serverless execution backed by Cloudflare D1 and R2
 */
import { handleServerlessRequest } from './src/server/api';

export interface Env {
  DB: any; // Cloudflare D1 Binding
  R2: any; // Cloudflare R2 Binding
  JWT_SECRET: string;
  JWT_REFRESH_SECRET?: string;
  R2_PUBLIC_URL?: string;
  ADGEM_APP_ID?: string;
  ADGEM_API_KEY?: string;
  OFFERWALL_KEY?: string;
  ESRNB_APP_ID?: string;
  ESRNB_API_KEY?: string;
  MUSIC_API_KEY?: string;
  MUSIC_API_URL?: string;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
}

/**
 * The deployed Worker is the production API boundary. Keep the legacy API
 * implementation intact for now, but explicitly block its two unsafe login
 * fallbacks before the request reaches the route handler:
 *   1. a login for an identifier that does not already exist in D1
 *   2. the historical hard-coded master/reset passwords
 *
 * Registration remains the only supported path for creating an account.
 */
async function guardLoginRequest(request: Request, env: Env): Promise<Response | null> {
  if (request.method.toUpperCase() !== 'POST') return null;

  const url = new URL(request.url);
  let path = url.pathname;
  if (path.startsWith('/.netlify/functions/api')) {
    path = path.replace('/.netlify/functions/api', '/api');
  }
  if (path !== '/api/auth/login') return null;

  const body: any = await request.clone().json().catch(() => ({}));
  const identifier = typeof body?.identifier === 'string' ? body.identifier.toLowerCase().trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!identifier || !password) return null;

  if (password === 'Password123!' || password === 'SphereUpdated2026!Secure') {
    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid username/email or password.',
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  if (!env?.DB || typeof env.DB.prepare !== 'function') {
    return new Response(JSON.stringify({
      success: false,
      error: 'Authentication service is unavailable.',
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  const row = await env.DB
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .bind(identifier, identifier)
    .first();

  if (!row) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid username/email or password.',
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const loginGuardResponse = await guardLoginRequest(request, env);
    if (loginGuardResponse) return loginGuardResponse;

    return handleServerlessRequest(request, env);
  },
};
