// Habit data is private to its owner. Archiving retains daily history.
module.exports = `
CREATE TABLE IF NOT EXISTS habits (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  category TEXT NOT NULL DEFAULT 'personal' CHECK (length(category) BETWEEN 1 AND 32),
  icon TEXT NOT NULL DEFAULT 'leaf' CHECK (length(icon) BETWEEN 1 AND 24),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id,id)
);
CREATE TABLE IF NOT EXISTS habit_logs (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id INT NOT NULL,
  day DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (habit_id,day),
  FOREIGN KEY (user_id,habit_id) REFERENCES habits(user_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS habit_logs_owner_day ON habit_logs(user_id,day);
`;