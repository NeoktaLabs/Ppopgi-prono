CREATE TABLE IF NOT EXISTS wrapup_erratum_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  sent_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_wrapup_erratum_emails_sent_at
ON wrapup_erratum_emails(sent_at);
