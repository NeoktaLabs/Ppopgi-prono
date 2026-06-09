import type { Env, MatchRow } from "./types";
import { calculatePredictionPoints, isGroupStage, multiplierForStage, usableFinalScore } from "./scoring";

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
  insight_created_at: string;
};

function isLiveStatus(status: string) {
  return ["live", "in_play", "1h", "2h", "ht", "et", "bt", "p", "penalties", "extra_time"].includes(status.toLowerCase());
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
  return JSON.parse(value) as { suggested_pick?: string; bonus_recommendation?: { use_bonus?: boolean } };
}

function canUseAiBonus(row: AiInsightRow, insight: ReturnType<typeof parseInsightJson>) {
  return insight.bonus_recommendation?.use_bonus === true && isGroupStage(row.stage) && new Date(row.insight_created_at).getTime() <= new Date(row.kickoff_at).getTime();
}

function isPreKickoffAiInsight(row: AiInsightRow) {
  return new Date(row.insight_created_at).getTime() <= new Date(row.kickoff_at).getTime();
}

function matchCountsForBonusUsage(row: AiInsightRow) {
  return isLiveStatus(row.status) || new Date(row.kickoff_at).getTime() <= Date.now() || usableFinalScore(row) !== null;
}

function aiBonusMatchIds(rows: AiInsightRow[]) {
  const ids = new Set<string>();
  for (const row of rows.slice().sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime())) {
    if (ids.size >= 2) break;
    if (!isPreKickoffAiInsight(row)) continue;
    if (!matchCountsForBonusUsage(row)) continue;
    const insight = parseInsightJson(row.insight_json);
    if (canUseAiBonus(row, insight)) ids.add(row.id);
  }
  return ids;
}

function latestPreKickoffRows(rows: AiInsightRow[]) {
  const byMatch = new Map<string, AiInsightRow>();
  for (const row of rows) {
    if (!isPreKickoffAiInsight(row)) continue;
    const existing = byMatch.get(row.id);
    if (!existing || new Date(row.insight_created_at).getTime() > new Date(existing.insight_created_at).getTime()) {
      byMatch.set(row.id, row);
    }
  }
  return Array.from(byMatch.values());
}

export async function oddzzAiLeaderboardRow(env: Env, includeLive = false): Promise<Omit<LeaderboardLikeRow, "rank"> | null> {
  const rows = await env.DB.prepare(`
    SELECT matches.*, insights.insight_json, insights.created_at as insight_created_at
    FROM matches
    JOIN ai_fixture_insights insights ON insights.match_id = matches.id
  `).all<AiInsightRow>();

  let points = 0;
  let exactScores = 0;
  let correctResults = 0;
  let predictionsCount = 0;
  const allRows = rows.results ?? [];
  const preKickoffRows = latestPreKickoffRows(allRows);
  const bonusMatchIds = aiBonusMatchIds(preKickoffRows);

  for (const row of preKickoffRows) {
    const insight = parseInsightJson(row.insight_json);
    const predicted = parseAiScoreline(insight.suggested_pick);
    if (!predicted) continue;
    predictionsCount += 1;

    const score = scoreForMatch(row, includeLive);
    if (!score) continue;

    const result = calculatePredictionPoints({
      predictedHome: predicted.home,
      predictedAway: predicted.away,
      finalHome: score.home,
      finalAway: score.away,
      multiplier: multiplierForStage(row.stage),
      bonusMultiplier: bonusMatchIds.has(row.id) ? 5 : 1,
    });

    points += result.points;
    exactScores += result.isExact ? 1 : 0;
    correctResults += result.isCorrectResult ? 1 : 0;
  }

  return {
    user_id: ODDZZ_AI_USER_ID,
    nickname: ODDZZ_AI_NICKNAME,
    points,
    exact_scores: exactScores,
    correct_results: correctResults,
    predictions_count: predictionsCount,
    bonuses_remaining: Math.max(0, 2 - bonusMatchIds.size),
    is_ai: true,
  };
}

export async function oddzzAiVisiblePredictions(env: Env) {
  const rows = await env.DB.prepare(`
    SELECT matches.*, insights.insight_json, insights.created_at as insight_created_at
    FROM matches
    JOIN ai_fixture_insights insights ON insights.match_id = matches.id
    WHERE matches.status IN ('live', 'in_play', 'LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'penalties', 'extra_time')
      OR matches.kickoff_at <= datetime('now')
      OR matches.final_home IS NOT NULL
      OR matches.manual_final_home IS NOT NULL
    ORDER BY matches.kickoff_at DESC
  `).all<AiInsightRow>();

  const allRows = rows.results ?? [];
  const preKickoffRows = latestPreKickoffRows(allRows);
  const bonusMatchIds = aiBonusMatchIds(preKickoffRows);

  return preKickoffRows.map((row) => {
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
          bonusMultiplier: bonusMatchIds.has(row.id) ? 5 : 1,
        }).points
      : null;

    return {
      ...row,
      match_id: row.id,
      home_score: predicted?.home ?? null,
      away_score: predicted?.away ?? null,
      points,
      bonus_used: bonusMatchIds.has(row.id) ? 1 : 0,
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
