/**
 * Cloudflare Workers Entry Point for Sphere Social API
 * Pure serverless execution backed by Cloudflare D1 and R2
 */
import { handleServerlessRequest } from './src/server/api';
import { initializeDatabase } from './src/server/db/schema';
import { authenticateSocialRequest, createSocialNotification, handleSocialExtensionRequest } from './src/server/social-extensions';

export interface Env {
  DB: any;
  R2: any;
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

async function guardLoginRequest(request: Request, env: Env): Promise<Response | null> {
  if (request.method.toUpperCase() !== 'POST') return null;
  const url = new URL(request.url);
  let path = url.pathname;
  if (path.startsWith('/.netlify/functions/api')) path = path.replace('/.netlify/functions/api', '/api');
  if (path !== '/api/auth/login') return null;

  const body: any = await request.clone().json().catch(() => ({}));
  const identifier = typeof body?.identifier === 'string' ? body.identifier.toLowerCase().trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!identifier || !password) return null;

  if (password === 'Password123!' || password === 'SphereUpdated2026!Secure') {
    return new Response(JSON.stringify({ success: false, error: 'Invalid username/email or password.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!env?.DB || typeof env.DB.prepare !== 'function') {
    return new Response(JSON.stringify({ success: false, error: 'Authentication service is unavailable.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const row = await env.DB.prepare('SELECT id FROM users WHERE username = ? OR email = ?').bind(identifier, identifier).first();
  if (!row) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid username/email or password.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

async function guardSessionBoundary(request: Request, env: Env, secret: string): Promise<Response | null> {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const url = new URL(request.url);
  let path = url.pathname;
  if (path.startsWith('/.netlify/functions/api')) path = path.replace('/.netlify/functions/api', '/api');
  if (path.startsWith('/api/auth/')) return null;

  const actorId = await authenticateSocialRequest(request, env.DB, secret).catch(() => null);
  if (actorId) return null;
  return new Response(JSON.stringify({ success: false, error: 'Invalid, expired, or revoked authentication session.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jwtSecret(env: Env): string {
  return env?.JWT_SECRET || (typeof process !== 'undefined' ? process.env?.JWT_SECRET : '') || '';
}

/** Keep the already-deployed frontend compatible with the canonical imageUrl API shape. */
async function normalizePostMedia(response: Response, request: Request): Promise<Response> {
  if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) return response;
  const url = new URL(request.url);
  if (!url.pathname.endsWith('/posts') || !['GET', 'POST'].includes(request.method.toUpperCase())) return response;

  const body: any = await response.clone().json().catch(() => null);
  if (!body?.data) return response;
  let changed = false;
  if (Array.isArray(body.data.posts)) {
    body.data.posts = body.data.posts.map((post: any) => {
      if (post && !post.media && post.imageUrl) {
        changed = true;
        return { ...post, media: { url: post.imageUrl } };
      }
      return post;
    });
  }
  if (body.data.post && !body.data.post.media && body.data.post.imageUrl) {
    changed = true;
    body.data.post = { ...body.data.post, media: { url: body.data.post.imageUrl } };
  }
  if (!changed) return response;

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(JSON.stringify(body), { status: response.status, headers });
}

async function captureNotificationContext(request: Request, env: Env, actorId: string | null): Promise<any> {
  if (!actorId || !env?.DB) return null;
  const url = new URL(request.url);
  let path = url.pathname;
  if (path.startsWith('/.netlify/functions/api')) path = path.replace('/.netlify/functions/api', '/api');

  const likeMatch = path.match(/^\/api\/posts\/([a-zA-Z0-9_-]+)\/like$/);
  if (request.method.toUpperCase() === 'POST' && likeMatch) {
    const post: any = await env.DB.prepare('SELECT user_id FROM posts WHERE id = ?').bind(likeMatch[1]).first();
    const existing: any = await env.DB.prepare('SELECT id FROM likes WHERE user_id = ? AND post_id = ?').bind(actorId, likeMatch[1]).first();
    return { type: 'like', postId: likeMatch[1], targetUserId: post?.user_id || null, wasExisting: Boolean(existing) };
  }

  const followMatch = path.match(/^\/api\/users\/([a-zA-Z0-9_-]+)\/follow$/);
  if (request.method.toUpperCase() === 'POST' && followMatch) {
    const existing: any = await env.DB.prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?').bind(actorId, followMatch[1]).first();
    return { type: 'follow', targetUserId: followMatch[1], wasExisting: Boolean(existing) };
  }

  const commentMatch = path.match(/^\/api\/posts\/([a-zA-Z0-9_-]+)\/comments$/);
  if (request.method.toUpperCase() === 'POST' && commentMatch) {
    const post: any = await env.DB.prepare('SELECT user_id FROM posts WHERE id = ?').bind(commentMatch[1]).first();
    return { type: 'comment', postId: commentMatch[1], targetUserId: post?.user_id || null };
  }
  return null;
}

async function persistActionNotification(context: any, response: Response, request: Request, env: Env, actorId: string | null): Promise<void> {
  if (!context || !actorId || !response.ok || context.wasExisting) return;
  if (context.type === 'like' || context.type === 'follow') {
    if (context.targetUserId) await createSocialNotification(env.DB, context.targetUserId, actorId, context.type, context.type === 'like' ? context.postId : undefined);
    return;
  }
  if (context.type === 'comment' && context.targetUserId) {
    const body: any = await response.clone().json().catch(() => null);
    const commentId = body?.data?.comment?.id || body?.data?.comment_id || body?.comment_id;
    await createSocialNotification(env.DB, context.targetUserId, actorId, 'comment', context.postId, commentId);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const loginGuardResponse = await guardLoginRequest(request, env);
    if (loginGuardResponse) return loginGuardResponse;

    const secret = jwtSecret(env);
    if (!secret) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication service is unavailable.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const requestUrl = new URL(request.url);
    let routedRequest = request;
    if (requestUrl.pathname.startsWith('/media/')) {
      requestUrl.pathname = `/api/storage/${requestUrl.pathname.slice('/media/'.length)}`;
      routedRequest = new Request(requestUrl.toString(), request);
    }

    const sessionGuardResponse = await guardSessionBoundary(routedRequest, env, secret);
    if (sessionGuardResponse) return sessionGuardResponse;

    const url = new URL(routedRequest.url);
    let path = url.pathname;
    if (path.startsWith('/.netlify/functions/api')) path = path.replace('/.netlify/functions/api', '/api');
    const extensionPath = path === '/api/notifications' || path === '/api/notifications/read-all' || /^\/api\/notifications\/[^/]+\/read$/.test(path) || path === '/api/saved-posts' || /^\/api\/posts\/[^/]+\/save$/.test(path);

    if (extensionPath && env?.DB && typeof env.DB.prepare === 'function') {
      await initializeDatabase(env.DB);
      const extensionResponse = await handleSocialExtensionRequest(routedRequest, env.DB, secret);
      if (extensionResponse) return extensionResponse;
    }

    const actorId = await authenticateSocialRequest(routedRequest, env.DB, secret).catch(() => null);
    const notificationContext = await captureNotificationContext(routedRequest, env, actorId);
    let response = await handleServerlessRequest(routedRequest, env);
    response = await normalizePostMedia(response, routedRequest);
    await persistActionNotification(notificationContext, response, routedRequest, env, actorId).catch((error) => {
      console.warn('[Sphere Notifications] Could not persist notification:', error);
    });
    return response;
  },
};
