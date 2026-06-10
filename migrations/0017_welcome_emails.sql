CREATE TABLE IF NOT EXISTS welcome_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  sent_at TEXT NOT NULL,
  language TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_welcome_emails_user_id
  ON welcome_emails(user_id);
