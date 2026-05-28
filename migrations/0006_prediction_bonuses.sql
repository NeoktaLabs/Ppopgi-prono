ALTER TABLE predictions ADD COLUMN bonus_used INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_predictions_bonus_usage ON predictions(league_id, user_id, bonus_used);
