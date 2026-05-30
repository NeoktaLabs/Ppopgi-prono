CREATE TABLE IF NOT EXISTS pending_signups (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_signups_token ON pending_signups(token_hash);
CREATE INDEX IF NOT EXISTS idx_pending_signups_email ON pending_signups(email);

PRAGMA foreign_keys = OFF;

CREATE TABLE predictions_new (
  id TEXT PRIMARY KEY,
  league_id TEXT,
  user_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  is_exact INTEGER NOT NULL DEFAULT 0,
  is_correct_result INTEGER NOT NULL DEFAULT 0,
  bonus_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, match_id),
  FOREIGN KEY(league_id) REFERENCES leagues(id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(match_id) REFERENCES matches(id)
);

INSERT INTO predictions_new (
  id, league_id, user_id, match_id, home_score, away_score, points, is_exact, is_correct_result, bonus_used, created_at, updated_at
)
SELECT
  id,
  league_id,
  user_id,
  match_id,
  home_score,
  away_score,
  points,
  is_exact,
  is_correct_result,
  bonus_used,
  created_at,
  updated_at
FROM predictions;

DROP TABLE predictions;
ALTER TABLE predictions_new RENAME TO predictions;

CREATE INDEX idx_predictions_league_user ON predictions(league_id, user_id);
CREATE INDEX idx_predictions_match ON predictions(match_id);
CREATE INDEX idx_predictions_user_match ON predictions(user_id, match_id);
CREATE UNIQUE INDEX idx_predictions_user_match_unique ON predictions(user_id, match_id);
CREATE INDEX idx_predictions_bonus_usage ON predictions(league_id, user_id, bonus_used);

PRAGMA foreign_keys = ON;
