CREATE TABLE IF NOT EXISTS kickoff_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  sent_at TEXT NOT NULL,
  language TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_kickoff_emails_user_id
  ON kickoff_emails(user_id);
