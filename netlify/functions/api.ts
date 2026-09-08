import { handleServerlessRequest } from '../../src/server/api';

/**
 * Netlify Functions v2 Entry Point for Sphere Social API
 * Handles all /api/* routes natively on Netlify.
 * If CLOUDFLARE_WORKER_URL is provided in environment variables, it proxies to the Worker.
 * Otherwise, it executes the authoritative serverless API handler.
 */
export default async (req: Request) => {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
  if (workerUrl) {
    try {
      const url = new URL(req.url);
      const target = `${workerUrl.replace(/\/$/, '')}${url.pathname}${url.search}`;
      const proxyHeaders = new Headers(req.headers);
      proxyHeaders.set('host', new URL(workerUrl).host);

      return await fetch(target, {
        method: req.method,
        headers: proxyHeaders,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
        // @ts-ignore
        duplex: 'half',
      });
    } catch (err: any) {
      console.warn('[Netlify Worker Proxy Error]:', err.message);
    }
  }

  return handleServerlessRequest(req, process.env);
};

export const config = {
  path: '/api/*',
};
