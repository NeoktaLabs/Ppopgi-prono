import type { Env, MatchRow } from "./types";
import { badRequest, json, nowIso, requireUser, sha256 } from "./utils";

type InsightPayload = {
  headline: string;
  summary: string;
  angles: string[];
  suggested_pick: string;
  bonus_recommendation: {
    use_bonus: boolean;
    reason: string;
  };
  confidence: "low" | "medium" | "high";
  disclaimer: string;
};

type ScoreSignal = "home" | "draw" | "away" | "balanced" | "sparse" | "unavailable";

type Scorecard = {
  market_signal: ScoreSignal;
  api_prediction_signal: ScoreSignal;
  qualifier_form_signal: ScoreSignal;
  recent_form_signal: ScoreSignal;
  strength_prior_signal: ScoreSignal;
  regional_context_signal: ScoreSignal;
  confidence_score: number;
  confidence_level: "low" | "medium" | "high";
  suggested_pick: string;
  bonus_recommended: boolean;
  reasons: string[];
};

type TeamFormHistory = {
  note: string;
  competitions: ReadonlyArray<unknown>;
  source: string;
  competition_strength: number;
  average_opponent_strength: number;
  adjusted_points_per_match: number;
  last_3_summary: {
    record: { wins: number; draws: number; losses: number };
    goals_for: number;
    goals_against: number;
    results: string[];
  };
  record: { wins: number; draws: number; losses: number };
  matches: any[];
};

const INSIGHT_PROMPT_VERSION = "2026-06-02-scorecard-v25";
type InsightLanguage = "en" | "fr";

const WORLD_CUP_2026_QUALIFIER_COMPETITIONS = [
  { league: 29, season: 2023, name: "World Cup - Qualification Africa", confederation: "CAF", strength: 0.98 },
  { league: 30, season: 2026, name: "World Cup - Qualification Asia", confederation: "AFC", strength: 0.9 },
  { league: 31, season: 2026, name: "World Cup - Qualification CONCACAF", confederation: "CONCACAF", strength: 0.92 },
  { league: 32, season: 2024, name: "World Cup - Qualification Europe", confederation: "UEFA", strength: 1.12 },
  { league: 33, season: 2026, name: "World Cup - Qualification Oceania", confederation: "OFC", strength: 0.75 },
  { league: 34, season: 2026, name: "World Cup - Qualification South America", confederation: "CONMEBOL", strength: 1.1 },
  { league: 37, season: 2026, name: "World Cup - Qualification Intercontinental Play-offs", confederation: "PLAYOFF", strength: 1 },
] as const;

const HOST_RECENT_FORM_TEAMS = new Set(["Canada", "Mexico", "USA", "United States"]);
const TOURNAMENT_HOST_TEAMS = new Set(["Canada", "Mexico", "USA", "United States"]);
const AMERICAS_TEAMS = new Set([
  "Argentina",
  "Brazil",
  "Bolivia",
  "Canada",
  "Chile",
  "Colombia",
  "Costa Rica",
  "Ecuador",
  "Mexico",
  "Panama",
  "Paraguay",
  "USA",
  "United States",
  "Uruguay",
]);

const TEAM_STRENGTH_PRIOR: Record<string, number> = {
  Argentina: 95,
  France: 94,
  Spain: 92,
  England: 91,
  Brazil: 91,
  Portugal: 89,
  Netherlands: 88,
  Germany: 88,
  Belgium: 86,
  Croatia: 86,
  Italy: 85,
  Uruguay: 84,
  Switzerland: 83,
  Colombia: 83,
  Denmark: 82,
  Morocco: 82,
  Japan: 81,
  Czechia: 80,
  "Czech Republic": 80,
  USA: 79,
  Mexico: 78,
  Senegal: 78,
  Serbia: 77,
  Sweden: 77,
  Austria: 77,
  Poland: 76,
  Ecuador: 76,
  Hungary: 76,
  Turkey: 76,
  Cameroon: 75,
  Iran: 75,
  Australia: 74,
  "South Korea": 74,
  Canada: 73,
  Panama: 73,
  Norway: 73,
  Chile: 72,
  "Republic of Ireland": 72,
  Ireland: 72,
  Wales: 72,
  Georgia: 70,
  Tunisia: 70,
  Nigeria: 70,
  Paraguay: 70,
  Scotland: 70,
  Uzbekistan: 69,
  Ghana: 69,
  "United Arab Emirates": 68,
  UAE: 68,
  "South Africa": 68,
  "Saudi Arabia": 67,
  "Bosnia & Herzegovina": 67,
  "Costa Rica": 67,
  Jordan: 66,
  "Cape Verde": 66,
  "Cape Verde Islands": 66,
  Angola: 65,
  Bulgaria: 65,
  Qatar: 64,
  Curacao: 64,
  Curaçao: 64,
  Oman: 63,
  Armenia: 62,
  Bolivia: 62,
  Libya: 62,
  Palestine: 60,
  Kuwait: 58,
  Kyrgyzstan: 55,
  "North Korea": 55,
  Mauritius: 50,
  Eswatini: 49,
};

class AiProviderError extends Error {
  constructor(message: string, public readonly status = 503) {
    super(message);
  }
}

function safeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function apiFootballBaseUrl(env: Env) {
  return env.FOOTBALL_API_BASE_URL || "https://v3.football.api-sports.io";
}

async function fetchApiFootball<T = any>(env: Env, path: string, params: Record<string, string | number | null | undefined>) {
  if (!env.FOOTBALL_API_KEY) return null;
  const url = new URL(`${apiFootballBaseUrl(env)}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString(), {
    headers: { "x-apisports-key": env.FOOTBALL_API_KEY },
  });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

function compactTeamStats(payload: any) {
  const stats = payload?.response ?? {};
  if (!stats || typeof stats !== "object") return null;
  return {
    form: stats.form ?? null,
    fixtures: stats.fixtures ?? null,
    goals: stats.goals ?? null,
    clean_sheet: stats.clean_sheet ?? null,
    failed_to_score: stats.failed_to_score ?? null,
    biggest: stats.biggest ?? null,
  };
}

function compactFixture(fixture: any) {
  if (!fixture) return null;
  return {
    date: fixture.fixture?.date ?? null,
    status: fixture.fixture?.status?.short ?? fixture.fixture?.status?.long ?? null,
    league: fixture.league ? {
      id: fixture.league.id ?? null,
      name: fixture.league.name ?? null,
      country: fixture.league.country ?? null,
      season: fixture.league.season ?? null,
      round: fixture.league.round ?? null,
    } : null,
    teams: {
      home: fixture.teams?.home?.name ?? null,
      away: fixture.teams?.away?.name ?? null,
    },
    score: {
      home: fixture.goals?.home ?? fixture.score?.fulltime?.home ?? null,
      away: fixture.goals?.away ?? fixture.score?.fulltime?.away ?? null,
    },
  };
}

function compactFixtureForTeam(fixture: any, teamId: number) {
  const side = sideForTeam(fixture, teamId);
  const opponent = opponentNameForTeam(fixture, teamId);
  return {
    ...compactFixture(fixture),
    team_side: side,
    opponent,
    opponent_strength: teamStrength(opponent ?? ""),
  };
}

function isWorldCupQualifierFixture(fixture: any) {
  const leagueId = safeNumber(fixture?.league?.id);
  return WORLD_CUP_2026_QUALIFIER_COMPETITIONS.some((competition) => competition.league === leagueId);
}

function qualifierCompetitionForLeague(leagueId: number | null) {
  return WORLD_CUP_2026_QUALIFIER_COMPETITIONS.find((competition) => competition.league === leagueId) ?? null;
}

function isCompletedFixture(fixture: any) {
  const short = String(fixture?.fixture?.status?.short ?? "").toUpperCase();
  const long = String(fixture?.fixture?.status?.long ?? "").toLowerCase();
  return ["FT", "AET", "PEN"].includes(short) || long.includes("match finished");
}

function sideForTeam(fixture: any, teamId: number) {
  const homeId = safeNumber(fixture?.teams?.home?.id);
  const awayId = safeNumber(fixture?.teams?.away?.id);
  if (homeId === teamId) return "home";
  if (awayId === teamId) return "away";
  return null;
}

function resultForTeam(fixture: any, teamId: number) {
  const side = sideForTeam(fixture, teamId);
  const homeGoals = safeNumber(fixture?.goals?.home ?? fixture?.score?.fulltime?.home);
  const awayGoals = safeNumber(fixture?.goals?.away ?? fixture?.score?.fulltime?.away);
  if (homeGoals === null || awayGoals === null) return null;
  if (!side) return null;
  const own = side === "home" ? homeGoals : awayGoals;
  const against = side === "home" ? awayGoals : homeGoals;
  return own > against ? "W" : own < against ? "L" : "D";
}

function opponentNameForTeam(fixture: any, teamId: number) {
  const side = sideForTeam(fixture, teamId);
  if (side === "home") return fixture?.teams?.away?.name ?? null;
  if (side === "away") return fixture?.teams?.home?.name ?? null;
  return null;
}

function adjustedResultPoints(result: string | null, opponentStrength: number) {
  const raw = result === "W" ? 3 : result === "D" ? 1 : 0;
  return raw * Math.max(0.72, Math.min(1.25, opponentStrength / 76));
}

function scoreForTeam(match: any, teamId: number) {
  const home = match.team_side === "home";
  const away = match.team_side === "away";
  const homeGoals = safeNumber(match.score?.home);
  const awayGoals = safeNumber(match.score?.away);
  if ((!home && !away) || homeGoals === null || awayGoals === null) return null;
  return {
    for: home ? homeGoals : awayGoals,
    against: home ? awayGoals : homeGoals,
  };
}

function summarizeLastThree(matches: any[], teamId: number) {
  const lastThree = matches.slice(0, 3);
  const summary = lastThree.reduce((acc: TeamFormHistory["last_3_summary"], match: any) => {
    const score = scoreForTeam(match, teamId);
    if (match.result === "W") acc.record.wins += 1;
    if (match.result === "D") acc.record.draws += 1;
    if (match.result === "L") acc.record.losses += 1;
    if (score) {
      acc.goals_for += score.for;
      acc.goals_against += score.against;
      acc.results.push(`${match.result ?? "?"} ${score.for}-${score.against} vs ${match.opponent ?? "opponent"}`);
    }
    return acc;
  }, {
    record: { wins: 0, draws: 0, losses: 0 },
    goals_for: 0,
    goals_against: 0,
    results: [],
  });
  return summary;
}

function compactQualifierHistory(fixturesPayloads: any[], teamId: number, teamName: string, beforeIso: string): TeamFormHistory {
  const beforeTime = new Date(beforeIso).getTime();
  const fixtures = fixturesPayloads
    .flatMap((payload) => Array.isArray(payload?.response) ? payload.response : [])
    .filter((fixture: any, index: number, all: any[]) => {
      const fixtureId = fixture?.fixture?.id;
      if (fixtureId == null) return true;
      return all.findIndex((candidate: any) => candidate?.fixture?.id === fixtureId) === index;
    });
  const matches = fixtures
    .filter((fixture: any) => isWorldCupQualifierFixture(fixture))
    .filter((fixture: any) => isCompletedFixture(fixture))
    .filter((fixture: any) => new Date(fixture?.fixture?.date ?? 0).getTime() < beforeTime)
    .filter((fixture: any) => sideForTeam(fixture, teamId) !== null)
    .sort((a: any, b: any) => new Date(b?.fixture?.date ?? 0).getTime() - new Date(a?.fixture?.date ?? 0).getTime())
    .slice(0, 12)
    .map((fixture: any) => {
      const leagueId = safeNumber(fixture?.league?.id);
      const competition = qualifierCompetitionForLeague(leagueId);
      const side = sideForTeam(fixture, teamId);
      const opponent = opponentNameForTeam(fixture, teamId);
      return {
        ...compactFixture(fixture),
        result: resultForTeam(fixture, teamId),
        team_side: side,
        opponent,
        opponent_strength: teamStrength(opponent ?? ""),
        confederation: competition?.confederation ?? null,
        competition_strength: competition?.strength ?? 1,
      };
    })
    .filter(Boolean);

  const record = matches.reduce((acc: { wins: number; draws: number; losses: number }, fixture: any) => {
    if (fixture.result === "W") acc.wins += 1;
    if (fixture.result === "D") acc.draws += 1;
    if (fixture.result === "L") acc.losses += 1;
    return acc;
  }, { wins: 0, draws: 0, losses: 0 });

  const competitionStrength = matches.length
    ? matches.reduce((sum: number, fixture: any) => sum + (safeNumber(fixture.competition_strength) ?? 1), 0) / matches.length
    : 1;
  const averageOpponentStrength = matches.length
    ? matches.reduce((sum: number, fixture: any) => sum + (safeNumber(fixture.opponent_strength) ?? 72), 0) / matches.length
    : 72;
  const adjustedPointsPerMatch = matches.length
    ? matches.reduce((sum: number, fixture: any) => (
      sum + adjustedResultPoints(fixture.result, safeNumber(fixture.opponent_strength) ?? 72) * (safeNumber(fixture.competition_strength) ?? 1)
    ), 0) / matches.length
    : 0;

  return {
    note: "World Cup 2026 qualification fixtures only, matched by API-Football qualifier league IDs and completed before this match kickoff. Some qualifier competitions use API-Football season labels earlier than 2026.",
    competitions: WORLD_CUP_2026_QUALIFIER_COMPETITIONS,
    source: "world_cup_qualifiers",
    competition_strength: Number(competitionStrength.toFixed(2)),
    average_opponent_strength: Number(averageOpponentStrength.toFixed(1)),
    adjusted_points_per_match: Number(adjustedPointsPerMatch.toFixed(2)),
    last_3_summary: summarizeLastThree(matches, teamId),
    record,
    matches,
  };
}

function compactHostRecentHistory(payload: any, teamId: number, teamName: string, beforeIso: string): TeamFormHistory {
  const beforeTime = new Date(beforeIso).getTime();
  const fixtures = Array.isArray(payload?.response) ? payload.response : [];
  const matches = fixtures
    .filter((fixture: any) => isCompletedFixture(fixture))
    .filter((fixture: any) => new Date(fixture?.fixture?.date ?? 0).getTime() < beforeTime)
    .filter((fixture: any) => sideForTeam(fixture, teamId) !== null)
    .sort((a: any, b: any) => new Date(b?.fixture?.date ?? 0).getTime() - new Date(a?.fixture?.date ?? 0).getTime())
    .slice(0, 10)
    .map((fixture: any) => {
      const side = sideForTeam(fixture, teamId);
      const opponent = opponentNameForTeam(fixture, teamId);
      return {
        ...compactFixture(fixture),
        result: resultForTeam(fixture, teamId),
        team_side: side,
        opponent,
        opponent_strength: teamStrength(opponent ?? ""),
        confederation: "CONCACAF",
        competition_strength: 0.92,
      };
    })
    .filter(Boolean);
  const record = matches.reduce((acc: { wins: number; draws: number; losses: number }, fixture: any) => {
    if (fixture.result === "W") acc.wins += 1;
    if (fixture.result === "D") acc.draws += 1;
    if (fixture.result === "L") acc.losses += 1;
    return acc;
  }, { wins: 0, draws: 0, losses: 0 });

  const adjustedPointsPerMatch = matches.length
    ? matches.reduce((sum: number, fixture: any) => (
      sum + adjustedResultPoints(fixture.result, safeNumber(fixture.opponent_strength) ?? 72) * (safeNumber(fixture.competition_strength) ?? 1)
    ), 0) / matches.length
    : 0;
  const averageOpponentStrength = matches.length
    ? matches.reduce((sum: number, fixture: any) => sum + (safeNumber(fixture.opponent_strength) ?? 72), 0) / matches.length
    : 72;

  return {
    note: `${teamName} is a 2026 host, so no normal World Cup qualifier record is available. OddzzAI uses the latest 10 completed matches across all competitions and friendlies instead.`,
    competitions: [],
    source: "host_recent_all_competitions",
    competition_strength: 0.92,
    average_opponent_strength: Number(averageOpponentStrength.toFixed(1)),
    adjusted_points_per_match: Number(adjustedPointsPerMatch.toFixed(2)),
    last_3_summary: summarizeLastThree(matches, teamId),
    record,
    matches,
  };
}

function compactPrediction(payload: any) {
  const item = payload?.response?.[0];
  if (!item) return null;
  return {
    winner: item.predictions?.winner?.name ?? null,
    advice: item.predictions?.advice ?? null,
    percent: item.predictions?.percent ?? null,
    goals: item.predictions?.goals ?? null,
    comparison: item.comparison ?? null,
    teams: item.teams ? {
      home: {
        name: item.teams.home?.name ?? null,
        last_5: item.teams.home?.last_5 ?? null,
        league: item.teams.home?.league ?? null,
      },
      away: {
        name: item.teams.away?.name ?? null,
        last_5: item.teams.away?.last_5 ?? null,
        league: item.teams.away?.league ?? null,
      },
    } : null,
    h2h: Array.isArray(item.h2h) ? item.h2h.slice(0, 5).map(compactFixture) : [],
  };
}

function compactStanding(payload: any) {
  const rows = payload?.response?.[0]?.league?.standings?.flat?.() ?? [];
  const row = rows[0];
  if (!row) return null;
  return {
    rank: row.rank ?? null,
    points: row.points ?? null,
    goalsDiff: row.goalsDiff ?? null,
    form: row.form ?? null,
    all: row.all ?? null,
  };
}

function compactInjuries(payload: any) {
  const injuries = Array.isArray(payload?.response) ? payload.response : [];
  return injuries.slice(0, 8).map((item: any) => ({
    player: item.player?.name ?? null,
    team: item.team?.name ?? null,
    reason: item.player?.reason ?? null,
    type: item.player?.type ?? null,
  })).filter((item: any) => item.player || item.team || item.reason);
}

function compactOdds(payload: any) {
  const rows = Array.isArray(payload?.response) ? payload.response : [];
  const bookmaker = rows[0]?.bookmakers?.[0];
  if (!bookmaker) return null;
  const bets = Array.isArray(bookmaker.bets) ? bookmaker.bets : [];
  const interestingMarkets = new Set(["Match Winner", "Home/Away", "Goals Over/Under", "Both Teams Score", "Double Chance"]);
  return {
    bookmaker: bookmaker.name ?? null,
    markets: bets
      .filter((bet: any) => interestingMarkets.has(bet.name))
      .slice(0, 4)
      .map((bet: any) => ({
        name: bet.name ?? null,
        values: Array.isArray(bet.values) ? bet.values.slice(0, 8).map((value: any) => ({
          label: value.value ?? null,
          odd: value.odd ?? null,
        })) : [],
      })),
  };
}

function teamStrength(name: string) {
  return TEAM_STRENGTH_PRIOR[name] ?? 72;
}

function baselineScoreHint(homeTeam: string, awayTeam: string) {
  const home = teamStrength(homeTeam);
  const away = teamStrength(awayTeam);
  const gap = home - away;
  if (gap >= 18) return `${homeTeam} 3-0 ${awayTeam}`;
  if (gap >= 11) return `${homeTeam} 2-0 ${awayTeam}`;
  if (gap >= 6) return `${homeTeam} 2-1 ${awayTeam}`;
  if (gap > -6) return `${homeTeam} 1-1 ${awayTeam}`;
  if (gap > -11) return `${homeTeam} 1-2 ${awayTeam}`;
  if (gap > -18) return `${homeTeam} 0-2 ${awayTeam}`;
  return `${homeTeam} 0-3 ${awayTeam}`;
}

function parsePercent(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function signalValue(signal: ScoreSignal) {
  if (signal === "home") return 1;
  if (signal === "away") return -1;
  return 0;
}

function confidenceLevel(score: number): "low" | "medium" | "high" {
  if (score >= 0.72) return "high";
  if (score >= 0.48) return "medium";
  return "low";
}

function matchWinnerOddsSignal(odds: any, homeTeam: string, awayTeam: string) {
  const markets = Array.isArray(odds?.markets) ? odds.markets : [];
  const market = markets.find((item: any) => ["Match Winner", "Home/Away"].includes(item?.name));
  const values = Array.isArray(market?.values) ? market.values : [];
  const map = new Map<"home" | "draw" | "away", number>();
  for (const value of values) {
    const label = String(value?.label ?? "").toLowerCase();
    const odd = Number(value?.odd);
    if (!Number.isFinite(odd) || odd <= 1) continue;
    if (label === "home" || label === homeTeam.toLowerCase()) map.set("home", odd);
    if (label === "draw") map.set("draw", odd);
    if (label === "away" || label === awayTeam.toLowerCase()) map.set("away", odd);
  }
  if (map.size < 2) return { signal: "unavailable" as ScoreSignal, reason: "No usable match-winner odds yet." };
  const ranked = [...map.entries()].sort((a, b) => a[1] - b[1]);
  const [best, second] = ranked;
  if (!best || !second) return { signal: "unavailable" as ScoreSignal, reason: "No usable match-winner odds yet." };
  const edge = second[1] - best[1];
  return {
    signal: edge < 0.18 ? "balanced" as ScoreSignal : best[0],
    reason: `Market leans ${best[0]} from ${odds.bookmaker ?? "available"} odds.`,
  };
}

function apiPredictionSignal(prediction: any, homeTeam: string, awayTeam: string) {
  const percent = prediction?.percent ?? prediction?.predictions?.percent;
  const home = parsePercent(percent?.home);
  const draw = parsePercent(percent?.draw);
  const away = parsePercent(percent?.away);
  if (home !== null && draw !== null && away !== null) {
    const ranked: Array<["home" | "draw" | "away", number]> = [
      ["home", home],
      ["draw", draw],
      ["away", away],
    ];
    ranked.sort((a, b) => b[1] - a[1]);
    const [best, second] = ranked;
    return {
      signal: best[1] - second[1] < 6 ? "balanced" as ScoreSignal : best[0],
      reason: `API-Football prediction leans ${best[0]} (${best[1]}%).`,
    };
  }
  const winner = String(prediction?.winner ?? "").toLowerCase();
  if (!winner) return { signal: "unavailable" as ScoreSignal, reason: "API-Football prediction is unavailable." };
  if (winner === homeTeam.toLowerCase()) return { signal: "home" as ScoreSignal, reason: `API-Football winner signal favors ${homeTeam}.` };
  if (winner === awayTeam.toLowerCase()) return { signal: "away" as ScoreSignal, reason: `API-Football winner signal favors ${awayTeam}.` };
  return { signal: "draw" as ScoreSignal, reason: "API-Football winner signal points to a draw or balanced match." };
}

function qualifierFormSignal(homeHistory: any, awayHistory: any) {
  const homeMatches = Number(homeHistory?.matches?.length ?? 0);
  const awayMatches = Number(awayHistory?.matches?.length ?? 0);
  if (homeMatches < 2 || awayMatches < 2) return { signal: "sparse" as ScoreSignal, reason: "World Cup qualifier history is sparse for at least one team." };
  const homeRecord = homeHistory.record ?? {};
  const awayRecord = awayHistory.record ?? {};
  const homeStrength = safeNumber(homeHistory.competition_strength) ?? 1;
  const awayStrength = safeNumber(awayHistory.competition_strength) ?? 1;
  const homeOpponentStrength = safeNumber(homeHistory.average_opponent_strength) ?? 72;
  const awayOpponentStrength = safeNumber(awayHistory.average_opponent_strength) ?? 72;
  const homePpg = safeNumber(homeHistory.adjusted_points_per_match)
    ?? ((((homeRecord.wins ?? 0) * 3 + (homeRecord.draws ?? 0)) / homeMatches) * homeStrength);
  const awayPpg = safeNumber(awayHistory.adjusted_points_per_match)
    ?? ((((awayRecord.wins ?? 0) * 3 + (awayRecord.draws ?? 0)) / awayMatches) * awayStrength);
  const diff = homePpg - awayPpg;
  if (Math.abs(diff) < 0.28) return { signal: "balanced" as ScoreSignal, reason: `Adjusted qualifier/form signal is close (${homePpg.toFixed(2)} vs ${awayPpg.toFixed(2)} pts/match), after opponent quality (${homeOpponentStrength.toFixed(1)} vs ${awayOpponentStrength.toFixed(1)} avg strength).` };
  return {
    signal: diff > 0 ? "home" as ScoreSignal : "away" as ScoreSignal,
    reason: `Adjusted qualifier/form signal favors ${diff > 0 ? "home" : "away"} (${homePpg.toFixed(2)} vs ${awayPpg.toFixed(2)} pts/match), including opponent quality (${homeOpponentStrength.toFixed(1)} vs ${awayOpponentStrength.toFixed(1)} avg strength).`,
  };
}

function recentFormSignal(homeForm: any[], awayForm: any[], homeTeam: string, awayTeam: string) {
  if (!homeForm?.length || !awayForm?.length) return { signal: "sparse" as ScoreSignal, reason: "Generic recent-form data is sparse." };
  const avgGoalDiff = (fixtures: any[]) => {
    const diffs = fixtures.map((fixture) => {
      const home = fixture.team_side === "home";
      const away = fixture.team_side === "away";
      const homeGoals = safeNumber(fixture.score?.home);
      const awayGoals = safeNumber(fixture.score?.away);
      if ((!home && !away) || homeGoals === null || awayGoals === null) return null;
      return home ? homeGoals - awayGoals : awayGoals - homeGoals;
    }).filter((value): value is number => value !== null);
    return diffs.length ? diffs.reduce((sum, value) => sum + value, 0) / diffs.length : null;
  };
  const homeDiff = avgGoalDiff(homeForm);
  const awayDiff = avgGoalDiff(awayForm);
  if (homeDiff === null || awayDiff === null) return { signal: "sparse" as ScoreSignal, reason: "Recent-form score data could not be normalized reliably." };
  const diff = homeDiff - awayDiff;
  if (Math.abs(diff) < 0.35) return { signal: "balanced" as ScoreSignal, reason: `Recent goal-difference form is close (${homeDiff.toFixed(2)} vs ${awayDiff.toFixed(2)}).` };
  return {
    signal: diff > 0 ? "home" as ScoreSignal : "away" as ScoreSignal,
    reason: `Recent goal-difference form favors ${diff > 0 ? homeTeam : awayTeam} (${homeDiff.toFixed(2)} vs ${awayDiff.toFixed(2)}).`,
  };
}

function strengthPriorSignal(homeTeam: string, awayTeam: string) {
  const gap = teamStrength(homeTeam) - teamStrength(awayTeam);
  if (Math.abs(gap) < 4) return { signal: "balanced" as ScoreSignal, reason: "Internal strength prior sees the teams as close." };
  return {
    signal: gap > 0 ? "home" as ScoreSignal : "away" as ScoreSignal,
    reason: `Internal strength prior favors ${gap > 0 ? homeTeam : awayTeam} by ${Math.abs(gap)} points.`,
  };
}

function regionalTournamentBoost(teamName: string) {
  if (TOURNAMENT_HOST_TEAMS.has(teamName)) return 4;
  if (AMERICAS_TEAMS.has(teamName)) return 2;
  return 0;
}

function regionalContextSignal(homeTeam: string, awayTeam: string) {
  const homeBoost = regionalTournamentBoost(homeTeam);
  const awayBoost = regionalTournamentBoost(awayTeam);
  const diff = homeBoost - awayBoost;
  if (diff === 0) {
    if (homeBoost > 0) return { signal: "balanced" as ScoreSignal, boost_home: homeBoost, boost_away: awayBoost, reason: "Both teams get a similar regional World Cup travel/context boost." };
    return { signal: "balanced" as ScoreSignal, boost_home: 0, boost_away: 0, reason: "No regional World Cup travel/context boost applies." };
  }
  return {
    signal: diff > 0 ? "home" as ScoreSignal : "away" as ScoreSignal,
    boost_home: homeBoost,
    boost_away: awayBoost,
    reason: `${diff > 0 ? homeTeam : awayTeam} gets a small World Cup regional context boost (${Math.abs(diff)} points).`,
  };
}

function suggestedScoreFromEdge(homeTeam: string, awayTeam: string, edge: number, strengthGap: number) {
  if (edge >= 0.45 && strengthGap >= 16) return `${homeTeam} 3-0 ${awayTeam}`;
  if (edge <= -0.45 && strengthGap <= -16) return `${homeTeam} 0-3 ${awayTeam}`;
  if (edge >= 0.55) return `${homeTeam} 2-0 ${awayTeam}`;
  if (edge >= 0.2) return `${homeTeam} 2-1 ${awayTeam}`;
  if (edge <= -0.55) return `${homeTeam} 0-2 ${awayTeam}`;
  if (edge <= -0.2) return `${homeTeam} 1-2 ${awayTeam}`;
  return `${homeTeam} 1-1 ${awayTeam}`;
}

function buildScorecard(match: MatchRow, scouting: any): Scorecard {
  const market = matchWinnerOddsSignal(scouting.market_odds, match.home_team, match.away_team);
  const api = apiPredictionSignal(scouting.provider_prediction, match.home_team, match.away_team);
  const qualifiers = qualifierFormSignal(scouting.world_cup_qualifiers?.home, scouting.world_cup_qualifiers?.away);
  const recent = recentFormSignal(scouting.teams?.home?.recent_form ?? [], scouting.teams?.away?.recent_form ?? [], match.home_team, match.away_team);
  const strength = strengthPriorSignal(match.home_team, match.away_team);
  const regional = regionalContextSignal(match.home_team, match.away_team);
  const strengthGap = (teamStrength(match.home_team) + regional.boost_home) - (teamStrength(match.away_team) + regional.boost_away);
  const weightedSignals = [
    { ...market, weight: 0.35 },
    { ...api, weight: 0.25 },
    { ...qualifiers, weight: 0.2 },
    { ...strength, weight: 0.13 },
    { ...recent, weight: 0.05 },
    { ...regional, weight: 0.02 },
  ];
  const usable = weightedSignals.filter((item) => !["unavailable", "sparse"].includes(item.signal));
  const totalWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  const edge = totalWeight ? usable.reduce((sum, item) => sum + signalValue(item.signal) * item.weight, 0) / totalWeight : 0;
  const agreement = usable.length ? usable.filter((item) => Math.sign(signalValue(item.signal)) === Math.sign(edge) || signalValue(item.signal) === 0).length / usable.length : 0;
  const baseConfidence = totalWeight * (0.55 + agreement * 0.45) * Math.min(1, Math.abs(edge) + 0.35);
  const structuralConfidence = Math.abs(strengthGap) >= 22 ? 0.58 : Math.abs(strengthGap) >= 16 ? 0.5 : Math.abs(strengthGap) >= 10 ? 0.42 : 0.12;
  const marketOrApiAvailable = !["unavailable", "sparse"].includes(market.signal) || !["unavailable", "sparse"].includes(api.signal);
  const confidenceCap = marketOrApiAvailable ? 0.95 : 0.68;
  const confidence = Math.max(0.12, Math.min(confidenceCap, Math.max(baseConfidence, structuralConfidence)));
  const level = confidenceLevel(confidence);
  return {
    market_signal: market.signal,
    api_prediction_signal: api.signal,
    qualifier_form_signal: qualifiers.signal,
    recent_form_signal: recent.signal,
    strength_prior_signal: strength.signal,
    regional_context_signal: regional.signal,
    confidence_score: Number(confidence.toFixed(2)),
    confidence_level: level,
    suggested_pick: suggestedScoreFromEdge(match.home_team, match.away_team, edge, strengthGap),
    bonus_recommended: level === "high" && Math.abs(edge) >= 0.5 && String(match.stage ?? "").toLowerCase().includes("group"),
    reasons: [market.reason, api.reason, qualifiers.reason, strength.reason, regional.reason, recent.reason].filter(Boolean).slice(0, 5),
  };
}

function teamInsightSummary(teamName: string, history: TeamFormHistory | null, fallbackForm: any[]) {
  const source = history?.source ?? (fallbackForm.length ? "recent_form" : "unavailable");
  const sourceLabel = source === "world_cup_qualifiers"
    ? "World Cup qualifier matches"
    : source === "host_recent_all_competitions"
      ? "latest matches across all competitions and friendlies because this host team has no normal qualifier campaign"
      : source === "recent_form"
        ? "recent matches from API-Football"
        : "no form data available";
  const lastThree = history?.last_3_summary ?? {
    record: { wins: 0, draws: 0, losses: 0 },
    goals_for: 0,
    goals_against: 0,
    results: [],
  };
  return {
    team: teamName,
    source,
    source_label: sourceLabel,
    matches_available: history?.matches.length ?? fallbackForm.length,
    full_record: history?.record ?? null,
    adjusted_points_per_match: history?.adjusted_points_per_match ?? null,
    average_opponent_strength: history?.average_opponent_strength ?? null,
    last_3: lastThree,
  };
}

function buildScoutingInsights(match: MatchRow, scouting: any) {
  const home = teamInsightSummary(match.home_team, scouting.world_cup_qualifiers?.home ?? null, scouting.teams?.home?.recent_form ?? []);
  const away = teamInsightSummary(match.away_team, scouting.world_cup_qualifiers?.away ?? null, scouting.teams?.away?.recent_form ?? []);
  const injuries = Array.isArray(scouting.injuries) ? scouting.injuries : [];
  return {
    instruction: "Prioritize these concrete numbers in the user-facing insight bullets before generic strength-prior language.",
    form_comparison: {
      home,
      away,
      adjusted_points_gap_home_minus_away: home.adjusted_points_per_match != null && away.adjusted_points_per_match != null
        ? Number((home.adjusted_points_per_match - away.adjusted_points_per_match).toFixed(2))
        : null,
      average_opponent_strength_gap_home_minus_away: home.average_opponent_strength != null && away.average_opponent_strength != null
        ? Number((home.average_opponent_strength - away.average_opponent_strength).toFixed(1))
        : null,
    },
    injury_watch: {
      count: injuries.length,
      players: injuries.slice(0, 5),
      note: injuries.length ? "Mention key absences only if the player/team/reason is clear." : "No fixture injury list is available from API-Football yet.",
    },
    tournament_context: {
      note: "World Cup 2026 is mainly hosted in USA, Canada and Mexico. This is a small regional/travel context boost, not API-Football home advantage.",
      home: { team: match.home_team, boost: regionalTournamentBoost(match.home_team) },
      away: { team: match.away_team, boost: regionalTournamentBoost(match.away_team) },
    },
  };
}

async function fetchFixtureTeams(env: Env, externalId: string) {
  const payload = await fetchApiFootball<{ response?: any[] }>(env, "/fixtures", { id: externalId });
  const fixture = payload?.response?.[0];
  return fixture?.teams ? {
    home: safeNumber(fixture.teams.home?.id),
    away: safeNumber(fixture.teams.away?.id),
  } : null;
}

async function fetchTeamStats(env: Env, teamId: number | null) {
  if (!env.FOOTBALL_API_KEY || !teamId) return null;
  const league = env.FOOTBALL_API_LEAGUE_ID || "1";
  const season = env.FOOTBALL_API_SEASON || "2026";
  return compactTeamStats(await fetchApiFootball(env, "/teams/statistics", { league, season, team: teamId }));
}

async function fetchTeamWorldCupQualifierPayloads(env: Env, teamId: number | null) {
  if (!env.FOOTBALL_API_KEY || !teamId) return [];
  return Promise.all(WORLD_CUP_2026_QUALIFIER_COMPETITIONS.map((competition) => (
    fetchApiFootball(env, "/fixtures", {
      league: competition.league,
      season: competition.season,
      team: teamId,
    }).catch(() => null)
  )));
}

async function fetchHostRecentHistory(env: Env, teamId: number | null, teamName: string, beforeIso: string) {
  if (!env.FOOTBALL_API_KEY || !teamId || !HOST_RECENT_FORM_TEAMS.has(teamName)) return null;
  const hostPayload = await fetchApiFootball(env, "/fixtures", { team: teamId, last: 10 }).catch(() => null);
  return compactHostRecentHistory(hostPayload, teamId, teamName, beforeIso);
}

async function buildStatsSnapshot(env: Env, match: MatchRow) {
  const storedTeams = {
    home: safeNumber(match.home_team_api_id),
    away: safeNumber(match.away_team_api_id),
  };
  const fetchedTeams = storedTeams.home && storedTeams.away ? null : await fetchFixtureTeams(env, match.external_id).catch(() => null);
  const teams = {
    home: storedTeams.home ?? fetchedTeams?.home ?? null,
    away: storedTeams.away ?? fetchedTeams?.away ?? null,
  };
  const league = env.FOOTBALL_API_LEAGUE_ID || "1";
  const season = env.FOOTBALL_API_SEASON || "2026";
  const [homeStats, awayStats, homeForm, awayForm, homeQualifierPayloads, awayQualifierPayloads, homeStanding, awayStanding, h2h, providerPrediction, injuries, odds] = await Promise.all([
    fetchTeamStats(env, teams?.home ?? null).catch(() => null),
    fetchTeamStats(env, teams?.away ?? null).catch(() => null),
    teams?.home ? fetchApiFootball(env, "/fixtures", { team: teams.home, last: 5 }).then((payload: any) => payload?.response?.slice(0, 5).map((fixture: any) => compactFixtureForTeam(fixture, teams.home!)) ?? null).catch(() => null) : null,
    teams?.away ? fetchApiFootball(env, "/fixtures", { team: teams.away, last: 5 }).then((payload: any) => payload?.response?.slice(0, 5).map((fixture: any) => compactFixtureForTeam(fixture, teams.away!)) ?? null).catch(() => null) : null,
    fetchTeamWorldCupQualifierPayloads(env, teams?.home ?? null).catch(() => []),
    fetchTeamWorldCupQualifierPayloads(env, teams?.away ?? null).catch(() => []),
    teams?.home ? fetchApiFootball(env, "/standings", { league, season, team: teams.home }).then(compactStanding).catch(() => null) : null,
    teams?.away ? fetchApiFootball(env, "/standings", { league, season, team: teams.away }).then(compactStanding).catch(() => null) : null,
    teams?.home && teams?.away ? fetchApiFootball(env, "/fixtures/headtohead", { h2h: `${teams.home}-${teams.away}`, last: 10 }).then((payload: any) => payload?.response?.slice(0, 10).map(compactFixture) ?? null).catch(() => null) : null,
    fetchApiFootball(env, "/predictions", { fixture: match.external_id }).then(compactPrediction).catch(() => null),
    fetchApiFootball(env, "/injuries", { fixture: match.external_id }).then(compactInjuries).catch(() => null),
    fetchApiFootball(env, "/odds", { fixture: match.external_id }).then(compactOdds).catch(() => null),
  ]);
  let homeQualifierHistory = teams?.home ? compactQualifierHistory(homeQualifierPayloads, teams.home, match.home_team, match.kickoff_at) : null;
  let awayQualifierHistory = teams?.away ? compactQualifierHistory(awayQualifierPayloads, teams.away, match.away_team, match.kickoff_at) : null;
  if (homeQualifierHistory && homeQualifierHistory.matches.length === 0 && HOST_RECENT_FORM_TEAMS.has(match.home_team)) {
    homeQualifierHistory = await fetchHostRecentHistory(env, teams?.home ?? null, match.home_team, match.kickoff_at).catch(() => homeQualifierHistory);
  }
  if (awayQualifierHistory && awayQualifierHistory.matches.length === 0 && HOST_RECENT_FORM_TEAMS.has(match.away_team)) {
    awayQualifierHistory = await fetchHostRecentHistory(env, teams?.away ?? null, match.away_team, match.kickoff_at).catch(() => awayQualifierHistory);
  }
  const datasets = {
    odds: !!odds,
    world_cup_qualifiers: !!((homeQualifierHistory?.matches.length ?? 0) || (awayQualifierHistory?.matches.length ?? 0)),
    team_statistics: !!(homeStats || awayStats),
    recent_form: !!((homeForm?.length ?? 0) || (awayForm?.length ?? 0)),
    standings: !!(homeStanding || awayStanding),
    head_to_head: !!(h2h?.length ?? 0),
    api_prediction: !!providerPrediction,
    injuries: !!(injuries?.length ?? 0),
  };
  const scouting = {
    match: {
      id: match.id,
      external_id: match.external_id,
      home_team: match.home_team,
      away_team: match.away_team,
      kickoff_at: match.kickoff_at,
      stage: match.stage,
      status: match.status,
      live_score: match.live_home_score != null || match.live_away_score != null ? `${match.live_home_score ?? 0}-${match.live_away_score ?? 0}` : null,
      final_score: match.final_home != null || match.final_away != null ? `${match.final_home ?? 0}-${match.final_away ?? 0}` : null,
      points_multiplier: match.points_multiplier,
    },
    source: Object.values(datasets).some(Boolean) ? "football-api-scouting-pack" : "match-context",
    datasets,
    market_odds: odds,
    world_cup_qualifiers: {
      home: homeQualifierHistory,
      away: awayQualifierHistory,
    },
    provider_prediction: providerPrediction,
    head_to_head: h2h ?? [],
    injuries: injuries ?? [],
    baseline_strength_prior: {
      note: "Oddzz heuristic fallback used when provider data is limited. Higher means stronger expected team quality; it is not an official FIFA ranking. Regional context is a small World Cup 2026 travel/host boost, not home advantage.",
      home: { team: match.home_team, strength: teamStrength(match.home_team), regional_boost: regionalTournamentBoost(match.home_team) },
      away: { team: match.away_team, strength: teamStrength(match.away_team), regional_boost: regionalTournamentBoost(match.away_team) },
      strength_gap_home_minus_away: (teamStrength(match.home_team) + regionalTournamentBoost(match.home_team)) - (teamStrength(match.away_team) + regionalTournamentBoost(match.away_team)),
      suggested_score_hint: baselineScoreHint(match.home_team, match.away_team),
    },
    teams: {
      home: { id: teams?.home ?? null, name: match.home_team, stats: homeStats, recent_form: homeForm ?? [], world_cup_qualifiers: homeQualifierHistory, standing: homeStanding },
      away: { id: teams?.away ?? null, name: match.away_team, stats: awayStats, recent_form: awayForm ?? [], world_cup_qualifiers: awayQualifierHistory, standing: awayStanding },
    },
  };
  return { ...scouting, scouting_insights: buildScoutingInsights(match, scouting), oddzz_scorecard: buildScorecard(match, scouting) };
}

function fallbackInsight(match: MatchRow, statsSource: string, scorecard?: Scorecard): InsightPayload {
  return {
    headline: `${match.home_team} vs ${match.away_team}: quick read`,
    summary: scorecard ? `OddzzAI scorecard leans toward ${scorecard.suggested_pick} with ${scorecard.confidence_level} confidence.` : `Oddzz AI can compare team stats once API keys are configured. For now, this local preview uses fixture context only, so treat it as a UI demo rather than a real forecast.`,
    angles: [
      ...(scorecard?.reasons ?? [`${match.stage ?? "World Cup"} match scheduled for ${new Date(match.kickoff_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}.`]),
      `Stats source: ${statsSource}.`,
    ].slice(0, 4),
    suggested_pick: scorecard?.suggested_pick ?? `${match.home_team} 1-1 ${match.away_team}`,
    bonus_recommendation: {
      use_bonus: scorecard?.bonus_recommended ?? false,
      reason: scorecard?.bonus_recommended ? "The scorecard sees a high-confidence group-stage edge." : "Do not use a bonus unless the scorecard confidence is high.",
    },
    confidence: scorecard?.confidence_level ?? "low",
    disclaimer: "AI insight for fun only. Not betting advice.",
  };
}

function coerceInsight(value: any, match: MatchRow, scorecard?: Scorecard): InsightPayload {
  const rawPick = String(value?.suggested_pick || "");
  const suggestedPick = /\d+\s*[-:]\s*\d+/.test(rawPick) ? rawPick : (scorecard?.suggested_pick ?? `${match.home_team} 1-1 ${match.away_team}`);
  return {
    headline: String(value?.headline || `${match.home_team} vs ${match.away_team}`),
    summary: String(value?.summary || "No summary available."),
    angles: Array.isArray(value?.angles) ? value.angles.slice(0, 4).map(String) : [],
    suggested_pick: suggestedPick,
    bonus_recommendation: {
      use_bonus: value?.bonus_recommendation?.use_bonus === true && (scorecard?.bonus_recommended ?? true),
      reason: String(value?.bonus_recommendation?.reason || scorecard?.reasons?.[0] || "No bonus recommendation available."),
    },
    confidence: ["low", "medium", "high"].includes(value?.confidence) ? value.confidence : (scorecard?.confidence_level ?? "low"),
    disclaimer: String(value?.disclaimer || "AI insight for fun only. Not betting advice."),
  };
}

async function generateInsight(env: Env, match: MatchRow, stats: unknown, language: InsightLanguage): Promise<InsightPayload> {
  const scorecard = (stats as any)?.oddzz_scorecard as Scorecard | undefined;
  if (!env.OPENAI_API_KEY) return fallbackInsight(match, (stats as any)?.source ?? "match-context", scorecard);
  const languageInstruction = language === "fr"
    ? "Write every user-facing value in French. Keep team names unchanged. Use French football wording such as prono, score exact, nul, victoire, forme récente."
    : "Write every user-facing value in English. Keep team names unchanged.";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are Oddzz AI, a friendly World Cup prediction assistant for entertainment only.",
            "Use ONLY the match and stats JSON provided by the user. Do not invent team history, host status, recent form, injuries, rankings, or previous results.",
            "World Cup fixtures are neutral-tournament fixtures unless the stats explicitly say otherwise. The JSON fields home and away are fixture labels only; never infer home advantage, home-team win, or home crowd advantage from them.",
            "You may mention tournament_context when present: USA, Canada and Mexico get a small host/travel context edge, and North/South American teams may get a smaller regional travel/context edge. Describe this as regional context, never as home advantage unless the team is actually a host playing in its host country.",
            "The stats JSON contains oddzz_scorecard. Treat this scorecard as the primary recommendation produced by Oddzz's deterministic engine. Explain it clearly; do not override its suggested_pick unless the provided raw datasets strongly contradict it.",
            "The stats JSON also contains scouting_insights. Use scouting_insights as the main source for user-facing bullets: last 3 results, goals scored, goals conceded, adjusted points per match, average opponent strength, and injury watch.",
            "When writing form bullets, use scouting_insights.form_comparison.home.source_label and scouting_insights.form_comparison.away.source_label. If a team source is host_recent_all_competitions or recent_form, do not describe that data as World Cup qualifiers.",
            "The angles array should be concrete and numerical where possible. Prefer bullets like 'Portugal last 3 qualifiers: W-W-D, 7 scored, 2 conceded, avg opponent strength 71.3' over generic statements like 'Portugal is stronger'.",
            "When injuries are available, mention key absences by player/team/reason. If injury data is unavailable, say 'No fixture injury list available yet' only if useful; do not overstate it.",
            "Consider the available datasets in this order: market_odds, provider_prediction, world_cup_qualifiers, recent_form, head_to_head, team_statistics, standings, injuries, then match context.",
            "World Cup qualifier history is an important national-team signal. Oddzz adjusts this signal by confederation strength, so continents are not treated as perfectly equal.",
            "For 2026 host teams without qualifiers, Oddzz may provide host_recent_all_competitions from their latest 10 completed matches including friendlies. Treat it as useful but weaker than true qualifier data.",
            "If market_odds exists, treat bookmaker odds as a useful market signal, not certainty. Use it especially to break ties when football stats are limited.",
            "When provider_prediction and live statistics are missing or limited, use baseline_strength_prior as a heuristic fallback so stronger teams are not treated as automatic 1-1 draws.",
            "If the strength gap is 6+ points, avoid defaulting to a draw unless other provided data clearly supports it.",
            "If API-Football's provider_prediction exists, treat it as one useful signal, not as guaranteed truth.",
            "Use precise wording about data availability: if qualifier or recent-form matches are present, do not call all data sparse. Instead say market odds, provider predictions, live stats, injuries, or World Cup 2026 team statistics are missing if those specific datasets are absent.",
            "The suggested_pick must be an exact scoreline in the format 'Team A 1-1 Team B', not just a winner.",
            "Prefer oddzz_scorecard.suggested_pick for suggested_pick. Bonus recommendation should normally follow oddzz_scorecard.bonus_recommended.",
            "Also recommend whether OddzzAI should use one of its two x5 bonuses. It can only use bonuses on group-stage matches, and only when confidence is high enough to justify the risk.",
            "Keep the answer concise and useful for a prediction game.",
            languageInstruction,
            "Return strict JSON with keys: headline, summary, angles, suggested_pick, bonus_recommendation, confidence, disclaimer. bonus_recommendation must be an object with boolean use_bonus and string reason.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({ instructions: { language, no_invented_facts: true, exact_score_required: true }, match: { home: match.home_team, away: match.away_team, stage: match.stage, kickoff_at: match.kickoff_at }, stats }),
        },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string; type?: string } } | null;
    const code = body?.error?.code || body?.error?.type || "provider_error";
    const message = code === "insufficient_quota"
      ? "Oddzz AI is temporarily unavailable because the OpenAI account has no remaining quota. Please check billing or credits."
      : "Oddzz AI is temporarily unavailable. Please try again later.";
    throw new AiProviderError(message, response.status === 429 ? 503 : response.status);
  }
  const payload = await response.json() as any;
  return coerceInsight(JSON.parse(payload.choices?.[0]?.message?.content ?? "{}"), match, scorecard);
}

export async function fixtureAiInsight(request: Request, env: Env, matchId: string) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);
  const match = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<MatchRow>();
  if (!match) return badRequest("Match not found.", 404);
  const language = new URL(request.url).searchParams.get("lang") === "fr" ? "fr" : "en";

  const result = await cachedOrGenerateInsight(env, match, language);
  return result instanceof Response ? result : json(result);
}

async function latestCachedInsight(env: Env, matchId: string, language: InsightLanguage, kickoffAt: string) {
  return env.DB.prepare(`
    SELECT insight_json, updated_at, stats_json FROM ai_fixture_insights
    WHERE match_id = ?
      AND json_extract(stats_json, '$.prompt_version') = ?
      AND json_extract(stats_json, '$.language') = ?
      AND created_at <= ?
    ORDER BY updated_at DESC LIMIT 1
  `).bind(matchId, INSIGHT_PROMPT_VERSION, language, kickoffAt).first<{ insight_json: string; updated_at: string; stats_json: string }>();
}

async function cachedOrGenerateInsightFromStats(env: Env, match: MatchRow, language: InsightLanguage, stats: Awaited<ReturnType<typeof buildStatsSnapshot>>) {
  const statsJson = JSON.stringify({ prompt_version: INSIGHT_PROMPT_VERSION, language, stats });
  const statsHash = await sha256(statsJson);
  const cached = await env.DB.prepare(`
    SELECT insight_json, updated_at FROM ai_fixture_insights
    WHERE match_id = ? AND stats_hash = ?
    ORDER BY updated_at DESC LIMIT 1
  `).bind(match.id, statsHash).first<{ insight_json: string; updated_at: string }>();

  if (cached) {
    return { insight: JSON.parse(cached.insight_json), cached: true, updated_at: cached.updated_at, stats_source: stats.source };
  }

  let insight: InsightPayload;
  try {
    insight = await generateInsight(env, match, stats, language);
  } catch (error) {
    if (error instanceof AiProviderError) return badRequest(error.message, error.status);
    throw error;
  }
  const now = nowIso();
  await env.DB.prepare(`
    INSERT INTO ai_fixture_insights (id, match_id, stats_hash, stats_json, insight_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), match.id, statsHash, statsJson, JSON.stringify(insight), now, now).run();

  return { insight, cached: false, updated_at: now, stats_source: stats.source };
}

async function cachedOrGenerateInsight(env: Env, match: MatchRow, language: InsightLanguage) {
  const cached = await latestCachedInsight(env, match.id, language, match.kickoff_at);
  if (cached) {
    const parsedStats = JSON.parse(cached.stats_json) as { stats?: { source?: string } };
    return { insight: JSON.parse(cached.insight_json), cached: true, updated_at: cached.updated_at, stats_source: parsedStats.stats?.source ?? "cached" };
  }
  if (new Date(match.kickoff_at).getTime() <= Date.now()) {
    return badRequest("OddzzAI predictions are only generated before kickoff.", 409);
  }
  return cachedOrGenerateInsightFromStats(env, match, language, await buildStatsSnapshot(env, match));
}

export async function scheduledAiInsightRefresh(env: Env) {
  const now = new Date();
  const oddsWindowEnd = new Date(now);
  oddsWindowEnd.setDate(oddsWindowEnd.getDate() + 7);
  const rows = await env.DB.prepare(`
    SELECT * FROM matches
    WHERE kickoff_at >= ? AND kickoff_at <= ?
      AND LOWER(status) NOT IN ('finished', 'cancelled', 'postponed')
    ORDER BY kickoff_at ASC
    LIMIT 80
  `).bind(now.toISOString(), oddsWindowEnd.toISOString()).all<MatchRow>();

  for (const match of rows.results ?? []) {
    const stats = await buildStatsSnapshot(env, match).catch(() => null);
    if (!stats) continue;
    await cachedOrGenerateInsightFromStats(env, match, "en", stats).catch(() => null);
    await cachedOrGenerateInsightFromStats(env, match, "fr", stats).catch(() => null);
  }
}
