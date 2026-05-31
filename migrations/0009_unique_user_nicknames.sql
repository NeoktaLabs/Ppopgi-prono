CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_unique_ci
ON users(LOWER(TRIM(nickname)))
WHERE nickname IS NOT NULL;
