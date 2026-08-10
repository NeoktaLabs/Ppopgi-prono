-- Use only after exporting a full backup and generating the Hall of Fame archive.
-- This keeps users, emails, nicknames, preferences, and global-admin flags.
-- It removes tournament data, auth sessions, emails logs, API cache, AI cache, leagues, and predictions.

PRAGMA foreign_keys = OFF;

DELETE FROM wrapup_erratum_emails;
DELETE FROM wrapup_emails;
DELETE FROM kickoff_emails;
DELETE FROM prediction_reminder_emails;
DELETE FROM prediction_audit_logs;

DELETE FROM global_leaderboard_snapshots;
DELETE FROM leaderboard_snapshots;

DELETE FROM ai_refresh_jobs;
DELETE FROM ai_fixture_insights;
DELETE FROM ai_football_dataset_cache;
DELETE FROM ai_football_fixtures;
DELETE FROM ai_football_teams;

DELETE FROM predictions;
DELETE FROM league_members;
DELETE FROM leagues;
DELETE FROM matches;
DELETE FROM sync_logs;

DELETE FROM sessions;
DELETE FROM magic_links;
DELETE FROM pending_signups;

PRAGMA foreign_keys = ON;
VACUUM;
