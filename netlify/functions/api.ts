import { handleServerlessRequest } from '../../src/server/api';

const ALLOWED_BROWSER_ORIGINS = new Set([
  'https://spheres.com.ng',
  'https://sphereis.netlify.app',
]);

function normalizeWorkerCors(response: Response, request: Request): Response {
  const origin = request.headers.get('Origin') || '';
  if (!ALLOWED_BROWSER_ORIGINS.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Netlify Functions v2 Entry Point for Sphere Social API
 *
 * The Cloudflare Worker is authoritative for the production API. Netlify is
 * retained as the compatibility/proxy boundary for the production frontend.
 * Provider callbacks must never silently fall through to the SPA when the
 * Worker proxy is unavailable.
 */
export default async (req: Request) => {
  try {
    const url = new URL(req.url);
    let apiPath = url.pathname;
    if (apiPath.startsWith('/.netlify/functions/api')) apiPath = apiPath.replace('/.netlify/functions/api', '/api');

    const isProviderCallback = apiPath === '/api/cpal_postback' || /^\/api\/earn\/postback\/(cpalead|cpagrip)$/.test(apiPath);
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    let bodyBuffer: ArrayBuffer | undefined;
    if (hasBody) bodyBuffer = await req.arrayBuffer();

    const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
    if (workerUrl) {
      try {
        const target = `${workerUrl.replace(/\/$/, '')}${apiPath}${url.search}`;
        const proxyHeaders = new Headers(req.headers);
        proxyHeaders.set('host', new URL(workerUrl).host);
        if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
          proxyHeaders.set('CF-Access-Client-Id', process.env.CF_ACCESS_CLIENT_ID);
          proxyHeaders.set('CF-Access-Client-Secret', process.env.CF_ACCESS_CLIENT_SECRET);
        }

        const res = await fetch(target, {
          method: req.method,
          headers: proxyHeaders,
          body: bodyBuffer,
          redirect: 'manual',
        });
        const locationHeader = res.headers.get('location') || '';
        const isAccessRedirect = res.status === 302 || locationHeader.includes('cloudflareaccess.com');

        if (!isAccessRedirect && res.status < 500) return normalizeWorkerCors(res, req);

        if (isProviderCallback) {
          return new Response(JSON.stringify({ success: false, error: 'Reward provider callback could not reach the Cloudflare Worker.', origin: 'netlify-worker-proxy' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          });
        }
      } catch (proxyErr: any) {
        console.warn('[Netlify Worker Proxy Error]:', proxyErr.message);
        if (isProviderCallback) {
          return new Response(JSON.stringify({ success: false, error: 'Reward provider callback could not reach the Cloudflare Worker.', origin: 'netlify-worker-proxy' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          });
        }
      }
    } else if (isProviderCallback) {
      return new Response(JSON.stringify({ success: false, error: 'Reward provider callback is not connected to the Cloudflare Worker.', origin: 'netlify-worker-proxy' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const finalReq = hasBody ? new Request(req.url, { method: req.method, headers: req.headers, body: bodyBuffer }) : req;
    return await handleServerlessRequest(finalReq, process.env);
  } catch (fatalErr: any) {
    console.error('[Netlify Function Fatal Error]:', fatalErr);
    return new Response(JSON.stringify({ success: false, error: fatalErr.message || 'Server encountered an unexpected error', origin: 'netlify-function-guard' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      },
    });
  }
};

export const config = { path: ['/api/*', '/.netlify/functions/api/*'] };
