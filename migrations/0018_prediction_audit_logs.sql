CREATE TABLE IF NOT EXISTS prediction_audit_logs (
  id TEXT PRIMARY KEY,
  prediction_id TEXT,
  user_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
  old_home_score INTEGER,
  old_away_score INTEGER,
  old_bonus_used INTEGER,
  new_home_score INTEGER,
  new_away_score INTEGER,
  new_bonus_used INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prediction_audit_user_match ON prediction_audit_logs(user_id, match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_audit_match ON prediction_audit_logs(match_id, created_at DESC);
