ALTER TABLE users ADD COLUMN email_language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN email_reminders_enabled INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_users_email_reminders_enabled
  ON users(email_reminders_enabled);
