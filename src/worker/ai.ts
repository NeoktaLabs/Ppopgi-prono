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
  form_table?: InsightFormRow[];
  odds_summary?: OddsSummary;
};

type OddsSummary = {
  bookmakers_count: number;
  result: {
    home_probability: number | null;
    draw_probability: number | null;
    away_probability: number | null;
    favorite: "home" | "draw" | "away" | null;
  };
  goals: {
    over_2_5_probability: number | null;
    under_2_5_probability: number | null;
    both_teams_score_yes_probability: number | null;
    expected_range: string | null;
  };
  likely_scores: Array<{ score: string; average_odd: number; bookmakers: number }>;
};

type InsightFormRow = {
  team: string;
  source: string;
  form: string;
  last_5: string[];
  goals_for: number;
  goals_against: number;
  opponent_strength: number | null;
  adjusted_points_per_match: number | null;
  oddzz_baseline: number;
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
  debug?: {
    raw_count: number;
    completed_count: number;
    before_match_count: number;
    side_matched_count: number;
  };
};

const INSIGHT_PROMPT_VERSION = "2026-06-04-scorecard-v33-market-consensus";
const AI_DATASET_CACHE_TTL_SECONDS = 6 * 60 * 60;
const AI_PAST_DATA_CACHE_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;
type InsightLanguage = "en" | "fr";
type StatsSnapshotOptions = {
  allowProviderFetch: boolean;
  bypassCache?: boolean;
};
type HydrateBatchOptions = {
  teamOffset: number;
  teamLimit: number;
  fixtureOffset: number;
  fixtureLimit: number;
  historicalDetailLimit: number;
};

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

function normalizedParams(params: Record<string, string | number | null | undefined>) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value != null && value !== "")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, String(value)]),
  );
}

function addParams(url: URL, params: Record<string, string | number | null | undefined>) {
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
}

function hasApiFootballErrors(payload: any) {
  if (!payload?.errors) return false;
  if (Array.isArray(payload.errors)) return payload.errors.length > 0;
  if (typeof payload.errors === "object") return Object.keys(payload.errors).length > 0;
  return Boolean(payload.errors);
}

async function fetchApiFootballFromProvider<T = any>(env: Env, path: string, params: Record<string, string | number | null | undefined>) {
  if (!env.FOOTBALL_API_KEY) return null;
  const url = new URL(`${apiFootballBaseUrl(env)}${path}`);
  addParams(url, params);
  const response = await fetch(url.toString(), {
    headers: { "x-apisports-key": env.FOOTBALL_API_KEY },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  if (!payload || hasApiFootballErrors(payload)) return null;
  return payload as T;
}

async function readCachedApiFootball<T = any>(env: Env, cacheKey: string) {
  try {
    const cached = await env.DB.prepare(`
      SELECT payload_json FROM ai_football_dataset_cache
      WHERE cache_key = ? AND expires_at > ?
      LIMIT 1
    `).bind(cacheKey, nowIso()).first<{ payload_json: string }>();
    if (!cached) return null;
    const payload = JSON.parse(cached.payload_json);
    return hasApiFootballErrors(payload) ? null : payload as T;
  } catch {
    return null;
  }
}

function extractCacheDimensions(path: string, params: Record<string, string | number | null | undefined>) {
  const team = safeNumber(params.team);
  const fixture = safeNumber(params.fixture ?? params.id);
  const league = safeNumber(params.league);
  const season = safeNumber(params.season);
  return { team, fixture, league, season };
}

async function persistApiFootballDataset(env: Env, cacheKey: string, path: string, params: Record<string, string | number | null | undefined>, payload: any, ttlSeconds: number) {
  const now = nowIso();
  const expires = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const cleanParams = normalizedParams(params);
  const dimensions = extractCacheDimensions(path, params);
  const payloadJson = JSON.stringify(payload);
  try {
    await env.DB.prepare(`
      INSERT INTO ai_football_dataset_cache (cache_key, endpoint, params_json, team_api_id, fixture_api_id, league_id, season, payload_json, fetched_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        payload_json = excluded.payload_json,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at,
        team_api_id = excluded.team_api_id,
        fixture_api_id = excluded.fixture_api_id,
        league_id = excluded.league_id,
        season = excluded.season
    `).bind(cacheKey, path, JSON.stringify(cleanParams), dimensions.team, dimensions.fixture, dimensions.league, dimensions.season, payloadJson, now, expires).run();

    if (path === "/fixtures" && Array.isArray(payload?.response)) {
      for (const item of payload.response) {
        const fixtureId = safeNumber(item?.fixture?.id);
        if (!fixtureId) continue;
        const homeId = safeNumber(item?.teams?.home?.id);
        const awayId = safeNumber(item?.teams?.away?.id);
        if (homeId) {
          await env.DB.prepare(`
            INSERT INTO ai_football_teams (api_team_id, name, logo, country, last_seen_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(api_team_id) DO UPDATE SET name = excluded.name, logo = excluded.logo, country = excluded.country, last_seen_at = excluded.last_seen_at
          `).bind(homeId, item?.teams?.home?.name ?? `Team ${homeId}`, item?.teams?.home?.logo ?? null, item?.league?.country ?? null, now).run();
        }
        if (awayId) {
          await env.DB.prepare(`
            INSERT INTO ai_football_teams (api_team_id, name, logo, country, last_seen_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(api_team_id) DO UPDATE SET name = excluded.name, logo = excluded.logo, country = excluded.country, last_seen_at = excluded.last_seen_at
          `).bind(awayId, item?.teams?.away?.name ?? `Team ${awayId}`, item?.teams?.away?.logo ?? null, item?.league?.country ?? null, now).run();
        }
        await env.DB.prepare(`
          INSERT INTO ai_football_fixtures (
            api_fixture_id, league_id, league_name, league_season, league_round, kickoff_at, status_short, status_long,
            home_team_api_id, away_team_api_id, home_goals, away_goals, payload_json, source_endpoint, source_params_json, last_seen_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(api_fixture_id) DO UPDATE SET
            league_id = excluded.league_id,
            league_name = excluded.league_name,
            league_season = excluded.league_season,
            league_round = excluded.league_round,
            kickoff_at = excluded.kickoff_at,
            status_short = excluded.status_short,
            status_long = excluded.status_long,
            home_team_api_id = excluded.home_team_api_id,
            away_team_api_id = excluded.away_team_api_id,
            home_goals = excluded.home_goals,
            away_goals = excluded.away_goals,
            payload_json = excluded.payload_json,
            source_endpoint = excluded.source_endpoint,
            source_params_json = excluded.source_params_json,
            last_seen_at = excluded.last_seen_at
        `).bind(
          fixtureId,
          safeNumber(item?.league?.id),
          item?.league?.name ?? null,
          safeNumber(item?.league?.season),
          item?.league?.round ?? null,
          item?.fixture?.date ?? null,
          item?.fixture?.status?.short ?? null,
          item?.fixture?.status?.long ?? null,
          homeId,
          awayId,
          safeNumber(item?.goals?.home ?? item?.score?.fulltime?.home),
          safeNumber(item?.goals?.away ?? item?.score?.fulltime?.away),
          JSON.stringify(item),
          path,
          JSON.stringify(cleanParams),
          now,
        ).run();
      }
    }
  } catch {
    // The AI should keep working before the cache migration is applied.
  }
}

async function fetchApiFootball<T = any>(
  env: Env,
  path: string,
  params: Record<string, string | number | null | undefined>,
  options: { ttlSeconds?: number; bypassCache?: boolean } = {},
) {
  if (!env.FOOTBALL_API_KEY) return null;
  const ttlSeconds = options.ttlSeconds ?? AI_DATASET_CACHE_TTL_SECONDS;
  const cleanParams = normalizedParams(params);
  const cacheKey = await sha256(JSON.stringify({ provider: "api-football", path, params: cleanParams }));
  if (!options.bypassCache) {
    const cached = await readCachedApiFootball<T>(env, cacheKey);
    if (cached) return cached;
  }
  const payload = await fetchApiFootballFromProvider<T>(env, path, cleanParams);
  if (payload) await persistApiFootballDataset(env, cacheKey, path, cleanParams, payload, ttlSeconds);
  return payload;
}

async function getApiFootball<T = any>(
  env: Env,
  path: string,
  params: Record<string, string | number | null | undefined>,
  options: StatsSnapshotOptions & { ttlSeconds?: number; bypassCache?: boolean },
) {
  if (options.allowProviderFetch) return fetchApiFootball<T>(env, path, params, options);
  return readApiFootballDataset<T>(env, path, params);
}

async function readApiFootballDataset<T = any>(env: Env, path: string, params: Record<string, string | number | null | undefined>) {
  const cleanParams = normalizedParams(params);
  const cacheKey = await sha256(JSON.stringify({ provider: "api-football", path, params: cleanParams }));
  try {
    const cached = await env.DB.prepare(`
      SELECT payload_json FROM ai_football_dataset_cache
      WHERE cache_key = ?
      LIMIT 1
    `).bind(cacheKey).first<{ payload_json: string }>();
    if (!cached) return null;
    const payload = JSON.parse(cached.payload_json);
    return hasApiFootballErrors(payload) ? null : payload as T;
  } catch {
    return null;
  }
}

async function debugFetchApiFootball(env: Env, path: string, params: Record<string, string | number | null | undefined>) {
  if (!env.FOOTBALL_API_KEY) return { ok: false, status: null, response_count: 0, error: "FOOTBALL_API_KEY is not configured." };
  const url = new URL(`${apiFootballBaseUrl(env)}${path}`);
  addParams(url, params);
  const response = await fetch(url.toString(), {
    headers: { "x-apisports-key": env.FOOTBALL_API_KEY },
  });
  const payload = await response.json().catch(() => null) as any;
  const rows = Array.isArray(payload?.response) ? payload.response : [];
  return {
    ok: response.ok,
    status: response.status,
    endpoint: `${path}?${url.searchParams.toString()}`,
    response_count: rows.length,
    errors: payload?.errors ?? null,
    sample: rows.slice(0, 5).map((fixture: any) => ({
      fixture_id: fixture?.fixture?.id ?? null,
      date: fixture?.fixture?.date ?? null,
      status: fixture?.fixture?.status?.short ?? fixture?.fixture?.status?.long ?? null,
      league: fixture?.league ? { id: fixture.league.id ?? null, season: fixture.league.season ?? null, round: fixture.league.round ?? null } : null,
      teams: fixture?.teams ? {
        home: { id: fixture.teams.home?.id ?? null, name: fixture.teams.home?.name ?? null },
        away: { id: fixture.teams.away?.id ?? null, name: fixture.teams.away?.name ?? null },
      } : null,
      goals: fixture?.goals ?? null,
    })),
  };
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
    fixture_id: fixture.fixture?.id ?? null,
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

function scoreFromCompactMatch(match: any) {
  const home = match?.team_side === "home";
  const away = match?.team_side === "away";
  const homeGoals = safeNumber(match?.score?.home);
  const awayGoals = safeNumber(match?.score?.away);
  if ((!home && !away) || homeGoals === null || awayGoals === null) return null;
  return {
    for: home ? homeGoals : awayGoals,
    against: home ? awayGoals : homeGoals,
  };
}

function insightSourceLabel(source: string | null | undefined) {
  if (source === "world_cup_qualifiers") return "World Cup qualifiers";
  if (source === "host_recent_all_competitions") return "Recent official/friendly games";
  if (source === "recent_form") return "Recent games";
  return "No form data";
}

function buildInsightFormRow(teamName: string, history: TeamFormHistory | null, fallbackForm: any[]): InsightFormRow {
  const matches = (history?.matches?.length ? history.matches : fallbackForm).slice(0, 5);
  const totals = matches.reduce((acc, match: any) => {
    const score = scoreFromCompactMatch(match);
    if (score) {
      acc.goals_for += score.for;
      acc.goals_against += score.against;
    }
    return acc;
  }, { goals_for: 0, goals_against: 0 });
  const last5 = matches.map((match: any) => {
    const score = scoreFromCompactMatch(match);
    const result = match?.result ?? "?";
    const opponent = match?.opponent ?? "opponent";
    return score ? `${result} ${score.for}-${score.against} vs ${opponent}` : `${result} vs ${opponent}`;
  });
  return {
    team: teamName,
    source: insightSourceLabel(history?.source ?? (fallbackForm.length ? "recent_form" : "unavailable")),
    form: matches.length ? matches.map((match: any) => match?.result ?? "?").join("-") : "N/A",
    last_5: last5,
    goals_for: totals.goals_for,
    goals_against: totals.goals_against,
    opponent_strength: history?.average_opponent_strength ?? null,
    adjusted_points_per_match: history?.adjusted_points_per_match ?? null,
    oddzz_baseline: teamStrength(teamName),
  };
}

function buildInsightFormTable(match: MatchRow, scouting: any, homeHistory: TeamFormHistory | null, awayHistory: TeamFormHistory | null): InsightFormRow[] {
  return [
    buildInsightFormRow(match.home_team, homeHistory, scouting.teams?.home?.recent_form ?? []),
    buildInsightFormRow(match.away_team, awayHistory, scouting.teams?.away?.recent_form ?? []),
  ];
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
  const completedFixtures = fixtures.filter((fixture: any) => isCompletedFixture(fixture));
  const beforeMatchFixtures = completedFixtures.filter((fixture: any) => new Date(fixture?.fixture?.date ?? 0).getTime() < beforeTime);
  const sideMatchedFixtures = beforeMatchFixtures.filter((fixture: any) => sideForTeam(fixture, teamId) !== null);
  const matches = sideMatchedFixtures
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
    debug: {
      raw_count: fixtures.length,
      completed_count: completedFixtures.length,
      before_match_count: beforeMatchFixtures.length,
      side_matched_count: sideMatchedFixtures.length,
    },
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

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function roundedProbability(value: number | null) {
  return value === null ? null : Number((value * 100).toFixed(1));
}

function normalizedProbabilities(values: Array<{ key: string; odd: number }>) {
  const implied = values.map((value) => ({ key: value.key, probability: 1 / value.odd }));
  const total = implied.reduce((sum, value) => sum + value.probability, 0);
  return total > 0 ? implied.map((value) => ({ ...value, probability: value.probability / total })) : [];
}

function compactOdds(payload: any) {
  const rows = Array.isArray(payload?.response) ? payload.response : [];
  const bookmakers = rows.flatMap((row: any) => Array.isArray(row?.bookmakers) ? row.bookmakers : []);
  if (!bookmakers.length) return null;
  const resultProbabilities = { home: [] as number[], draw: [] as number[], away: [] as number[] };
  const over25: number[] = [];
  const under25: number[] = [];
  const bttsYes: number[] = [];
  const exactScores = new Map<string, number[]>();

  for (const bookmaker of bookmakers) {
    const bets = Array.isArray(bookmaker?.bets) ? bookmaker.bets : [];
    const winner = bets.find((bet: any) => bet?.name === "Match Winner");
    const winnerValues = Array.isArray(winner?.values) ? winner.values : [];
    const winnerOdds = winnerValues.map((value: any) => ({
      key: String(value?.value ?? "").toLowerCase(),
      odd: safeNumber(value?.odd),
    })).filter((value: any): value is { key: string; odd: number } => ["home", "draw", "away"].includes(value.key) && value.odd !== null && value.odd > 1);
    if (winnerOdds.length === 3) {
      for (const value of normalizedProbabilities(winnerOdds)) {
        resultProbabilities[value.key as "home" | "draw" | "away"].push(value.probability);
      }
    }

    const goals = bets.find((bet: any) => bet?.name === "Goals Over/Under");
    const goalValues = Array.isArray(goals?.values) ? goals.values : [];
    const goal25 = goalValues.map((value: any) => ({
      key: String(value?.value ?? "").toLowerCase(),
      odd: safeNumber(value?.odd),
    })).filter((value: any): value is { key: string; odd: number } => ["over 2.5", "under 2.5"].includes(value.key) && value.odd !== null && value.odd > 1);
    if (goal25.length === 2) {
      for (const value of normalizedProbabilities(goal25)) {
        (value.key === "over 2.5" ? over25 : under25).push(value.probability);
      }
    }

    const bothTeams = bets.find((bet: any) => bet?.name === "Both Teams Score");
    const bothTeamsValues = Array.isArray(bothTeams?.values) ? bothTeams.values : [];
    const btts = bothTeamsValues.map((value: any) => ({
      key: String(value?.value ?? "").toLowerCase(),
      odd: safeNumber(value?.odd),
    })).filter((value: any): value is { key: string; odd: number } => ["yes", "no"].includes(value.key) && value.odd !== null && value.odd > 1);
    if (btts.length === 2) {
      const yes = normalizedProbabilities(btts).find((value) => value.key === "yes");
      if (yes) bttsYes.push(yes.probability);
    }

    const exact = bets.find((bet: any) => bet?.name === "Exact Score");
    for (const value of Array.isArray(exact?.values) ? exact.values : []) {
      const score = String(value?.value ?? "").trim();
      const odd = safeNumber(value?.odd);
      if (!/^\d+:\d+$/.test(score) || odd === null || odd <= 1) continue;
      exactScores.set(score, [...(exactScores.get(score) ?? []), odd]);
    }
  }

  const home = average(resultProbabilities.home);
  const draw = average(resultProbabilities.draw);
  const away = average(resultProbabilities.away);
  const resultRanking = ([
    ["home", home ?? -1],
    ["draw", draw ?? -1],
    ["away", away ?? -1],
  ] as Array<["home" | "draw" | "away", number]>).filter((item) => item[1] >= 0);
  resultRanking.sort((a, b) => b[1] - a[1]);
  const over = average(over25);
  const under = average(under25);
  const summary: OddsSummary = {
    bookmakers_count: bookmakers.length,
    result: {
      home_probability: roundedProbability(home),
      draw_probability: roundedProbability(draw),
      away_probability: roundedProbability(away),
      favorite: resultRanking[0]?.[0] ?? null,
    },
    goals: {
      over_2_5_probability: roundedProbability(over),
      under_2_5_probability: roundedProbability(under),
      both_teams_score_yes_probability: roundedProbability(average(bttsYes)),
      expected_range: under !== null && under >= 0.6 ? "0-2 goals" : over !== null && over >= 0.6 ? "3+ goals" : over !== null ? "2-3 goals" : null,
    },
    likely_scores: [...exactScores.entries()]
      .map(([score, odds]) => ({ score: score.replace(":", "-"), average_odd: Number((average(odds) ?? 0).toFixed(2)), bookmakers: odds.length }))
      .sort((a, b) => a.average_odd - b.average_odd)
      .slice(0, 3),
  };
  return {
    bookmakers_count: bookmakers.length,
    summary,
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
  const result = odds?.summary?.result;
  const ranked = ([
    ["home", safeNumber(result?.home_probability) ?? -1],
    ["draw", safeNumber(result?.draw_probability) ?? -1],
    ["away", safeNumber(result?.away_probability) ?? -1],
  ] as Array<["home" | "draw" | "away", number]>).filter((item) => item[1] >= 0);
  ranked.sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || !second) return { signal: "unavailable" as ScoreSignal, reason: "No usable match-winner odds yet." };
  const edge = best[1] - second[1];
  const label = best[0] === "home" ? homeTeam : best[0] === "away" ? awayTeam : "draw";
  return {
    signal: edge < 6 ? "balanced" as ScoreSignal : best[0],
    reason: `Consensus across ${odds?.summary?.bookmakers_count ?? odds?.bookmakers_count ?? "available"} bookmaker(s) leans ${label} at ${best[1].toFixed(1)}%.`,
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

function suggestedScoreFromEdge(homeTeam: string, awayTeam: string, edge: number, strengthGap: number, odds: any) {
  const over25 = safeNumber(odds?.summary?.goals?.over_2_5_probability);
  const under25 = safeNumber(odds?.summary?.goals?.under_2_5_probability);
  const btts = safeNumber(odds?.summary?.goals?.both_teams_score_yes_probability);
  const lowScoring = under25 !== null && under25 >= 60;
  const highScoring = over25 !== null && over25 >= 60;
  const bothScore = btts !== null && btts >= 55;
  if (edge >= 0.45 && strengthGap >= 16) return `${homeTeam} ${lowScoring ? "2-0" : bothScore ? "3-1" : "3-0"} ${awayTeam}`;
  if (edge <= -0.45 && strengthGap <= -16) return `${homeTeam} ${lowScoring ? "0-2" : bothScore ? "1-3" : "0-3"} ${awayTeam}`;
  if (edge >= 0.55) return `${homeTeam} ${bothScore ? "2-1" : "2-0"} ${awayTeam}`;
  if (edge >= 0.2) return `${homeTeam} ${lowScoring ? "1-0" : "2-1"} ${awayTeam}`;
  if (edge <= -0.55) return `${homeTeam} ${bothScore ? "1-2" : "0-2"} ${awayTeam}`;
  if (edge <= -0.2) return `${homeTeam} ${lowScoring ? "0-1" : "1-2"} ${awayTeam}`;
  if (highScoring) return `${homeTeam} 2-2 ${awayTeam}`;
  if (lowScoring) return `${homeTeam} 0-0 ${awayTeam}`;
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
    { ...market, weight: 0.22 },
    { ...api, weight: 0.18 },
    { ...qualifiers, weight: 0.25 },
    { ...strength, weight: 0.2 },
    { ...recent, weight: 0.12 },
    { ...regional, weight: 0.03 },
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
    suggested_pick: suggestedScoreFromEdge(match.home_team, match.away_team, edge, strengthGap, scouting.market_odds),
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
    instruction: "Prioritize concrete football numbers and context. Bookmaker consensus is one useful signal, never the sole basis for the pick.",
    bookmaker_consensus: scouting.market_odds?.summary ?? null,
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
    historical_match_details: scouting.historical_match_details ?? {
      note: "No cached historical fixture statistics, events, or lineups are available yet.",
      home: [],
      away: [],
    },
  };
}

function compactFixtureStatistics(payload: any) {
  const rows = Array.isArray(payload?.response) ? payload.response : [];
  return rows.map((team: any) => ({
    team: team?.team?.name ?? null,
    team_id: team?.team?.id ?? null,
    statistics: Array.isArray(team?.statistics)
      ? team.statistics
        .filter((stat: any) => stat?.type && stat?.value != null)
        .map((stat: any) => ({ type: stat.type, value: stat.value }))
      : [],
  })).filter((team: any) => team.team || team.team_id || team.statistics.length);
}

function compactFixtureEvents(payload: any) {
  const rows = Array.isArray(payload?.response) ? payload.response : [];
  return rows.slice(0, 18).map((event: any) => ({
    minute: event?.time?.elapsed ?? null,
    extra: event?.time?.extra ?? null,
    team: event?.team?.name ?? null,
    team_id: event?.team?.id ?? null,
    player: event?.player?.name ?? null,
    assist: event?.assist?.name ?? null,
    type: event?.type ?? null,
    detail: event?.detail ?? null,
  })).filter((event: any) => event.type || event.player || event.team);
}

function compactFixtureLineups(payload: any) {
  const rows = Array.isArray(payload?.response) ? payload.response : [];
  return rows.map((lineup: any) => ({
    team: lineup?.team?.name ?? null,
    team_id: lineup?.team?.id ?? null,
    formation: lineup?.formation ?? null,
    coach: lineup?.coach?.name ?? null,
    start_xi: Array.isArray(lineup?.startXI)
      ? lineup.startXI.slice(0, 11).map((item: any) => ({
        name: item?.player?.name ?? null,
        number: item?.player?.number ?? null,
        pos: item?.player?.pos ?? null,
      }))
      : [],
  })).filter((lineup: any) => lineup.team || lineup.team_id);
}

async function cachedPastFixtureDetail(env: Env, fixtureId: number) {
  const [statistics, events, lineups] = await Promise.all([
    readApiFootballDataset(env, "/fixtures/statistics", { fixture: fixtureId }).then(compactFixtureStatistics).catch(() => []),
    readApiFootballDataset(env, "/fixtures/events", { fixture: fixtureId }).then(compactFixtureEvents).catch(() => []),
    readApiFootballDataset(env, "/fixtures/lineups", { fixture: fixtureId }).then(compactFixtureLineups).catch(() => []),
  ]);
  return {
    fixture_id: fixtureId,
    statistics,
    events,
    lineups,
    datasets: {
      statistics: statistics.length > 0,
      events: events.length > 0,
      lineups: lineups.length > 0,
    },
  };
}

async function cachedHistoricalDetailsForHistory(env: Env, history: TeamFormHistory | null) {
  const fixtureIds = uniqueNumbers((history?.matches ?? []).slice(0, 3).map((fixture: any) => safeNumber(fixture.fixture_id)));
  const details = await Promise.all(fixtureIds.map((fixtureId) => cachedPastFixtureDetail(env, fixtureId)));
  return details.filter((detail) => detail.datasets.statistics || detail.datasets.events || detail.datasets.lineups);
}

async function fetchFixtureTeams(env: Env, externalId: string, options: StatsSnapshotOptions) {
  const cachedFixture = await env.DB.prepare(`
    SELECT home_team_api_id, away_team_api_id
    FROM ai_football_fixtures
    WHERE api_fixture_id = ?
    LIMIT 1
  `).bind(safeNumber(externalId)).first<{ home_team_api_id: number | null; away_team_api_id: number | null }>().catch(() => null);
  if (cachedFixture?.home_team_api_id && cachedFixture?.away_team_api_id) {
    return {
      home: safeNumber(cachedFixture.home_team_api_id),
      away: safeNumber(cachedFixture.away_team_api_id),
    };
  }
  const payload = await getApiFootball<{ response?: any[] }>(env, "/fixtures", { id: externalId }, options);
  const fixture = payload?.response?.[0];
  return fixture?.teams ? {
    home: safeNumber(fixture.teams.home?.id),
    away: safeNumber(fixture.teams.away?.id),
  } : null;
}

async function fetchTeamStats(env: Env, teamId: number | null, options: StatsSnapshotOptions) {
  if (!teamId) return null;
  const league = env.FOOTBALL_API_LEAGUE_ID || "1";
  const season = env.FOOTBALL_API_SEASON || "2026";
  return compactTeamStats(await getApiFootball(env, "/teams/statistics", { league, season, team: teamId }, options));
}

async function fetchTeamWorldCupQualifierPayloads(env: Env, teamId: number | null, options: StatsSnapshotOptions) {
  if (!teamId) return [];
  const payloads = [];
  for (const competition of WORLD_CUP_2026_QUALIFIER_COMPETITIONS) {
    const payload = options.allowProviderFetch
      ? await getApiFootball(env, "/fixtures", {
        league: competition.league,
        season: competition.season,
        team: teamId,
      }, options)
        .then((payload) => payload ?? readStoredTeamQualifierPayload(env, teamId, competition.league, competition.season))
        .catch(() => readStoredTeamQualifierPayload(env, teamId, competition.league, competition.season))
      : await readStoredTeamQualifierPayload(env, teamId, competition.league, competition.season);
    payloads.push(payload);
  }
  return payloads;
}

async function readStoredTeamQualifierPayload(env: Env, teamId: number, league: number, season: number) {
  try {
    const rows = await env.DB.prepare(`
      SELECT payload_json FROM ai_football_fixtures
      WHERE league_id = ?
        AND league_season = ?
        AND (home_team_api_id = ? OR away_team_api_id = ?)
      ORDER BY kickoff_at DESC
      LIMIT 40
    `).bind(league, season, teamId, teamId).all<{ payload_json: string }>();
    return { response: (rows.results ?? []).map((row) => JSON.parse(row.payload_json)) };
  } catch {
    return null;
  }
}

function qualifierEndpointSummary(payloads: any[]) {
  return WORLD_CUP_2026_QUALIFIER_COMPETITIONS.map((competition, index) => {
    const rows = Array.isArray(payloads[index]?.response) ? payloads[index].response : [];
    return {
      league: competition.league,
      season: competition.season,
      confederation: competition.confederation,
      response_count: rows.length,
      completed_count: rows.filter((fixture: any) => isCompletedFixture(fixture)).length,
    };
  });
}

async function fetchHostRecentHistory(env: Env, teamId: number | null, teamName: string, beforeIso: string, options: StatsSnapshotOptions) {
  if (!teamId || !HOST_RECENT_FORM_TEAMS.has(teamName)) return null;
  const hostPayload = await getApiFootball(env, "/fixtures", { team: teamId, last: 10 }, options).catch(() => null);
  return compactHostRecentHistory(hostPayload, teamId, teamName, beforeIso);
}

async function buildStatsSnapshot(env: Env, match: MatchRow, options: StatsSnapshotOptions = { allowProviderFetch: false }) {
  const storedTeams = {
    home: safeNumber(match.home_team_api_id),
    away: safeNumber(match.away_team_api_id),
  };
  const fetchedTeams = storedTeams.home && storedTeams.away ? null : await fetchFixtureTeams(env, match.external_id, options).catch(() => null);
  const teams = {
    home: storedTeams.home ?? fetchedTeams?.home ?? null,
    away: storedTeams.away ?? fetchedTeams?.away ?? null,
  };
  const league = env.FOOTBALL_API_LEAGUE_ID || "1";
  const season = env.FOOTBALL_API_SEASON || "2026";
  const [homeStats, awayStats, homeForm, awayForm, homeQualifierPayloads, awayQualifierPayloads, homeStanding, awayStanding, h2h, providerPrediction, injuries, odds] = await Promise.all([
    fetchTeamStats(env, teams?.home ?? null, options).catch(() => null),
    fetchTeamStats(env, teams?.away ?? null, options).catch(() => null),
    teams?.home ? getApiFootball(env, "/fixtures", { team: teams.home, last: 5 }, options).then((payload: any) => payload?.response?.slice(0, 5).map((fixture: any) => compactFixtureForTeam(fixture, teams.home!)) ?? null).catch(() => null) : null,
    teams?.away ? getApiFootball(env, "/fixtures", { team: teams.away, last: 5 }, options).then((payload: any) => payload?.response?.slice(0, 5).map((fixture: any) => compactFixtureForTeam(fixture, teams.away!)) ?? null).catch(() => null) : null,
    fetchTeamWorldCupQualifierPayloads(env, teams?.home ?? null, options).catch(() => []),
    fetchTeamWorldCupQualifierPayloads(env, teams?.away ?? null, options).catch(() => []),
    teams?.home ? getApiFootball(env, "/standings", { league, season, team: teams.home }, options).then(compactStanding).catch(() => null) : null,
    teams?.away ? getApiFootball(env, "/standings", { league, season, team: teams.away }, options).then(compactStanding).catch(() => null) : null,
    teams?.home && teams?.away ? getApiFootball(env, "/fixtures/headtohead", { h2h: `${teams.home}-${teams.away}`, last: 10 }, options).then((payload: any) => payload?.response?.slice(0, 10).map(compactFixture) ?? null).catch(() => null) : null,
    getApiFootball(env, "/predictions", { fixture: match.external_id }, options).then(compactPrediction).catch(() => null),
    getApiFootball(env, "/injuries", { fixture: match.external_id }, options).then(compactInjuries).catch(() => null),
    getApiFootball(env, "/odds", { fixture: match.external_id }, options).then(compactOdds).catch(() => null),
  ]);
  let homeQualifierHistory = teams?.home ? compactQualifierHistory(homeQualifierPayloads, teams.home, match.home_team, match.kickoff_at) : null;
  let awayQualifierHistory = teams?.away ? compactQualifierHistory(awayQualifierPayloads, teams.away, match.away_team, match.kickoff_at) : null;
  if (homeQualifierHistory && homeQualifierHistory.matches.length === 0 && HOST_RECENT_FORM_TEAMS.has(match.home_team)) {
    homeQualifierHistory = await fetchHostRecentHistory(env, teams?.home ?? null, match.home_team, match.kickoff_at, options).catch(() => homeQualifierHistory);
  }
  if (awayQualifierHistory && awayQualifierHistory.matches.length === 0 && HOST_RECENT_FORM_TEAMS.has(match.away_team)) {
    awayQualifierHistory = await fetchHostRecentHistory(env, teams?.away ?? null, match.away_team, match.kickoff_at, options).catch(() => awayQualifierHistory);
  }
  const [homeHistoricalDetails, awayHistoricalDetails] = await Promise.all([
    cachedHistoricalDetailsForHistory(env, homeQualifierHistory).catch(() => []),
    cachedHistoricalDetailsForHistory(env, awayQualifierHistory).catch(() => []),
  ]);
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
    historical_match_details: {
      note: "Cached past fixture statistics, events, and lineups for the most relevant completed qualifier/recent-form matches. These are historical datasets only, not live feeds.",
      home: homeHistoricalDetails,
      away: awayHistoricalDetails,
    },
    baseline_strength_prior: {
      note: "Oddzz heuristic fallback used when provider data is limited. Higher means stronger expected team quality; it is not an official FIFA ranking. Regional context is a small World Cup 2026 travel/host boost, not home advantage.",
      home: { team: match.home_team, strength: teamStrength(match.home_team), regional_boost: regionalTournamentBoost(match.home_team) },
      away: { team: match.away_team, strength: teamStrength(match.away_team), regional_boost: regionalTournamentBoost(match.away_team) },
      strength_gap_home_minus_away: (teamStrength(match.home_team) + regionalTournamentBoost(match.home_team)) - (teamStrength(match.away_team) + regionalTournamentBoost(match.away_team)),
      suggested_score_hint: baselineScoreHint(match.home_team, match.away_team),
    },
    qualifier_endpoint_debug: {
      home: qualifierEndpointSummary(homeQualifierPayloads),
      away: qualifierEndpointSummary(awayQualifierPayloads),
    },
    teams: {
      home: { id: teams?.home ?? null, name: match.home_team, stats: homeStats, recent_form: homeForm ?? [], world_cup_qualifiers: homeQualifierHistory, standing: homeStanding },
      away: { id: teams?.away ?? null, name: match.away_team, stats: awayStats, recent_form: awayForm ?? [], world_cup_qualifiers: awayQualifierHistory, standing: awayStanding },
    },
  };
  return {
    ...scouting,
    scouting_insights: buildScoutingInsights(match, scouting),
    oddzz_scorecard: buildScorecard(match, scouting),
    insight_form_table: buildInsightFormTable(match, scouting, homeQualifierHistory, awayQualifierHistory),
  };
}

function insightFormTable(stats: unknown): InsightFormRow[] | undefined {
  const rows = (stats as any)?.insight_form_table;
  return Array.isArray(rows) ? rows.slice(0, 2) : undefined;
}

function insightOddsSummary(stats: unknown): OddsSummary | undefined {
  const summary = (stats as any)?.market_odds?.summary;
  return summary?.bookmakers_count ? summary : undefined;
}

function fallbackInsight(match: MatchRow, statsSource: string, scorecard?: Scorecard, stats?: unknown): InsightPayload {
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
    form_table: insightFormTable(stats),
    odds_summary: insightOddsSummary(stats),
  };
}

function coerceInsight(value: any, match: MatchRow, scorecard?: Scorecard, stats?: unknown): InsightPayload {
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
    form_table: insightFormTable(stats),
    odds_summary: insightOddsSummary(stats),
  };
}

async function generateInsight(env: Env, match: MatchRow, stats: unknown, language: InsightLanguage): Promise<InsightPayload> {
  const scorecard = (stats as any)?.oddzz_scorecard as Scorecard | undefined;
  if (!env.OPENAI_API_KEY) return fallbackInsight(match, (stats as any)?.source ?? "match-context", scorecard, stats);
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
            "Never describe the predicted result as a home win or away win. Name the team instead.",
            "You may mention tournament_context when present: USA, Canada and Mexico get a small host/travel context edge, and North/South American teams may get a smaller regional travel/context edge. Describe this as regional context, never as home advantage unless the team is actually a host playing in its host country.",
            "The stats JSON contains oddzz_scorecard. Treat this scorecard as the primary recommendation produced by Oddzz's deterministic engine. Explain it clearly; do not override its suggested_pick unless the provided raw datasets strongly contradict it.",
            "The stats JSON also contains scouting_insights and insight_form_table. Use them as the main source for the rationale paragraph: recent results, goals scored, goals conceded, adjusted points per match, average opponent strength, baseline strength, and injury watch.",
            "When scouting_insights.historical_match_details contains cached past fixture statistics, events, or lineups, use them to add concrete context such as shots, corners, cards, goals/events, formations, and notable starters. Do not invent those details when missing.",
            "When writing form bullets, use scouting_insights.form_comparison.home.source_label and scouting_insights.form_comparison.away.source_label. If a team source is host_recent_all_competitions or recent_form, do not describe that data as World Cup qualifiers.",
            "The angles array is kept only for backward compatibility and can be short. Do not rely on it for the final UI.",
            "When injuries are available, mention key absences by player/team/reason. If injury data is unavailable, say 'No fixture injury list available yet' only if useful; do not overstate it.",
            "Consider all available datasets together: World Cup qualifiers, baseline strength, recent form, provider prediction, bookmaker consensus, head-to-head, team statistics, standings, injuries, and tournament context.",
            "World Cup qualifier history is an important national-team signal. Oddzz adjusts this signal by confederation strength, so continents are not treated as perfectly equal.",
            "For 2026 host teams without qualifiers, Oddzz may provide host_recent_all_competitions from their latest 10 completed matches including friendlies. Treat it as useful but weaker than true qualifier data.",
            "If scouting_insights.bookmaker_consensus exists, summarize what the combined bookmakers expect using the result probabilities, over/under 2.5 goals, both-teams-to-score probability, and likely exact scores when available.",
            "Bookmaker consensus is one weighted signal, not the main prediction and never certainty. Do not simply copy the bookmaker favorite or likely score; reconcile it with qualifier form, opponent quality, strength prior, recent form, injuries, and tournament context.",
            "The deterministic engine may use the goals market only to shape the exact scoreline after all signals determine the likely result; never let goals odds choose the winner.",
            "When provider_prediction and live statistics are missing or limited, use baseline_strength_prior as a heuristic fallback so stronger teams are not treated as automatic 1-1 draws.",
            "If the strength gap is 6+ points, avoid defaulting to a draw unless other provided data clearly supports it.",
            "If API-Football's provider_prediction exists, treat it as one useful signal, not as guaranteed truth.",
            "Use precise wording about data availability: if qualifier or recent-form matches are present, do not call all data sparse. Instead say market odds, provider predictions, live stats, injuries, or World Cup 2026 team statistics are missing if those specific datasets are absent.",
            "The suggested_pick must be an exact scoreline in the format 'Team A 1-1 Team B', not just a winner.",
            "Prefer oddzz_scorecard.suggested_pick for suggested_pick. Bonus recommendation should normally follow oddzz_scorecard.bonus_recommended.",
            "Also recommend whether OddzzAI should use one of its two x5 bonuses. It can only use bonuses on group-stage matches, and only when confidence is high enough to justify the risk.",
            "Write summary as one clean rationale paragraph explaining why the suggested pick and bonus call make sense. Do not format it as bullets.",
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
  return coerceInsight(JSON.parse(payload.choices?.[0]?.message?.content ?? "{}"), match, scorecard, stats);
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
  const freshAfter = new Date(Date.now() - AI_DATASET_CACHE_TTL_SECONDS * 1000).toISOString();
  return env.DB.prepare(`
    SELECT insight_json, updated_at, stats_json FROM ai_fixture_insights
    WHERE match_id = ?
      AND json_extract(stats_json, '$.prompt_version') = ?
      AND json_extract(stats_json, '$.language') = ?
      AND created_at <= ?
      AND updated_at >= ?
    ORDER BY updated_at DESC LIMIT 1
  `).bind(matchId, INSIGHT_PROMPT_VERSION, language, kickoffAt, freshAfter).first<{ insight_json: string; updated_at: string; stats_json: string }>();
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

async function refreshFixtureScoutingDatasets(env: Env, match: MatchRow) {
  await Promise.all([
    fetchApiFootball(env, "/predictions", { fixture: match.external_id }).catch(() => null),
    fetchApiFootball(env, "/injuries", { fixture: match.external_id }).catch(() => null),
    fetchApiFootball(env, "/odds", { fixture: match.external_id }).catch(() => null),
  ]);
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
  await refreshFixtureScoutingDatasets(env, match);
  return cachedOrGenerateInsightFromStats(env, match, language, await buildStatsSnapshot(env, match, { allowProviderFetch: false }));
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
    const stats = await buildStatsSnapshot(env, match, { allowProviderFetch: true }).catch(() => null);
    if (!stats) continue;
    await cachedOrGenerateInsightFromStats(env, match, "en", stats).catch(() => null);
    await cachedOrGenerateInsightFromStats(env, match, "fr", stats).catch(() => null);
  }
}

function uniqueNumbers(values: Array<number | null | undefined>) {
  return [...new Set(values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)))];
}

function completedFixtureIdsFromPayloads(payloads: any[], beforeIso?: string) {
  const beforeTime = beforeIso ? new Date(beforeIso).getTime() : Date.now();
  return uniqueNumbers(payloads.flatMap((payload) => (
    Array.isArray(payload?.response)
      ? payload.response
        .filter((fixture: any) => isCompletedFixture(fixture))
        .filter((fixture: any) => new Date(fixture?.fixture?.date ?? 0).getTime() < beforeTime)
        .map((fixture: any) => safeNumber(fixture?.fixture?.id))
      : []
  )));
}

async function hydratePastFixtureDetails(env: Env, fixtureIds: number[]) {
  let attempted = 0;
  for (const fixtureId of fixtureIds) {
    await fetchApiFootball(env, "/fixtures/statistics", { fixture: fixtureId }, { ttlSeconds: AI_PAST_DATA_CACHE_TTL_SECONDS }).catch(() => null);
    await fetchApiFootball(env, "/fixtures/events", { fixture: fixtureId }, { ttlSeconds: AI_PAST_DATA_CACHE_TTL_SECONDS }).catch(() => null);
    await fetchApiFootball(env, "/fixtures/lineups", { fixture: fixtureId }, { ttlSeconds: AI_PAST_DATA_CACHE_TTL_SECONDS }).catch(() => null);
    attempted += 3;
  }
  return attempted;
}

async function hydrateAiFootballDataBatch(env: Env, options: HydrateBatchOptions) {
  if (!env.FOOTBALL_API_KEY) return badRequest("FOOTBALL_API_KEY is not configured.", 503);
  const teamOffset = options.teamOffset;
  const teamLimit = options.teamLimit;
  const fixtureOffset = options.fixtureOffset;
  const fixtureLimit = options.fixtureLimit;
  const league = env.FOOTBALL_API_LEAGUE_ID || "1";
  const season = env.FOOTBALL_API_SEASON || "2026";
  const worldCupPayload = await fetchApiFootball(env, "/fixtures", { league, season }, { bypassCache: true }).catch(() => null) as { response?: any[] } | null;
  const rows = Array.isArray(worldCupPayload?.response) ? worldCupPayload.response : [];
  const teamIds = uniqueNumbers(rows.flatMap((fixture: any) => [
    safeNumber(fixture?.teams?.home?.id),
    safeNumber(fixture?.teams?.away?.id),
  ]));
  const selectedTeamIds = teamIds.slice(teamOffset, teamOffset + teamLimit);
  const selectedFixtures = rows.slice(fixtureOffset, fixtureOffset + fixtureLimit);

  let qualifierRequests = 0;
  let recentRequests = 0;
  let statsRequests = 0;
  let standingsRequests = 0;
  let historicalDetailRequests = 0;
  const historicalFixtureIds = new Set<number>();
  for (const teamId of selectedTeamIds) {
    const qualifierPayloads = await fetchTeamWorldCupQualifierPayloads(env, teamId, { allowProviderFetch: true, bypassCache: true });
    for (const fixtureId of completedFixtureIdsFromPayloads(qualifierPayloads)) historicalFixtureIds.add(fixtureId);
    qualifierRequests += WORLD_CUP_2026_QUALIFIER_COMPETITIONS.length;
    const recentPayload = await fetchApiFootball(env, "/fixtures", { team: teamId, last: 10 }, { bypassCache: true }).catch(() => null);
    for (const fixtureId of completedFixtureIdsFromPayloads([recentPayload])) historicalFixtureIds.add(fixtureId);
    recentRequests += 1;
    await fetchApiFootball(env, "/teams/statistics", { league, season, team: teamId }, { bypassCache: true }).catch(() => null);
    statsRequests += 1;
    await fetchApiFootball(env, "/standings", { league, season, team: teamId }, { bypassCache: true }).catch(() => null);
    standingsRequests += 1;
  }
  historicalDetailRequests += await hydratePastFixtureDetails(env, [...historicalFixtureIds].slice(0, options.historicalDetailLimit));

  let fixtureScoutingRequests = 0;
  for (const fixture of selectedFixtures) {
    const fixtureId = safeNumber(fixture?.fixture?.id);
    const homeId = safeNumber(fixture?.teams?.home?.id);
    const awayId = safeNumber(fixture?.teams?.away?.id);
    const kickoffTime = new Date(fixture?.fixture?.date ?? 0).getTime();
    const isFutureFixture = fixtureId && kickoffTime > Date.now();
    if (isFutureFixture) {
      await fetchApiFootball(env, "/predictions", { fixture: fixtureId }, { bypassCache: true }).catch(() => null);
      await fetchApiFootball(env, "/injuries", { fixture: fixtureId }, { bypassCache: true }).catch(() => null);
      await fetchApiFootball(env, "/odds", { fixture: fixtureId }, { bypassCache: true }).catch(() => null);
      fixtureScoutingRequests += 3;
    }
    if (homeId && awayId) {
      await fetchApiFootball(env, "/fixtures/headtohead", { h2h: `${homeId}-${awayId}`, last: 10 }, { bypassCache: true }).catch(() => null);
      fixtureScoutingRequests += 1;
    }
  }

  return {
    ok: true,
    world_cup_fixtures: rows.length,
    teams: teamIds.length,
    processed: {
      team_offset: teamOffset,
      team_limit: teamLimit,
      teams: selectedTeamIds.length,
      fixture_offset: fixtureOffset,
      fixture_limit: fixtureLimit,
      fixtures: selectedFixtures.length,
    },
    next: {
      team_offset: teamOffset + selectedTeamIds.length < teamIds.length ? teamOffset + selectedTeamIds.length : null,
      fixture_offset: fixtureOffset + selectedFixtures.length < rows.length ? fixtureOffset + selectedFixtures.length : null,
    },
    provider_requests_attempted: {
      world_cup_fixtures: 1,
      qualifiers: qualifierRequests,
      recent_form: recentRequests,
      team_statistics: statsRequests,
      standings: standingsRequests,
      historical_fixture_details: historicalDetailRequests,
      fixture_scouting: fixtureScoutingRequests,
    },
  };
}

export async function hydrateAiFootballData(request: Request, env: Env) {
  const url = new URL(request.url);
  const result = await hydrateAiFootballDataBatch(env, {
    teamOffset: Math.max(0, Number(url.searchParams.get("teamOffset") ?? 0) || 0),
    teamLimit: Math.min(12, Math.max(1, Number(url.searchParams.get("teamLimit") ?? 3) || 3)),
    fixtureOffset: Math.max(0, Number(url.searchParams.get("fixtureOffset") ?? 0) || 0),
    fixtureLimit: Math.min(20, Math.max(1, Number(url.searchParams.get("fixtureLimit") ?? 5) || 5)),
    historicalDetailLimit: Math.min(30, Math.max(0, Number(url.searchParams.get("historicalDetailLimit") ?? 30) || 30)),
  });
  return result instanceof Response ? result : json(result);
}

export async function startAiFootballRefreshJob(request: Request, env: Env, startedByUserId: string | null = null) {
  const active = await env.DB.prepare(`
    SELECT * FROM ai_refresh_jobs
    WHERE status IN ('queued', 'running')
    ORDER BY created_at DESC
    LIMIT 1
  `).first<any>().catch(() => null);
  if (active) {
    return json({ ok: true, job: active, message: "An OddzzAI refresh job is already running." });
  }

  const body = await request.json().catch(() => ({})) as Partial<{
    teamLimit: number;
    fixtureLimit: number;
    historicalDetailLimit: number;
  }>;
  const now = nowIso();
  const job = {
    id: crypto.randomUUID(),
    teamLimit: Math.min(3, Math.max(1, Number(body.teamLimit ?? 1) || 1)),
    fixtureLimit: Math.min(5, Math.max(1, Number(body.fixtureLimit ?? 2) || 2)),
    historicalDetailLimit: Math.min(10, Math.max(0, Number(body.historicalDetailLimit ?? 5) || 5)),
  };
  await env.DB.prepare(`
    INSERT INTO ai_refresh_jobs (
      id, status, team_offset, fixture_offset, team_limit, fixture_limit, historical_detail_limit,
      started_by_user_id, created_at, updated_at
    )
    VALUES (?, 'queued', 0, 0, ?, ?, ?, ?, ?, ?)
  `).bind(job.id, job.teamLimit, job.fixtureLimit, job.historicalDetailLimit, startedByUserId, now, now).run();

  return json({
    ok: true,
    job_id: job.id,
    message: "OddzzAI D1 refresh queued. The one-minute cron will process one safe batch per minute.",
    batch_limits: {
      team_limit: job.teamLimit,
      fixture_limit: job.fixtureLimit,
      historical_detail_limit: job.historicalDetailLimit,
    },
  });
}

export async function getAiFootballRefreshJob(env: Env, jobId?: string | null) {
  const row = jobId
    ? await env.DB.prepare("SELECT * FROM ai_refresh_jobs WHERE id = ?").bind(jobId).first<any>()
    : await env.DB.prepare("SELECT * FROM ai_refresh_jobs ORDER BY created_at DESC LIMIT 1").first<any>();
  if (!row) return badRequest("OddzzAI refresh job not found.", 404);
  return json({ ok: true, job: row });
}

export async function processAiFootballRefreshQueue(env: Env) {
  const job = await env.DB.prepare(`
    SELECT * FROM ai_refresh_jobs
    WHERE status IN ('queued', 'running')
      AND (last_run_at IS NULL OR last_run_at <= ?)
    ORDER BY created_at ASC
    LIMIT 1
  `).bind(new Date(Date.now() - 55_000).toISOString()).first<any>().catch(() => null);
  if (!job) return;

  const now = nowIso();
  await env.DB.prepare(`
    UPDATE ai_refresh_jobs
    SET status = 'running', last_run_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(now, now, job.id).run();

  try {
    const result = await hydrateAiFootballDataBatch(env, {
      teamOffset: Number(job.team_offset ?? 0),
      teamLimit: Number(job.team_limit ?? 1),
      fixtureOffset: Number(job.fixture_offset ?? 0),
      fixtureLimit: Number(job.fixture_limit ?? 2),
      historicalDetailLimit: Number(job.historical_detail_limit ?? 5),
    });
    if (result instanceof Response) {
      await env.DB.prepare(`
        UPDATE ai_refresh_jobs
        SET status = 'failed', error_message = ?, updated_at = ?
        WHERE id = ?
      `).bind("OddzzAI refresh batch failed.", nowIso(), job.id).run();
      return;
    }

    const nextTeamOffset = result.next.team_offset;
    const nextFixtureOffset = result.next.fixture_offset;
    const isComplete = nextTeamOffset === null && nextFixtureOffset === null;
    await env.DB.prepare(`
      UPDATE ai_refresh_jobs
      SET status = ?,
        team_offset = ?,
        fixture_offset = ?,
        total_teams = ?,
        total_fixtures = ?,
        last_result_json = ?,
        error_message = NULL,
        updated_at = ?,
        completed_at = ?
      WHERE id = ?
    `).bind(
      isComplete ? "completed" : "running",
      nextTeamOffset ?? result.teams,
      nextFixtureOffset ?? result.world_cup_fixtures,
      result.teams,
      result.world_cup_fixtures,
      JSON.stringify(result),
      nowIso(),
      isComplete ? nowIso() : null,
      job.id,
    ).run();
  } catch (error) {
    await env.DB.prepare(`
      UPDATE ai_refresh_jobs
      SET status = 'failed', error_message = ?, updated_at = ?
      WHERE id = ?
    `).bind(error instanceof Error ? error.message : "Unknown refresh error.", nowIso(), job.id).run();
  }
}

export async function debugAiFixtureData(env: Env, matchId: string) {
  const match = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<MatchRow>();
  if (!match) return badRequest("Match not found.", 404);

  const storedTeams = {
    home: safeNumber(match.home_team_api_id),
    away: safeNumber(match.away_team_api_id),
  };
  const fetchedTeams = storedTeams.home && storedTeams.away ? null : await fetchFixtureTeams(env, match.external_id, { allowProviderFetch: true }).catch(() => null);
  const teams = {
    home: storedTeams.home ?? fetchedTeams?.home ?? null,
    away: storedTeams.away ?? fetchedTeams?.away ?? null,
  };

  const qualifierDebugForTeam = async (teamId: number | null) => {
    if (!teamId) return [];
    return Promise.all(WORLD_CUP_2026_QUALIFIER_COMPETITIONS.map(async (competition) => {
      const result = await debugFetchApiFootball(env, "/fixtures", {
        league: competition.league,
        season: competition.season,
        team: teamId,
      });
      const sample = Array.isArray(result.sample) ? result.sample : [];
      const completed = (status: unknown) => {
        const short = String(status ?? "").toUpperCase();
        return ["FT", "AET", "PEN"].includes(short);
      };
      return {
        competition,
        ...result,
        completed_sample_count: sample.filter((fixture: any) => completed(fixture.status)).length,
      };
    }));
  };

  return json({
    match: {
      id: match.id,
      external_id: match.external_id,
      home_team: match.home_team,
      away_team: match.away_team,
      kickoff_at: match.kickoff_at,
    },
    stored_team_ids: storedTeams,
    fetched_team_ids: fetchedTeams,
    effective_team_ids: teams,
    qualifiers: {
      home: await qualifierDebugForTeam(teams.home),
      away: await qualifierDebugForTeam(teams.away),
    },
  });
}
