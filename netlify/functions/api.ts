import { handleServerlessRequest } from '../../src/server/api';

/**
 * Netlify Functions v2 Entry Point for Sphere Social API
 *
 * The Cloudflare Worker is authoritative for the production API. Netlify is
 * retained as a compatibility/fallback path for environments that do not have
 * the Worker URL configured. Provider callbacks must never silently fall
 * through to the SPA when the Worker proxy is unavailable.
 */
export default async (req: Request) => {
  try {
    const url = new URL(req.url);
    let apiPath = url.pathname;
    if (apiPath.startsWith('/.netlify/functions/api')) {
      apiPath = apiPath.replace('/.netlify/functions/api', '/api');
    }

    const isProviderCallback =
      apiPath === '/api/cpal_postback' ||
      /^\/api\/earn\/postback\/(cpalead|cpagrip)$/.test(apiPath);

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    let bodyBuffer: ArrayBuffer | undefined = undefined;
    if (hasBody) {
      bodyBuffer = await req.arrayBuffer();
    }

    const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
    if (workerUrl) {
      try {
        const target = `${workerUrl.replace(/\/$/, '')}${apiPath}${url.search}`;
        const proxyHeaders = new Headers(req.headers);
        proxyHeaders.set('host', new URL(workerUrl).host);

        // Forward Cloudflare Access service tokens if configured.
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

        if (!isAccessRedirect && res.status < 500) {
          return res;
        }

        if (isProviderCallback) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Reward provider callback could not reach the Cloudflare Worker.',
              origin: 'netlify-worker-proxy',
            }),
            {
              status: 502,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
              },
            }
          );
        }
      } catch (proxyErr: any) {
        console.warn('[Netlify Worker Proxy Error]:', proxyErr.message);
        if (isProviderCallback) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Reward provider callback could not reach the Cloudflare Worker.',
              origin: 'netlify-worker-proxy',
            }),
            {
              status: 502,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
              },
            }
          );
        }
      }
    } else if (isProviderCallback) {
      // Never allow a callback to fall through to the SPA or another handler.
      // A 5xx tells CPAlead/CPAGrip that delivery must be retried/fixed.
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Reward provider callback is not connected to the Cloudflare Worker.',
          origin: 'netlify-worker-proxy',
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // Reconstruct request if body was buffered.
    const finalReq = hasBody
      ? new Request(req.url, {
          method: req.method,
          headers: req.headers,
          body: bodyBuffer,
        })
      : req;

    // Execute the legacy/serverless API handler for non-provider routes.
    return await handleServerlessRequest(finalReq, process.env);
  } catch (fatalErr: any) {
    console.error('[Netlify Function Fatal Error]:', fatalErr);
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
