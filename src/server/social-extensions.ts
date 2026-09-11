import { DatabaseAdapter } from './db/adapter';
import { generateId, sha256Hash, verifyJwt } from './auth/crypto';

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function authenticateSocialRequest(request: Request, db: DatabaseAdapter, jwtSecret: string): Promise<string | null> {
  const header = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  const payload = await verifyJwt<{ userId: string }>(token, jwtSecret);
  if (!payload?.userId) return null;

  const tokenHash = await sha256Hash(token);
  const session: any = await db
    .prepare('SELECT user_id, revoked, expires_at FROM sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .first();
  if (!session || session.revoked === 1 || Number(session.expires_at) < Date.now()) return null;
  return session.user_id === payload.userId ? session.user_id : null;
}

export async function createSocialNotification(
  db: DatabaseAdapter,
  userId: string,
  actorId: string,
  type: 'follow' | 'like' | 'comment',
  postId?: string,
  commentId?: string,
): Promise<void> {
  if (!userId || !actorId || userId === actorId) return;

  const settings: any = await db
    .prepare('SELECT notifications_enabled FROM user_settings WHERE user_id = ?')
    .bind(userId)
    .first();
  if (settings && Number(settings.notifications_enabled) === 0) return;

  await db
    .prepare('INSERT INTO notifications (id, user_id, actor_id, type, post_id, comment_id, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
    .bind(`ntf_${generateId(12)}`, userId, actorId, type, postId || null, commentId || null, Date.now())
    .run();
}

export async function handleSocialExtensionRequest(
  request: Request,
  db: DatabaseAdapter,
  jwtSecret: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  let path = url.pathname;
  if (path.startsWith('/.netlify/functions/api')) path = path.replace('/.netlify/functions/api', '/api');
  const method = request.method.toUpperCase();
  const userId = await authenticateSocialRequest(request, db, jwtSecret);

  if (path === '/api/notifications' && method === 'GET') {
    if (!userId) return json({ success: false, error: 'Authentication required.' }, 401);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 30)));
    const rows: any = await db.prepare(`
      SELECT n.id, n.type, n.post_id, n.comment_id, n.read, n.created_at,
             a.id AS actor_id, a.username AS actor_username, a.display_name AS actor_display_name,
             a.avatar_url AS actor_avatar_url,
             p.caption AS post_caption, p.image_url AS post_image_url
      FROM notifications n
      JOIN users a ON a.id = n.actor_id
      LEFT JOIN posts p ON p.id = n.post_id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT ?
    `).bind(userId, limit).all();

    const unread: any = await db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read = 0').bind(userId).first();
    return json({
      success: true,
      data: {
        notifications: (rows.results || []).map((n: any) => ({
          id: n.id,
          type: n.type,
          read: Boolean(n.read),
          createdAt: Number(n.created_at),
          actor: {
            id: n.actor_id,
            username: n.actor_username,
            displayName: n.actor_display_name,
            avatarUrl: n.actor_avatar_url || '',
          },
          postId: n.post_id || null,
          commentId: n.comment_id || null,
          post: n.post_id ? { caption: n.post_caption || '', imageUrl: n.post_image_url || '' } : null,
        })),
        unreadCount: Number(unread?.count || 0),
      },
    });
  }

  const readMatch = path.match(/^\/api\/notifications\/([a-zA-Z0-9_-]+)\/read$/);
  if (readMatch && method === 'POST') {
    if (!userId) return json({ success: false, error: 'Authentication required.' }, 401);
    const result: any = await db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').bind(readMatch[1], userId).run();
    return json({ success: true, data: { updated: Number(result?.meta?.changes || 0) } });
  }

  if (path === '/api/notifications/read-all' && method === 'POST') {
    if (!userId) return json({ success: false, error: 'Authentication required.' }, 401);
    await db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').bind(userId).run();
    return json({ success: true, data: { ok: true } });
  }

  const saveMatch = path.match(/^\/api\/posts\/([a-zA-Z0-9_-]+)\/save$/);
  if (saveMatch && method === 'POST') {
    if (!userId) return json({ success: false, error: 'Authentication required.' }, 401);
    const postId = saveMatch[1];
    const post: any = await db.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
    if (!post) return json({ success: false, error: 'Post not found.' }, 404);

    const existing: any = await db.prepare('SELECT id FROM saved_posts WHERE user_id = ? AND post_id = ?').bind(userId, postId).first();
    if (existing) {
      await db.prepare('DELETE FROM saved_posts WHERE user_id = ? AND post_id = ?').bind(userId, postId).run();
      return json({ success: true, data: { saved: false } });
    }

    await db.prepare('INSERT OR IGNORE INTO saved_posts (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(`sav_${generateId(12)}`, userId, postId, Date.now()).run();
    return json({ success: true, data: { saved: true } });
  }

  if (path === '/api/saved-posts' && method === 'GET') {
    if (!userId) return json({ success: false, error: 'Authentication required.' }, 401);
    const rows: any = await db.prepare(`
      SELECT p.id, p.user_id, p.image_url, p.caption, p.likes_count, p.comments_count, p.created_at,
             u.username, u.display_name, u.avatar_url
      FROM saved_posts s
      JOIN posts p ON p.id = s.post_id
      JOIN users u ON u.id = p.user_id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
      LIMIT 50
    `).bind(userId).all();
    return json({
      success: true,
      data: {
        posts: (rows.results || []).map((p: any) => ({
          id: p.id,
          userId: p.user_id,
          imageUrl: p.image_url,
          caption: p.caption || '',
          likesCount: Number(p.likes_count || 0),
          commentsCount: Number(p.comments_count || 0),
          createdAt: Number(p.created_at),
          author: { id: p.user_id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url || '' },
          saved: true,
        })),
      },
    });
  }

  return null;
}
