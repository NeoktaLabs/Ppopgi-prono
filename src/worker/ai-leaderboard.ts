import type { Env, MatchRow } from "./types";
import { calculatePredictionPoints, multiplierForStage, usableFinalScore } from "./scoring";

export const ODDZZ_AI_USER_ID = "__oddzz_ai__";
export const ODDZZ_AI_NICKNAME = "OddzzAI";

export type LeaderboardLikeRow = {
  user_id: string;
  nickname: string | null;
  points: number;
  exact_scores: number;
  correct_results: number;
  predictions_count: number;
  bonuses_remaining: number;
  rank: number;
  official_rank?: number;
  rank_delta?: number;
  movement_type?: "live" | "last_match";
  is_ai?: boolean;
};

type AiInsightRow = MatchRow & {
  insight_json: string;
};

function isLiveStatus(status: string) {
  return ["live", "in_play", "1h", "2h", "ht", "et", "penalties", "extra_time"].includes(status.toLowerCase());
}

export function parseAiScoreline(value: unknown) {
  const text = typeof value === "string" ? value : "";
  const match = text.match(/(\d{1,2})\s*[-:]\s*(\d{1,2})(?!.*\d{1,2}\s*[-:]\s*\d{1,2})/);
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
}

function scoreForMatch(match: MatchRow, includeLive: boolean) {
  if (includeLive && isLiveStatus(match.status) && match.live_home_score !== null && match.live_away_score !== null) {
    return { home: match.live_home_score, away: match.live_away_score };
  }
  return usableFinalScore(match);
}

function parseInsightJson(value: string) {
  return JSON.parse(value) as { suggested_pick?: string };
}

export async function oddzzAiLeaderboardRow(env: Env, includeLive = false): Promise<Omit<LeaderboardLikeRow, "rank"> | null> {
  const rows = await env.DB.prepare(`
    SELECT matches.*, insights.insight_json
    FROM matches
    JOIN (
      SELECT match_id, MAX(updated_at) as updated_at
      FROM ai_fixture_insights
      GROUP BY match_id
    ) latest ON latest.match_id = matches.id
    JOIN ai_fixture_insights insights ON insights.match_id = latest.match_id AND insights.updated_at = latest.updated_at
  `).all<AiInsightRow>();

  let points = 0;
  let exactScores = 0;
  let correctResults = 0;
  let predictionsCount = 0;

  for (const row of rows.results ?? []) {
    const score = scoreForMatch(row, includeLive);
    if (!score) continue;

    const insight = parseInsightJson(row.insight_json);
    const predicted = parseAiScoreline(insight.suggested_pick);
    if (!predicted) continue;

    const result = calculatePredictionPoints({
      predictedHome: predicted.home,
      predictedAway: predicted.away,
      finalHome: score.home,
      finalAway: score.away,
      multiplier: multiplierForStage(row.stage),
    });

    points += result.points;
    exactScores += result.isExact ? 1 : 0;
    correctResults += result.isCorrectResult ? 1 : 0;
    predictionsCount += 1;
  }

  if (predictionsCount === 0) return null;

  return {
    user_id: ODDZZ_AI_USER_ID,
    nickname: ODDZZ_AI_NICKNAME,
    points,
    exact_scores: exactScores,
    correct_results: correctResults,
    predictions_count: predictionsCount,
    bonuses_remaining: 0,
    is_ai: true,
  };
}

export async function oddzzAiVisiblePredictions(env: Env) {
  const rows = await env.DB.prepare(`
    SELECT matches.*, insights.insight_json
    FROM matches
    JOIN (
      SELECT match_id, MAX(updated_at) as updated_at
      FROM ai_fixture_insights
      GROUP BY match_id
    ) latest ON latest.match_id = matches.id
    JOIN ai_fixture_insights insights ON insights.match_id = latest.match_id AND insights.updated_at = latest.updated_at
    WHERE matches.status IN ('live', 'in_play', '1H', '2H', 'HT', 'ET', 'penalties', 'extra_time')
      OR matches.kickoff_at <= datetime('now')
      OR matches.final_home IS NOT NULL
      OR matches.manual_final_home IS NOT NULL
    ORDER BY matches.kickoff_at DESC
  `).all<AiInsightRow>();

  return (rows.results ?? []).map((row) => {
    const insight = parseInsightJson(row.insight_json);
    const predicted = parseAiScoreline(insight.suggested_pick);
    const score = scoreForMatch(row, true);
    const points = predicted && score
      ? calculatePredictionPoints({
          predictedHome: predicted.home,
          predictedAway: predicted.away,
          finalHome: score.home,
          finalAway: score.away,
          multiplier: multiplierForStage(row.stage),
        }).points
      : null;

    return {
      ...row,
      match_id: row.id,
      home_score: predicted?.home ?? null,
      away_score: predicted?.away ?? null,
      points,
      bonus_used: 0,
    };
  });
}

export function rankLeaderboardRows<T extends Omit<LeaderboardLikeRow, "rank">>(rows: T[]) {
  return rows
    .sort((a, b) =>
      Number(b.points) - Number(a.points) ||
      Number(b.exact_scores) - Number(a.exact_scores) ||
      Number(b.correct_results) - Number(a.correct_results) ||
      Number(b.predictions_count) - Number(a.predictions_count) ||
      (a.nickname ?? "").localeCompare(b.nickname ?? ""),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
