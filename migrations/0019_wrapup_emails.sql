CREATE TABLE IF NOT EXISTS wrapup_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  sent_at TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_wrapup_emails_sent_at
ON wrapup_emails(sent_at);
