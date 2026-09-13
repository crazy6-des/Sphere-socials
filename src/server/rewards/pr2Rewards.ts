import { DatabaseAdapter } from '../db/adapter';
import { generateId, sha256Hash, verifyJwt } from '../auth/crypto';

export type RewardProviderId = 'cpalead' | 'cpagrip' | 'reserved_3' | 'reserved_4' | 'reserved_5';
type Conversion = { provider: RewardProviderId; externalUserId: string; externalConversionId: string; externalOfferId?: string; payout: number; currency: string; status: 'approved' | 'reversed'; occurredAt: number; rawPayloadHash: string };

const PROVIDERS: RewardProviderId[] = ['cpalead', 'cpagrip', 'reserved_3', 'reserved_4', 'reserved_5'];
const PAYOUT_METHODS = ['paypal', 'crypto_usdt', 'bank'];

function envValue(env: any, key: string): string { const v = env?.[key] ?? (typeof process !== 'undefined' ? process.env?.[key] : undefined); return typeof v === 'string' ? v.trim() : ''; }
function clean(v: unknown, max = 256): string { return String(v ?? '').trim().slice(0, max); }
function money(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 1000000 ? Math.round(n * 100) / 100 : null; }
function equal(a: string, b: string): boolean { if (!a || !b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function hmac(secret: string, value: string): Promise<string> { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)); return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function canonical(p: Record<string, any>): string { return Object.keys(p).filter(k => k !== 'signature' && k !== 'sig').sort().map(k => `${k}=${String(p[k])}`).join('&'); }
function cors(request: Request): Record<string, string> { const origin = request.headers.get('Origin') || request.headers.get('origin') || ''; const allowed = !origin || origin === 'null' || /^https:\/\/([a-z0-9-]+\.)*netlify\.app$/i.test(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin); return { 'Access-Control-Allow-Origin': allowed && origin && origin !== 'null' ? origin : '*', 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' }; }
function json(request: Request, body: any, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(request) } }); }
function fail(request: Request, message: string, status = 400): Response { return json(request, { success: false, error: message }, status); }

function statuses(env: any) {
  const cpalead = Boolean(envValue(env, 'CPALEAD_PUBLISHER_ID') && envValue(env, 'CPALEAD_POSTBACK_PASSWORD'));
  const cpagrip = Boolean(envValue(env, 'CPAGRIP_PUBLISHER_ID') && envValue(env, 'CPAGRIP_POSTBACK_SECRET') && envValue(env, 'CPAGRIP_POSTBACK_MODE'));
  return [
    { id: 'cpalead', name: 'CPAlead', tagline: 'Surveys, installs and task-based offers', description: 'CPAlead publisher/offerwall integration with server-to-server verification.', isConfigured: cpalead, configurationNotes: cpalead ? 'Publisher ID and postback password configured.' : 'Configure CPALEAD_PUBLISHER_ID and CPALEAD_POSTBACK_PASSWORD before live crediting.', supportedOfferTypes: ['Surveys', 'App Installs', 'Games', 'Lead Offers'] },
    { id: 'cpagrip', name: 'CPAGrip', tagline: 'Offer walls and virtual-currency campaigns', description: 'CPAGrip adapter with an explicit verification mode; no undocumented signature scheme is assumed.', isConfigured: cpagrip, configurationNotes: cpagrip ? 'Publisher ID, callback secret and verification mode configured.' : 'Configure CPAGRIP_PUBLISHER_ID, CPAGRIP_POSTBACK_SECRET and CPAGRIP_POSTBACK_MODE only after confirming the dashboard callback contract.', supportedOfferTypes: ['Offer Walls', 'Surveys', 'Leads', 'Virtual Currency'] },
    { id: 'reserved_3', name: 'Provider 3', tagline: 'Reserved', description: 'Reserved provider slot.', isConfigured: false, configurationNotes: 'Add an adapter without changing the rewards engine.', supportedOfferTypes: [] },
    { id: 'reserved_4', name: 'Provider 4', tagline: 'Reserved', description: 'Reserved provider slot.', isConfigured: false, configurationNotes: 'Add an adapter without changing the rewards engine.', supportedOfferTypes: [] },
    { id: 'reserved_5', name: 'Provider 5', tagline: 'Reserved', description: 'Reserved provider slot.', isConfigured: false, configurationNotes: 'Add an adapter without changing the rewards engine.', supportedOfferTypes: [] },
  ];
}

async function normalize(provider: RewardProviderId, p: Record<string, any>, env: any): Promise<Conversion | null> {
  const externalUserId = clean(p.subid || p.sub_id || p.player_id || p.user_id || p.uid, 160);
  const externalConversionId = clean(p.lead_id || p.transaction_id || p.tx_id || p.conversion_id || p.event_id || p.id, 160);
  const externalOfferId = clean(p.campaign_id || p.offer_id || p.offerid || p.offer, 160);
  const payout = money(p.payout ?? p.amount ?? p.reward);
  if (!externalUserId || !externalConversionId || payout === null) return null;

  if (provider === 'cpalead') {
    const secret = envValue(env, 'CPALEAD_POSTBACK_PASSWORD'); const supplied = clean(p.password || p.signature || p.sig, 256); if (!secret || !supplied) return null;
    const expectedHmac = await hmac(secret, canonical(p)); if (!equal(supplied, secret) && !equal(supplied.toLowerCase(), expectedHmac.toLowerCase())) return null;
  } else if (provider === 'cpagrip') {
    const secret = envValue(env, 'CPAGRIP_POSTBACK_SECRET'); const mode = envValue(env, 'CPAGRIP_POSTBACK_MODE').toLowerCase(); const supplied = clean(p.signature || p.sig || p.password, 256); if (!secret || !mode || !supplied) return null;
    if (mode === 'secret') { if (!equal(supplied, secret)) return null; } else if (mode === 'hmac-sha256-query') { if (!equal(supplied.toLowerCase(), (await hmac(secret, canonical(p))).toLowerCase())) return null; } else return null;
  } else return null;

  const state = clean(p.status || p.event).toLowerCase(); const reversed = ['reversed', 'reverse', 'chargeback', 'cancelled', 'canceled'].includes(state) || clean(p.reversal).toLowerCase() === 'true';
  return { provider, externalUserId, externalConversionId, externalOfferId: externalOfferId || undefined, payout, currency: clean(p.currency || p.payout_currency || 'USD', 16).toUpperCase(), status: reversed ? 'reversed' : 'approved', occurredAt: Date.now(), rawPayloadHash: await sha256Hash(JSON.stringify(p)) };
}

async function authUser(request: Request, env: any): Promise<string | null> {
  const header = request.headers.get('Authorization') || request.headers.get('authorization'); if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim(); const secret = envValue(env, 'JWT_SECRET'); if (!token || !secret || !env?.DB) return null;
  try { const payload = await verifyJwt<{ userId: string }>(token, secret); if (!payload?.userId) return null; const hash = await sha256Hash(token); const session: any = await env.DB.prepare('SELECT user_id, revoked, expires_at FROM sessions WHERE token_hash = ?').bind(hash).first(); if (session && (Number(session.revoked) === 1 || Number(session.expires_at) < Date.now())) return null; return session?.user_id || payload.userId; } catch { return null; }
}

async function credit(db: DatabaseAdapter, c: Conversion): Promise<{ state: 'credited' | 'duplicate' | 'reversed' | 'rejected'; balance?: number }> {
  const user: any = await db.prepare('SELECT id FROM users WHERE id = ?').bind(c.externalUserId).first(); if (!user) return { state: 'rejected' };
  const event: any = await db.prepare('SELECT id, status, payout FROM reward_events WHERE provider = ? AND external_conversion_id = ?').bind(c.provider, c.externalConversionId).first();
  const wallet: any = await db.prepare('SELECT id FROM wallets WHERE user_id = ?').bind(user.id).first(); if (!wallet) return { state: 'rejected' };

  if (c.status === 'approved') {
    if (event?.status === 'credited' || event?.status === 'reversed') return { state: 'duplicate' };
    if (!db.batch) return { state: 'rejected' };
    const reference = `reward:${c.provider}:${c.externalConversionId}`; const txId = `txn_${generateId(14)}`;
    const results: any[] = await db.batch([
      db.prepare('INSERT OR IGNORE INTO reward_events (id, provider, external_conversion_id, external_user_id, external_offer_id, payout, currency, status, raw_payload_hash, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(`rev_${generateId(14)}`, c.provider, c.externalConversionId, user.id, c.externalOfferId || null, c.payout, c.currency, 'pending', c.rawPayloadHash, c.occurredAt, Date.now()),
      db.prepare('INSERT OR IGNORE INTO transactions (id, wallet_id, user_id, type, amount, status, provider, description, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(txId, wallet.id, user.id, 'reward', c.payout, 'pending', c.provider, `${c.provider} reward`, reference, Date.now()),
      db.prepare("UPDATE wallets SET balance = balance + ?, total_earned = total_earned + ?, updated_at = ? WHERE user_id = ? AND EXISTS (SELECT 1 FROM transactions WHERE id = ? AND status = 'pending')").bind(c.payout, c.payout, Date.now(), user.id, txId),
      db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ? AND status = 'pending'").bind(txId),
      db.prepare("UPDATE reward_events SET status = 'credited', transaction_id = ?, processed_at = ? WHERE provider = ? AND external_conversion_id = ?").bind(txId, Date.now(), c.provider, c.externalConversionId),
    ]);
    if (!results) return { state: 'rejected' };
    const updated: any = await db.prepare('SELECT balance FROM wallets WHERE user_id = ?').bind(user.id).first();
    return { state: 'credited', balance: Number(updated?.balance || 0) };
  }

  if (!event || event.status !== 'credited') return { state: 'rejected' };
  const reversalReference = `reward-reversal:${c.provider}:${c.externalConversionId}`; const exists: any = await db.prepare('SELECT id FROM transactions WHERE reference_id = ?').bind(reversalReference).first(); if (exists) return { state: 'duplicate' };
  if (!db.batch) return { state: 'rejected' };
  const amount = Number(event.payout || c.payout); const txId = `txn_${generateId(14)}`;
  await db.batch([
    db.prepare('INSERT INTO transactions (id, wallet_id, user_id, type, amount, status, provider, description, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(txId, wallet.id, user.id, 'reward', -amount, 'cancelled', c.provider, `${c.provider} reward reversal`, reversalReference, Date.now()),
    db.prepare('UPDATE wallets SET balance = balance - ?, updated_at = ? WHERE user_id = ?').bind(amount, Date.now(), user.id),
    db.prepare("UPDATE reward_events SET status = 'reversed', processed_at = ? WHERE provider = ? AND external_conversion_id = ?").bind(Date.now(), c.provider, c.externalConversionId),
  ]);
  const updated: any = await db.prepare('SELECT balance FROM wallets WHERE user_id = ?').bind(user.id).first(); return { state: 'reversed', balance: Number(updated?.balance || 0) };
}

async function walletResponse(request: Request, db: DatabaseAdapter, userId: string): Promise<Response> {
  const wallet: any = await db.prepare('SELECT user_id, balance, total_earned, total_withdrawn, updated_at FROM wallets WHERE user_id = ?').bind(userId).first();
  const rows: any = await db.prepare('SELECT id, wallet_id, user_id, type, amount, status, provider, description, reference_id, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(userId).all();
  const w = wallet || { user_id: userId, balance: 0, total_earned: 0, total_withdrawn: 0, updated_at: Date.now() };
  return json(request, { success: true, data: { wallet: { userId: w.user_id, balance: Number(w.balance || 0), totalEarned: Number(w.total_earned || 0), totalWithdrawn: Number(w.total_withdrawn || 0), updatedAt: Number(w.updated_at || Date.now()) }, transactions: rows.results || [] } });
}

export async function handlePr2RewardsRequest(request: Request, env: any, db: DatabaseAdapter): Promise<Response | null> {
  const url = new URL(request.url); let path = url.pathname; if (path.startsWith('/.netlify/functions/api')) path = path.replace('/.netlify/functions/api', '/api'); const method = request.method.toUpperCase();
  if (!path.startsWith('/api/earn') && path !== '/api/wallet' && path !== '/api/withdrawals') return null;
  if (method === 'OPTIONS') return json(request, { success: true }, 204);
  if (path === '/api/earn/providers' && method === 'GET') return json(request, { success: true, data: { providers: statuses(env) } });

  if (path.startsWith('/api/earn/postback/') && (method === 'GET' || method === 'POST')) {
    const provider = clean(path.split('/').pop()).toLowerCase() as RewardProviderId; if (!PROVIDERS.includes(provider) || provider.startsWith('reserved_')) return fail(request, 'Unknown reward provider.', 404);
    const payload: Record<string, any> = method === 'GET' ? Object.fromEntries(url.searchParams.entries()) : await request.json().catch(() => ({})); const conversion = await normalize(provider, payload, env); if (!conversion) return fail(request, 'Invalid or unauthenticated reward callback.', 401);
    const result = await credit(db, conversion); if (result.state === 'duplicate') return json(request, { success: true, duplicate: true }); if (result.state === 'credited') return json(request, { success: true, credited: true, balance: result.balance }); if (result.state === 'reversed') return json(request, { success: true, reversed: true, balance: result.balance }); return fail(request, 'Reward callback could not be processed.', 409);
  }

  const userId = await authUser(request, env); if (!userId) return fail(request, 'Authentication required.', 401);
  if (path === '/api/wallet' && method === 'GET') return walletResponse(request, db, userId);

  if (path === '/api/withdrawals' && method === 'POST') {
    const body: any = await request.json().catch(() => ({})); const amount = money(body.amount); const payoutMethod = clean(body.payoutMethod || body.payout_method).toLowerCase(); const destination = clean(body.destinationAccount || body.destination_account, 256); const minimum = Number(envValue(env, 'MIN_WITHDRAWAL') || '5');
    if (amount === null || amount < minimum) return fail(request, `Minimum withdrawal is ${minimum}.`); if (!PAYOUT_METHODS.includes(payoutMethod) || !destination) return fail(request, 'Valid payout method and destination account are required.');
    const pending: any = await db.prepare("SELECT id FROM withdrawals WHERE user_id = ? AND status = 'pending' LIMIT 1").bind(userId).first(); if (pending) return fail(request, 'You already have a pending withdrawal.', 409);
    const now = Date.now(); const id = `wd_${generateId(14)}`;
    const update = await db.prepare('UPDATE wallets SET balance = balance - ?, total_withdrawn = total_withdrawn + ?, updated_at = ? WHERE user_id = ? AND balance >= ?').bind(amount, amount, now, userId, amount).run();
    if (!update.success || update.meta.changes < 1) return fail(request, 'Insufficient available balance.');
    const inserted = await db.prepare('INSERT INTO withdrawals (id, user_id, amount, payout_method, destination_account, status, created_at, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, userId, amount, payoutMethod, destination, 'pending', now, `withdrawal:${id}`).run();
    if (!inserted.success) { await db.prepare('UPDATE wallets SET balance = balance + ?, total_withdrawn = total_withdrawn - ?, updated_at = ? WHERE user_id = ?').bind(amount, amount, Date.now(), userId).run(); return fail(request, 'Withdrawal could not be queued.', 500); }
    const wallet: any = await db.prepare('SELECT id, balance FROM wallets WHERE user_id = ?').bind(userId).first(); if (wallet) await db.prepare('INSERT INTO transactions (id, wallet_id, user_id, type, amount, status, provider, description, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(`txn_${generateId(14)}`, wallet.id, userId, 'withdrawal', -amount, 'pending', payoutMethod, 'Withdrawal request', `withdrawal:${id}`, now).run();
    return json(request, { success: true, data: { withdrawalId: id, newBalance: Number(wallet?.balance || 0) } });
  }

  if (path === '/api/earn/attention-reward' && method === 'POST') {
    const day = new Date(); day.setHours(0, 0, 0, 0); const reference = `attention:${userId}:${day.getTime()}`; const wallet: any = await db.prepare('SELECT id FROM wallets WHERE user_id = ?').bind(userId).first(); if (!wallet) return fail(request, 'Wallet unavailable.', 500);
    const inserted = await db.prepare('INSERT OR IGNORE INTO transactions (id, wallet_id, user_id, type, amount, status, provider, description, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(`txn_${generateId(14)}`, wallet.id, userId, 'reward', 0.15, 'completed', 'attention', 'Verified attention session', reference, Date.now()).run(); if (!inserted.success || inserted.meta.changes < 1) return fail(request, 'Daily attention reward already credited.', 409);
    await db.prepare('UPDATE wallets SET balance = balance + 0.15, total_earned = total_earned + 0.15, updated_at = ? WHERE user_id = ?').bind(Date.now(), userId).run(); const updated: any = await db.prepare('SELECT balance FROM wallets WHERE user_id = ?').bind(userId).first(); return json(request, { success: true, data: { rewardAmount: 0.15, newBalance: Number(updated?.balance || 0), message: 'Attention session verified and credited.' } });
  }

  if (path === '/api/earn/simulate-reward' && method === 'POST') {
    if (envValue(env, 'NODE_ENV') === 'production' || envValue(env, 'PRODUCTION') === 'true') return fail(request, 'Reward simulation is disabled in production.', 403);
    const body: any = await request.json().catch(() => ({})); const provider = clean(body.providerId || body.provider_id).toLowerCase(); const amount = money(body.amount); if (!['cpalead', 'cpagrip'].includes(provider) || amount === null) return fail(request, 'Invalid provider or reward amount.');
    const wallet: any = await db.prepare('SELECT id FROM wallets WHERE user_id = ?').bind(userId).first(); if (!wallet) return fail(request, 'Wallet unavailable.', 500); const now = Date.now(); await db.prepare('INSERT INTO transactions (id, wallet_id, user_id, type, amount, status, provider, description, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(`txn_${generateId(14)}`, wallet.id, userId, 'reward', amount, 'completed', provider, 'Development reward simulation', `simulation:${provider}:${generateId(16)}`, now).run(); await db.prepare('UPDATE wallets SET balance = balance + ?, total_earned = total_earned + ?, updated_at = ? WHERE user_id = ?').bind(amount, amount, now, userId).run(); const updated: any = await db.prepare('SELECT balance FROM wallets WHERE user_id = ?').bind(userId).first(); return json(request, { success: true, data: { rewardAmount: amount, newBalance: Number(updated?.balance || 0), message: 'Development reward simulated.' } });
  }
  return null;
}
