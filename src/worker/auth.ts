import type { Env, User } from "./types";
import { addDays, addMinutes, clearSessionCookie, json, nowIso, randomToken, readJson, sessionCookie, sha256 } from "./utils";

type MagicLinkRequest = {
  email?: string;
  turnstileToken?: string;
};

function hasGatewayCookie(request: Request) {
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie.split(";").some((part) => part.trim() === "turnstile_gateway=1");
}

async function verifyTurnstile(request: Request, env: Env, token?: string) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (hasGatewayCookie(request)) return true;
  if (!token) return false;

  const formData = new FormData();
  formData.append("secret", env.TURNSTILE_SECRET_KEY);
  formData.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) formData.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });
  const result = await response.json().catch(() => ({ success: false })) as { success?: boolean };
  return result.success === true;
}


export async function verifyGatewayTurnstile(request: Request, env: Env) {
  const { turnstileToken } = await readJson<MagicLinkRequest>(request);
  if (!(await verifyTurnstile(request, env, turnstileToken))) {
    return json({ error: "Captcha verification failed." }, { status: 403 });
  }

  return json({ ok: true }, {
    headers: {
      "Set-Cookie": "turnstile_gateway=1; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax",
    },
  });
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function requestMagicLink(request: Request, env: Env) {
  const { email, turnstileToken } = await readJson<MagicLinkRequest>(request);
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return json({ error: "Invalid email address." }, { status: 400 });
  }

  if (!(await verifyTurnstile(request, env, turnstileToken))) {
    return json({ error: "Captcha verification failed." }, { status: 403 });
  }

  const recent = await env.DB.prepare(`
    SELECT id FROM magic_links WHERE email = ? AND created_at > ?
  `).bind(normalizedEmail, new Date(Date.now() - 60_000).toISOString()).first();

  if (recent) {
    return json({ error: "A magic link was already sent. Try again in one minute." }, { status: 429 });
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = addMinutes(Number(env.MAGIC_LINK_MINUTES || 15));

  await env.DB.prepare(`
    INSERT INTO magic_links (id, email, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), normalizedEmail, tokenHash, expiresAt, nowIso()).run();

  const verifyUrl = `${env.APP_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;

  try {
    await sendMagicLinkEmail(env, normalizedEmail, verifyUrl);
  } catch (error) {
    console.error("Magic link email failed", { to: normalizedEmail, error: errorMessage(error) });
    return json({ error: "Magic link email failed. Check Worker logs and Cloudflare Email sender configuration." }, { status: 502 });
  }

  return json({ ok: true });
}

async function sendMagicLinkEmail(env: Env, to: string, url: string) {
  const subject = `${env.APP_NAME}: your login link`;
  const text = `Click this link to sign in to ${env.APP_NAME}: ${url}\n\nThis link expires soon and can only be used once.`;

  if (!env.EMAIL?.send) {
    throw new Error("Cloudflare Email binding EMAIL is not configured.");
  }

  await env.EMAIL.send({
    from: {
      email: env.EMAIL_FROM,
      name: env.EMAIL_FROM_NAME || env.APP_NAME,
    },
    to,
    replyTo: env.EMAIL_REPLY_TO || env.EMAIL_FROM,
    subject,
    text,
  });
}

export async function verifyMagicLink(request: Request, env: Env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return json({ error: "Missing token." }, { status: 400 });

  const tokenHash = await sha256(token);
  const link = await env.DB.prepare(`
    SELECT id, email FROM magic_links
    WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
  `).bind(tokenHash, nowIso()).first<{ id: string; email: string }>();

  if (!link) return json({ error: "Invalid or expired link." }, { status: 400 });

  await env.DB.prepare("UPDATE magic_links SET used_at = ? WHERE id = ?")
    .bind(nowIso(), link.id)
    .run();

  let user = await env.DB.prepare("SELECT id, email, nickname FROM users WHERE email = ?")
    .bind(link.email)
    .first<User>();

  if (!user) {
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO users (id, email, nickname, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?)
    `).bind(id, link.email, nowIso(), nowIso()).run();

    user = { id, email: link.email, nickname: null };
  }

  const sessionToken = randomToken();
  const sessionHash = await sha256(sessionToken);
  const sessionDays = Number(env.SESSION_DAYS || 90);

  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    user.id,
    sessionHash,
    addDays(sessionDays),
    nowIso(),
    nowIso(),
    request.headers.get("User-Agent"),
    await sha256(request.headers.get("CF-Connecting-IP") ?? "unknown"),
  ).run();

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": sessionCookie(sessionToken, sessionDays * 24 * 60 * 60),
    },
  });
}

export async function logout(request: Request, env: Env) {
  const cookie = request.headers.get("Cookie") ?? "";
  const token = cookie.split(";").map((v) => v.trim()).find((v) => v.startsWith("session="))?.slice(8);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(decodeURIComponent(token))).run();
  }
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
