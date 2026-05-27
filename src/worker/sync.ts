import type { Env } from "./types";
import { nowIso } from "./utils";
import { multiplierForStage } from "./scoring";
import { recalculateMatch } from "./api";
import { savePreMatchSnapshotsForMatches } from "./live";

type ProviderMatch = {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  stage?: string | null;
  groupName?: string | null;
  venue?: string | null;
  status: string;
  liveHomeScore?: number | null;
  liveAwayScore?: number | null;
  liveMinute?: number | null;
  score90Home?: number | null;
  score90Away?: number | null;
  score120Home?: number | null;
  score120Away?: number | null;
  penaltyHome?: number | null;
  penaltyAway?: number | null;
  finalHome?: number | null;
  finalAway?: number | null;
};

export async function scheduledSync(env: Env) {
  if (await shouldCallProvider(env)) await syncWorldCupMatches(env);
  await recalculateFinishedMatches(env);
}

async function latestSuccessfulSync(env: Env) {
  const row = await env.DB.prepare(`SELECT created_at FROM sync_logs WHERE type = 'matches' AND status = 'success' ORDER BY created_at DESC LIMIT 1`).first<{ created_at: string }>();
  return row ? new Date(row.created_at).getTime() : 0;
}

async function shouldCallProvider(env: Env) {
  const now = new Date();
  const latestSyncAt = await latestSuccessfulSync(env);
  const minutesSinceSync = latestSyncAt ? (Date.now() - latestSyncAt) / 60_000 : Infinity;
  const soon = new Date(now.getTime() + 2 * 60 * 60_000);
  const active = await env.DB.prepare(`SELECT id FROM matches WHERE status IN ('live', 'in_play', '1H', '2H', 'HT', 'ET', 'penalties', 'extra_time') OR (kickoff_at >= ? AND kickoff_at <= ? AND status NOT IN ('finished', 'FINISHED', 'cancelled', 'postponed')) LIMIT 1`).bind(now.toISOString(), soon.toISOString()).first();
  if (active) return minutesSinceSync >= 2;
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const hasTodayMatch = await env.DB.prepare(`SELECT id FROM matches WHERE kickoff_at >= ? AND kickoff_at < ? LIMIT 1`).bind(todayStart.toISOString(), todayEnd.toISOString()).first();
  if (hasTodayMatch) return minutesSinceSync >= 30;
  return minutesSinceSync >= 24 * 60;
}

async function removeStubFixtures(env: Env) {
  const rows = await env.DB.prepare("SELECT id FROM matches WHERE api_provider = 'stub' OR external_id LIKE 'stub-%'").all<{ id: string }>();
  for (const row of rows.results ?? []) {
    await env.DB.prepare("DELETE FROM leaderboard_snapshots WHERE match_id = ?").bind(row.id).run();
    await env.DB.prepare("DELETE FROM predictions WHERE match_id = ?").bind(row.id).run();
    await env.DB.prepare("DELETE FROM matches WHERE id = ?").bind(row.id).run();
  }
}

export async function syncWorldCupMatches(env: Env) {
  const provider = env.FOOTBALL_PROVIDER || "stub";
  const matches = provider === "api-football" ? await fetchApiFootballMatches(env) : stubMatches();

  if (provider !== "stub") await removeStubFixtures(env);

  for (const match of matches) {
    await env.DB.prepare(`
      INSERT INTO matches (id, external_id, home_team, away_team, kickoff_at, stage, group_name, venue, status, live_home_score, live_away_score, live_minute, last_live_synced_at, score_90_home, score_90_away, score_120_home, score_120_away, penalty_home, penalty_away, final_home, final_away, points_multiplier, api_provider, last_synced_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(external_id) DO UPDATE SET home_team = excluded.home_team, away_team = excluded.away_team, kickoff_at = excluded.kickoff_at, stage = excluded.stage, group_name = excluded.group_name, venue = excluded.venue, status = excluded.status, live_home_score = excluded.live_home_score, live_away_score = excluded.live_away_score, live_minute = excluded.live_minute, last_live_synced_at = excluded.last_live_synced_at, score_90_home = excluded.score_90_home, score_90_away = excluded.score_90_away, score_120_home = excluded.score_120_home, score_120_away = excluded.score_120_away, penalty_home = excluded.penalty_home, penalty_away = excluded.penalty_away, final_home = excluded.final_home, final_away = excluded.final_away, points_multiplier = excluded.points_multiplier, api_provider = excluded.api_provider, last_synced_at = excluded.last_synced_at, updated_at = excluded.updated_at
    `).bind(
      crypto.randomUUID(), match.externalId, match.homeTeam, match.awayTeam, match.kickoffAt, match.stage ?? null, match.groupName ?? null, match.venue ?? null, match.status,
      match.liveHomeScore ?? null, match.liveAwayScore ?? null, match.liveMinute ?? null, match.liveHomeScore !== undefined || match.liveAwayScore !== undefined ? nowIso() : null,
      match.score90Home ?? null, match.score90Away ?? null, match.score120Home ?? null, match.score120Away ?? null, match.penaltyHome ?? null, match.penaltyAway ?? null, match.finalHome ?? null, match.finalAway ?? null,
      multiplierForStage(match.stage ?? null), provider, nowIso(), nowIso(), nowIso(),
    ).run();
  }

  await env.DB.prepare(`INSERT INTO sync_logs (id, provider, type, status, message, created_at) VALUES (?, ?, 'matches', 'success', ?, ?)`).bind(crypto.randomUUID(), provider, `Synced ${matches.length} matches`, nowIso()).run();
}

function normalizeStatus(statusShort?: string, statusLong?: string) {
  const short = (statusShort ?? "").toUpperCase();
  const long = (statusLong ?? "").toLowerCase();
  if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE"].includes(short)) return short === "P" ? "penalties" : short;
  if (["FT", "AET", "PEN"].includes(short)) return "finished";
  if (["PST", "CANC", "ABD", "SUSP"].includes(short)) return long || "postponed";
  if (short === "NS") return "scheduled";
  return long || short.toLowerCase() || "scheduled";
}

async function fetchApiFootballMatches(env: Env): Promise<ProviderMatch[]> {
  if (!env.FOOTBALL_API_KEY) throw new Error("FOOTBALL_API_KEY is required when FOOTBALL_PROVIDER=api-football");
  const baseUrl = env.FOOTBALL_API_BASE_URL || "https://v3.football.api-sports.io";
  const league = env.FOOTBALL_API_LEAGUE_ID || "1";
  const season = env.FOOTBALL_API_SEASON || "2026";
  const response = await fetch(`${baseUrl}/fixtures?league=${league}&season=${season}`, { headers: { "x-apisports-key": env.FOOTBALL_API_KEY } });
  if (!response.ok) throw new Error(`API-Football request failed with ${response.status}`);
  const payload = await response.json() as { response?: any[] };
  return (payload.response ?? []).map((item) => {
    const fixture = item.fixture ?? {};
    const leagueData = item.league ?? {};
    const teams = item.teams ?? {};
    const goals = item.goals ?? {};
    const score = item.score ?? {};
    const status = normalizeStatus(fixture.status?.short, fixture.status?.long);
    const elapsed = typeof fixture.status?.elapsed === "number" ? fixture.status.elapsed : null;
    const isLive = ["1H", "2H", "HT", "ET", "BT", "penalties", "LIVE"].includes(status);
    return {
      externalId: String(fixture.id),
      homeTeam: teams.home?.name ?? "TBD",
      awayTeam: teams.away?.name ?? "TBD",
      kickoffAt: fixture.date,
      stage: leagueData.round ?? null,
      groupName: null,
      venue: fixture.venue?.name ?? null,
      status,
      liveHomeScore: isLive ? goals.home ?? null : null,
      liveAwayScore: isLive ? goals.away ?? null : null,
      liveMinute: isLive ? elapsed : null,
      score90Home: score.fulltime?.home ?? null,
      score90Away: score.fulltime?.away ?? null,
      score120Home: score.extratime?.home ?? null,
      score120Away: score.extratime?.away ?? null,
      penaltyHome: score.penalty?.home ?? null,
      penaltyAway: score.penalty?.away ?? null,
      finalHome: ["finished"].includes(status) ? goals.home ?? null : null,
      finalAway: ["finished"].includes(status) ? goals.away ?? null : null,
    };
  });
}

async function recalculateFinishedMatches(env: Env) {
  const rows = await env.DB.prepare(`SELECT id FROM matches WHERE status IN ('finished', 'FINISHED') AND (manual_final_home IS NOT NULL OR final_home IS NOT NULL OR score_120_home IS NOT NULL OR score_90_home IS NOT NULL)`).all<{ id: string }>();
  const matchIds = (rows.results ?? []).map((row) => row.id);
  await savePreMatchSnapshotsForMatches(env, matchIds);
  for (const matchId of matchIds) await recalculateMatch(env, matchId);
}

function stubMatches(): ProviderMatch[] {
  const year = new Date().getFullYear();
  return [
    { externalId: "stub-group-1", homeTeam: "Switzerland", awayTeam: "Germany", kickoffAt: new Date(Date.UTC(year, 5, 12, 18, 0, 0)).toISOString(), stage: "GROUP_STAGE", groupName: "A", venue: "Example Stadium", status: "scheduled" },
    { externalId: "stub-live-1", homeTeam: "France", awayTeam: "Brazil", kickoffAt: new Date(Date.now() - 30 * 60_000).toISOString(), stage: "GROUP_STAGE", groupName: "B", venue: "Live Demo Stadium", status: "live", liveHomeScore: 1, liveAwayScore: 0, liveMinute: 31 },
    { externalId: "stub-final-1", homeTeam: "TBD", awayTeam: "TBD", kickoffAt: new Date(Date.UTC(year, 6, 19, 19, 0, 0)).toISOString(), stage: "FINAL", status: "scheduled" },
  ];
}
