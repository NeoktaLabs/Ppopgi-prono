import type { Env, User } from "./types";

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

export function badRequest(error: string, status = 400) {
  return json({ error }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json().catch(() => ({}))) as T;
}

export function nowIso() {
  return new Date().toISOString();
}

export function addMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();
}

export function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  const item = cookie.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

export function sessionCookie(token: string, maxAgeSeconds: number) {
  return `session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie() {
  return "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}

export async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function randomCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return [...array].map((n) => alphabet[n % alphabet.length]).join("");
}

export async function requireUser(request: Request, env: Env): Promise<User | null> {
  const token = getCookie(request, "session");
  if (!token) return null;

  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT users.id, users.email, users.nickname, users.email_language, users.email_reminders_enabled
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(tokenHash, nowIso()).first<User>();

  if (row) {
    await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
      .bind(nowIso(), tokenHash)
      .run();
  }
  return row ?? null;
}
