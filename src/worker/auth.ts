import type { Env, User } from "./types";
import { addDays, addMinutes, clearSessionCookie, json, nowIso, randomToken, readJson, sessionCookie, sha256 } from "./utils";

type MagicLinkRequest = {
  email?: string;
  turnstileToken?: string;
};

function localDevRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local");
}

function devSessionCookie(token: string, maxAgeSeconds: number) {
  return `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

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

async function findOrCreateUser(env: Env, email: string, nickname?: string | null) {
  let user = await env.DB.prepare("SELECT id, email, nickname FROM users WHERE email = ?")
    .bind(email)
    .first<User>();

  if (!user) {
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO users (id, email, nickname, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, email, nickname ?? null, nowIso(), nowIso()).run();

    user = { id, email, nickname: nickname ?? null };
  } else if (!user.nickname && nickname) {
    await env.DB.prepare("UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?")
      .bind(nickname, nowIso(), user.id)
      .run();
    user = { ...user, nickname };
  }

  return user;
}

async function createSession(request: Request, env: Env, userId: string) {
  const sessionToken = randomToken();
  const sessionHash = await sha256(sessionToken);
  const sessionDays = Number(env.SESSION_DAYS || 90);

  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    sessionHash,
    addDays(sessionDays),
    nowIso(),
    nowIso(),
    request.headers.get("User-Agent"),
    await sha256(request.headers.get("CF-Connecting-IP") ?? "unknown"),
  ).run();

  return { sessionToken, sessionDays };
}

export async function requestMagicLink(request: Request, env: Env) {
  const { email, turnstileToken } = await readJson<MagicLinkRequest>(request);
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
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
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f8ff;font-family:Arial,Helvetica,sans-serif;color:#091833;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f8ff;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:22px;border:1px solid #d7e2f0;overflow:hidden;box-shadow:0 18px 44px rgba(6,23,53,0.10);">
            <tr>
              <td style="padding:30px 28px 22px;text-align:center;background:#061735;color:#ffffff;">
                <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ff8b98;">World Cup 2026 predictions</div>
                <h1 style="margin:12px 0 0;font-size:32px;line-height:1.05;">Sign in to ${env.APP_NAME}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;text-align:center;">
                <p style="margin:0 0 22px;font-size:16px;line-height:1.55;color:#53627a;">Use this secure magic link to continue. It expires soon and can only be used once.</p>
                <a href="${url}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#1fd36b;color:#041225;text-decoration:none;font-weight:800;">Open ${env.APP_NAME}</a>
                <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#667085;">If the button does not work, paste this link into your browser:<br><a href="${url}" style="color:#0f9f50;word-break:break-all;">${url}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  if (!env.EMAIL?.send) {
    throw new Error("Cloudflare Email binding EMAIL is not configured.");
  }

  const message = {
    from: {
      email: env.EMAIL_FROM,
      name: env.EMAIL_FROM_NAME || env.APP_NAME,
    },
    to,
    replyTo: env.EMAIL_REPLY_TO || env.EMAIL_FROM,
    subject,
    text,
  };

  try {
    await env.EMAIL.send({ ...message, html });
  } catch (error) {
    console.error("HTML magic link email failed, retrying text-only", { to, error: errorMessage(error) });
    await env.EMAIL.send(message);
  }
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

  const user = await findOrCreateUser(env, link.email);
  const { sessionToken, sessionDays } = await createSession(request, env, user.id);

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": sessionCookie(sessionToken, sessionDays * 24 * 60 * 60),
    },
  });
}

export async function devLogin(request: Request, env: Env) {
  if (env.DEV_AUTH_BYPASS !== "1" || !localDevRequest(request)) {
    return json({ error: "Dev auth bypass is disabled." }, { status: 404 });
  }

  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return json({ error: "Missing or invalid email. Use /api/dev/login?email=name@example.com" }, { status: 400 });
  }

  const nicknameParam = url.searchParams.get("nickname")?.trim();
  const fallbackNickname = email.split("@")[0].replace(/[^a-z0-9_-]/gi, "").slice(0, 15) || "Codex";
  const nickname = (nicknameParam || fallbackNickname).slice(0, 15);
  const user = await findOrCreateUser(env, email, nickname);
  const { sessionToken, sessionDays } = await createSession(request, env, user.id);

  const leagueParam = url.searchParams.get("league")?.trim();
  let leagueId: string | null = null;
  if (leagueParam) {
    const league = await env.DB.prepare("SELECT id FROM leagues WHERE id = ? OR code = ?")
      .bind(leagueParam, leagueParam.toUpperCase())
      .first<{ id: string }>();

    if (league) {
      leagueId = league.id;
      await env.DB.prepare(`
        INSERT INTO league_members (id, league_id, user_id, role, joined_at)
        VALUES (?, ?, ?, 'member', ?)
        ON CONFLICT(league_id, user_id) DO UPDATE SET removed_at = NULL, removed_by_user_id = NULL
      `).bind(crypto.randomUUID(), league.id, user.id, nowIso()).run();
    }
  }

  const redirectUrl = new URL("/", url.origin);
  redirectUrl.searchParams.set("devAuth", "1");
  if (leagueId) redirectUrl.searchParams.set("devLeagueId", leagueId);

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${redirectUrl.pathname}${redirectUrl.search}`,
      "Set-Cookie": devSessionCookie(sessionToken, sessionDays * 24 * 60 * 60),
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
