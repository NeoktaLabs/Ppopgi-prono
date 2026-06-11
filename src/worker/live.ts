import type { Env, MatchRow } from "./types";
import { badRequest, json, requireUser } from "./utils";
import { calculatePredictionPoints, isGroupStage, multiplierForStage, usableFinalScore } from "./scoring";
import { ODDZZ_AI_USER_ID, oddzzAiLeaderboardRow, oddzzAiVisiblePredictions, rankLeaderboardRows } from "./ai-leaderboard";
import { buildComputedLeaderboardRows } from "./leaderboard-aggregation";

type LeaderboardRow = {
  user_id: string;
  nickname: string | null;
  points: number;
  exact_scores: number;
  correct_results: number;
  predictions_count: number;
  bonuses_remaining: number;
  rank: number;
};

type PredictionRow = {
  user_id: string;
  nickname: string | null;
  home_score: number | null;
  away_score: number | null;
  points: number | null;
  bonus_used: number | null;
};

function isLiveStatus(status: string) {
  return ["live", "in_play", "1h", "2h", "ht", "et", "bt", "p", "susp", "int", "penalties", "extra_time"].includes(status.toLowerCase());
}

function isExpectedLiveWindow(match: MatchRow, now = Date.now()) {
  const kickoff = new Date(match.kickoff_at).getTime();
  const status = match.status.toLowerCase();
  const isFinished = ["finished", "ft", "aet", "pen", "cancelled", "postponed"].includes(status);
  return kickoff <= now
    && kickoff >= now - 4 * 60 * 60_000
    && !isFinished
    && usableFinalScore(match) === null;
}

function isLiveOrExpectedLive(match: MatchRow, now = Date.now()) {
  return isLiveStatus(match.status) || isExpectedLiveWindow(match, now);
}

function withCorrectMultiplier(match: MatchRow): MatchRow {
  return { ...match, points_multiplier: multiplierForStage(match.stage) };
}

function rankRows(rows: Omit<LeaderboardRow, "rank">[]): LeaderboardRow[] {
  return rankLeaderboardRows(rows) as LeaderboardRow[];
}

async function officialLeaderboard(env: Env, leagueId: string): Promise<LeaderboardRow[]> {
  return await buildComputedLeaderboardRows(env, { leagueId }) as LeaderboardRow[];
}

async function liveMatches(env: Env): Promise<MatchRow[]> {
  const now = new Date();
  const expectedLiveSince = new Date(now.getTime() - 4 * 60 * 60_000);
  const rows = await env.DB.prepare(`
    SELECT * FROM matches
    WHERE status IN ('live', 'in_play', 'LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'penalties', 'extra_time')
      OR (kickoff_at <= ? AND kickoff_at >= ? AND status NOT IN ('finished', 'FINISHED', 'FT', 'AET', 'PEN', 'cancelled', 'postponed') AND final_home IS NULL AND manual_final_home IS NULL)
    ORDER BY kickoff_at ASC
  `).bind(now.toISOString(), expectedLiveSince.toISOString()).all<MatchRow>();
  return (rows.results ?? []).map(withCorrectMultiplier);
}

function scoreForLiveMatch(match: MatchRow) {
  if (match.live_home_score !== null && match.live_away_score !== null) {
    return { home: match.live_home_score, away: match.live_away_score };
  }
  return usableFinalScore(match);
}

async function provisionalLiveLeaderboard(env: Env, leagueId: string, official: LeaderboardRow[], matches: MatchRow[]) {
  const totals = new Map(official.map((row) => [row.user_id, { ...row }]));

  for (const match of matches) {
    const liveScore = scoreForLiveMatch(match);
    if (!liveScore) continue;

    const rows = await env.DB.prepare(`
      SELECT predictions.user_id, MAX(predictions.home_score) as home_score, MAX(predictions.away_score) as away_score, MAX(predictions.bonus_used) as bonus_used
      FROM predictions
      JOIN league_members ON league_members.user_id = predictions.user_id AND league_members.league_id = ? AND league_members.removed_at IS NULL
      WHERE predictions.match_id = ?
      GROUP BY predictions.user_id
    `).bind(leagueId, match.id).all<{ user_id: string; home_score: number; away_score: number; bonus_used: number }>();

    for (const prediction of rows.results ?? []) {
      const current = totals.get(prediction.user_id);
      if (!current) continue;
      const points = calculatePredictionPoints({
        predictedHome: prediction.home_score,
        predictedAway: prediction.away_score,
        finalHome: liveScore.home,
        finalAway: liveScore.away,
        multiplier: match.points_multiplier,
        bonusMultiplier: prediction.bonus_used && isGroupStage(match.stage) ? 5 : 1,
      });

      current.points += points.points;
      current.exact_scores += points.isExact ? 1 : 0;
      current.correct_results += points.isCorrectResult ? 1 : 0;
    }
  }

  const live = rankRows([...totals.values()].map(({ rank: _rank, ...row }) => row));
  const officialRank = new Map(official.map((row) => [row.user_id, row.rank]));

  return live.map((row) => ({
    ...row,
    official_rank: officialRank.get(row.user_id) ?? row.rank,
    rank_delta: (officialRank.get(row.user_id) ?? row.rank) - row.rank,
    movement_type: "live",
  }));
}

async function latestPreBatchSnapshot(env: Env, leagueId: string) {
  const latest = await env.DB.prepare(`
    SELECT snapshot_key, created_at
    FROM leaderboard_snapshots
    WHERE league_id = ? AND snapshot_type = 'pre_batch' AND snapshot_key IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(leagueId).first<{ snapshot_key: string; created_at: string }>();

  if (!latest) return null;

  const rows = await env.DB.prepare(`
    SELECT user_id, rank
    FROM leaderboard_snapshots
    WHERE league_id = ? AND snapshot_key = ? AND snapshot_type = 'pre_batch'
  `).bind(leagueId, latest.snapshot_key).all<{ user_id: string; rank: number }>();

  return new Map((rows.results ?? []).map((row) => [row.user_id, row.rank]));
}

async function withLastMatchDeltas(env: Env, leagueId: string, official: LeaderboardRow[]) {
  const previousRanks = await latestPreBatchSnapshot(env, leagueId);

  return official.map((row) => {
    const previousRank = previousRanks?.get(row.user_id) ?? row.rank;
    return {
      ...row,
      official_rank: previousRank,
      rank_delta: previousRank - row.rank,
      movement_type: "last_match",
    };
  });
}

async function predictionsForMatch(env: Env, leagueId: string, match: MatchRow) {
  const hasStarted = isLiveStatus(match.status) || Date.now() >= new Date(match.kickoff_at).getTime() || usableFinalScore(match) !== null;
  if (!hasStarted) return [];

  const liveScore = scoreForLiveMatch(match);
  const rows = await env.DB.prepare(`
    WITH global_predictions AS (
      SELECT user_id, match_id, MAX(home_score) as home_score, MAX(away_score) as away_score, MAX(points) as points, MAX(bonus_used) as bonus_used
      FROM predictions
      GROUP BY user_id, match_id
    )
    SELECT users.id as user_id, users.nickname, global_predictions.home_score, global_predictions.away_score, global_predictions.points, global_predictions.bonus_used
    FROM league_members
    JOIN users ON users.id = league_members.user_id
    LEFT JOIN global_predictions ON global_predictions.user_id = users.id AND global_predictions.match_id = ?
    WHERE league_members.league_id = ? AND league_members.removed_at IS NULL
    ORDER BY users.nickname ASC
  `).bind(match.id, leagueId).all<PredictionRow>();

  const predictions = (rows.results ?? []).map((prediction) => {
    const livePoints = liveScore && prediction.home_score !== null && prediction.away_score !== null
      ? calculatePredictionPoints({
          predictedHome: prediction.home_score,
          predictedAway: prediction.away_score,
          finalHome: liveScore.home,
          finalAway: liveScore.away,
          multiplier: match.points_multiplier,
          bonusMultiplier: prediction.bonus_used && isGroupStage(match.stage) ? 5 : 1,
        }).points
      : prediction.points;

    return { ...prediction, live_points: livePoints };
  });
  const aiPrediction = (await oddzzAiVisiblePredictions(env)).find((prediction) => prediction.match_id === match.id);
  if (aiPrediction) {
    predictions.push({
      user_id: ODDZZ_AI_USER_ID,
      nickname: "OddzzAI",
      home_score: aiPrediction.home_score,
      away_score: aiPrediction.away_score,
      points: aiPrediction.points,
      bonus_used: aiPrediction.bonus_used ?? 0,
      live_points: aiPrediction.points,
    });
  }
  return predictions;
}

export async function leagueHome(request: Request, env: Env, leagueId: string) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);

  const membership = await env.DB.prepare(`
    SELECT id FROM league_members WHERE league_id = ? AND user_id = ? AND removed_at IS NULL
  `).bind(leagueId, user.id).first();
  if (!membership) return badRequest("You are not a member of this league.", 403);

  const live = await liveMatches(env);
  const official = await officialLeaderboard(env, leagueId);
  const aiRow = await oddzzAiLeaderboardRow(env, live.length > 0);
  const officialWithAi = aiRow ? rankRows([...official.map(({ rank: _rank, ...row }) => row), aiRow]) : official;
  const leaderboard = live.length > 0
    ? await provisionalLiveLeaderboard(env, leagueId, officialWithAi, live)
    : await withLastMatchDeltas(env, leagueId, officialWithAi);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const todayRows = await env.DB.prepare(`
    SELECT * FROM matches
    WHERE (kickoff_at >= ? AND kickoff_at < ?)
      OR status IN ('live', 'in_play', 'LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'penalties', 'extra_time')
    ORDER BY kickoff_at ASC
  `).bind(todayStart.toISOString(), todayEnd.toISOString()).all<MatchRow>();

  const matches = await Promise.all((todayRows.results ?? []).map(withCorrectMultiplier).map(async (match) => ({
    ...match,
    is_live: isLiveOrExpectedLive(match),
    effective_home_score: scoreForLiveMatch(match)?.home ?? null,
    effective_away_score: scoreForLiveMatch(match)?.away ?? null,
    predictions: await predictionsForMatch(env, leagueId, match),
  })));
  const hasImminentMatch = matches.some((match) => {
    const kickoffAt = new Date(match.kickoff_at).getTime();
    return !isLiveOrExpectedLive(match) && kickoffAt >= Date.now() && kickoffAt <= Date.now() + 15 * 60_000;
  });

  return json({
    mode: live.length > 0 ? "live" : "official",
    leaderboard,
    matches,
    poll_seconds: live.length > 0 || hasImminentMatch ? 20 : 60,
  });
}

export async function savePreMatchSnapshotsForMatches(env: Env, matchIds: string[]) {
  if (matchIds.length === 0) return;

  const snapshotKey = matchIds.slice().sort().join("+");
  const leagues = await env.DB.prepare(`SELECT id FROM leagues`).all<{ id: string }>();

  for (const league of leagues.results ?? []) {
    const exists = await env.DB.prepare(`
      SELECT id FROM leaderboard_snapshots
      WHERE league_id = ? AND snapshot_key = ? AND snapshot_type = 'pre_batch'
      LIMIT 1
    `).bind(league.id, snapshotKey).first();
    if (exists) continue;

    const board = await officialLeaderboard(env, league.id);
    for (const row of board) {
      await env.DB.prepare(`
        INSERT INTO leaderboard_snapshots (id, league_id, match_id, user_id, rank, points, exact_scores, correct_results, predictions_count, snapshot_type, snapshot_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pre_batch', ?, datetime('now'))
      `).bind(crypto.randomUUID(), league.id, matchIds[0], row.user_id, row.rank, row.points, row.exact_scores, row.correct_results, row.predictions_count, snapshotKey).run();
    }
  }
}

export async function savePreMatchSnapshotsForMatch(env: Env, matchId: string) {
  await savePreMatchSnapshotsForMatches(env, [matchId]);
}
