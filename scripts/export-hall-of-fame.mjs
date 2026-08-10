import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const databaseName = process.env.D1_DATABASE_NAME || "ppopgi-prono";
const outputPath = resolve(process.env.HALL_OF_FAME_OUTPUT || "public/hall-of-fame/world-cup-2026.json");

const ODDZZ_AI_USER_ID = "__oddzz_ai__";
const ODDZZ_AI_NICKNAME = "OddzzAI";

function runD1(sql) {
  const output = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", databaseName, "--remote", "--json", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(output);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return first?.results ?? first?.result?.[0]?.results ?? [];
}

function resultOf(home, away) {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

function usableFinalScore(match) {
  if (match.manual_final_home !== null && match.manual_final_away !== null) {
    return { home: match.manual_final_home, away: match.manual_final_away, source: "manual" };
  }
  if (match.score_120_home !== null && match.score_120_away !== null) {
    return { home: match.score_120_home, away: match.score_120_away, source: "api-120" };
  }
  if (match.final_home !== null && match.final_away !== null) {
    return { home: match.final_home, away: match.final_away, source: "api-final" };
  }
  if (match.score_90_home !== null && match.score_90_away !== null) {
    return { home: match.score_90_home, away: match.score_90_away, source: "api-90" };
  }
  return null;
}

function isGroupStage(stage) {
  return String(stage ?? "").toLowerCase().includes("group");
}

function calculatePredictionPoints({ predictedHome, predictedAway, finalHome, finalAway, multiplier, bonusMultiplier = 1 }) {
  const isExact = predictedHome === finalHome && predictedAway === finalAway;
  const isCorrectResult = resultOf(predictedHome, predictedAway) === resultOf(finalHome, finalAway);
  const predictedTotalGoals = predictedHome + predictedAway;
  const exactBasePoints = predictedTotalGoals >= 5 ? 15 : predictedTotalGoals >= 3 ? 10 : 5;
  const basePoints = isExact ? exactBasePoints : isCorrectResult ? 3 : 0;
  return {
    points: basePoints * Number(multiplier || 1) * bonusMultiplier,
    isExact,
    isCorrectResult,
  };
}

function parseAiScoreline(value) {
  const text = typeof value === "string" ? value : "";
  const match = text.match(/(\d{1,2})\s*[-:]\s*(\d{1,2})(?!.*\d{1,2}\s*[-:]\s*\d{1,2})/);
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function rankRows(rows) {
  return rows
    .sort((a, b) =>
      Number(b.points) - Number(a.points) ||
      Number(b.exactScores) - Number(a.exactScores) ||
      Number(b.correctResults) - Number(a.correctResults) ||
      Number(b.predictionsCount) - Number(a.predictionsCount) ||
      String(a.nickname ?? "").localeCompare(String(b.nickname ?? "")),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

const users = runD1(`
  SELECT id, nickname
  FROM users
  WHERE nickname IS NOT NULL
  ORDER BY LOWER(nickname)
`);

const matches = runD1(`
  SELECT
    id,
    external_id,
    home_team,
    away_team,
    home_team_logo,
    away_team_logo,
    kickoff_at,
    stage,
    group_name,
    venue,
    status,
    score_90_home,
    score_90_away,
    score_120_home,
    score_120_away,
    final_home,
    final_away,
    manual_final_home,
    manual_final_away,
    points_multiplier
  FROM matches
  WHERE kickoff_at <= datetime('now')
     OR final_home IS NOT NULL
     OR manual_final_home IS NOT NULL
     OR score_90_home IS NOT NULL
     OR score_120_home IS NOT NULL
  ORDER BY kickoff_at ASC
`);

const predictions = runD1(`
  SELECT
    predictions.user_id,
    predictions.match_id,
    predictions.home_score,
    predictions.away_score,
    predictions.bonus_used
  FROM predictions
`);

const aiInsights = runD1(`
  SELECT
    ai_fixture_insights.match_id,
    json_extract(ai_fixture_insights.insight_json, '$.suggested_pick') AS suggested_pick,
    json_extract(ai_fixture_insights.insight_json, '$.bonus_recommendation.use_bonus') AS bonus_recommended,
    ai_fixture_insights.created_at
  FROM ai_fixture_insights
  ORDER BY ai_fixture_insights.created_at ASC
`);

const matchById = new Map(matches.map((match) => [match.id, match]));
const predictionByUserMatch = new Map(predictions.map((prediction) => [`${prediction.user_id}:${prediction.match_id}`, prediction]));

const latestPreKickoffAiInsights = new Map();
for (const insight of aiInsights) {
  const match = matchById.get(insight.match_id);
  if (!match) continue;
  if (new Date(insight.created_at).getTime() > new Date(match.kickoff_at).getTime()) continue;
  const existing = latestPreKickoffAiInsights.get(insight.match_id);
  if (!existing || new Date(insight.created_at).getTime() > new Date(existing.created_at).getTime()) {
    latestPreKickoffAiInsights.set(insight.match_id, insight);
  }
}

const aiBonusMatchIds = new Set();
for (const match of matches.filter((row) => isGroupStage(row.stage)).sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))) {
  if (aiBonusMatchIds.size >= 2) break;
  const insight = latestPreKickoffAiInsights.get(match.id);
  if (!insight) continue;
  if (insight.bonus_recommended === 1 || insight.bonus_recommended === true) aiBonusMatchIds.add(match.id);
}

function archivePrediction(match, prediction) {
  const finalScore = usableFinalScore(match);
  if (!prediction || !finalScore) {
    return {
      matchId: match.id,
      homeScore: prediction?.home_score ?? null,
      awayScore: prediction?.away_score ?? null,
      points: 0,
      exact: false,
      correctResult: false,
      bonusUsed: Boolean(prediction?.bonus_used),
    };
  }
  const score = calculatePredictionPoints({
    predictedHome: Number(prediction.home_score),
    predictedAway: Number(prediction.away_score),
    finalHome: finalScore.home,
    finalAway: finalScore.away,
    multiplier: Number(match.points_multiplier || 1),
    bonusMultiplier: prediction.bonus_used && isGroupStage(match.stage) ? 5 : 1,
  });
  return {
    matchId: match.id,
    homeScore: prediction.home_score,
    awayScore: prediction.away_score,
    points: score.points,
    exact: score.isExact,
    correctResult: score.isCorrectResult,
    bonusUsed: Boolean(prediction.bonus_used),
  };
}

const archivedMatches = matches.map((match) => {
  const finalScore = usableFinalScore(match);
  return {
    id: match.id,
    externalId: match.external_id,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    homeTeamLogo: match.home_team_logo,
    awayTeamLogo: match.away_team_logo,
    kickoffAt: match.kickoff_at,
    stage: match.stage,
    groupName: match.group_name,
    venue: match.venue,
    finalHome: finalScore?.home ?? null,
    finalAway: finalScore?.away ?? null,
    scoreSource: finalScore?.source ?? null,
  };
});

function buildHumanRow(user) {
  const playerPredictions = matches.map((match) => {
    const prediction = predictionByUserMatch.get(`${user.id}:${match.id}`);
    return archivePrediction(match, prediction);
  });
  return {
    userId: user.id,
    nickname: user.nickname,
    isAi: false,
    points: playerPredictions.reduce((total, prediction) => total + prediction.points, 0),
    exactScores: playerPredictions.filter((prediction) => prediction.exact).length,
    correctResults: playerPredictions.filter((prediction) => prediction.correctResult).length,
    predictionsCount: playerPredictions.filter((prediction) => prediction.homeScore !== null && prediction.awayScore !== null).length,
    bonusesUsed: playerPredictions.filter((prediction) => prediction.bonusUsed).length,
    predictions: playerPredictions,
  };
}

function buildAiRow() {
  const playerPredictions = matches.map((match) => {
    const insight = latestPreKickoffAiInsights.get(match.id);
    const scoreline = parseAiScoreline(insight?.suggested_pick);
    return archivePrediction(match, scoreline ? {
      home_score: scoreline.home,
      away_score: scoreline.away,
      bonus_used: aiBonusMatchIds.has(match.id) ? 1 : 0,
    } : null);
  });
  return {
    userId: ODDZZ_AI_USER_ID,
    nickname: ODDZZ_AI_NICKNAME,
    isAi: true,
    points: playerPredictions.reduce((total, prediction) => total + prediction.points, 0),
    exactScores: playerPredictions.filter((prediction) => prediction.exact).length,
    correctResults: playerPredictions.filter((prediction) => prediction.correctResult).length,
    predictionsCount: playerPredictions.filter((prediction) => prediction.homeScore !== null && prediction.awayScore !== null).length,
    bonusesUsed: playerPredictions.filter((prediction) => prediction.bonusUsed).length,
    predictions: playerPredictions,
  };
}

const archive = {
  generatedAt: new Date().toISOString(),
  competitions: [
    {
      id: "world-cup-2026",
      name: "World Cup 2026",
      winner: "Spain",
      finishedAt: "2026-07-19",
      matches: archivedMatches,
      rankings: rankRows([...users.map(buildHumanRow), buildAiRow()]),
    },
  ],
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(archive, null, 2)}\n`);
console.log(`Hall of Fame archive written to ${outputPath}`);
