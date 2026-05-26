PRAGMA foreign_keys = ON;

CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nickname TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE magic_links (id TEXT PRIMARY KEY, email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT, user_agent TEXT, ip_hash TEXT, FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, admin_user_id TEXT NOT NULL, is_joinable INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(admin_user_id) REFERENCES users(id));
CREATE TABLE league_members (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', joined_at TEXT NOT NULL, removed_at TEXT, removed_by_user_id TEXT, UNIQUE(league_id, user_id), FOREIGN KEY(league_id) REFERENCES leagues(id), FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE matches (id TEXT PRIMARY KEY, external_id TEXT UNIQUE NOT NULL, home_team TEXT NOT NULL, away_team TEXT NOT NULL, home_team_code TEXT, away_team_code TEXT, kickoff_at TEXT NOT NULL, stage TEXT, group_name TEXT, venue TEXT, status TEXT NOT NULL DEFAULT 'scheduled', score_90_home INTEGER, score_90_away INTEGER, score_120_home INTEGER, score_120_away INTEGER, penalty_home INTEGER, penalty_away INTEGER, final_home INTEGER, final_away INTEGER, points_multiplier INTEGER NOT NULL DEFAULT 1, api_provider TEXT NOT NULL, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE predictions (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, user_id TEXT NOT NULL, match_id TEXT NOT NULL, home_score INTEGER NOT NULL, away_score INTEGER NOT NULL, points INTEGER NOT NULL DEFAULT 0, is_exact INTEGER NOT NULL DEFAULT 0, is_correct_result INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(league_id, user_id, match_id), FOREIGN KEY(league_id) REFERENCES leagues(id), FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(match_id) REFERENCES matches(id));
CREATE TABLE sync_logs (id TEXT PRIMARY KEY, provider TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, message TEXT, created_at TEXT NOT NULL);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_magic_links_token_hash ON magic_links(token_hash);
CREATE INDEX idx_leagues_code ON leagues(code);
CREATE INDEX idx_league_members_league_id ON league_members(league_id);
CREATE INDEX idx_league_members_user_id ON league_members(user_id);
CREATE INDEX idx_predictions_league_user ON predictions(league_id, user_id);
CREATE INDEX idx_predictions_match ON predictions(match_id);
CREATE INDEX idx_matches_kickoff ON matches(kickoff_at);
