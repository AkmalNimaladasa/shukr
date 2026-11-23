module.exports = `
ALTER TABLE fyp_progress ADD COLUMN IF NOT EXISTS reposted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE fyp_progress ADD COLUMN IF NOT EXISTS reposted_at TIMESTAMPTZ;
ALTER TABLE fyp_progress ADD COLUMN IF NOT EXISTS liked_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS fyp_views (
 user_id INT REFERENCES users(id) ON DELETE CASCADE, lesson_id TEXT NOT NULL, day DATE NOT NULL,
 session_id TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 watched_ms INT NOT NULL DEFAULT 0, duration_ms INT NOT NULL DEFAULT 0, max_position_ms INT NOT NULL DEFAULT 0,
 completed BOOLEAN NOT NULL DEFAULT false, slides_seen JSONB NOT NULL DEFAULT '[]',
 PRIMARY KEY(user_id,lesson_id,day));
CREATE TABLE IF NOT EXISTS fyp_comments (
 id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, lesson_id TEXT NOT NULL,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 hidden BOOLEAN NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS fyp_comments_post ON fyp_comments(lesson_id,created_at);
CREATE TABLE IF NOT EXISTS fyp_shares (
 user_id INT REFERENCES users(id) ON DELETE CASCADE, lesson_id TEXT NOT NULL, day DATE NOT NULL,
 PRIMARY KEY(user_id,lesson_id,day));
CREATE TABLE IF NOT EXISTS fyp_comment_reports (
 user_id INT REFERENCES users(id) ON DELETE CASCADE, comment_id INT REFERENCES fyp_comments(id) ON DELETE CASCADE,
 reason TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,comment_id));
`;