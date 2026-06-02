CREATE TABLE IF NOT EXISTS ai_refresh_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  team_offset INTEGER NOT NULL DEFAULT 0,
  fixture_offset INTEGER NOT NULL DEFAULT 0,
  team_limit INTEGER NOT NULL DEFAULT 1,
  fixture_limit INTEGER NOT NULL DEFAULT 2,
  historical_detail_limit INTEGER NOT NULL DEFAULT 5,
  total_teams INTEGER,
  total_fixtures INTEGER,
  last_result_json TEXT,
  error_message TEXT,
  started_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  last_run_at TEXT,
  FOREIGN KEY(started_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_refresh_jobs_status_updated
ON ai_refresh_jobs(status, updated_at DESC);
