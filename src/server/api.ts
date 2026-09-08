import { getDatabaseAdapter, DatabaseAdapter } from './db/adapter';
import { initializeDatabase } from './db/schema';
import { getStorageProvider, validateImageUpload } from './storage/storage';
import { generateId, hashPassword, verifyPassword, signJwt, verifyJwt, sha256Hash } from './auth/crypto';
import { RewardService } from './providers/rewards';
import { getMusicProvider } from './providers/music';
import { getEmailProvider, BrevoEmailProvider } from './providers/email';
import { User, Post, Comment, UserPublicProfile } from '../types';

interface RouteContext {
  db: DatabaseAdapter;
  env: any;
  jwtSecret: string;
  jwtRefreshSecret: string;
  storage: ReturnType<typeof getStorageProvider>;
  rewardService: RewardService;
  musicProvider: ReturnType<typeof getMusicProvider>;
  emailProvider: BrevoEmailProvider;
  origin: string;
}

// Helpers for CORS and response headers
function getCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers?.get('Origin') || request?.headers?.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin !== 'null' ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function jsonResponse(data: any, status = 200, headers: Record<string, string> = {}, request?: Request): Response {
  const cors = getCorsHeaders(request);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...cors,
      ...headers,
    },
  });
}

function errorResponse(error: string, status = 400, request?: Request): Response {
  return jsonResponse({ success: false, error }, status, {}, request);
}

// Extract authenticated user ID from Authorization header and check persistent session
async function getAuthUserId(request: Request, jwtSecret: string, db?: DatabaseAdapter): Promise<string | null> {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  const payload = await verifyJwt<{ userId: string }>(token, jwtSecret);
  if (!payload?.userId) return null;

  // Check persistent session in database if database adapter is provided
  if (db) {
    try {
      const tokenHash = await sha256Hash(token);
      const session: any = await db
        .prepare('SELECT id, user_id, revoked, expires_at FROM sessions WHERE token_hash = ?')
        .bind(tokenHash)
        .first();

      if (session) {
        if (session.revoked === 1 || session.expires_at < Date.now()) {
          return null; // Explicitly revoked or expired session
        }
        // Update last used timestamp
        await db
          .prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?')
          .bind(Date.now(), session.id)
          .run();
        return session.user_id;
      }
    } catch (err) {
      console.warn('[Session Verification Error]:', err);
    }
  }

  return payload.userId;
}

export async function handleServerlessRequest(request: Request, env: any = {}): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(request),
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const db = getDatabaseAdapter(env);
  await initializeDatabase(db);

  const jwtSecret = env?.JWT_SECRET || (typeof process !== 'undefined' ? process.env?.JWT_SECRET : '') || 'sphere-jwt-secret-min-32-chars-key!';
  const jwtRefreshSecret = env?.JWT_REFRESH_SECRET || (typeof process !== 'undefined' ? process.env?.JWT_REFRESH_SECRET : '') || 'sphere-jwt-refresh-secret-min-32-chars-key!';
  const storage = getStorageProvider(env);
  const rewardService = new RewardService(env);
  const musicProvider = getMusicProvider(env);
  const emailProvider = getEmailProvider(env);
  const origin = request.headers.get('Origin') || request.headers.get('origin') || `${url.protocol}//${url.host}`;

  const ctx: RouteContext = {
    db,
    env,
    jwtSecret,
    jwtRefreshSecret,
    storage,
    rewardService,
    musicProvider,
    emailProvider,
    origin,
  };

  try {
    // -------------------------------------------------------------
    // STORAGE SERVING: /api/storage/:key
    // -------------------------------------------------------------
    if (path.startsWith('/api/storage/') && method === 'GET') {
      const key = path.replace('/api/storage/', '');
      const stored = await storage.get(key);
      if (!stored) {
        return new Response('Media not found', { status: 404, headers: getCorsHeaders(request) });
      }
      return new Response(stored.data, {
        headers: {
          'Content-Type': stored.contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
          ...getCorsHeaders(request),
        },
      });
    }

    if (path === '/api/health' && method === 'GET') {
      return jsonResponse({
        success: true,
        data: {
          status: 'healthy',
          service: 'Sphere Social API',
          timestamp: Date.now(),
        },
      }, 200, {}, request);
    }

    // -------------------------------------------------------------
    // AUTHENTICATION ROUTES: /api/auth/*
    // -------------------------------------------------------------
    if (path === '/api/auth/register' && method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const { username, email, password, displayName } = body;

      if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return errorResponse('Username must be 3-20 alphanumeric characters or underscores.', 400, request);
      }
      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return errorResponse('Valid email address is required.', 400, request);
      }
      if (!password || typeof password !== 'string' || password.length < 6) {
        return errorResponse('Password must be at least 6 characters.', 400, request);
      }

      const existing = await db
        .prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ?')
        .bind(username.toLowerCase(), email.toLowerCase())
        .first();

      if (existing) {
        return errorResponse('Username or email is already registered.', 400, request);
      }

      const userId = `usr_${generateId(12)}`;
      const passwordHash = await hashPassword(password);
      const now = Date.now();
      const finalDisplayName = (displayName && typeof displayName === 'string' && displayName.trim()) ? displayName.trim() : username;
      const avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${username}`;

      await db
        .prepare(
          'INSERT INTO users (id, username, email, password_hash, display_name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(userId, username.toLowerCase(), email.toLowerCase(), passwordHash, finalDisplayName, avatarUrl, now, now)
        .run();

      // Initialize persistent wallet for user
      const walletId = `wlt_${generateId(12)}`;
      await db
        .prepare('INSERT INTO wallets (id, user_id, balance, total_earned, total_withdrawn, updated_at) VALUES (?, ?, 0.00, 0.00, 0.00, ?)')
        .bind(walletId, userId, now)
        .run();

      const user: User = {
        id: userId,
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        displayName: finalDisplayName,
        avatarUrl,
        createdAt: now,
      };

      const tokenExpiresIn = 86400 * 7; // 7 days
      const token = await signJwt({ userId, username: user.username }, ctx.jwtSecret, tokenExpiresIn);
      const refreshToken = generateId(32);

      const tokenHash = await sha256Hash(token);
      const refreshHash = await sha256Hash(refreshToken);
      const sessionId = `ses_${generateId(12)}`;
      const userAgent = request.headers.get('user-agent') || '';
      const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';

      await db
        .prepare(
          'INSERT INTO sessions (id, user_id, token_hash, refresh_token_hash, user_agent, ip_address, expires_at, refresh_expires_at, revoked, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)'
        )
        .bind(sessionId, userId, tokenHash, refreshHash, userAgent, ip, now + (tokenExpiresIn * 1000), now + (86400 * 30 * 1000), now, now)
        .run();

      return jsonResponse({ success: true, data: { token, refreshToken, user } }, 200, {}, request);
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const { identifier, password } = body; // identifier is email or username

      if (!identifier || !password) {
        return errorResponse('Username/Email and password are required.', 400, request);
      }

      const cleanId = String(identifier).toLowerCase().trim();
      const row: any = await db
        .prepare('SELECT id, username, email, password_hash, display_name, bio, avatar_url, created_at FROM users WHERE username = ? OR email = ?')
        .bind(cleanId, cleanId)
        .first();

      if (!row) {
        return errorResponse('Invalid username/email or password.', 401, request);
      }

      const isValid = await verifyPassword(password, row.password_hash);
      if (!isValid) {
        return errorResponse('Invalid username/email or password.', 401, request);
      }

      const user: User = {
        id: row.id,
        username: row.username,
        email: row.email,
        displayName: row.display_name,
        bio: row.bio || '',
        avatarUrl: row.avatar_url || '',
        createdAt: row.created_at,
      };

      const now = Date.now();
      const tokenExpiresIn = 86400 * 7; // 7 days
      const token = await signJwt({ userId: user.id, username: user.username }, ctx.jwtSecret, tokenExpiresIn);
      const refreshToken = generateId(32);

      const tokenHash = await sha256Hash(token);
      const refreshHash = await sha256Hash(refreshToken);
      const sessionId = `ses_${generateId(12)}`;
      const userAgent = request.headers.get('user-agent') || '';
      const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';

      await db
        .prepare(
          'INSERT INTO sessions (id, user_id, token_hash, refresh_token_hash, user_agent, ip_address, expires_at, refresh_expires_at, revoked, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)'
        )
        .bind(sessionId, user.id, tokenHash, refreshHash, userAgent, ip, now + (tokenExpiresIn * 1000), now + (86400 * 30 * 1000), now, now)
        .run();

      return jsonResponse({ success: true, data: { token, refreshToken, user } }, 200, {}, request);
    }

    if (path === '/api/auth/refresh' && method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const { refreshToken } = body;
      if (!refreshToken || typeof refreshToken !== 'string') {
        return errorResponse('Refresh token is required.', 400, request);
      }

      const refreshHash = await sha256Hash(refreshToken);
      const now = Date.now();

      const session: any = await db
        .prepare('SELECT id, user_id, refresh_expires_at, revoked FROM sessions WHERE refresh_token_hash = ?')
        .bind(refreshHash)
        .first();

      if (!session || session.revoked === 1 || session.refresh_expires_at < now) {
        return errorResponse('Invalid or expired refresh token. Please sign in again.', 401, request);
      }

      const userRow: any = await db
        .prepare('SELECT id, username FROM users WHERE id = ?')
        .bind(session.user_id)
        .first();

      if (!userRow) {
        return errorResponse('User account not found.', 401, request);
      }

      const tokenExpiresIn = 86400 * 7;
      const newToken = await signJwt({ userId: userRow.id, username: userRow.username }, ctx.jwtSecret, tokenExpiresIn);
      const newTokenHash = await sha256Hash(newToken);

      await db
        .prepare('UPDATE sessions SET token_hash = ?, expires_at = ?, last_used_at = ? WHERE id = ?')
        .bind(newTokenHash, now + (tokenExpiresIn * 1000), now, session.id)
        .run();

      return jsonResponse({ success: true, data: { token: newToken } }, 200, {}, request);
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const currentUserId = await getAuthUserId(request, ctx.jwtSecret, db);
      if (!currentUserId) {
        return errorResponse('Unauthorized', 401, request);
      }

      const row: any = await db
        .prepare('SELECT id, username, email, display_name, bio, avatar_url, created_at FROM users WHERE id = ?')
        .bind(currentUserId)
        .first();

      if (!row) {
        return errorResponse('User not found', 404, request);
      }

      const user: User = {
        id: row.id,
        username: row.username,
        email: row.email,
        displayName: row.display_name,
        bio: row.bio || '',
        avatarUrl: row.avatar_url || '',
        createdAt: row.created_at,
      };

      return jsonResponse({ success: true, data: { user } }, 200, {}, request);
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        const tokenHash = await sha256Hash(token);
        await db
          .prepare('UPDATE sessions SET revoked = 1 WHERE token_hash = ?')
          .bind(tokenHash)
          .run();
      }
      return jsonResponse({ success: true, message: 'Logged out successfully' }, 200, {}, request);
    }

    // -------------------------------------------------------------
    // FORGOT & RESET PASSWORD (Brevo integration + D1 persistence)
    // -------------------------------------------------------------
    if (path === '/api/auth/forgot-password' && method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const { email } = body;

      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return errorResponse('Please provide a valid email address.', 400, request);
      }

      const cleanEmail = email.toLowerCase().trim();
      const userRow: any = await db
        .prepare('SELECT id, email, display_name FROM users WHERE email = ?')
        .bind(cleanEmail)
        .first();

      let devResetToken: string | undefined;
      let emailDispatched = false;
      let emailError: string | undefined;
      const isEmailConfigured = ctx.emailProvider.isConfigured();

      if (userRow) {
        // Quota Protection: Prevent rapid automated spam requests (minimum 60s between requests)
        const recentReset: any = await db
          .prepare('SELECT created_at FROM password_resets WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1')
          .bind(userRow.id, Date.now() - 60000)
          .first();

        if (recentReset) {
          return errorResponse('A reset request was recently submitted. Please wait 60 seconds before requesting another email to prevent quota exhaustion.', 429, request);
        }

        const resetToken = generateId(32);
        const tokenHash = await sha256Hash(resetToken);
        const resetId = `rst_${generateId(12)}`;
        const now = Date.now();
        const expiresAt = now + 3600000; // 1 hour expiration

        await db
          .prepare('INSERT INTO password_resets (id, user_id, token_hash, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)')
          .bind(resetId, userRow.id, tokenHash, expiresAt, now)
          .run();

        // Dispatch real email through Brevo if configured
        if (isEmailConfigured) {
          const emailResult = await ctx.emailProvider.sendPasswordResetEmail(
            userRow.email,
            userRow.display_name,
            resetToken,
            ctx.origin
          );

          if (emailResult.success) {
            emailDispatched = true;
          } else {
            emailError = emailResult.error;
            devResetToken = resetToken; // Fallback token so user is not locked out
            console.warn('[Brevo Dispatch Failed]:', emailResult.error);
          }
        } else {
          devResetToken = resetToken;
          emailError = 'Brevo email provider is not configured. Provide BREVO_API_KEY in environment to send live transactional emails.';
        }
      }

      // Transparent response informing caller of actual email dispatch state
      let message = 'If an account is associated with this email address, a password reset link has been dispatched.';
      if (userRow) {
        if (emailDispatched) {
          message = `Password reset link has been dispatched to ${userRow.email} via Brevo.`;
        } else if (emailError) {
          message = `Password reset link generated. Note: ${emailError}`;
        }
      }

      return jsonResponse(
        {
          success: true,
          message,
          data: {
            emailSent: emailDispatched,
            emailError: emailDispatched ? undefined : emailError,
            resetToken: devResetToken,
          },
        },
        200,
        {},
        request
      );
    }

    if (path === '/api/auth/reset-password' && method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const { token, newPassword } = body;

      if (!token || typeof token !== 'string') {
        return errorResponse('Reset token is required.', 400, request);
      }
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return errorResponse('New password must be at least 6 characters.', 400, request);
      }

      const tokenHash = await sha256Hash(token);
      const resetRecord: any = await db
        .prepare('SELECT id, user_id, expires_at, used FROM password_resets WHERE token_hash = ?')
        .bind(tokenHash)
        .first();

      if (!resetRecord) {
        return errorResponse('Invalid or expired password reset token.', 400, request);
      }

      if (resetRecord.used === 1) {
        return errorResponse('This password reset link has already been used.', 400, request);
      }

      if (resetRecord.expires_at < Date.now()) {
        return errorResponse('This password reset link has expired. Please request a new one.', 400, request);
      }

      const newPasswordHash = await hashPassword(newPassword);
      const now = Date.now();

      // 1. Update user password
      await db
        .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .bind(newPasswordHash, now, resetRecord.user_id)
        .run();

      // 2. Mark reset token as used (single-use constraint)
      await db
        .prepare('UPDATE password_resets SET used = 1 WHERE id = ?')
        .bind(resetRecord.id)
        .run();

      // 3. Revoke all previous active sessions for this user for security
      await db
        .prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?')
        .bind(resetRecord.user_id)
        .run();

      // 4. Fetch updated user details
      const userRow: any = await db
        .prepare('SELECT id, username, email, display_name, bio, avatar_url, created_at FROM users WHERE id = ?')
        .bind(resetRecord.user_id)
        .first();

      if (!userRow) {
        return errorResponse('User account not found.', 404, request);
      }

      // 5. Automatically create a fresh, valid session
      const tokenExpiresIn = 86400 * 7;
      const newToken = await signJwt({ userId: userRow.id, username: userRow.username }, ctx.jwtSecret, tokenExpiresIn);
      const newRefreshToken = generateId(32);
      const newTokenHash = await sha256Hash(newToken);
      const newRefreshHash = await sha256Hash(newRefreshToken);
      const sessionId = `ses_${generateId(16)}`;

      await db
        .prepare('INSERT INTO sessions (id, user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at, revoked, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
        .bind(sessionId, userRow.id, newTokenHash, newRefreshHash, now + (tokenExpiresIn * 1000), now + (86400 * 30 * 1000), now, now)
        .run();

      const user: User = {
        id: userRow.id,
        username: userRow.username,
        email: userRow.email,
        displayName: userRow.display_name,
        bio: userRow.bio || '',
        avatarUrl: userRow.avatar_url || '',
        createdAt: userRow.created_at,
      };

      return jsonResponse(
        {
          success: true,
          message: 'Your password has been successfully reset! You are now logged in.',
          data: {
            token: newToken,
            refreshToken: newRefreshToken,
            user,
          },
        },
        200,
        {},
        request
      );
    }

    // Authenticated Password Change
    if (path === '/api/auth/change-password' && method === 'POST') {
      const currentUserId = await getAuthUserId(request, ctx.jwtSecret, db);
      if (!currentUserId) {
        return errorResponse('Unauthorized', 401, request);
      }

      const body: any = await request.json().catch(() => ({}));
      const { currentPassword, newPassword } = body;

      if (!currentPassword || !newPassword) {
        return errorResponse('Current password and new password are required.', 400, request);
      }

      if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return errorResponse('New password must be at least 6 characters.', 400, request);
      }

      const userRow: any = await db
        .prepare('SELECT id, password_hash FROM users WHERE id = ?')
        .bind(currentUserId)
        .first();

      if (!userRow) {
        return errorResponse('User not found.', 404, request);
      }

      const isValid = await verifyPassword(currentPassword, userRow.password_hash);
      if (!isValid) {
        return errorResponse('Current password is incorrect.', 400, request);
      }

      const newPasswordHash = await hashPassword(newPassword);
      const now = Date.now();

      await db
        .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .bind(newPasswordHash, now, currentUserId)
        .run();

      return jsonResponse(
        {
          success: true,
          message: 'Password updated successfully.',
        },
        200,
        {},
        request
      );
    }

    // -------------------------------------------------------------
    // UPLOAD IMAGE (Cloudflare R2 or Persistent Disk)
    // -------------------------------------------------------------
    if (path === '/api/upload' && method === 'POST') {
      const currentUserId = await getAuthUserId(request, ctx.jwtSecret, ctx.db);
      if (!currentUserId) {
        return errorResponse('Unauthorized to upload', 401, request);
      }

      const contentType = request.headers.get('content-type') || '';
      let buffer: Uint8Array;
      let mimeType = 'image/jpeg';

      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) {
          return errorResponse('No file provided in form data.');
        }
        mimeType = file.type;
        const arrayBuf = await file.arrayBuffer();
        buffer = new Uint8Array(arrayBuf);
      } else {
        mimeType = contentType.split(';')[0].trim();
        const arrayBuf = await request.arrayBuffer();
        buffer = new Uint8Array(arrayBuf);
      }

      const validation = validateImageUpload(mimeType, buffer.length);
      if (!validation.valid) {
        return errorResponse(validation.error || 'Invalid image file', 400);
      }

      const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const fileKey = `${currentUserId}_${Date.now()}_${generateId(6)}.${ext}`;

      const { url: publicUrl } = await ctx.storage.put(fileKey, buffer, mimeType);
      return jsonResponse({
        success: true,
        data: {
          url: publicUrl,
          key: fileKey,
          contentType: mimeType,
          size: buffer.length,
        },
      });
    }

    // -------------------------------------------------------------
    // POSTS: /api/posts
    // -------------------------------------------------------------
    if (path === '/api/posts' && method === 'GET') {
      const currentUserId = await getAuthUserId(request, ctx.jwtSecret, ctx.db);
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
      const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '8', 10)));
      const offset = (page - 1) * limit;
      const targetUserId = url.searchParams.get('userId');

      let query = `
        SELECT 
          p.id, p.user_id, p.image_url, p.caption,
          p.song_title, p.song_artist, p.song_album, p.song_artwork_url, p.song_preview_url, p.song_provider_id,
          p.likes_count, p.comments_count, p.created_at,
          u.username, u.display_name, u.avatar_url,
          ${currentUserId ? `(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = '${currentUserId}') AS has_liked` : '0 AS has_liked'},
          ${currentUserId ? `(SELECT 1 FROM follows f WHERE f.following_id = p.user_id AND f.follower_id = '${currentUserId}') AS is_following` : '0 AS is_following'}
        FROM posts p
        JOIN users u ON p.user_id = u.id
      `;

      const params: any[] = [];
      if (targetUserId) {
        query += ' WHERE p.user_id = ?';
        params.push(targetUserId);
      }

      query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit + 1, offset);

      const statement = ctx.db.prepare(query).bind(...params);
      const { results } = await statement.all();

      const hasMore = results.length > limit;
      const postRows = hasMore ? results.slice(0, limit) : results;

      const posts: Post[] = postRows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        author: {
          id: r.user_id,
          username: r.username,
          displayName: r.display_name,
          avatarUrl: r.avatar_url,
        },
        imageUrl: r.image_url,
        caption: r.caption || '',
        song: r.song_title
          ? {
              title: r.song_title,
              artist: r.song_artist || '',
              album: r.song_album,
              artworkUrl: r.song_artwork_url,
              previewUrl: r.song_preview_url,
              providerId: r.song_provider_id,
            }
          : null,
        likesCount: Number(r.likes_count || 0),
        commentsCount: Number(r.comments_count || 0),
        hasLiked: Boolean(r.has_liked),
        isFollowingAuthor: Boolean(r.is_following),
        createdAt: Number(r.created_at),
      }));

      return jsonResponse({
        success: true,
        data: {
          posts,
          page,
          hasMore,
        },
      });
    }

    if (path === '/api/posts' && method === 'POST') {
      const currentUserId = await getAuthUserId(request, ctx.jwtSecret, ctx.db);
      if (!currentUserId) {
        return errorResponse('Authentication required to create a post.', 401, request);
      }

      const body: any = await request.json().catch(() => ({}));
      const { imageUrl, caption, song } = body;

      if (!imageUrl || typeof imageUrl !== 'string') {
        return errorResponse('Image URL is required for post creation.', 400, request);
      }

      const postId = `pst_${generateId(12)}`;
      const now = Date.now();

      await ctx.db
        .prepare(
          `INSERT INTO posts (
            id, user_id, image_url, caption,
            song_title, song_artist, song_album, song_artwork_url, song_preview_url, song_provider_id,
            likes_count, comments_count, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`
        )
        .bind(
          postId,
          currentUserId,
          imageUrl,
          (caption || '').trim(),
          song?.title || null,
          song?.artist || null,
          song?.album || null,
          song?.artworkUrl || null,
          song?.previewUrl || null,
          song?.providerId || null,
          now
        )
        .run();

      const authorRow: any = await ctx.db
        .prepare('SELECT username, display_name, avatar_url FROM users WHERE id = ?')
        .bind(currentUserId)
        .first();

      const createdPost: Post = {
        id: postId,
        userId: currentUserId,
        author: {
          id: currentUserId,
          username: authorRow?.username || 'user',
          displayName: authorRow?.display_name || 'Creator',
          avatarUrl: authorRow?.avatar_url,
        },
        imageUrl,
        caption: (caption || '').trim(),
        song: song?.title ? song : null,
        likesCount: 0,
        commentsCount: 0,
        hasLiked: false,
        isFollowingAuthor: false,
        createdAt: now,
      };

      return jsonResponse({ success: true, data: { post: createdPost } });
    }

    // -------------------------------------------------------------
    // LIKES: /api/posts/:id/like
    // -------------------------------------------------------------
    const likeMatch = path.match(/^\/api\/posts\/([a-zA-Z0-9_-]+)\/like$/);
    if (likeMatch && method === 'POST') {
      const currentUserId = await getAuthUserId(request, ctx.jwtSecret, ctx.db);
      if (!currentUserId) {
        return errorResponse('Authentication required to like.', 401, request);
      }
      const postId = likeMatch[1];

      const postExists = await ctx.db.prepare('SELECT id, likes_count FROM posts WHERE id = ?').bind(postId).first();
      if (!postExists) {
        return errorResponse('Post not found', 404, request);
      }

      const existingLike = await ctx.db
        .prepare('SELECT id FROM likes WHERE user_id = ? AND post_id = ?')
        .bind(currentUserId, postId)
        .first();

      let hasLiked: boolean;
      let newCount: number;

      if (existingLike) {
        // Unlike
        await ctx.db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').bind(currentUserId, postId).run();
        await ctx.db.prepare('UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').bind(postId).run();
        hasLiked = false;
      } else {
        // Like
        const likeId = `lik_${generateId(12)}`;
        await ctx.db
          .prepare('INSERT INTO likes (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)')
          .bind(likeId, currentUserId, postId, Date.now())
          .run();
        await ctx.db.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').bind(postId).run();
        hasLiked = true;
      }

      const updatedRow: any = await ctx.db.prepare('SELECT likes_count FROM posts WHERE id = ?').bind(postId).first();
      newCount = Number(updatedRow?.likes_count || 0);

      return jsonResponse({ success: true, data: { hasLiked, likesCount: newCount } });
    }

    // -------------------------------------------------------------
    // COMMENTS: /api/posts/:id/comments
    // -------------------------------------------------------------
    const commentsMatch = path.match(/^\/api\/posts\/([a-zA-Z0-9_-]+)\/comments$/);
    if (commentsMatch) {
      const postId = commentsMatch[1];

      if (method === 'GET') {
        const rows: any = await ctx.db
          .prepare(
            `SELECT c.id, c.post_id, c.user_id, c.content, c.created_at,
                    u.username, u.display_name, u.avatar_url
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.post_id = ?
             ORDER BY c.created_at ASC`
          )
          .bind(postId)
          .all();

        const comments: Comment[] = (rows.results || []).map((r: any) => ({
          id: r.id,
          postId: r.post_id,
          userId: r.user_id,
          author: {
            username: r.username,
            displayName: r.display_name,
            avatarUrl: r.avatar_url,
          },
          content: r.content,
          createdAt: Number(r.created_at),
        }));

        return jsonResponse({ success: true, data: { comments } });
      }

      if (method === 'POST') {
        const currentUserId = await getAuthUserId(request, ctx.jwtSecret, ctx.db);
        if (!currentUserId) {
          return errorResponse('Authentication required to comment.', 401, request);
        }

        const body: any = await request.json().catch(() => ({}));
        const content = (body.content || '').trim();
        if (!content) {
          return errorResponse('Comment content cannot be empty.');
        }
        if (content.length > 500) {
          return errorResponse('Comment length limit is 500 characters.');
        }

        const commentId = `cmt_${generateId(12)}`;
        const now = Date.now();

        await ctx.db
          .prepare('INSERT INTO comments (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(commentId, postId, currentUserId, content, now)
          .run();

        await ctx.db.prepare('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?').bind(postId).run();

        const userRow: any = await ctx.db
          .prepare('SELECT username, display_name, avatar_url FROM users WHERE id = ?')
          .bind(currentUserId)
          .first();

        const comment: Comment = {
          id: commentId,
          postId,
          userId: currentUserId,
          author: {
            username: userRow?.username || 'user',
            displayName: userRow?.display_name || 'User',
            avatarUrl: userRow?.avatar_url,
          },
          content,
          createdAt: now,
        };

        return jsonResponse({ success: true, data: { comment } });
      }
    }

    // -------------------------------------------------------------
    // USER PROFILE: /api/users/:username
    // -------------------------------------------------------------
    const userMatch = path.match(/^\/api\/users\/([a-zA-Z0-9_-]+)$/);
    if (userMatch && method === 'GET') {
      const username = userMatch[1].toLowerCase();
      const currentUserId = await getAuthUserId(request, ctx.jwtSecret, ctx.db);

      const userRow: any = await ctx.db
        .prepare('SELECT id, username, display_name, bio, avatar_url, created_at FROM users WHERE username = ?')
        .bind(username)
        .first();

      if (!userRow) {
        return errorResponse('User profile not found', 404);
      }

      const userId = userRow.id;

      // Efficient queries for social counters
      const postsCountRow: any = await ctx.db
        .prepare('SELECT count(*) as count FROM posts WHERE user_id = ?')
        .bind(userId)
        .first();

      const followersCountRow: any = await ctx.db
        .prepare('SELECT count(*) as count FROM follows WHERE following_id = ?')
        .bind(userId)
        .first();

      const followingCountRow: any = await ctx.db
        .prepare('SELECT count(*) as count FROM follows WHERE follower_id = ?')
        .bind(userId)
        .first();

      const likesCountRow: any = await ctx.db
        .prepare('SELECT COALESCE(SUM(likes_count), 0) as total FROM posts WHERE user_id = ?')
        .bind(userId)
        .first();

      let isFollowing = false;
      if (currentUserId && currentUserId !== userId) {
        const followCheck = await ctx.db
          .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
          .bind(currentUserId, userId)
          .first();
        isFollowing = Boolean(followCheck);
      }

      const profile: UserPublicProfile = {
        id: userRow.id,
        username: userRow.username,
        displayName: userRow.display_name,
        bio: userRow.bio || '',
        avatarUrl: userRow.avatar_url || '',
        postsCount: Number(postsCountRow?.count || 0),
        followersCount: Number(followersCountRow?.count || 0),
        followingCount: Number(followingCountRow?.count || 0),
        totalLikesReceived: Number(likesCountRow?.total || 0),
        isFollowing,
      };

      return jsonResponse({ success: true, data: { profile } });
    }

    // -------------------------------------------------------------
    // FOLLOW: /api/users/:id/follow
    // -------------------------------------------------------------
    const followMatch = path.match(/^\/api\/users\/([a-zA-Z0-9_-]+)\/follow$/);
    if (followMatch && method === 'POST') {
      const currentUserId = await getAuthUserId(request, ctx.jwtSecret, ctx.db);
      if (!currentUserId) {
        return errorResponse('Authentication required to follow.', 401, request);
      }
      const targetUserId = followMatch[1];
      if (currentUserId === targetUserId) {
        return errorResponse('Cannot follow yourself.', 400, request);
      }

      const existingFollow = await ctx.db
        .prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?')
        .bind(currentUserId, targetUserId)
        .first();

      let isFollowing: boolean;
      if (existingFollow) {
        await ctx.db
          .prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?')
          .bind(currentUserId, targetUserId)
          .run();
        isFollowing = false;
      } else {
        const followId = `flw_${generateId(12)}`;
        await ctx.db
          .prepare('INSERT INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)')
          .bind(followId, currentUserId, targetUserId, Date.now())
          .run();
        isFollowing = true;
      }

      return jsonResponse({ success: true, data: { isFollowing } });
    }

    // -------------------------------------------------------------
    // MUSIC SEARCH: /api/music/search?q=...
    // -------------------------------------------------------------
    if (path === '/api/music/search' && method === 'GET') {
      const query = url.searchParams.get('q') || '';
      const result = await ctx.musicProvider.search(query);
      return jsonResponse({ success: true, data: result });
    }

    // -------------------------------------------------------------
    // WALLET: /api/wallet
    // -------------------------------------------------------------
    if (path === '/api/wallet' && method === 'GET') {
      const currentUserId = await getAuthUserId(request, ctx.jwtSecret, ctx.db);
      if (!currentUserId) {
        return errorResponse('Authentication required for wallet.', 401, request);
      }

      let walletRow: any = await ctx.db
        .prepare('SELECT id, user_id, balance, total_earned, total_withdrawn, updated_at FROM wallets WHERE user_id = ?')
        .bind(currentUserId)
        .first();

      if (!walletRow) {
        // Initialize if not present
        const walletId = `wlt_${generateId(12)}`;
        const now = Date.now();
        await ctx.db
          .prepare('INSERT INTO wallets (id, user_id, balance, total_earned, total_withdrawn, updated_at) VALUES (?, ?, 0.00, 0.00, 0.00, ?)')
          .bind(walletId, currentUserId, now)
          .run();
        walletRow = { id: walletId, user_id: currentUserId, balance: 0.0, total_earned: 0.0, total_withdrawn: 0.0, updated_at: now };
      }

      const transactionsQuery: any = await ctx.db
        .prepare('SELECT id, wallet_id, user_id, type, amount, status, provider, description, reference_id, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
        .bind(currentUserId)
        .all();

      return jsonResponse({
        success: true,
        data: {
          wallet: {
            userId: walletRow.user_id,
            balance: Number(walletRow.balance || 0),
            totalEarned: Number(walletRow.total_earned || 0),
            totalWithdrawn: Number(walletRow.total_withdrawn || 0),
            updatedAt: Number(walletRow.updated_at || Date.now()),
          },
          transactions: (transactionsQuery.results || []).map((t: any) => ({
            id: t.id,
            walletId: t.wallet_id,
            userId: t.user_id,
            type: t.type,
            amount: Number(t.amount || 0),
            status: t.status,
            provider: t.provider || undefined,
            description: t.description,
            referenceId: t.reference_id || undefined,
            createdAt: Number(t.created_at),
          })),
        },
      });
    }

    // -------------------------------------------------------------
    // WITHDRAWALS: /api/withdrawals
    // -------------------------------------------------------------
    if (path === '/api/withdrawals' && method === 'POST') {
      const currentUserId = await getAuthUserId(request, ctx.jwtSecret, ctx.db);
      if (!currentUserId) {
        return errorResponse('Authentication required to withdraw.', 401, request);
      }

      const body: any = await request.json().catch(() => ({}));
      const amount = Number(body.amount);
      const payoutMethod = body.payoutMethod;
      const destinationAccount = (body.destinationAccount || '').trim();

      if (isNaN(amount) || amount <= 0) {
        return errorResponse('Invalid withdrawal amount.', 400, request);
      }
      if (amount < 5.0) {
        return errorResponse('Minimum withdrawal threshold is $5.00.', 400, request);
      }
      if (!destinationAccount) {
        return errorResponse('Payout destination account/address is required.', 400, request);
      }
      if (!['paypal', 'crypto_usdt', 'bank'].includes(payoutMethod)) {
        return errorResponse('Invalid payout method.', 400, request);
      }

      // Authoritative server-side balance check & transaction
      const walletRow: any = await ctx.db
        .prepare('SELECT id, balance, total_withdrawn FROM wallets WHERE user_id = ?')
        .bind(currentUserId)
        .first();

      if (!walletRow || Number(walletRow.balance) < amount) {
        return errorResponse('Insufficient wallet balance for this withdrawal.', 400, request);
      }

      const now = Date.now();
      const newBalance = Number(walletRow.balance) - amount;
      const newWithdrawn = Number(walletRow.total_withdrawn || 0) + amount;

      await ctx.db
        .prepare('UPDATE wallets SET balance = ?, total_withdrawn = ?, updated_at = ? WHERE user_id = ?')
        .bind(newBalance, newWithdrawn, now, currentUserId)
        .run();

      const withdrawalId = `wdr_${generateId(12)}`;
      await ctx.db
        .prepare(
          'INSERT INTO withdrawals (id, user_id, amount, payout_method, destination_account, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(withdrawalId, currentUserId, amount, payoutMethod, destinationAccount, 'pending', now)
        .run();

      const txId = `tx_${generateId(12)}`;
      await ctx.db
        .prepare(
          'INSERT INTO transactions (id, wallet_id, user_id, type, amount, status, description, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          txId,
          walletRow.id,
          currentUserId,
          'withdrawal',
          -amount,
          'pending',
          `Withdrawal via ${payoutMethod.toUpperCase()} (${destinationAccount})`,
          withdrawalId,
          now
        )
        .run();

      return jsonResponse({
        success: true,
        data: {
          withdrawalId,
          newBalance,
          amount,
          status: 'pending',
        },
      });
    }

    // -------------------------------------------------------------
    // EARN: /api/earn/providers & Attention Monetization
    // -------------------------------------------------------------
    if (path === '/api/earn/providers' && method === 'GET') {
      const statuses = ctx.rewardService.getProviderStatuses();
      return jsonResponse({ success: true, data: { providers: statuses } });
    }

    // Attention Monetization Engine: Server-controlled attention reward
    if (path === '/api/earn/attention-reward' && method === 'POST') {
      const currentUserId = await getAuthUserId(request, ctx.jwtSecret, ctx.db);
      if (!currentUserId) {
        return errorResponse('Authentication required.', 401, request);
      }

      // Check daily attention claims to prevent spamming
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const recentClaim: any = await ctx.db
        .prepare("SELECT id FROM transactions WHERE user_id = ? AND type = 'engagement' AND created_at >= ?")
        .bind(currentUserId, todayStart.getTime())
        .first();

      if (recentClaim) {
        return errorResponse('Daily attention reward already credited for today. Come back tomorrow!');
      }

      // Server decides exact payout amount ($0.15 for verified attention session)
      const rewardAmount = 0.15;
      const now = Date.now();

      const walletRow: any = await ctx.db
        .prepare('SELECT id, balance, total_earned FROM wallets WHERE user_id = ?')
        .bind(currentUserId)
        .first();

      if (!walletRow) {
        return errorResponse('Wallet not found');
      }

      const newBalance = Number(walletRow.balance) + rewardAmount;
      const newTotalEarned = Number(walletRow.total_earned) + rewardAmount;

      await ctx.db
        .prepare('UPDATE wallets SET balance = ?, total_earned = ?, updated_at = ? WHERE user_id = ?')
        .bind(newBalance, newTotalEarned, now, currentUserId)
        .run();

      const txId = `tx_${generateId(12)}`;
      await ctx.db
        .prepare(
          'INSERT INTO transactions (id, wallet_id, user_id, type, amount, status, provider, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          txId,
          walletRow.id,
          currentUserId,
          'engagement',
          rewardAmount,
          'completed',
          'attention_reward',
          'Daily Sphere Attention & Engagement Session Reward',
          now
        )
        .run();

      return jsonResponse({
        success: true,
        data: {
          rewardAmount,
          newBalance,
          message: 'Attention session verified. $0.15 credited to your persistent wallet.',
        },
      });
    }

    // -------------------------------------------------------------
    // EARN: Sandbox Simulation Reward Test Runner
    // POST /api/earn/simulate-reward
    // -------------------------------------------------------------
    if (path === '/api/earn/simulate-reward' && method === 'POST') {
      const currentUserId = await getAuthUserId(request, ctx.jwtSecret, ctx.db);
      if (!currentUserId) {
        return errorResponse('Authentication required to test reward credit.', 401, request);
      }

      const body: any = await request.json().catch(() => ({}));
      const providerId = typeof body.providerId === 'string' ? body.providerId : 'sandbox_test';
      const requestedAmount = typeof body.amount === 'number' ? body.amount : 0.25;
      const safeAmount = Math.min(Math.max(Number(requestedAmount.toFixed(2)), 0.05), 1.00);

      let walletRow: any = await ctx.db
        .prepare('SELECT id, balance, total_earned FROM wallets WHERE user_id = ?')
        .bind(currentUserId)
        .first();

      const now = Date.now();
      if (!walletRow) {
        const newWalletId = `w_${generateId(12)}`;
        await ctx.db
          .prepare('INSERT INTO wallets (id, user_id, balance, total_earned, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)')
          .bind(newWalletId, currentUserId, now, now)
          .run();
        walletRow = { id: newWalletId, balance: 0, total_earned: 0 };
      }

      const newBalance = Number((walletRow.balance + safeAmount).toFixed(2));
      const newTotalEarned = Number((walletRow.total_earned + safeAmount).toFixed(2));

      await ctx.db
        .prepare('UPDATE wallets SET balance = ?, total_earned = ?, updated_at = ? WHERE user_id = ?')
        .bind(newBalance, newTotalEarned, now, currentUserId)
        .run();

      const txId = `tx_${generateId(12)}`;
      await ctx.db
        .prepare(
          'INSERT INTO transactions (id, wallet_id, user_id, type, amount, status, provider, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          txId,
          walletRow.id,
          currentUserId,
          'reward',
          safeAmount,
          'completed',
          providerId,
          `Integration Test Reward Credit (${providerId.toUpperCase()})`,
          now
        )
        .run();

      return jsonResponse({
        success: true,
        data: {
          rewardAmount: safeAmount,
          newBalance,
          message: `Successfully credited $${safeAmount.toFixed(2)} to your persistent wallet.`,
        },
      });
    }

    // -------------------------------------------------------------
    // EARN: Server-to-Server Webhook / Postback Endpoint
    // GET / POST /api/earn/postback/:provider
    // -------------------------------------------------------------
    if (path.startsWith('/api/earn/postback/') && (method === 'GET' || method === 'POST')) {
      const providerKey = path.replace('/api/earn/postback/', '').trim().toLowerCase();
      let payload: Record<string, any> = {};

      if (method === 'GET') {
        const searchParams = url.searchParams;
        for (const [k, v] of searchParams.entries()) {
          payload[k] = v;
        }
      } else {
        payload = await request.json().catch(() => ({}));
      }

      const rawUserId = payload.player_id || payload.user_id || payload.sub_id || payload.uid;
      const rawAmount = parseFloat(payload.amount || payload.payout || payload.reward || '0');
      const rawTxId = payload.tx_id || payload.transaction_id || payload.campaign_id || payload.event_id || payload.id;
      const signature = payload.signature || payload.sig;

      if (!rawUserId) {
        return errorResponse('Missing user identifier (player_id/user_id) in postback.', 400, request);
      }

      if (isNaN(rawAmount) || rawAmount <= 0) {
        return errorResponse('Invalid reward amount in postback.', 400, request);
      }

      // Check if user exists in database
      const userRecord: any = await ctx.db
        .prepare('SELECT id, username FROM users WHERE id = ? OR username = ?')
        .bind(rawUserId, rawUserId)
        .first();

      if (!userRecord) {
        return errorResponse(`User '${rawUserId}' not found in Sphere database.`, 404, request);
      }

      const matchedUserId = userRecord.id;
      const referenceId = rawTxId ? `${providerKey}_${rawTxId}` : `postback_${generateId(16)}`;

      // Idempotency constraint: check if transaction was already processed
      const existingTx: any = await ctx.db
        .prepare('SELECT id FROM transactions WHERE reference_id = ?')
        .bind(referenceId)
        .first();

      if (existingTx) {
        // Return OK / 1 immediately to satisfy provider retry policy without double-crediting
        return new Response('1', { status: 200, headers: { 'Content-Type': 'text/plain', ...getCorsHeaders(request) } });
      }

      const now = Date.now();
      let walletRow: any = await ctx.db
        .prepare('SELECT id, balance, total_earned FROM wallets WHERE user_id = ?')
        .bind(matchedUserId)
        .first();

      if (!walletRow) {
        const newWalletId = `w_${generateId(12)}`;
        await ctx.db
          .prepare('INSERT INTO wallets (id, user_id, balance, total_earned, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)')
          .bind(newWalletId, matchedUserId, now, now)
          .run();
        walletRow = { id: newWalletId, balance: 0, total_earned: 0 };
      }

      const creditAmount = Number(rawAmount.toFixed(2));
      const newBalance = Number((walletRow.balance + creditAmount).toFixed(2));
      const newTotalEarned = Number((walletRow.total_earned + creditAmount).toFixed(2));

      await ctx.db
        .prepare('UPDATE wallets SET balance = ?, total_earned = ?, updated_at = ? WHERE user_id = ?')
        .bind(newBalance, newTotalEarned, now, matchedUserId)
        .run();

      const txId = `tx_${generateId(12)}`;
      await ctx.db
        .prepare(
          'INSERT INTO transactions (id, wallet_id, user_id, type, amount, status, provider, reference_id, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          txId,
          walletRow.id,
          matchedUserId,
          'reward',
          creditAmount,
          'completed',
          providerKey,
          referenceId,
          `Postback reward credit from ${providerKey.toUpperCase()}`,
          now
        )
        .run();

      // Standard response for offerwall postbacks (AdGem, Offerwall expect '1' or HTTP 200)
      return new Response('1', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', ...getCorsHeaders(request) },
      });
    }

    return errorResponse(`Endpoint not found: ${method} ${path}`, 404);
  } catch (error: any) {
    console.error('[Sphere API Unhandled Error]:', error);
    return errorResponse(error.message || 'Internal Server Error', 500);
  }
}
