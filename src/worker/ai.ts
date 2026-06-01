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

const INSIGHT_PROMPT_VERSION = "2026-06-01-odds-prior-v7";
type InsightLanguage = "en" | "fr";

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
  USA: 79,
  Mexico: 78,
  Senegal: 78,
  Serbia: 77,
  Sweden: 77,
  Austria: 77,
  Poland: 76,
  Ecuador: 76,
  Australia: 74,
  "South Korea": 74,
  Canada: 73,
  Norway: 73,
  Chile: 72,
  Wales: 72,
  Tunisia: 70,
  Nigeria: 70,
  Paraguay: 70,
  Scotland: 70,
  Ghana: 69,
  "South Africa": 68,
  "Saudi Arabia": 67,
  Qatar: 64,
  Iran: 64,
};

class AiProviderError extends Error {
  constructor(message: string, public readonly status = 503) {
    super(message);
  }
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

async function buildStatsSnapshot(env: Env, match: MatchRow) {
  const teams = await fetchFixtureTeams(env, match.external_id).catch(() => null);
  const league = env.FOOTBALL_API_LEAGUE_ID || "1";
  const season = env.FOOTBALL_API_SEASON || "2026";
  const [homeStats, awayStats, homeForm, awayForm, homeStanding, awayStanding, h2h, providerPrediction, injuries, odds] = await Promise.all([
    fetchTeamStats(env, teams?.home ?? null).catch(() => null),
    fetchTeamStats(env, teams?.away ?? null).catch(() => null),
    teams?.home ? fetchApiFootball(env, "/fixtures", { team: teams.home, last: 5 }).then((payload: any) => payload?.response?.slice(0, 5).map(compactFixture) ?? null).catch(() => null) : null,
    teams?.away ? fetchApiFootball(env, "/fixtures", { team: teams.away, last: 5 }).then((payload: any) => payload?.response?.slice(0, 5).map(compactFixture) ?? null).catch(() => null) : null,
    teams?.home ? fetchApiFootball(env, "/standings", { league, season, team: teams.home }).then(compactStanding).catch(() => null) : null,
    teams?.away ? fetchApiFootball(env, "/standings", { league, season, team: teams.away }).then(compactStanding).catch(() => null) : null,
    teams?.home && teams?.away ? fetchApiFootball(env, "/fixtures/headtohead", { h2h: `${teams.home}-${teams.away}`, last: 10 }).then((payload: any) => payload?.response?.slice(0, 10).map(compactFixture) ?? null).catch(() => null) : null,
    fetchApiFootball(env, "/predictions", { fixture: match.external_id }).then(compactPrediction).catch(() => null),
    fetchApiFootball(env, "/injuries", { fixture: match.external_id }).then(compactInjuries).catch(() => null),
    fetchApiFootball(env, "/odds", { fixture: match.external_id }).then(compactOdds).catch(() => null),
  ]);
  const datasets = {
    odds: !!odds,
    team_statistics: !!(homeStats || awayStats),
    recent_form: !!((homeForm?.length ?? 0) || (awayForm?.length ?? 0)),
    standings: !!(homeStanding || awayStanding),
    head_to_head: !!(h2h?.length ?? 0),
    api_prediction: !!providerPrediction,
    injuries: !!(injuries?.length ?? 0),
  };
  return {
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
    provider_prediction: providerPrediction,
    head_to_head: h2h ?? [],
    injuries: injuries ?? [],
    baseline_strength_prior: {
      note: "Oddzz heuristic fallback used only when API-Football data is sparse. Higher means stronger expected team quality; it is not an official FIFA ranking.",
      home: { team: match.home_team, strength: teamStrength(match.home_team) },
      away: { team: match.away_team, strength: teamStrength(match.away_team) },
      strength_gap_home_minus_away: teamStrength(match.home_team) - teamStrength(match.away_team),
      suggested_score_hint: baselineScoreHint(match.home_team, match.away_team),
    },
    teams: {
      home: { id: teams?.home ?? null, name: match.home_team, stats: homeStats, recent_form: homeForm ?? [], standing: homeStanding },
      away: { id: teams?.away ?? null, name: match.away_team, stats: awayStats, recent_form: awayForm ?? [], standing: awayStanding },
    },
  };
}

function fallbackInsight(match: MatchRow, statsSource: string): InsightPayload {
  return {
    headline: `${match.home_team} vs ${match.away_team}: quick read`,
    summary: `Oddzz AI can compare team stats once API keys are configured. For now, this local preview uses fixture context only, so treat it as a UI demo rather than a real forecast.`,
    angles: [
      `${match.stage ?? "World Cup"} match scheduled for ${new Date(match.kickoff_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}.`,
      `Stats source: ${statsSource}.`,
      `A cautious pick is usually better than chasing a huge scoreline in group-stage style fixtures.`,
    ],
    suggested_pick: `${match.home_team} 1-1 ${match.away_team}`,
    bonus_recommendation: {
      use_bonus: false,
      reason: "Do not use a bonus when confidence is low or the data is sparse.",
    },
    confidence: "low",
    disclaimer: "AI insight for fun only. Not betting advice.",
  };
}

function coerceInsight(value: any, match: MatchRow): InsightPayload {
  const rawPick = String(value?.suggested_pick || "");
  const suggestedPick = /\d+\s*[-:]\s*\d+/.test(rawPick) ? rawPick : `${match.home_team} 1-1 ${match.away_team}`;
  return {
    headline: String(value?.headline || `${match.home_team} vs ${match.away_team}`),
    summary: String(value?.summary || "No summary available."),
    angles: Array.isArray(value?.angles) ? value.angles.slice(0, 4).map(String) : [],
    suggested_pick: suggestedPick,
    bonus_recommendation: {
      use_bonus: value?.bonus_recommendation?.use_bonus === true,
      reason: String(value?.bonus_recommendation?.reason || "No bonus recommendation available."),
    },
    confidence: ["low", "medium", "high"].includes(value?.confidence) ? value.confidence : "low",
    disclaimer: String(value?.disclaimer || "AI insight for fun only. Not betting advice."),
  };
}

async function generateInsight(env: Env, match: MatchRow, stats: unknown, language: InsightLanguage): Promise<InsightPayload> {
  if (!env.OPENAI_API_KEY) return fallbackInsight(match, (stats as any)?.source ?? "match-context");
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
            "Consider the available datasets in this order: market_odds, provider_prediction, recent_form, head_to_head, team_statistics, standings, injuries, then match context.",
            "If market_odds exists, treat bookmaker odds as a useful market signal, not certainty. Use it especially to break ties when football stats are sparse.",
            "When provider_prediction and live statistics are missing or sparse, use baseline_strength_prior as a heuristic fallback so stronger teams are not treated as automatic 1-1 draws.",
            "If the strength gap is 6+ points, avoid defaulting to a draw unless other provided data clearly supports it.",
            "If API-Football's provider_prediction exists, treat it as one useful signal, not as guaranteed truth.",
            "If team stats are null or sparse, say clearly that there is not enough statistical data yet and keep confidence low.",
            "The suggested_pick must be an exact scoreline in the format 'Team A 1-1 Team B', not just a winner.",
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
  return coerceInsight(JSON.parse(payload.choices?.[0]?.message?.content ?? "{}"), match);
}

export async function fixtureAiInsight(request: Request, env: Env, matchId: string) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);
  const match = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<MatchRow>();
  if (!match) return badRequest("Match not found.", 404);
  const language = new URL(request.url).searchParams.get("lang") === "fr" ? "fr" : "en";

  return json(await cachedOrGenerateInsight(env, match, language));
}

async function cachedOrGenerateInsight(env: Env, match: MatchRow, language: InsightLanguage) {
  const stats = await buildStatsSnapshot(env, match);
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

export async function scheduledAiInsightRefresh(env: Env) {
  const now = new Date();
  const oddsWindowEnd = new Date(now);
  oddsWindowEnd.setDate(oddsWindowEnd.getDate() + 14);
  const rows = await env.DB.prepare(`
    SELECT * FROM matches
    WHERE kickoff_at >= ? AND kickoff_at <= ?
      AND LOWER(status) NOT IN ('finished', 'cancelled', 'postponed')
    ORDER BY kickoff_at ASC
    LIMIT 80
  `).bind(now.toISOString(), oddsWindowEnd.toISOString()).all<MatchRow>();

  for (const match of rows.results ?? []) {
    await cachedOrGenerateInsight(env, match, "en").catch(() => null);
    await cachedOrGenerateInsight(env, match, "fr").catch(() => null);
  }
}
