import type { MatchRow } from "./types";

export function resultOf(home: number, away: number) {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

export function usableFinalScore(match: MatchRow): { home: number; away: number; source: "manual" | "api" } | null {
  if (match.manual_final_home !== null && match.manual_final_away !== null) {
    return { home: match.manual_final_home, away: match.manual_final_away, source: "manual" };
  }

  if (match.score_120_home !== null && match.score_120_away !== null) {
    return { home: match.score_120_home, away: match.score_120_away, source: "api" };
  }

  if (match.final_home !== null && match.final_away !== null) {
    return { home: match.final_home, away: match.final_away, source: "api" };
  }

  if (match.score_90_home !== null && match.score_90_away !== null) {
    return { home: match.score_90_home, away: match.score_90_away, source: "api" };
  }

  return null;
}

export function calculatePredictionPoints(args: {
  predictedHome: number;
  predictedAway: number;
  finalHome: number;
  finalAway: number;
  multiplier: number;
  bonusMultiplier?: number;
}) {
  const exact = args.predictedHome === args.finalHome && args.predictedAway === args.finalAway;
  const correctResult = resultOf(args.predictedHome, args.predictedAway) === resultOf(args.finalHome, args.finalAway);
  const predictedTotalGoals = args.predictedHome + args.predictedAway;
  const exactBasePoints = predictedTotalGoals >= 5 ? 15 : predictedTotalGoals >= 3 ? 10 : 5;
  const basePoints = exact ? exactBasePoints : correctResult ? 3 : 0;

  return {
    points: basePoints * args.multiplier * (args.bonusMultiplier ?? 1),
    isExact: exact,
    isCorrectResult: correctResult,
    basePoints,
  };
}

export function multiplierForStage(stage: string | null) {
  const normalized = (stage ?? "").toLowerCase().trim();

  if (!normalized) return 1;
  if (normalized.includes("group")) return 1;

  if (normalized.includes("last_32") || normalized.includes("round of 32") || normalized.includes("1/16")) return 2;
  if (normalized.includes("last_16") || normalized.includes("round of 16") || normalized.includes("huit") || normalized.includes("1/8")) return 3;
  if (normalized.includes("quarter")) return 4;
  if (normalized.includes("semi")) return 5;
  if (normalized.includes("third") || normalized.includes("3rd") || normalized.includes("bronze")) return 5;
  if (normalized === "final") return 10;

  return 1;
}

export function isGroupStage(stage: string | null) {
  return (stage ?? "").toLowerCase().includes("group");
}
