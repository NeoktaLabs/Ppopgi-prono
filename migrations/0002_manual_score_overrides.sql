ALTER TABLE matches ADD COLUMN manual_final_home INTEGER;
ALTER TABLE matches ADD COLUMN manual_final_away INTEGER;
ALTER TABLE matches ADD COLUMN manual_score_set_by_user_id TEXT REFERENCES users(id);
ALTER TABLE matches ADD COLUMN manual_score_set_at TEXT;
ALTER TABLE matches ADD COLUMN score_source TEXT NOT NULL DEFAULT 'api';

CREATE INDEX idx_matches_manual_score_set_by_user_id ON matches(manual_score_set_by_user_id);
