CREATE TABLE global_leaderboard_snapshots (
  id TEXT PRIMARY KEY,
  match_id TEXT,
  user_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  points INTEGER NOT NULL,
  exact_scores INTEGER NOT NULL DEFAULT 0,
  correct_results INTEGER NOT NULL DEFAULT 0,
  predictions_count INTEGER NOT NULL DEFAULT 0,
  snapshot_type TEXT NOT NULL,
  snapshot_key TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(id)
);

CREATE INDEX idx_global_leaderboard_snapshots_key_type ON global_leaderboard_snapshots(snapshot_key, snapshot_type);
CREATE INDEX idx_global_leaderboard_snapshots_user ON global_leaderboard_snapshots(user_id);
