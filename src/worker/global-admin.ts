import type { Env } from "./types";
import { badRequest, json, nowIso, readJson, requireUser } from "./utils";
import { recalculateMatch } from "./api";
import { savePreMatchSnapshotsForMatch } from "./live";

function adminEmails(env: Env) {
  return (env.GLOBAL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireGlobalAdmin(request: Request, env: Env) {
  const user = await requireUser(request, env);
  if (!user) return { error: badRequest("Not authenticated.", 401), user: null };

  const allowed = adminEmails(env);
  if (!allowed.includes(user.email.toLowerCase())) {
    return { error: badRequest("Global admin access required.", 403), user: null };
  }

  return { error: null, user };
}

function parseManualScore(value: unknown) {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 ? value : null;
}

export async function setGlobalManualScore(request: Request, env: Env, matchId: string) {
  const admin = await requireGlobalAdmin(request, env);
  if (admin.error || !admin.user) return admin.error;

  const body = await readJson<{ homeScore?: unknown; awayScore?: unknown }>(request);
  const homeScore = parseManualScore(body.homeScore);
  const awayScore = parseManualScore(body.awayScore);
  if (homeScore === null || awayScore === null) {
    return badRequest("Invalid manual score.");
  }

  const match = await env.DB.prepare("SELECT id FROM matches WHERE id = ?").bind(matchId).first();
  if (!match) return badRequest("Match not found.", 404);

  await savePreMatchSnapshotsForMatch(env, matchId);

  await env.DB.prepare(`
    UPDATE matches SET
      manual_final_home = ?,
      manual_final_away = ?,
      manual_score_set_by_user_id = ?,
      manual_score_set_at = ?,
      score_source = 'manual',
      status = CASE WHEN status IN ('scheduled', 'live') THEN 'finished' ELSE status END,
      updated_at = ?
    WHERE id = ?
  `).bind(homeScore, awayScore, admin.user.id, nowIso(), nowIso(), matchId).run();

  await recalculateMatch(env, matchId);
  return json({ ok: true, source: "manual", scope: "global" });
}

export async function clearGlobalManualScore(request: Request, env: Env, matchId: string) {
  const admin = await requireGlobalAdmin(request, env);
  if (admin.error) return admin.error;

  const match = await env.DB.prepare("SELECT id FROM matches WHERE id = ?").bind(matchId).first();
  if (!match) return badRequest("Match not found.", 404);

  await savePreMatchSnapshotsForMatch(env, matchId);

  await env.DB.prepare(`
    UPDATE matches SET
      manual_final_home = NULL,
      manual_final_away = NULL,
      manual_score_set_by_user_id = NULL,
      manual_score_set_at = NULL,
      score_source = 'api',
      updated_at = ?
    WHERE id = ?
  `).bind(nowIso(), matchId).run();

  await recalculateMatch(env, matchId);
  return json({ ok: true, source: "api", scope: "global" });
}

export async function recalculateGlobalMatch(request: Request, env: Env, matchId: string) {
  const admin = await requireGlobalAdmin(request, env);
  if (admin.error) return admin.error;

  await recalculateMatch(env, matchId);
  return json({ ok: true, scope: "global" });
}

export async function recalculateAllGlobalScores(request: Request, env: Env) {
  const admin = await requireGlobalAdmin(request, env);
  if (admin.error) return admin.error;

  const rows = await env.DB.prepare("SELECT id FROM matches").all<{ id: string }>();
  let recalculated = 0;

  for (const row of rows.results ?? []) {
    await recalculateMatch(env, row.id);
    recalculated += 1;
  }

  return json({ ok: true, scope: "global", recalculated });
}
