ALTER TABLE matches ADD COLUMN live_home_score INTEGER;
ALTER TABLE matches ADD COLUMN live_away_score INTEGER;
ALTER TABLE matches ADD COLUMN live_minute INTEGER;
ALTER TABLE matches ADD COLUMN last_live_synced_at TEXT;

CREATE TABLE leaderboard_snapshots (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  match_id TEXT,
  user_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  points INTEGER NOT NULL,
  exact_scores INTEGER NOT NULL DEFAULT 0,
  correct_results INTEGER NOT NULL DEFAULT 0,
  predictions_count INTEGER NOT NULL DEFAULT 0,
  snapshot_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(league_id) REFERENCES leagues(id),
  FOREIGN KEY(match_id) REFERENCES matches(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX idx_matches_status_kickoff ON matches(status, kickoff_at);
CREATE INDEX idx_leaderboard_snapshots_league_match_type ON leaderboard_snapshots(league_id, match_id, snapshot_type);
CREATE INDEX idx_leaderboard_snapshots_user ON leaderboard_snapshots(user_id);
