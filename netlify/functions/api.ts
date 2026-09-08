import { handleServerlessRequest } from '../../src/server/api';

/**
 * Netlify Functions v2 Entry Point for Sphere Social API
 * Handles all /api/* routes natively on Netlify.
 * If CLOUDFLARE_WORKER_URL is provided in environment variables, it proxies to the Worker.
 * Otherwise, it executes the authoritative serverless API handler with error isolation.
 */
export default async (req: Request) => {
  try {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    let bodyBuffer: ArrayBuffer | undefined = undefined;
    if (hasBody) {
      bodyBuffer = await req.arrayBuffer();
    }

    const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
    if (workerUrl) {
      try {
        const url = new URL(req.url);
        let apiPath = url.pathname;
        if (apiPath.startsWith('/.netlify/functions/api')) {
          apiPath = apiPath.replace('/.netlify/functions/api', '/api');
        }
        const target = `${workerUrl.replace(/\/$/, '')}${apiPath}${url.search}`;
        const proxyHeaders = new Headers(req.headers);
        proxyHeaders.set('host', new URL(workerUrl).host);

        const res = await fetch(target, {
          method: req.method,
          headers: proxyHeaders,
          body: bodyBuffer,
        });
        if (res.ok || res.status < 500) {
          return res;
        }
      } catch (proxyErr: any) {
        console.warn('[Netlify Worker Proxy Error, falling back to local handler]:', proxyErr.message);
      }
    }

    // Reconstruct request if body was buffered
    const finalReq = hasBody
      ? new Request(req.url, {
          method: req.method,
          headers: req.headers,
          body: bodyBuffer,
        })
      : req;

    // Execute serverless API handler
    return await handleServerlessRequest(finalReq, process.env);
  } catch (fatalErr: any) {
    console.error('[Netlify Function Fatal Error]:', fatalErr);
    // Never allow an uncaught exception to bubble out to Netlify (which generates a 502 Bad Gateway)
    return new Response(
      JSON.stringify({
        success: false,
        error: fatalErr.message || 'Server encountered an unexpected error',
        origin: 'netlify-function-guard',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        },
      }
    );
  }
};

export const config = {
  path: ['/api/*', '/.netlify/functions/api/*'],
};
