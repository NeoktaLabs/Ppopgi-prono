import type { Env } from "./types";
import { nowIso } from "./utils";
import { multiplierForStage } from "./scoring";
import { recalculateMatch } from "./api";

type ProviderMatch = {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  stage?: string | null;
  groupName?: string | null;
  venue?: string | null;
  status: string;
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
  await syncWorldCupMatches(env);
  await recalculateFinishedMatches(env);
}

export async function syncWorldCupMatches(env: Env) {
  const provider = env.FOOTBALL_PROVIDER || "stub";
  const matches = provider === "stub" ? stubMatches() : await fetchProviderMatches(env);

  for (const match of matches) {
    await env.DB.prepare(`
      INSERT INTO matches (
        id, external_id, home_team, away_team, kickoff_at, stage, group_name, venue, status,
        score_90_home, score_90_away, score_120_home, score_120_away, penalty_home, penalty_away,
        final_home, final_away, points_multiplier, api_provider, last_synced_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(external_id) DO UPDATE SET
        home_team = excluded.home_team,
        away_team = excluded.away_team,
        kickoff_at = excluded.kickoff_at,
        stage = excluded.stage,
        group_name = excluded.group_name,
        venue = excluded.venue,
        status = excluded.status,
        score_90_home = excluded.score_90_home,
        score_90_away = excluded.score_90_away,
        score_120_home = excluded.score_120_home,
        score_120_away = excluded.score_120_away,
        penalty_home = excluded.penalty_home,
        penalty_away = excluded.penalty_away,
        final_home = excluded.final_home,
        final_away = excluded.final_away,
        points_multiplier = excluded.points_multiplier,
        last_synced_at = excluded.last_synced_at,
        updated_at = excluded.updated_at
    `).bind(
      crypto.randomUUID(),
      match.externalId,
      match.homeTeam,
      match.awayTeam,
      match.kickoffAt,
      match.stage ?? null,
      match.groupName ?? null,
      match.venue ?? null,
      match.status,
      match.score90Home ?? null,
      match.score90Away ?? null,
      match.score120Home ?? null,
      match.score120Away ?? null,
      match.penaltyHome ?? null,
      match.penaltyAway ?? null,
      match.finalHome ?? null,
      match.finalAway ?? null,
      multiplierForStage(match.stage ?? null),
      provider,
      nowIso(),
      nowIso(),
      nowIso(),
    ).run();
  }

  await env.DB.prepare(`
    INSERT INTO sync_logs (id, provider, type, status, message, created_at)
    VALUES (?, ?, 'matches', 'success', ?, ?)
  `).bind(crypto.randomUUID(), provider, `Synced ${matches.length} matches`, nowIso()).run();
}

async function fetchProviderMatches(_env: Env): Promise<ProviderMatch[]> {
  // TODO: wire API-Football or football-data.org mapping here.
  // Keep this isolated so the rest of the app is provider-agnostic.
  return stubMatches();
}

async function recalculateFinishedMatches(env: Env) {
  const rows = await env.DB.prepare(`
    SELECT id FROM matches
    WHERE status IN ('finished', 'FINISHED') AND (final_home IS NOT NULL OR score_120_home IS NOT NULL OR score_90_home IS NOT NULL)
  `).all<{ id: string }>();

  for (const row of rows.results ?? []) {
    await recalculateMatch(env, row.id);
  }
}

function stubMatches(): ProviderMatch[] {
  const year = new Date().getFullYear();
  return [
    {
      externalId: "stub-group-1",
      homeTeam: "Suisse",
      awayTeam: "Allemagne",
      kickoffAt: new Date(Date.UTC(year, 5, 12, 18, 0, 0)).toISOString(),
      stage: "GROUP_STAGE",
      groupName: "A",
      venue: "Stade Exemple",
      status: "scheduled",
    },
    {
      externalId: "stub-final-1",
      homeTeam: "TBD",
      awayTeam: "TBD",
      kickoffAt: new Date(Date.UTC(year, 6, 19, 19, 0, 0)).toISOString(),
      stage: "FINAL",
      status: "scheduled",
    },
  ];
}
