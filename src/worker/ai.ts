import type { Env, MatchRow } from "./types";
import { badRequest, json, nowIso, requireUser, sha256 } from "./utils";

type InsightPayload = {
  headline: string;
  summary: string;
  angles: string[];
  suggested_pick: string;
  confidence: "low" | "medium" | "high";
  disclaimer: string;
};

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

async function fetchFixtureTeams(env: Env, externalId: string) {
  if (!env.FOOTBALL_API_KEY) return null;
  const baseUrl = env.FOOTBALL_API_BASE_URL || "https://v3.football.api-sports.io";
  const response = await fetch(`${baseUrl}/fixtures?id=${encodeURIComponent(externalId)}`, {
    headers: { "x-apisports-key": env.FOOTBALL_API_KEY },
  });
  if (!response.ok) return null;
  const payload = await response.json() as { response?: any[] };
  const fixture = payload.response?.[0];
  return fixture?.teams ? {
    home: safeNumber(fixture.teams.home?.id),
    away: safeNumber(fixture.teams.away?.id),
  } : null;
}

async function fetchTeamStats(env: Env, teamId: number | null) {
  if (!env.FOOTBALL_API_KEY || !teamId) return null;
  const baseUrl = env.FOOTBALL_API_BASE_URL || "https://v3.football.api-sports.io";
  const league = env.FOOTBALL_API_LEAGUE_ID || "1";
  const season = env.FOOTBALL_API_SEASON || "2026";
  const response = await fetch(`${baseUrl}/teams/statistics?league=${league}&season=${season}&team=${teamId}`, {
    headers: { "x-apisports-key": env.FOOTBALL_API_KEY },
  });
  if (!response.ok) return null;
  return compactTeamStats(await response.json());
}

async function buildStatsSnapshot(env: Env, match: MatchRow) {
  const teams = await fetchFixtureTeams(env, match.external_id).catch(() => null);
  const [homeStats, awayStats] = await Promise.all([
    fetchTeamStats(env, teams?.home ?? null).catch(() => null),
    fetchTeamStats(env, teams?.away ?? null).catch(() => null),
  ]);
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
    source: homeStats || awayStats ? "football-api" : "match-context",
    teams: {
      home: { id: teams?.home ?? null, name: match.home_team, stats: homeStats },
      away: { id: teams?.away ?? null, name: match.away_team, stats: awayStats },
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
    confidence: "low",
    disclaimer: "AI insight for fun only. Not betting advice.",
  };
}

function coerceInsight(value: any, match: MatchRow): InsightPayload {
  return {
    headline: String(value?.headline || `${match.home_team} vs ${match.away_team}`),
    summary: String(value?.summary || "No summary available."),
    angles: Array.isArray(value?.angles) ? value.angles.slice(0, 4).map(String) : [],
    suggested_pick: String(value?.suggested_pick || "No clear pick"),
    confidence: ["low", "medium", "high"].includes(value?.confidence) ? value.confidence : "low",
    disclaimer: String(value?.disclaimer || "AI insight for fun only. Not betting advice."),
  };
}

async function generateInsight(env: Env, match: MatchRow, stats: unknown): Promise<InsightPayload> {
  if (!env.OPENAI_API_KEY) return fallbackInsight(match, (stats as any)?.source ?? "match-context");
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
          content: "You are Oddzz AI, a friendly World Cup prediction assistant. Give concise football insights for entertainment only. Do not present betting advice or certainty. Return strict JSON with keys: headline, summary, angles, suggested_pick, confidence, disclaimer.",
        },
        {
          role: "user",
          content: JSON.stringify({ match: { home: match.home_team, away: match.away_team, stage: match.stage, kickoff_at: match.kickoff_at }, stats }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}): ${await response.text()}`);
  const payload = await response.json() as any;
  return coerceInsight(JSON.parse(payload.choices?.[0]?.message?.content ?? "{}"), match);
}

export async function fixtureAiInsight(request: Request, env: Env, matchId: string) {
  const user = await requireUser(request, env);
  if (!user) return badRequest("Not authenticated.", 401);
  const match = await env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<MatchRow>();
  if (!match) return badRequest("Match not found.", 404);

  const stats = await buildStatsSnapshot(env, match);
  const statsJson = JSON.stringify(stats);
  const statsHash = await sha256(statsJson);
  const cached = await env.DB.prepare(`
    SELECT insight_json, updated_at FROM ai_fixture_insights
    WHERE match_id = ? AND stats_hash = ?
    ORDER BY updated_at DESC LIMIT 1
  `).bind(match.id, statsHash).first<{ insight_json: string; updated_at: string }>();

  if (cached) {
    return json({ insight: JSON.parse(cached.insight_json), cached: true, updated_at: cached.updated_at, stats_source: stats.source });
  }

  const insight = await generateInsight(env, match, stats);
  const now = nowIso();
  await env.DB.prepare(`
    INSERT INTO ai_fixture_insights (id, match_id, stats_hash, stats_json, insight_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), match.id, statsHash, statsJson, JSON.stringify(insight), now, now).run();

  return json({ insight, cached: false, updated_at: now, stats_source: stats.source });
}
