import type { Env, MatchRow } from "./types";
import { badRequest, json, nowIso, randomCode, readJson, requireUser } from "./utils";
import { calculatePredictionPoints, isGroupStage, multiplierForStage, usableFinalScore } from "./scoring";
import { clearPendingSignupCookie, createSession, findOrCreateUser, pendingSignupEmail } from "./auth";

function isGlobalAdmin(env: Env, email: string) {
  return (env.GLOBAL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

async function isNicknameTaken(env: Env, nickname: string, exceptUserId?: string) {
  const normalized = nickname.trim().toLowerCase();
  const row = exceptUserId
    ? await env.DB.prepare("SELECT id FROM users WHERE LOWER(TRIM(nickname)) = ? AND id != ? LIMIT 1").bind(normalized, exceptUserId).first<{ id: string }>()
    : await env.DB.prepare("SELECT id FROM users WHERE LOWER(TRIM(nickname)) = ? LIMIT 1").bind(normalized).first<{ id: string }>();
  return !!row;
}

export async function me(request: Request, env: Env) {
  const user = await requireUser(request, env);
  if (!user) {
    const pending = await pendingSignupEmail(request, env);
    return json({ user: null, leagues: [], pendingEmail: pending?.email ?? null });
  }
  const leagues = await env.DB.prepare(`SELECT leagues.id, leagues.name, leagues.code, league_members.role FROM league_members JOIN leagues ON leagues.id = league_members.league_id WHERE league_members.user_id = ? AND league_members.removed_at IS NULL ORDER BY league_members.joined_at DESC`).bind(user.id).all();
  return json({ user: { ...user, is_global_admin: isGlobalAdmin(env, user.email) }, leagues: leagues.results ?? [] });
}

export async function updateProfile(request: Request, env: Env) {
  const user = await requireUser(request, env);
  const { nickname } = await readJson<{ nickname?: string }>(request);
  const clean = nickname?.trim();
  if (!clean || clean.length < 3 || clean.length > 13) return badRequest("Pseudo must be between 3 and 13 characters.");
  if (!user) {
    const pending = await pendingSignupEmail(request, env);
    if (!pending) return badRequest("Not authenticated.", 401);
    if (await isNicknameTaken(env, clean)) return badRequest("Pseudo already taken.");
    const created = await findOrCreateUser(env, pending.email, clean);
    const { sessionToken, sessionDays } = await createSession(request, env, created.id);
    await env.DB.prepare("UPDATE pending_signups SET used_at = ? WHERE id = ?").bind(nowIso(), pending.id).run();
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
    headers.append("Set-Cookie", `session=${encodeURIComponent(sessionToken)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${sessionDays * 24 * 60 * 60}`);
    headers.append("Set-Cookie", clearPendingSignupCookie());
    return new Response(JSON.stringify({ ok: true }), { headers });
  }
  if (await isNicknameTaken(env, clean, user.id)) return badRequest("Pseudo already taken.");
  await env.DB.prepare("UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?").bind(clean, nowIso(), user.id).run();
  return json({ ok: true });
}

export async function createLeague(request: Request, env: Env) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);
  const { name } = await readJson<{ name?: string }>(request);
  const clean = name?.trim();
  if (!clean || clean.length < 3) return badRequest("Invalid league name.");

  let code = randomCode(Number(env.LEAGUE_CODE_LENGTH || 6));
  for (let i = 0; i < 5; i++) {
    if (!(await env.DB.prepare("SELECT id FROM leagues WHERE code = ?").bind(code).first())) break;
    code = randomCode(Number(env.LEAGUE_CODE_LENGTH || 6));
  }

  const leagueId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO leagues (id, name, code, admin_user_id, is_joinable, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`).bind(leagueId, clean, code, user.id, nowIso(), nowIso()),
    env.DB.prepare(`INSERT INTO league_members (id, league_id, user_id, role, joined_at) VALUES (?, ?, ?, 'admin', ?)`).bind(crypto.randomUUID(), leagueId, user.id, nowIso()),
  ]);
  return json({ id: leagueId, code });
}

export async function joinLeague(request: Request, env: Env) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);
  const { code } = await readJson<{ code?: string }>(request);
  const clean = code?.trim().toUpperCase();
  if (!clean) return badRequest("League code is required.");
  const league = await env.DB.prepare("SELECT id, is_joinable FROM leagues WHERE code = ?").bind(clean).first<{ id: string; is_joinable: number }>();
  if (!league) return badRequest("League not found.", 404);
  if (!league.is_joinable) return badRequest("This league is closed to new members.", 403);
  await env.DB.prepare(`INSERT INTO league_members (id, league_id, user_id, role, joined_at) VALUES (?, ?, ?, 'member', ?) ON CONFLICT(league_id, user_id) DO UPDATE SET removed_at = NULL, removed_by_user_id = NULL`).bind(crypto.randomUUID(), league.id, user.id, nowIso()).run();
  return json({ ok: true, leagueId: league.id });
}

export async function leaderboard(request: Request, env: Env, leagueId: string) {
  if (!(await requireUser(request, env))) return badRequest("Not authenticated.", 401);
  const rows = await env.DB.prepare(`
    WITH global_predictions AS (
      SELECT user_id, match_id, MAX(points) as points, MAX(is_exact) as is_exact, MAX(is_correct_result) as is_correct_result, MAX(bonus_used) as bonus_used
      FROM predictions
      GROUP BY user_id, match_id
    )
    SELECT users.id, users.nickname, COALESCE(SUM(global_predictions.points), 0) as points, COALESCE(SUM(global_predictions.is_exact), 0) as exact_scores, COALESCE(SUM(global_predictions.is_correct_result), 0) as correct_results, COUNT(global_predictions.match_id) as predictions_count, MAX(0, 2 - COALESCE(SUM(CASE WHEN global_predictions.bonus_used = 1 AND LOWER(COALESCE(matches.stage, '')) LIKE '%group%' AND (matches.status IN ('live', 'in_play', '1H', '2H', 'HT', 'ET', 'penalties', 'extra_time') OR matches.kickoff_at <= ? OR matches.final_home IS NOT NULL OR matches.manual_final_home IS NOT NULL) THEN 1 ELSE 0 END), 0)) as bonuses_remaining
    FROM league_members
    JOIN users ON users.id = league_members.user_id
    LEFT JOIN global_predictions ON global_predictions.user_id = users.id
    LEFT JOIN matches ON matches.id = global_predictions.match_id
    WHERE league_members.league_id = ? AND league_members.removed_at IS NULL
    GROUP BY users.id
    ORDER BY points DESC, exact_scores DESC, correct_results DESC, predictions_count DESC, users.nickname ASC
  `).bind(nowIso(), leagueId).all();
  return json({ leaderboard: rows.results ?? [] });
}

function withEffectiveScore(match: MatchRow) {
  const score = usableFinalScore(match);
  return { ...match, points_multiplier: multiplierForStage(match.stage), effective_final_home: score?.home ?? null, effective_final_away: score?.away ?? null, effective_score_source: score?.source ?? "none" };
}

async function repairMatchMultipliers(env: Env, rows: MatchRow[]) {
  for (const match of rows) {
    const multiplier = multiplierForStage(match.stage);
    if (multiplier !== match.points_multiplier) {
      await env.DB.prepare("UPDATE matches SET points_multiplier = ?, updated_at = ? WHERE id = ?").bind(multiplier, nowIso(), match.id).run();
      await recalculateMatch(env, match.id);
      match.points_multiplier = multiplier;
    }
  }
}

function matchLocksPredictions(match: MatchRow) {
  return ["live", "in_play", "1h", "2h", "ht", "et", "penalties", "extra_time"].includes(match.status.toLowerCase()) || Date.now() >= new Date(match.kickoff_at).getTime() || usableFinalScore(match) !== null;
}

export async function listMatches(env: Env) {
  const rows = await env.DB.prepare("SELECT * FROM matches ORDER BY kickoff_at ASC").all<MatchRow>();
  const matches = rows.results ?? [];
  await repairMatchMultipliers(env, matches);
  return json({ matches: matches.map(withEffectiveScore) });
}

export async function todayMatches(env: Env) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const rows = await env.DB.prepare("SELECT * FROM matches WHERE kickoff_at >= ? AND kickoff_at < ? ORDER BY kickoff_at ASC").bind(start.toISOString(), end.toISOString()).all<MatchRow>();
  const matches = rows.results ?? [];
  await repairMatchMultipliers(env, matches);
  return json({ matches: matches.map(withEffectiveScore) });
}

export async function myPredictions(request: Request, env: Env, leagueId?: string) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);
  if (leagueId) {
    const membership = await env.DB.prepare("SELECT id FROM league_members WHERE league_id = ? AND user_id = ? AND removed_at IS NULL").bind(leagueId, user.id).first();
    if (!membership) return badRequest("You are not a member of this league.", 403);
  }
  const rows = await env.DB.prepare("SELECT match_id, MAX(home_score) as home_score, MAX(away_score) as away_score, MAX(points) as points, MAX(bonus_used) as bonus_used, MAX(updated_at) as updated_at FROM predictions WHERE user_id = ? GROUP BY match_id").bind(user.id).all();
  return json({ predictions: rows.results ?? [] });
}

function parseScore(value: unknown) {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 ? value : null;
}

export async function upsertPrediction(request: Request, env: Env, leagueId?: string) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);
  const body = await readJson<{ matchId?: string; homeScore?: unknown; awayScore?: unknown; useBonus?: boolean }>(request);
  const homeScore = parseScore(body.homeScore);
  const awayScore = parseScore(body.awayScore);
  if (!body.matchId || homeScore === null || awayScore === null) return badRequest("Prediction is incomplete.");
  if (leagueId) {
    const membership = await env.DB.prepare("SELECT id FROM league_members WHERE league_id = ? AND user_id = ? AND removed_at IS NULL").bind(leagueId, user.id).first();
    if (!membership) return badRequest("You are not a member of this league.", 403);
  }
  const match = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(body.matchId).first<MatchRow>();
  if (!match) return badRequest("Match not found.", 404);
  if (matchLocksPredictions(match)) return badRequest("This match is locked because kickoff has passed or a final score has been set.", 409);
  const useBonus = body.useBonus === true;
  if (useBonus) {
    if (!isGroupStage(match.stage)) return badRequest("The x5 bonus can only be used during the group stage.", 409);
    const usage = await env.DB.prepare("SELECT COUNT(DISTINCT predictions.match_id) as count FROM predictions JOIN matches ON matches.id = predictions.match_id WHERE predictions.user_id = ? AND predictions.bonus_used = 1 AND predictions.match_id != ? AND LOWER(COALESCE(matches.stage, '')) LIKE '%group%'").bind(user.id, body.matchId).first<{ count: number }>();
    if (Number(usage?.count ?? 0) >= 2) return badRequest("You have already used your two group-stage x5 bonuses.", 409);
  }
  const existing = await env.DB.prepare("SELECT id FROM predictions WHERE user_id = ? AND match_id = ? LIMIT 1").bind(user.id, body.matchId).first<{ id: string }>();
  if (existing) {
    await env.DB.prepare("UPDATE predictions SET home_score = ?, away_score = ?, bonus_used = ?, updated_at = ? WHERE user_id = ? AND match_id = ?").bind(homeScore, awayScore, useBonus ? 1 : 0, nowIso(), user.id, body.matchId).run();
  } else {
    await env.DB.prepare(`INSERT INTO predictions (id, league_id, user_id, match_id, home_score, away_score, bonus_used, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), leagueId ?? null, user.id, body.matchId, homeScore, awayScore, useBonus ? 1 : 0, nowIso(), nowIso()).run();
  }
  return json({ ok: true });
}

export async function matchPredictions(request: Request, env: Env, leagueId: string, matchId: string) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);
  const match = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<MatchRow>();
  if (!match) return badRequest("Match not found.", 404);
  const hasStarted = matchLocksPredictions(match);
  const query = hasStarted
    ? "WITH global_predictions AS (SELECT user_id, match_id, MAX(home_score) as home_score, MAX(away_score) as away_score, MAX(points) as points, MAX(bonus_used) as bonus_used FROM predictions GROUP BY user_id, match_id) SELECT users.id as user_id, users.nickname, global_predictions.home_score, global_predictions.away_score, global_predictions.points, global_predictions.bonus_used FROM league_members JOIN users ON users.id = league_members.user_id LEFT JOIN global_predictions ON global_predictions.user_id = users.id AND global_predictions.match_id = ? WHERE league_members.league_id = ? AND league_members.removed_at IS NULL ORDER BY users.nickname ASC"
    : "SELECT predictions.user_id, users.nickname, MAX(predictions.home_score) as home_score, MAX(predictions.away_score) as away_score, MAX(predictions.points) as points, MAX(predictions.bonus_used) as bonus_used FROM predictions JOIN users ON users.id = predictions.user_id WHERE predictions.match_id = ? AND predictions.user_id = ? GROUP BY predictions.user_id ORDER BY users.nickname ASC";
  const rows = hasStarted ? await env.DB.prepare(query).bind(matchId, leagueId).all() : await env.DB.prepare(query).bind(matchId, user.id).all();
  return json({ visibleToAll: hasStarted, predictions: rows.results ?? [] });
}

export async function globalLeaderboard(request: Request, env: Env) {
  if (!(await requireUser(request, env))) return badRequest("Not authenticated.", 401);
  const rows = await env.DB.prepare(`
    WITH global_predictions AS (
      SELECT user_id, match_id, MAX(points) as points, MAX(is_exact) as is_exact, MAX(is_correct_result) as is_correct_result, MAX(bonus_used) as bonus_used
      FROM predictions
      GROUP BY user_id, match_id
    )
    SELECT users.id as user_id, users.nickname, COALESCE(SUM(global_predictions.points), 0) as points, COALESCE(SUM(global_predictions.is_exact), 0) as exact_scores, COALESCE(SUM(global_predictions.is_correct_result), 0) as correct_results, COUNT(global_predictions.match_id) as predictions_count, MAX(0, 2 - COALESCE(SUM(CASE WHEN global_predictions.bonus_used = 1 AND LOWER(COALESCE(matches.stage, '')) LIKE '%group%' AND (matches.status IN ('live', 'in_play', '1H', '2H', 'HT', 'ET', 'penalties', 'extra_time') OR matches.kickoff_at <= ? OR matches.final_home IS NOT NULL OR matches.manual_final_home IS NOT NULL) THEN 1 ELSE 0 END), 0)) as bonuses_remaining
    FROM users
    LEFT JOIN global_predictions ON global_predictions.user_id = users.id
    LEFT JOIN matches ON matches.id = global_predictions.match_id
    GROUP BY users.id
    ORDER BY points DESC, exact_scores DESC, correct_results DESC, predictions_count DESC, users.nickname ASC
  `).bind(nowIso()).all();
  return json({ leaderboard: (rows.results ?? []).map((row, index) => ({ ...row, rank: index + 1, official_rank: index + 1, rank_delta: 0, movement_type: "last_match" })) });
}

export async function globalUserPredictions(request: Request, env: Env, userId: string) {
  if (!(await requireUser(request, env))) return badRequest("Not authenticated.", 401);
  const rows = await env.DB.prepare(`
    WITH global_predictions AS (
      SELECT user_id, match_id, MAX(home_score) as home_score, MAX(away_score) as away_score, MAX(points) as points, MAX(bonus_used) as bonus_used
      FROM predictions
      WHERE user_id = ?
      GROUP BY user_id, match_id
    )
    SELECT matches.id as match_id, matches.external_id, matches.home_team, matches.away_team, matches.home_team_logo, matches.away_team_logo, matches.kickoff_at, matches.stage, matches.group_name, matches.status, matches.final_home, matches.final_away, matches.score_90_home, matches.score_90_away, matches.score_120_home, matches.score_120_away, matches.manual_final_home, matches.manual_final_away, matches.score_source, matches.live_home_score, matches.live_away_score, matches.live_minute, matches.points_multiplier, global_predictions.home_score, global_predictions.away_score, global_predictions.points, global_predictions.bonus_used
    FROM matches
    JOIN global_predictions ON global_predictions.match_id = matches.id
    WHERE matches.status IN ('live', 'in_play', '1H', '2H', 'HT', 'ET', 'penalties', 'extra_time') OR matches.kickoff_at <= ? OR matches.final_home IS NOT NULL OR matches.manual_final_home IS NOT NULL
    ORDER BY matches.kickoff_at DESC
  `).bind(userId, nowIso()).all<MatchRow & { match_id: string; home_score: number; away_score: number; points: number | null; bonus_used: number | null }>();
  return json({ predictions: (rows.results ?? []).map((row) => {
    const isLive = ["live", "in_play", "1h", "2h", "ht", "et", "penalties", "extra_time"].includes(row.status.toLowerCase());
    const score = isLive && row.live_home_score !== null && row.live_away_score !== null
      ? { home: row.live_home_score, away: row.live_away_score }
      : null;
    const livePoints = score
      ? calculatePredictionPoints({ predictedHome: row.home_score, predictedAway: row.away_score, finalHome: score.home, finalAway: score.away, multiplier: row.points_multiplier, bonusMultiplier: row.bonus_used && isGroupStage(row.stage) ? 5 : 1 }).points
      : row.points;
    return { ...row, points: livePoints };
  }) });
}

export async function removeLeagueMember(request: Request, env: Env, leagueId: string, userId: string) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);
  const league = await env.DB.prepare("SELECT admin_user_id FROM leagues WHERE id = ?").bind(leagueId).first<{ admin_user_id: string }>();
  if (!league) return badRequest("League not found.", 404);
  if (league.admin_user_id !== user.id) return badRequest("League admin access required.", 403);
  if (userId === user.id) return badRequest("The league admin cannot remove themselves.", 409);
  await env.DB.prepare("UPDATE league_members SET removed_at = ?, removed_by_user_id = ? WHERE league_id = ? AND user_id = ?").bind(nowIso(), user.id, leagueId, userId).run();
  return json({ ok: true });
}

export async function recalculateMatch(env: Env, matchId: string) {
  const match = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<MatchRow>();
  if (!match) return;
  const finalScore = usableFinalScore(match);
  if (!finalScore) {
    await env.DB.prepare("UPDATE predictions SET points = 0, is_exact = 0, is_correct_result = 0, updated_at = ? WHERE match_id = ?").bind(nowIso(), matchId).run();
    return;
  }
  const predictions = await env.DB.prepare("SELECT id, home_score, away_score, bonus_used FROM predictions WHERE match_id = ?").bind(matchId).all<{ id: string; home_score: number; away_score: number; bonus_used: number }>();
  for (const prediction of predictions.results ?? []) {
    const score = calculatePredictionPoints({ predictedHome: prediction.home_score, predictedAway: prediction.away_score, finalHome: finalScore.home, finalAway: finalScore.away, multiplier: match.points_multiplier, bonusMultiplier: prediction.bonus_used && isGroupStage(match.stage) ? 5 : 1 });
    await env.DB.prepare("UPDATE predictions SET points = ?, is_exact = ?, is_correct_result = ?, updated_at = ? WHERE id = ?").bind(score.points, score.isExact ? 1 : 0, score.isCorrectResult ? 1 : 0, nowIso(), prediction.id).run();
  }
}
