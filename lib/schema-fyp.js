// Private learning data; deliberately separate from the public community profile.
module.exports = `
CREATE TABLE IF NOT EXISTS learning_profiles (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT NOT NULL DEFAULT '', interests JSONB NOT NULL DEFAULT '[]',
  level TEXT NOT NULL DEFAULT 'beginner', daily_goal INT NOT NULL DEFAULT 3 CHECK(daily_goal BETWEEN 1 AND 20),
  intention TEXT NOT NULL DEFAULT '', CHECK(level IN ('beginner','building','confident')));
CREATE TABLE IF NOT EXISTS fyp_progress (
  user_id INT REFERENCES users(id) ON DELETE CASCADE, lesson_id TEXT NOT NULL,
  liked BOOLEAN NOT NULL DEFAULT false, saved BOOLEAN NOT NULL DEFAULT false,
  completed BOOLEAN NOT NULL DEFAULT false, hidden BOOLEAN NOT NULL DEFAULT false,
  completed_day DATE, quiz_result JSONB, PRIMARY KEY(user_id,lesson_id));
CREATE TABLE IF NOT EXISTS fyp_feed_orders (
  user_id INT REFERENCES users(id) ON DELETE CASCADE, feed_key TEXT NOT NULL,
  lesson_ids JSONB NOT NULL, PRIMARY KEY(user_id,feed_key));
`;
