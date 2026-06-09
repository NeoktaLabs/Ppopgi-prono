import type { Env, MatchRow } from "./types";
import { calculatePredictionPoints, isGroupStage, usableFinalScore } from "./scoring";
import { rankLeaderboardRows, type LeaderboardLikeRow } from "./ai-leaderboard";

type AggregatePredictionRow = MatchRow & {
  user_id: string;
  home_score: number;
  away_score: number;
  bonus_used: number | null;
};

function isLiveStatus(status: string) {
  return ["live", "in_play", "1h", "2h", "ht", "et", "bt", "p", "penalties", "extra_time"].includes(status.toLowerCase());
}

function scoreForMatch(match: MatchRow, includeLive: boolean) {
  if (includeLive && isLiveStatus(match.status) && match.live_home_score !== null && match.live_away_score !== null) {
    return { home: match.live_home_score, away: match.live_away_score };
  }
  return usableFinalScore(match);
}

function matchCountsForBonusUsage(match: MatchRow) {
  return isLiveStatus(match.status) || new Date(match.kickoff_at).getTime() <= Date.now() || usableFinalScore(match) !== null;
}

export async function buildComputedLeaderboardRows(env: Env, options?: { leagueId?: string; includeLive?: boolean }) {
  const includeLive = options?.includeLive === true;
  const usersQuery = options?.leagueId
    ? env.DB.prepare(`
        SELECT users.id AS user_id, users.nickname
        FROM league_members
        JOIN users ON users.id = league_members.user_id
        WHERE league_members.league_id = ? AND league_members.removed_at IS NULL
      `).bind(options.leagueId)
    : env.DB.prepare("SELECT id AS user_id, nickname FROM users");

  const users = await usersQuery.all<{ user_id: string; nickname: string | null }>();
  const totals = new Map<string, Omit<LeaderboardLikeRow, "rank"> & { usedBonusMatchIds: Set<string> }>();

  for (const user of users.results ?? []) {
    totals.set(user.user_id, {
      user_id: user.user_id,
      nickname: user.nickname,
      points: 0,
      exact_scores: 0,
      correct_results: 0,
      predictions_count: 0,
      bonuses_remaining: 2,
      usedBonusMatchIds: new Set<string>(),
    });
  }

  const predictionsQuery = options?.leagueId
    ? env.DB.prepare(`
        WITH global_predictions AS (
          SELECT user_id, match_id, MAX(home_score) AS home_score, MAX(away_score) AS away_score, MAX(bonus_used) AS bonus_used
          FROM predictions
          GROUP BY user_id, match_id
        )
        SELECT
          global_predictions.user_id,
          global_predictions.home_score,
          global_predictions.away_score,
          global_predictions.bonus_used,
          matches.*
        FROM global_predictions
        JOIN matches ON matches.id = global_predictions.match_id
        JOIN league_members ON league_members.user_id = global_predictions.user_id
        WHERE league_members.league_id = ? AND league_members.removed_at IS NULL
      `).bind(options.leagueId)
    : env.DB.prepare(`
        WITH global_predictions AS (
          SELECT user_id, match_id, MAX(home_score) AS home_score, MAX(away_score) AS away_score, MAX(bonus_used) AS bonus_used
          FROM predictions
          GROUP BY user_id, match_id
        )
        SELECT
          global_predictions.user_id,
          global_predictions.home_score,
          global_predictions.away_score,
          global_predictions.bonus_used,
          matches.*
        FROM global_predictions
        JOIN matches ON matches.id = global_predictions.match_id
      `);

  const predictions = await predictionsQuery.all<AggregatePredictionRow>();

  for (const row of predictions.results ?? []) {
    const total = totals.get(row.user_id);
    if (!total) continue;

    total.predictions_count += 1;

    if (row.bonus_used && isGroupStage(row.stage) && matchCountsForBonusUsage(row)) {
      total.usedBonusMatchIds.add(row.id);
    }

    const score = scoreForMatch(row, includeLive);
    if (!score) continue;

    const result = calculatePredictionPoints({
      predictedHome: row.home_score,
      predictedAway: row.away_score,
      finalHome: score.home,
      finalAway: score.away,
      multiplier: row.points_multiplier,
      bonusMultiplier: row.bonus_used && isGroupStage(row.stage) ? 5 : 1,
    });

    total.points += result.points;
    total.exact_scores += result.isExact ? 1 : 0;
    total.correct_results += result.isCorrectResult ? 1 : 0;
  }

  return rankLeaderboardRows(
    Array.from(totals.values()).map(({ usedBonusMatchIds, ...row }) => ({
      ...row,
      bonuses_remaining: Math.max(0, 2 - usedBonusMatchIds.size),
    })),
  );
}
