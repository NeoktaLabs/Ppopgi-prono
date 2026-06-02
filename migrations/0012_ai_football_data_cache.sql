CREATE TABLE IF NOT EXISTS ai_football_teams (
  api_team_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  logo TEXT,
  country TEXT,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_football_fixtures (
  api_fixture_id INTEGER PRIMARY KEY,
  league_id INTEGER,
  league_name TEXT,
  league_season INTEGER,
  league_round TEXT,
  kickoff_at TEXT,
  status_short TEXT,
  status_long TEXT,
  home_team_api_id INTEGER,
  away_team_api_id INTEGER,
  home_goals INTEGER,
  away_goals INTEGER,
  payload_json TEXT NOT NULL,
  source_endpoint TEXT NOT NULL,
  source_params_json TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_football_dataset_cache (
  cache_key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  params_json TEXT NOT NULL,
  team_api_id INTEGER,
  fixture_api_id INTEGER,
  league_id INTEGER,
  season INTEGER,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_football_dataset_cache_expires
ON ai_football_dataset_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_ai_football_dataset_cache_team
ON ai_football_dataset_cache(team_api_id, endpoint, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_football_fixtures_home
ON ai_football_fixtures(home_team_api_id, league_id, league_season, kickoff_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_football_fixtures_away
ON ai_football_fixtures(away_team_api_id, league_id, league_season, kickoff_at DESC);
