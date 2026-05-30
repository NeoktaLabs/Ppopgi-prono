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

INSERT INTO users (id, email, nickname, created_at, updated_at) VALUES
  ('demo-amine', 'amine@example.com', 'Amine', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-clara', 'clara@example.com', 'Clara', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-diego', 'diego@example.com', 'Diego', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-emma', 'emma@example.com', 'Emma', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-felix', 'felix@example.com', 'Felix', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-hana', 'hana@example.com', 'Hana', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-ines', 'ines@example.com', 'Ines', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-jules', 'jules@example.com', 'Jules', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-karim', 'karim@example.com', 'Karim', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-lina', 'lina@example.com', 'Lina', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-marco', 'marco@example.com', 'Marco', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-nina', 'nina@example.com', 'Nina', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-omar', 'omar@example.com', 'Omar', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pia', 'pia@example.com', 'Pia', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-quinn', 'quinn@example.com', 'Quinn', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-rosa', 'rosa@example.com', 'Rosa', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-theo', 'theo@example.com', 'Theo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-yara', 'yara@example.com', 'Yara', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  nickname = excluded.nickname,
  updated_at = excluded.updated_at;

INSERT INTO league_members (id, league_id, user_id, role, joined_at, removed_at, removed_by_user_id) VALUES
  ('demo-member-amine', 'demo-league', 'demo-amine', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-clara', 'demo-league', 'demo-clara', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-diego', 'demo-league', 'demo-diego', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-emma', 'demo-league', 'demo-emma', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-felix', 'demo-league', 'demo-felix', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-hana', 'demo-league', 'demo-hana', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-ines', 'demo-league', 'demo-ines', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-jules', 'demo-league', 'demo-jules', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-karim', 'demo-league', 'demo-karim', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-lina', 'demo-league', 'demo-lina', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-marco', 'demo-league', 'demo-marco', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-nina', 'demo-league', 'demo-nina', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-omar', 'demo-league', 'demo-omar', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-pia', 'demo-league', 'demo-pia', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-quinn', 'demo-league', 'demo-quinn', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-rosa', 'demo-league', 'demo-rosa', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-theo', 'demo-league', 'demo-theo', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL),
  ('demo-member-yara', 'demo-league', 'demo-yara', 'member', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL, NULL)
ON CONFLICT(league_id, user_id) DO UPDATE SET
  role = excluded.role,
  removed_at = NULL,
  removed_by_user_id = NULL;

INSERT INTO predictions (id, league_id, user_id, match_id, home_score, away_score, points, is_exact, is_correct_result, bonus_used, created_at, updated_at) VALUES
  ('demo-pred-amine-past-group', 'demo-league', 'demo-amine', 'demo-match-past-group', 1, 0, 25, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-clara-past-group', 'demo-league', 'demo-clara', 'demo-match-past-group', 2, 1, 3, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-diego-past-group', 'demo-league', 'demo-diego', 'demo-match-past-group', 0, 0, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-emma-past-group', 'demo-league', 'demo-emma', 'demo-match-past-group', 1, 0, 5, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-felix-past-group', 'demo-league', 'demo-felix', 'demo-match-past-group', 2, 0, 3, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-hana-past-group', 'demo-league', 'demo-hana', 'demo-match-past-group', 1, 1, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-ines-past-group', 'demo-league', 'demo-ines', 'demo-match-past-group', 1, 0, 25, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-jules-past-group', 'demo-league', 'demo-jules', 'demo-match-past-group', 0, 1, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-karim-past-group', 'demo-league', 'demo-karim', 'demo-match-past-group', 3, 1, 3, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-lina-past-group', 'demo-league', 'demo-lina', 'demo-match-past-group', 1, 0, 5, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-marco-past-group', 'demo-league', 'demo-marco', 'demo-match-past-group', 2, 0, 3, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-nina-past-group', 'demo-league', 'demo-nina', 'demo-match-past-group', 1, 2, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-omar-past-group', 'demo-league', 'demo-omar', 'demo-match-past-group', 1, 0, 5, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-pia-past-group', 'demo-league', 'demo-pia', 'demo-match-past-group', 0, 0, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-quinn-past-group', 'demo-league', 'demo-quinn', 'demo-match-past-group', 2, 0, 3, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-rosa-past-group', 'demo-league', 'demo-rosa', 'demo-match-past-group', 1, 0, 5, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-theo-past-group', 'demo-league', 'demo-theo', 'demo-match-past-group', 3, 2, 3, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-yara-past-group', 'demo-league', 'demo-yara', 'demo-match-past-group', 1, 0, 25, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-amine-past-quarter', 'demo-league', 'demo-amine', 'demo-match-past-quarter', 2, 1, 20, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-clara-past-quarter', 'demo-league', 'demo-clara', 'demo-match-past-quarter', 1, 0, 12, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-diego-past-quarter', 'demo-league', 'demo-diego', 'demo-match-past-quarter', 2, 1, 20, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-emma-past-quarter', 'demo-league', 'demo-emma', 'demo-match-past-quarter', 2, 0, 12, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-felix-past-quarter', 'demo-league', 'demo-felix', 'demo-match-past-quarter', 1, 1, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-hana-past-quarter', 'demo-league', 'demo-hana', 'demo-match-past-quarter', 2, 1, 20, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-ines-past-quarter', 'demo-league', 'demo-ines', 'demo-match-past-quarter', 3, 1, 12, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-jules-past-quarter', 'demo-league', 'demo-jules', 'demo-match-past-quarter', 0, 2, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-karim-past-quarter', 'demo-league', 'demo-karim', 'demo-match-past-quarter', 2, 1, 20, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-lina-past-quarter', 'demo-league', 'demo-lina', 'demo-match-past-quarter', 1, 0, 12, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-marco-past-quarter', 'demo-league', 'demo-marco', 'demo-match-past-quarter', 2, 2, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-nina-past-quarter', 'demo-league', 'demo-nina', 'demo-match-past-quarter', 2, 1, 20, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-omar-past-quarter', 'demo-league', 'demo-omar', 'demo-match-past-quarter', 3, 2, 12, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-pia-past-quarter', 'demo-league', 'demo-pia', 'demo-match-past-quarter', 2, 1, 20, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-quinn-past-quarter', 'demo-league', 'demo-quinn', 'demo-match-past-quarter', 1, 0, 12, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-rosa-past-quarter', 'demo-league', 'demo-rosa', 'demo-match-past-quarter', 0, 1, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-theo-past-quarter', 'demo-league', 'demo-theo', 'demo-match-past-quarter', 2, 1, 20, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-pred-yara-past-quarter', 'demo-league', 'demo-yara', 'demo-match-past-quarter', 3, 1, 12, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(user_id, match_id) DO UPDATE SET
  home_score = excluded.home_score,
  away_score = excluded.away_score,
  points = excluded.points,
  is_exact = excluded.is_exact,
  is_correct_result = excluded.is_correct_result,
  bonus_used = excluded.bonus_used,
  updated_at = excluded.updated_at;

INSERT INTO matches (
  id, external_id, home_team, away_team, home_team_logo, away_team_logo, kickoff_at, stage, group_name, venue, status,
  score_90_home, score_90_away, score_120_home, score_120_away, penalty_home, penalty_away, final_home, final_away,
  manual_final_home, manual_final_away, score_source, live_home_score, live_away_score, live_minute, last_live_synced_at,
  points_multiplier, api_provider, last_synced_at, created_at, updated_at
) VALUES
  ('demo-history-01', 'demo-history-01', 'Spain', 'Croatia', 'https://flagcdn.com/w80/es.png', 'https://flagcdn.com/w80/hr.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-18 days'), 'Group Stage - 1', 'D', 'Demo Arena', 'finished', 2, 0, NULL, NULL, NULL, NULL, 2, 0, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 1, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-02', 'demo-history-02', 'USA', 'Wales', 'https://flagcdn.com/w80/us.png', 'https://flagcdn.com/w80/gb-wls.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-17 days'), 'Group Stage - 1', 'B', 'Demo Arena', 'finished', 1, 1, NULL, NULL, NULL, NULL, 1, 1, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 1, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-03', 'demo-history-03', 'Portugal', 'Ghana', 'https://flagcdn.com/w80/pt.png', 'https://flagcdn.com/w80/gh.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-16 days'), 'Group Stage - 1', 'H', 'Demo Arena', 'finished', 3, 1, NULL, NULL, NULL, NULL, 3, 1, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 1, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-04', 'demo-history-04', 'Netherlands', 'Ecuador', 'https://flagcdn.com/w80/nl.png', 'https://flagcdn.com/w80/ec.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-15 days'), 'Group Stage - 2', 'A', 'Demo Arena', 'finished', 0, 0, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 1, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-05', 'demo-history-05', 'Japan', 'Germany', 'https://flagcdn.com/w80/jp.png', 'https://flagcdn.com/w80/de.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-14 days'), 'Group Stage - 2', 'E', 'Demo Arena', 'finished', 2, 1, NULL, NULL, NULL, NULL, 2, 1, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 1, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-06', 'demo-history-06', 'Morocco', 'Belgium', 'https://flagcdn.com/w80/ma.png', 'https://flagcdn.com/w80/be.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-13 days'), 'Group Stage - 2', 'F', 'Demo Arena', 'finished', 1, 0, NULL, NULL, NULL, NULL, 1, 0, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 1, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-07', 'demo-history-07', 'Switzerland', 'Serbia', 'https://flagcdn.com/w80/ch.png', 'https://flagcdn.com/w80/rs.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-12 days'), 'Group Stage - 3', 'G', 'Demo Arena', 'finished', 2, 2, NULL, NULL, NULL, NULL, 2, 2, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 1, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-08', 'demo-history-08', 'Uruguay', 'South Korea', 'https://flagcdn.com/w80/uy.png', 'https://flagcdn.com/w80/kr.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-11 days'), 'Group Stage - 3', 'H', 'Demo Arena', 'finished', 0, 1, NULL, NULL, NULL, NULL, 0, 1, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 1, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-09', 'demo-history-09', 'England', 'Senegal', 'https://flagcdn.com/w80/gb-eng.png', 'https://flagcdn.com/w80/sn.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-9 days'), 'Round of 16', NULL, 'Demo Arena', 'finished', 3, 0, NULL, NULL, NULL, NULL, 3, 0, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 3, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-10', 'demo-history-10', 'Argentina', 'Australia', 'https://flagcdn.com/w80/ar.png', 'https://flagcdn.com/w80/au.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-8 days'), 'Round of 16', NULL, 'Demo Arena', 'finished', 2, 1, NULL, NULL, NULL, NULL, 2, 1, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 3, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-11', 'demo-history-11', 'Brazil', 'Switzerland', 'https://flagcdn.com/w80/br.png', 'https://flagcdn.com/w80/ch.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-7 days'), 'Round of 16', NULL, 'Demo Arena', 'finished', 1, 0, NULL, NULL, NULL, NULL, 1, 0, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 3, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-12', 'demo-history-12', 'France', 'Morocco', 'https://flagcdn.com/w80/fr.png', 'https://flagcdn.com/w80/ma.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-6 days'), 'Semi-finals', NULL, 'Demo Arena', 'finished', 2, 0, NULL, NULL, NULL, NULL, 2, 0, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 5, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-13', 'demo-history-13', 'Croatia', 'Argentina', 'https://flagcdn.com/w80/hr.png', 'https://flagcdn.com/w80/ar.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-5 days'), 'Semi-finals', NULL, 'Demo Arena', 'finished', 1, 3, NULL, NULL, NULL, NULL, 1, 3, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 5, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('demo-history-14', 'demo-history-14', 'Argentina', 'France', 'https://flagcdn.com/w80/ar.png', 'https://flagcdn.com/w80/fr.png', strftime('%Y-%m-%dT%H:%M:%SZ','now','-3 days'), 'Final', NULL, 'Demo Arena', 'finished', 3, 3, NULL, NULL, NULL, NULL, 3, 3, NULL, NULL, 'api', NULL, NULL, NULL, NULL, 10, 'demo', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(external_id) DO UPDATE SET
  kickoff_at = excluded.kickoff_at,
  status = excluded.status,
  score_90_home = excluded.score_90_home,
  score_90_away = excluded.score_90_away,
  final_home = excluded.final_home,
  final_away = excluded.final_away,
  points_multiplier = excluded.points_multiplier,
  updated_at = excluded.updated_at;

INSERT INTO predictions (id, league_id, user_id, match_id, home_score, away_score, points, is_exact, is_correct_result, bonus_used, created_at, updated_at)
WITH demo_users(idx, user_id) AS (
  VALUES
    (1, 'demo-admin'), (2, 'demo-alice'), (3, 'demo-ben'), (4, 'demo-chloe'),
    (5, 'demo-amine'), (6, 'demo-clara'), (7, 'demo-diego'), (8, 'demo-emma'),
    (9, 'demo-felix'), (10, 'demo-hana'), (11, 'demo-ines'), (12, 'demo-jules'),
    (13, 'demo-karim'), (14, 'demo-lina'), (15, 'demo-marco'), (16, 'demo-nina'),
    (17, 'demo-omar'), (18, 'demo-pia'), (19, 'demo-quinn'), (20, 'demo-rosa'),
    (21, 'demo-theo'), (22, 'demo-yara')
),
demo_history(idx, match_id, final_home, final_away, multiplier) AS (
  VALUES
    (1, 'demo-history-01', 2, 0, 1), (2, 'demo-history-02', 1, 1, 1),
    (3, 'demo-history-03', 3, 1, 1), (4, 'demo-history-04', 0, 0, 1),
    (5, 'demo-history-05', 2, 1, 1), (6, 'demo-history-06', 1, 0, 1),
    (7, 'demo-history-07', 2, 2, 1), (8, 'demo-history-08', 0, 1, 1),
    (9, 'demo-history-09', 3, 0, 3), (10, 'demo-history-10', 2, 1, 3),
    (11, 'demo-history-11', 1, 0, 3), (12, 'demo-history-12', 2, 0, 5),
    (13, 'demo-history-13', 1, 3, 5), (14, 'demo-history-14', 3, 3, 10)
),
demo_picks AS (
  SELECT
    u.user_id,
    h.match_id,
    h.final_home,
    h.final_away,
    h.multiplier,
    CASE (h.idx + u.idx) % 6
      WHEN 0 THEN h.final_home
      WHEN 1 THEN h.final_home + 1
      WHEN 2 THEN MAX(h.final_home - 1, 0)
      WHEN 3 THEN h.final_home
      WHEN 4 THEN h.final_away
      ELSE h.final_home + 2
    END AS home_score,
    CASE (h.idx + u.idx) % 6
      WHEN 0 THEN h.final_away
      WHEN 1 THEN h.final_away
      WHEN 2 THEN MAX(h.final_away - 1, 0)
      WHEN 3 THEN h.final_away + 1
      WHEN 4 THEN h.final_home
      ELSE h.final_away
    END AS away_score,
    h.idx AS match_idx,
    u.idx AS user_idx
  FROM demo_history h
  CROSS JOIN demo_users u
)
SELECT
  'demo-pred-' || user_id || '-' || match_id,
  'demo-league',
  user_id,
  match_id,
  home_score,
  away_score,
  CASE
    WHEN home_score = final_home AND away_score = final_away THEN 5 * multiplier * CASE WHEN match_idx = 2 AND user_idx IN (4, 5, 11, 22) THEN 5 ELSE 1 END
    WHEN (home_score - away_score = 0 AND final_home - final_away = 0)
      OR (home_score - away_score > 0 AND final_home - final_away > 0)
      OR (home_score - away_score < 0 AND final_home - final_away < 0) THEN 3 * multiplier * CASE WHEN match_idx = 2 AND user_idx IN (4, 5, 11, 22) THEN 5 ELSE 1 END
    ELSE 0
  END,
  CASE WHEN home_score = final_home AND away_score = final_away THEN 1 ELSE 0 END,
  CASE WHEN (home_score - away_score = 0 AND final_home - final_away = 0)
    OR (home_score - away_score > 0 AND final_home - final_away > 0)
    OR (home_score - away_score < 0 AND final_home - final_away < 0) THEN 1 ELSE 0 END,
  CASE WHEN match_idx = 2 AND user_idx IN (4, 5, 11, 22) THEN 1 ELSE 0 END,
  strftime('%Y-%m-%dT%H:%M:%SZ','now'),
  strftime('%Y-%m-%dT%H:%M:%SZ','now')
FROM demo_picks
WHERE 1
ON CONFLICT(user_id, match_id) DO UPDATE SET
  home_score = excluded.home_score,
  away_score = excluded.away_score,
  points = excluded.points,
  is_exact = excluded.is_exact,
  is_correct_result = excluded.is_correct_result,
  bonus_used = excluded.bonus_used,
  updated_at = excluded.updated_at;
