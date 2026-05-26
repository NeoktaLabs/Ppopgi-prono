import type { Env, MatchRow } from "./types";
import { badRequest, json, nowIso, randomCode, readJson, requireUser } from "./utils";
import { calculatePredictionPoints, usableFinalScore } from "./scoring";

export async function me(request: Request, env: Env) {
  const user = await requireUser(request, env);
  if (!user) return json({ user: null, leagues: [] });
  const leagues = await env.DB.prepare(`SELECT leagues.id, leagues.name, leagues.code, league_members.role FROM league_members JOIN leagues ON leagues.id = league_members.league_id WHERE league_members.user_id = ? AND league_members.removed_at IS NULL ORDER BY league_members.joined_at DESC`).bind(user.id).all();
  return json({ user, leagues: leagues.results ?? [] });
}

export async function updateProfile(request: Request, env: Env) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);
  const { nickname } = await readJson<{ nickname?: string }>(request);
  const clean = nickname?.trim();
  if (!clean || clean.length < 2 || clean.length > 30) return badRequest("Nickname must be between 2 and 30 characters.");
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
  const rows = await env.DB.prepare(`SELECT users.id, users.nickname, COALESCE(SUM(predictions.points), 0) as points, COALESCE(SUM(predictions.is_exact), 0) as exact_scores, COALESCE(SUM(predictions.is_correct_result), 0) as correct_results, COUNT(predictions.id) as predictions_count FROM league_members JOIN users ON users.id = league_members.user_id LEFT JOIN predictions ON predictions.user_id = users.id AND predictions.league_id = league_members.league_id WHERE league_members.league_id = ? AND league_members.removed_at IS NULL GROUP BY users.id ORDER BY points DESC, exact_scores DESC, correct_results DESC, predictions_count DESC, users.nickname ASC`).bind(leagueId).all();
  return json({ leaderboard: rows.results ?? [] });
}

function withEffectiveScore(match: MatchRow) {
  const score = usableFinalScore(match);
  return { ...match, effective_final_home: score?.home ?? null, effective_final_away: score?.away ?? null, effective_score_source: score?.source ?? "none" };
}

export async function listMatches(env: Env) {
  const rows = await env.DB.prepare("SELECT * FROM matches ORDER BY kickoff_at ASC").all<MatchRow>();
  return json({ matches: (rows.results ?? []).map(withEffectiveScore) });
}

export async function todayMatches(env: Env) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const rows = await env.DB.prepare("SELECT * FROM matches WHERE kickoff_at >= ? AND kickoff_at < ? ORDER BY kickoff_at ASC").bind(start.toISOString(), end.toISOString()).all<MatchRow>();
  return json({ matches: (rows.results ?? []).map(withEffectiveScore) });
}

export async function upsertPrediction(request: Request, env: Env, leagueId: string) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);
  const { matchId, homeScore, awayScore } = await readJson<{ matchId?: string; homeScore?: number; awayScore?: number }>(request);
  if (!matchId || homeScore === undefined || awayScore === undefined) return badRequest("Prediction is incomplete.");
  const membership = await env.DB.prepare("SELECT id FROM league_members WHERE league_id = ? AND user_id = ? AND removed_at IS NULL").bind(leagueId, user.id).first();
  if (!membership) return badRequest("You are not a member of this league.", 403);
  const match = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<MatchRow>();
  if (!match) return badRequest("Match not found.", 404);
  if (Date.now() >= new Date(match.kickoff_at).getTime()) return badRequest("Kickoff has passed, this prediction is locked.", 409);
  await env.DB.prepare(`INSERT INTO predictions (id, league_id, user_id, match_id, home_score, away_score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(league_id, user_id, match_id) DO UPDATE SET home_score = excluded.home_score, away_score = excluded.away_score, updated_at = excluded.updated_at`).bind(crypto.randomUUID(), leagueId, user.id, matchId, homeScore, awayScore, nowIso(), nowIso()).run();
  return json({ ok: true });
}

export async function matchPredictions(request: Request, env: Env, leagueId: string, matchId: string) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);
  const match = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<MatchRow>();
  if (!match) return badRequest("Match not found.", 404);
  const hasStarted = Date.now() >= new Date(match.kickoff_at).getTime();
  const query = hasStarted
    ? "SELECT users.nickname, predictions.home_score, predictions.away_score, predictions.points FROM predictions JOIN users ON users.id = predictions.user_id WHERE predictions.league_id = ? AND predictions.match_id = ? ORDER BY users.nickname ASC"
    : "SELECT users.nickname, predictions.home_score, predictions.away_score, predictions.points FROM predictions JOIN users ON users.id = predictions.user_id WHERE predictions.league_id = ? AND predictions.match_id = ? AND predictions.user_id = ? ORDER BY users.nickname ASC";
  const rows = hasStarted ? await env.DB.prepare(query).bind(leagueId, matchId).all() : await env.DB.prepare(query).bind(leagueId, matchId, user.id).all();
  return json({ visibleToAll: hasStarted, predictions: rows.results ?? [] });
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
  if (!finalScore) return;
  const predictions = await env.DB.prepare("SELECT id, home_score, away_score FROM predictions WHERE match_id = ?").bind(matchId).all<{ id: string; home_score: number; away_score: number }>();
  for (const prediction of predictions.results ?? []) {
    const score = calculatePredictionPoints({ predictedHome: prediction.home_score, predictedAway: prediction.away_score, finalHome: finalScore.home, finalAway: finalScore.away, multiplier: match.points_multiplier });
    await env.DB.prepare("UPDATE predictions SET points = ?, is_exact = ?, is_correct_result = ?, updated_at = ? WHERE id = ?").bind(score.points, score.isExact ? 1 : 0, score.isCorrectResult ? 1 : 0, nowIso(), prediction.id).run();
  }
}
