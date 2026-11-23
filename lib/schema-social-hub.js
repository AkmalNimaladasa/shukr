// Run after schema2, schema-fyp and schema-fyp-social. See lib/social-hub.js integration notes.
module.exports = `
CREATE TABLE IF NOT EXISTS fyp_publications (
 id TEXT PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 content JSONB NOT NULL, published_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS social_stories (
 id TEXT PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lesson_id TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', content JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '24 hours');
CREATE INDEX IF NOT EXISTS social_stories_expiry ON social_stories(expires_at);
CREATE TABLE IF NOT EXISTS social_conversations (
 id TEXT PRIMARY KEY, starter INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 accepted BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(starter<>recipient));
CREATE UNIQUE INDEX IF NOT EXISTS social_conversations_pair ON social_conversations(LEAST(starter,recipient),GREATEST(starter,recipient));
CREATE TABLE IF NOT EXISTS social_messages (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
 sender INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS social_messages_thread ON social_messages(conversation_id,created_at);
CREATE INDEX IF NOT EXISTS social_messages_rate ON social_messages(sender,created_at);
CREATE TABLE IF NOT EXISTS social_reports (
 id SERIAL PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lesson_id TEXT NOT NULL,reason TEXT NOT NULL,details TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS social_takedowns (
 lesson_id TEXT PRIMARY KEY,reviewer INT NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now());
`;
