CREATE TABLE IF NOT EXISTS ai_fixture_insights (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  stats_hash TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  insight_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(match_id, stats_hash),
  FOREIGN KEY(match_id) REFERENCES matches(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_fixture_insights_match_updated
ON ai_fixture_insights(match_id, updated_at DESC);
