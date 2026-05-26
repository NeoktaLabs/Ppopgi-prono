ALTER TABLE leaderboard_snapshots ADD COLUMN snapshot_key TEXT;

CREATE INDEX idx_leaderboard_snapshots_league_key_type ON leaderboard_snapshots(league_id, snapshot_key, snapshot_type);
