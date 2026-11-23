// Extra schema for v2 features. Executed after the core schema.
module.exports = `
CREATE TABLE IF NOT EXISTS quran_progress (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, last_surah INT DEFAULT 1, last_ayah INT DEFAULT 1,
  khatam_count INT DEFAULT 0, daily_goal INT DEFAULT 5, translation TEXT DEFAULT 'en.pickthall', reciter TEXT DEFAULT 'ar.alafasy',
  updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS quran_read (
  user_id INT REFERENCES users(id) ON DELETE CASCADE, surah INT NOT NULL, ayah INT NOT NULL, cycle INT DEFAULT 0,
  day DATE NOT NULL, PRIMARY KEY(user_id, surah, ayah, cycle));
CREATE INDEX IF NOT EXISTS idx_quran_read_day ON quran_read(user_id, day);
CREATE TABLE IF NOT EXISTS bookmarks (
  id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, ref TEXT NOT NULL,
  title TEXT, note TEXT, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(user_id, kind, ref));
CREATE TABLE IF NOT EXISTS hifz_items (
  user_id INT REFERENCES users(id) ON DELETE CASCADE, surah INT NOT NULL, ayah INT NOT NULL,
  status TEXT DEFAULT 'new', ease REAL DEFAULT 2.5, interval_days INT DEFAULT 0, reps INT DEFAULT 0,
  due DATE, last_review DATE, PRIMARY KEY(user_id, surah, ayah));
CREATE TABLE IF NOT EXISTS tajweed_attempts (
  id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, surah INT, ayah INT,
  transcript TEXT, score INT, feedback TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS profiles (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, username TEXT UNIQUE NOT NULL, display_name TEXT,
  bio TEXT, location TEXT, avatar TEXT, private BOOLEAN DEFAULT false, is_admin BOOLEAN DEFAULT false,
  banned BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS follows (follower INT REFERENCES users(id) ON DELETE CASCADE, followee INT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(follower, followee));
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, kind TEXT DEFAULT 'post', body TEXT NOT NULL,
  image TEXT, status TEXT DEFAULT 'visible', mod_reason TEXT, dua_count INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY, post_id INT REFERENCES posts(id) ON DELETE CASCADE, user_id INT REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL, status TEXT DEFAULT 'visible', created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS likes (post_id INT REFERENCES posts(id) ON DELETE CASCADE, user_id INT REFERENCES users(id) ON DELETE CASCADE, kind TEXT DEFAULT 'like',
  PRIMARY KEY(post_id, user_id, kind));
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY, reporter INT REFERENCES users(id) ON DELETE CASCADE, target_kind TEXT, target_id INT,
  reason TEXT, resolved BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS blocks (blocker INT REFERENCES users(id) ON DELETE CASCADE, blocked INT REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(blocker, blocked));
CREATE TABLE IF NOT EXISTS message_vectors (message_id INT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE, user_id INT, embedding REAL[]);
CREATE TABLE IF NOT EXISTS conv_summaries (conversation_id INT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE, summary TEXT, upto_id INT, updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS user_profile_ai (user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, life_summary TEXT, patterns JSONB, updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS fasting (user_id INT REFERENCES users(id) ON DELETE CASCADE, day DATE NOT NULL, kind TEXT DEFAULT 'sunnah', PRIMARY KEY(user_id, day));
CREATE TABLE IF NOT EXISTS mp_cache (city_id TEXT PRIMARY KEY, data JSONB, fetched_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS audiobook_progress (user_id INT REFERENCES users(id) ON DELETE CASCADE, book TEXT, track INT, pos REAL, updated_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(user_id, book));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta JSONB;
`;
