PRAGMA foreign_keys = ON;

INSERT INTO users (id, email, nickname, created_at, updated_at) VALUES
  ('demo-admin', 'codex@example.com', 'Codex', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-alice', 'alice@example.com', 'Alice', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-ben', 'ben@example.com', 'Ben', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-chloe', 'chloe@example.com', 'Chloe', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  nickname = excluded.nickname,
  updated_at = excluded.updated_at;

INSERT INTO leagues (id, name, code, admin_user_id, is_joinable, created_at, updated_at)
VALUES ('demo-league', 'Oddzz Demo League', 'DEMO26', 'demo-admin', 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  code = excluded.code,
  admin_user_id = excluded.admin_user_id,
  is_joinable = excluded.is_joinable,
  updated_at = excluded.updated_at;

INSERT INTO league_members (id, league_id, user_id, role, joined_at, removed_at, removed_by_user_id) VALUES
  ('demo-member-admin', 'demo-league', 'demo-admin', 'admin', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-alice', 'demo-league', 'demo-alice', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-ben', 'demo-league', 'demo-ben', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-chloe', 'demo-league', 'demo-chloe', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL)
ON CONFLICT(league_id, user_id) DO UPDATE SET
  role = excluded.role,
  removed_at = NULL,
  removed_by_user_id = NULL;

INSERT INTO matches (
  id, external_id, home_team, away_team, home_team_logo, away_team_logo, kickoff_at, stage, group_name, venue, status,
  score_90_home, score_90_away, score_120_home, score_120_away, penalty_home, penalty_away, final_home, final_away,
  manual_final_home, manual_final_away, score_source, live_home_score, live_away_score, live_minute, last_live_synced_at,
  points_multiplier, api_provider, last_synced_at, created_at, updated_at
) VALUES
  ('demo-match-past-group', 'demo-past-group', 'Mexico', 'South Africa', 'https://flagcdn.com/w80/mx.png', 'https://flagcdn.com/w80/za.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-4 days'), 'Group Stage - 1', 'A', 'Demo Stadium', 'finished', 1, 0, NULL, NULL, NULL, NULL, 1, 0, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 1, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-match-past-quarter', 'demo-past-quarter', 'France', 'Brazil', 'https://flagcdn.com/w80/fr.png', 'https://flagcdn.com/w80/br.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-2 days'), 'Quarter-finals', NULL, 'Demo Stadium', 'finished', 2, 1, NULL, NULL, NULL, NULL, 2, 1, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 4, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-match-live-group', 'demo-live-group', 'Canada', 'Bosnia & Herzegovina', 'https://flagcdn.com/w80/ca.png', 'https://flagcdn.com/w80/ba.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-28 minutes'), 'Group Stage - 2', 'B', 'Live Demo Stadium', 'live', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'api', 1, 0, 28, strftime('%Y-%m-%dT%H:%M:%SZ','now'), 1, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-match-live-semi', 'demo-live-semi', 'Japan', 'Germany', 'https://flagcdn.com/w80/jp.png', 'https://flagcdn.com/w80/de.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-72 minutes'), 'Semi-finals', NULL, 'Live Demo Stadium', '2H', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'api', 2, 2, 72, strftime('%Y-%m-%dT%H:%M:%SZ','now'), 5, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-match-future-group', 'demo-future-group', 'Senegal', 'Iraq', 'https://flagcdn.com/w80/sn.png', 'https://flagcdn.com/w80/iq.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','+2 days'), 'Group Stage - 3', 'C', 'Future Demo Stadium', 'scheduled', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 1, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-match-future-final', 'demo-future-final', 'Argentina', 'England', 'https://flagcdn.com/w80/ar.png', 'https://flagcdn.com/w80/gb-eng.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','+6 days'), 'Final', NULL, 'Future Demo Stadium', 'scheduled', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 10, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(external_id) DO UPDATE SET
  home_team = excluded.home_team,
  away_team = excluded.away_team,
  home_team_logo = excluded.home_team_logo,
  away_team_logo = excluded.away_team_logo,
  kickoff_at = excluded.kickoff_at,
  stage = excluded.stage,
  group_name = excluded.group_name,
  venue = excluded.venue,
  status = excluded.status,
  score_90_home = excluded.score_90_home,
  score_90_away = excluded.score_90_away,
  final_home = excluded.final_home,
  final_away = excluded.final_away,
  manual_final_home = excluded.manual_final_home,
  manual_final_away = excluded.manual_final_away,
  score_source = excluded.score_source,
  live_home_score = excluded.live_home_score,
  live_away_score = excluded.live_away_score,
  live_minute = excluded.live_minute,
  last_live_synced_at = excluded.last_live_synced_at,
  points_multiplier = excluded.points_multiplier,
  updated_at = excluded.updated_at;

INSERT INTO predictions (id, league_id, user_id, match_id, home_score, away_score, points, is_exact, is_correct_result, bonus_used, created_at, updated_at) VALUES
  ('demo-pred-admin-past-group', 'demo-league', 'demo-admin', 'demo-match-past-group', 1, 0, 5, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-alice-past-group', 'demo-league', 'demo-alice', 'demo-match-past-group', 2, 0, 3, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-ben-past-group', 'demo-league', 'demo-ben', 'demo-match-past-group', 0, 1, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-chloe-past-group', 'demo-league', 'demo-chloe', 'demo-match-past-group', 1, 0, 25, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-admin-past-quarter', 'demo-league', 'demo-admin', 'demo-match-past-quarter', 2, 1, 20, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-alice-past-quarter', 'demo-league', 'demo-alice', 'demo-match-past-quarter', 1, 0, 12, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-ben-past-quarter', 'demo-league', 'demo-ben', 'demo-match-past-quarter', 2, 2, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-chloe-past-quarter', 'demo-league', 'demo-chloe', 'demo-match-past-quarter', 2, 1, 100, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-admin-live-group', 'demo-league', 'demo-admin', 'demo-match-live-group', 2, 0, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-alice-live-group', 'demo-league', 'demo-alice', 'demo-match-live-group', 1, 0, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-ben-live-group', 'demo-league', 'demo-ben', 'demo-match-live-group', 0, 1, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-admin-live-semi', 'demo-league', 'demo-admin', 'demo-match-live-semi', 2, 2, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-alice-live-semi', 'demo-league', 'demo-alice', 'demo-match-live-semi', 3, 2, 0, 0, 0, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-ben-live-semi', 'demo-league', 'demo-ben', 'demo-match-live-semi', 1, 2, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-admin-future-group', 'demo-league', 'demo-admin', 'demo-match-future-group', 1, 0, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-admin-future-final', 'demo-league', 'demo-admin', 'demo-match-future-final', 2, 1, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(league_id, user_id, match_id) DO UPDATE SET
  home_score = excluded.home_score,
  away_score = excluded.away_score,
  points = excluded.points,
  is_exact = excluded.is_exact,
  is_correct_result = excluded.is_correct_result,
  bonus_used = excluded.bonus_used,
  updated_at = excluded.updated_at;
