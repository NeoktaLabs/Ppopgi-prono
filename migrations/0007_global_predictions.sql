UPDATE predictions
SET
  points = (
    SELECT MAX(other.points)
    FROM predictions other
    WHERE other.user_id = predictions.user_id AND other.match_id = predictions.match_id
  ),
  is_exact = (
    SELECT MAX(other.is_exact)
    FROM predictions other
    WHERE other.user_id = predictions.user_id AND other.match_id = predictions.match_id
  ),
  is_correct_result = (
    SELECT MAX(other.is_correct_result)
    FROM predictions other
    WHERE other.user_id = predictions.user_id AND other.match_id = predictions.match_id
  ),
  bonus_used = (
    SELECT MAX(other.bonus_used)
    FROM predictions other
    WHERE other.user_id = predictions.user_id AND other.match_id = predictions.match_id
  )
WHERE rowid IN (
  SELECT MAX(rowid)
  FROM predictions
  GROUP BY user_id, match_id
);

DELETE FROM predictions
WHERE rowid NOT IN (
  SELECT MAX(rowid)
  FROM predictions
  GROUP BY user_id, match_id
);

CREATE UNIQUE INDEX idx_predictions_user_match_unique ON predictions(user_id, match_id);
CREATE INDEX idx_predictions_user_match ON predictions(user_id, match_id);
