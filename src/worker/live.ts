import type { Env, MatchRow } from "./types";
import { badRequest, json, requireUser } from "./utils";
import { calculatePredictionPoints, usableFinalScore } from "./scoring";

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
  home_score: number;
  away_score: number;
  points: number;
  bonus_used: number;
};

function isLiveStatus(status: string) {
  return ["live", "in_play", "1h", "2h", "ht", "et", "penalties", "extra_time"].includes(status.toLowerCase());
}

function rankRows(rows: Omit<LeaderboardRow, "rank">[]): LeaderboardRow[] {
  return rows
    .sort((a, b) =>
      b.points - a.points ||
      b.exact_scores - a.exact_scores ||
      b.correct_results - a.correct_results ||
      b.predictions_count - a.predictions_count ||
      (a.nickname ?? "").localeCompare(b.nickname ?? ""),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

async function officialLeaderboard(env: Env, leagueId: string): Promise<LeaderboardRow[]> {
  const rows = await env.DB.prepare(`
    SELECT
      users.id as user_id,
      users.nickname,
      COALESCE(SUM(predictions.points), 0) as points,
      COALESCE(SUM(predictions.is_exact), 0) as exact_scores,
      COALESCE(SUM(predictions.is_correct_result), 0) as correct_results,
      COUNT(predictions.id) as predictions_count,
      2 - COALESCE(SUM(predictions.bonus_used), 0) as bonuses_remaining
    FROM league_members
    JOIN users ON users.id = league_members.user_id
    LEFT JOIN predictions ON predictions.user_id = users.id AND predictions.league_id = league_members.league_id
    WHERE league_members.league_id = ? AND league_members.removed_at IS NULL
    GROUP BY users.id
  `).bind(leagueId).all<Omit<LeaderboardRow, "rank">>();

  return rankRows((rows.results ?? []).map((row) => ({
    ...row,
    points: Number(row.points),
    exact_scores: Number(row.exact_scores),
    correct_results: Number(row.correct_results),
    predictions_count: Number(row.predictions_count),
    bonuses_remaining: Number(row.bonuses_remaining),
  })));
}

async function liveMatches(env: Env): Promise<MatchRow[]> {
  const rows = await env.DB.prepare(`
    SELECT * FROM matches
    WHERE status IN ('live', 'in_play', '1H', '2H', 'HT', 'ET', 'penalties', 'extra_time')
    ORDER BY kickoff_at ASC
  `).all<MatchRow>();
  return rows.results ?? [];
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
      SELECT user_id, home_score, away_score, bonus_used
      FROM predictions
      WHERE league_id = ? AND match_id = ?
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
        bonusMultiplier: prediction.bonus_used ? 5 : 1,
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
  const hasStarted = Date.now() >= new Date(match.kickoff_at).getTime();
  if (!hasStarted) return [];

  const liveScore = scoreForLiveMatch(match);
  const rows = await env.DB.prepare(`
    SELECT predictions.user_id, users.nickname, predictions.home_score, predictions.away_score, predictions.points, predictions.bonus_used
    FROM predictions
    JOIN users ON users.id = predictions.user_id
    WHERE predictions.league_id = ? AND predictions.match_id = ?
    ORDER BY users.nickname ASC
  `).bind(leagueId, match.id).all<PredictionRow>();

  return (rows.results ?? []).map((prediction) => {
    const livePoints = liveScore
      ? calculatePredictionPoints({
          predictedHome: prediction.home_score,
          predictedAway: prediction.away_score,
          finalHome: liveScore.home,
          finalAway: liveScore.away,
          multiplier: match.points_multiplier,
          bonusMultiplier: prediction.bonus_used ? 5 : 1,
        }).points
      : prediction.points;

    return { ...prediction, live_points: livePoints };
  });
}

export async function leagueHome(request: Request, env: Env, leagueId: string) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);

  const membership = await env.DB.prepare(`
    SELECT id FROM league_members WHERE league_id = ? AND user_id = ? AND removed_at IS NULL
  `).bind(leagueId, user.id).first();
  if (!membership) return badRequest("You are not a member of this league.", 403);

  const official = await officialLeaderboard(env, leagueId);
  const live = await liveMatches(env);
  const leaderboard = live.length > 0
    ? await provisionalLiveLeaderboard(env, leagueId, official, live)
    : await withLastMatchDeltas(env, leagueId, official);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const todayRows = await env.DB.prepare(`
    SELECT * FROM matches
    WHERE (kickoff_at >= ? AND kickoff_at < ?)
      OR status IN ('live', 'in_play', '1H', '2H', 'HT', 'ET', 'penalties', 'extra_time')
    ORDER BY kickoff_at ASC
  `).bind(todayStart.toISOString(), todayEnd.toISOString()).all<MatchRow>();

  const matches = await Promise.all((todayRows.results ?? []).map(async (match) => ({
    ...match,
    is_live: isLiveStatus(match.status),
    effective_home_score: scoreForLiveMatch(match)?.home ?? null,
    effective_away_score: scoreForLiveMatch(match)?.away ?? null,
    predictions: await predictionsForMatch(env, leagueId, match),
  })));

  return json({
    mode: live.length > 0 ? "live" : "official",
    leaderboard,
    matches,
    poll_seconds: live.length > 0 ? 20 : 60,
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
