import { sha256Hash, verifyJwt } from '../auth/crypto';

type CpaleadEnv = {
  JWT_SECRET?: string;
  CPALEAD_PUBLISHER_ID?: string;
  CPALEAD_OFFERWALL_SLUG?: string;
  FRONTEND_ORIGIN?: string;
  FRONTEND_NETLIFY_ORIGIN?: string;
};

const envValue = (env: CpaleadEnv, key: keyof CpaleadEnv) => String(env?.[key] ?? '').trim();
const clean = (value: unknown, max = 512) => String(value ?? '').trim().slice(0, max);

function cors(request: Request, env: CpaleadEnv): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const configured = [envValue(env, 'FRONTEND_ORIGIN'), envValue(env, 'FRONTEND_NETLIFY_ORIGIN'), 'https://spheres.com.ng', 'https://sphereis.netlify.app'].filter(Boolean);
  const allowed = !origin || origin === 'null' || configured.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  return {
    'Access-Control-Allow-Origin': allowed && origin && origin !== 'null' ? origin : '*',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}

function json(request: Request, env: CpaleadEnv, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(request, env), ...extra },
  });
}

async function authenticateUser(request: Request, env: CpaleadEnv, db: any): Promise<string | null> {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  const secret = envValue(env, 'JWT_SECRET');
  if (!token || !secret || !db?.prepare) return null;
  try {
    const payload = await verifyJwt<{ userId: string }>(token, secret);
    if (!payload?.userId) return null;
    const hash = await sha256Hash(token);
    const session: any = await db.prepare('SELECT user_id, revoked, expires_at FROM sessions WHERE token_hash = ?').bind(hash).first();
    if (!session || Number(session.revoked) === 1 || Number(session.expires_at) <= Date.now()) return null;
    return session.user_id === payload.userId ? payload.userId : null;
  } catch { return null; }
}

async function offers(request: Request, env: CpaleadEnv, db: any, url: URL): Promise<Response> {
  const userId = await authenticateUser(request, env, db);
  if (!userId) return json(request, env, { success: false, error: 'Authentication required.' }, 401);
  const publisherId = envValue(env, 'CPALEAD_PUBLISHER_ID');
  if (!publisherId) return json(request, env, { success: false, error: 'CPAlead publisher configuration is unavailable.' }, 503);
  const upstream = new URL('https://www.cpalead.com/api/offers');
  upstream.searchParams.set('id', publisherId);
  upstream.searchParams.set('country', 'user');
  upstream.searchParams.set('device', 'user');
  upstream.searchParams.set('subid', userId);
  upstream.searchParams.set('limit', '100');
  upstream.searchParams.set('fields', 'id,title,description,long_description,link,amount,payout_currency,offer_rank,device,conversion_mode,countries,events,creatives,preview_link');
  let response: Response;
  try { response = await fetch(upstream.toString(), { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' }); }
  catch { return json(request, env, { success: false, error: 'CPAlead Offers API is unreachable.' }, 502); }
  const payload: any = await response.json().catch(() => null);
  if (!response.ok || !payload) return json(request, env, { success: false, error: 'CPAlead Offers API returned an invalid response.' }, 502);
  const rawOffers = Array.isArray(payload.offers) ? payload.offers : Array.isArray(payload.data) ? payload.data : [];
  const normalized = rawOffers.map((offer: any) => ({ id: clean(offer.id || offer.offer_id, 100), title: clean(offer.title, 200), description: clean(offer.description, 1000), longDescription: clean(offer.long_description, 4000), link: clean(offer.link, 2000), amount: Number(offer.amount || 0), currency: clean(offer.payout_currency || 'USD', 16).toUpperCase(), offerRank: Number(offer.offer_rank || 0), device: offer.device || null, conversionMode: offer.conversion_mode || null, countries: offer.countries || [], events: Array.isArray(offer.events) ? offer.events : [], creatives: offer.creatives || null, previewLink: clean(offer.preview_link, 2000) })).filter((offer: any) => offer.id && offer.link);
  return json(request, env, { success: true, data: { provider: 'cpalead', publisherId, userId, offers: normalized, fetchedAt: Date.now(), source: 'CPAlead Offers API', upstreamUrl: url.pathname } }, 200, { 'Cache-Control': 'private, no-store' });
}

async function offerwall(request: Request, env: CpaleadEnv, db: any): Promise<Response> {
  const userId = await authenticateUser(request, env, db);
  if (!userId) return json(request, env, { success: false, error: 'Authentication required.' }, 401);
  const slug = envValue(env, 'CPALEAD_OFFERWALL_SLUG') || 'vekoIu9';
  const wallUrl = `https://www.cpalead.com/wall/${encodeURIComponent(slug)}?subid=${encodeURIComponent(userId)}`;
  return json(request, env, { success: true, data: { provider: 'cpalead', slug, userId, url: wallUrl, tracking: 'subid' } });
}

export async function handleCpaleadRequest(request: Request, env: CpaleadEnv, db: any): Promise<Response | null> {
  const url = new URL(request.url);
  let path = url.pathname;
  if (path.startsWith('/.netlify/functions/api')) path = path.replace('/.netlify/functions/api', '/api');
  if (request.method.toUpperCase() === 'OPTIONS') return json(request, env, { success: true }, 204);
  if (path === '/api/earn/cpalead/offers' && request.method.toUpperCase() === 'GET') return offers(request, env, db, url);
  if (path === '/api/earn/cpalead/offerwall' && request.method.toUpperCase() === 'GET') return offerwall(request, env, db);
  return null;
}
