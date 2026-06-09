CREATE TABLE IF NOT EXISTS prediction_reminder_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reminder_date TEXT NOT NULL,
  match_ids TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  UNIQUE(user_id, reminder_date),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prediction_reminder_emails_user_date
  ON prediction_reminder_emails(user_id, reminder_date);
