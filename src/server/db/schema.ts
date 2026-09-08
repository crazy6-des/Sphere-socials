import { DatabaseAdapter } from './adapter';

export const SCHEMA_SQL = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Posts table (image only - strictly no video)
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  song_title TEXT DEFAULT NULL,
  song_artist TEXT DEFAULT NULL,
  song_album TEXT DEFAULT NULL,
  song_artwork_url TEXT DEFAULT NULL,
  song_preview_url TEXT DEFAULT NULL,
  song_provider_id TEXT DEFAULT NULL,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Likes table
CREATE TABLE IF NOT EXISTS likes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, post_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Follows table
CREATE TABLE IF NOT EXISTS follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  balance REAL DEFAULT 0.00,
  total_earned REAL DEFAULT 0.00,
  total_withdrawn REAL DEFAULT 0.00,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL,
  provider TEXT,
  description TEXT NOT NULL,
  reference_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Withdrawals table
CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  payout_method TEXT NOT NULL,
  destination_account TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Sessions table for persistent server-managed session management & revocation
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  user_agent TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  expires_at INTEGER NOT NULL,
  refresh_expires_at INTEGER NOT NULL,
  revoked INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Password Resets table for persistent, single-use, timed reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Query optimization indexes
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_post ON likes(user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh ON sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);
`;

let schemaInitialized = false;

export async function initializeDatabase(db: DatabaseAdapter): Promise<void> {
  if (schemaInitialized) return;
  try {
    await db.exec(SCHEMA_SQL);
    schemaInitialized = true;
    console.log('[Sphere DB] Schema initialized successfully.');
  } catch (error: any) {
    console.error('[Sphere DB] Schema initialization error:', error.message);
    throw error;
  }
}
