import type { Env } from "./types";
import { badRequest, json, nowIso, randomCode, readJson, requireUser } from "./utils";

async function requireLeagueAdmin(request: Request, env: Env, leagueId: string) {
  const user = await requireUser(request, env);
  if (!user) return { error: badRequest("Non authentifié.", 401), user: null };

  const league = await env.DB.prepare("SELECT id, admin_user_id FROM leagues WHERE id = ?")
    .bind(leagueId)
    .first<{ id: string; admin_user_id: string }>();

  if (!league) return { error: badRequest("Ligue introuvable.", 404), user: null };
  if (league.admin_user_id !== user.id) return { error: badRequest("Réservé à l’admin de la ligue.", 403), user: null };

  return { error: null, user };
}

async function generateUniqueLeagueCode(env: Env) {
  let code = randomCode(Number(env.LEAGUE_CODE_LENGTH || 6));

  for (let i = 0; i < 10; i += 1) {
    const exists = await env.DB.prepare("SELECT id FROM leagues WHERE code = ?").bind(code).first();
    if (!exists) return code;
    code = randomCode(Number(env.LEAGUE_CODE_LENGTH || 6));
  }

  throw new Error("Unable to generate a unique league code.");
}

export async function updateLeagueSettings(request: Request, env: Env, leagueId: string) {
  const admin = await requireLeagueAdmin(request, env, leagueId);
  if (admin.error) return admin.error;

  const body = await readJson<{ name?: string; isJoinable?: boolean }>(request);
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    const clean = body.name.trim();
    if (clean.length < 3 || clean.length > 80) return badRequest("Le nom de ligue doit contenir entre 3 et 80 caractères.");
    updates.push("name = ?");
    values.push(clean);
  }

  if (body.isJoinable !== undefined) {
    updates.push("is_joinable = ?");
    values.push(body.isJoinable ? 1 : 0);
  }

  if (updates.length === 0) return badRequest("Aucun paramètre à modifier.");

  updates.push("updated_at = ?");
  values.push(nowIso(), leagueId);

  await env.DB.prepare(`UPDATE leagues SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();

  return json({ ok: true });
}

export async function regenerateLeagueCode(request: Request, env: Env, leagueId: string) {
  const admin = await requireLeagueAdmin(request, env, leagueId);
  if (admin.error) return admin.error;

  const code = await generateUniqueLeagueCode(env);
  await env.DB.prepare("UPDATE leagues SET code = ?, updated_at = ? WHERE id = ?")
    .bind(code, nowIso(), leagueId)
    .run();

  return json({ ok: true, code });
}

export async function transferLeagueAdmin(request: Request, env: Env, leagueId: string) {
  const admin = await requireLeagueAdmin(request, env, leagueId);
  if (admin.error || !admin.user) return admin.error;

  const { userId } = await readJson<{ userId?: string }>(request);
  if (!userId) return badRequest("Nouvel admin manquant.");
  if (userId === admin.user.id) return badRequest("Cet utilisateur est déjà admin de la ligue.");

  const target = await env.DB.prepare(`
    SELECT id FROM league_members
    WHERE league_id = ? AND user_id = ? AND removed_at IS NULL
  `).bind(leagueId, userId).first();

  if (!target) return badRequest("Le nouvel admin doit être un membre actif de la ligue.", 404);

  await env.DB.batch([
    env.DB.prepare("UPDATE leagues SET admin_user_id = ?, updated_at = ? WHERE id = ?")
      .bind(userId, nowIso(), leagueId),
    env.DB.prepare("UPDATE league_members SET role = 'member' WHERE league_id = ? AND user_id = ?")
      .bind(leagueId, admin.user.id),
    env.DB.prepare("UPDATE league_members SET role = 'admin' WHERE league_id = ? AND user_id = ?")
      .bind(leagueId, userId),
  ]);

  return json({ ok: true, adminUserId: userId });
}
