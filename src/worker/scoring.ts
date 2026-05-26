import type { MatchRow } from "./types";

export function resultOf(home: number, away: number) {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

export function usableFinalScore(match: MatchRow): { home: number; away: number } | null {
  if (match.score_120_home !== null && match.score_120_away !== null) {
    return { home: match.score_120_home, away: match.score_120_away };
  }
  if (match.final_home !== null && match.final_away !== null) {
    return { home: match.final_home, away: match.final_away };
  }
  if (match.score_90_home !== null && match.score_90_away !== null) {
    return { home: match.score_90_home, away: match.score_90_away };
  }
  return null;
}

export function calculatePredictionPoints(args: {
  predictedHome: number;
  predictedAway: number;
  finalHome: number;
  finalAway: number;
  multiplier: number;
}) {
  const exact = args.predictedHome === args.finalHome && args.predictedAway === args.finalAway;
  const correctResult = resultOf(args.predictedHome, args.predictedAway) === resultOf(args.finalHome, args.finalAway);
  const basePoints = exact ? 5 : correctResult ? 3 : 0;

  return {
    points: basePoints * args.multiplier,
    isExact: exact,
    isCorrectResult: correctResult,
    basePoints,
  };
}

export function multiplierForStage(stage: string | null) {
  const normalized = (stage ?? "").toLowerCase();
  if (normalized.includes("final") && !normalized.includes("semi") && !normalized.includes("third")) return 5;
  if (normalized.includes("semi") || normalized.includes("third") || normalized.includes("3")) return 4;
  if (normalized.includes("quarter")) return 3;
  if (normalized.includes("last_16") || normalized.includes("round of 16") || normalized.includes("huit")) return 2;
  return 1;
}
