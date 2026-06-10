import type { Env } from "./types";
import { sendEmail } from "./email";
import { json, nowIso, readJson } from "./utils";

type KickoffEmailUser = {
  id: string;
  email: string;
  nickname: string | null;
  email_language: "en" | "fr" | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function kickoffCopy(language: "en" | "fr", nickname: string | null, appName: string) {
  return language === "fr"
    ? {
      subject: `La Coupe du Monde commence sur ${appName}`,
      eyebrow: "Coup d'envoi Coupe du Monde 2026",
      title: `${nickname || "Salut"}, merci d'avoir rejoint ${appName}`,
      intro: "Petit message avant que le jeu commence vraiment. Au départ, Oddzz n'était pas prévu pour devenir un site public : c'était surtout un projet perso, une façon de m'amuser, de découvrir ce qu'on peut construire avec l'IA, et de recréer un jeu de pronos simple, sans pubs partout.",
      body: `Maintenant que la Coupe du Monde démarre, j'espère surtout que ${appName} vous donnera une bonne excuse pour chambrer gentiment vos collègues, vos amis ou votre famille, tenter quelques scores osés, et suivre le classement avec un peu trop de sérieux.`,
      invite: "Si tu veux agrandir ta ligue, c'est encore le bon moment pour partager ton code et inviter d'autres joueurs avant les premiers matchs.",
      cta: `Ouvrir ${appName}`,
      footer: "Merci d'être là, et bons pronos.",
      text: [
        `${nickname || "Salut"}, merci d'avoir rejoint ${appName}.`,
        "",
        "Petit message avant que le jeu commence vraiment. Au départ, Oddzz n'était pas prévu pour devenir un site public : c'était surtout un projet perso, une façon de m'amuser, de découvrir ce qu'on peut construire avec l'IA, et de recréer un jeu de pronos simple, sans pubs partout.",
        "",
        `Maintenant que la Coupe du Monde démarre, j'espère surtout que ${appName} vous donnera une bonne excuse pour chambrer gentiment vos collègues, vos amis ou votre famille, tenter quelques scores osés, et suivre le classement avec un peu trop de sérieux.`,
        "",
        "Si tu veux agrandir ta ligue, c'est encore le bon moment pour partager ton code et inviter d'autres joueurs avant les premiers matchs.",
        "",
        "Merci d'être là, et bons pronos.",
      ].join("\n"),
    }
    : {
      subject: `The World Cup is starting on ${appName}`,
      eyebrow: "World Cup 2026 kickoff",
      title: `${nickname || "Hey"}, thanks for joining ${appName}`,
      intro: "A quick note before the game really begins. Oddzz was not meant to become a public website at first: it started as a personal project, a way to have fun, explore what AI-assisted coding can do, and rebuild a simple prediction game without ads everywhere.",
      body: `Now that the World Cup is starting, I mostly hope ${appName} gives you a good reason to tease your friends, colleagues, or family, try a few brave scorelines, and follow the leaderboard with just the right amount of drama.`,
      invite: "If you want to grow your league, this is still a good time to share your code and invite more players before the first matches.",
      cta: `Open ${appName}`,
      footer: "Thanks for being here, and good luck with your predictions.",
      text: [
        `${nickname || "Hey"}, thanks for joining ${appName}.`,
        "",
        "A quick note before the game really begins. Oddzz was not meant to become a public website at first: it started as a personal project, a way to have fun, explore what AI-assisted coding can do, and rebuild a simple prediction game without ads everywhere.",
        "",
        `Now that the World Cup is starting, I mostly hope ${appName} gives you a good reason to tease your friends, colleagues, or family, try a few brave scorelines, and follow the leaderboard with just the right amount of drama.`,
        "",
        "If you want to grow your league, this is still a good time to share your code and invite more players before the first matches.",
        "",
        "Thanks for being here, and good luck with your predictions.",
      ].join("\n"),
    };
}

function kickoffHtml(env: Env, user: KickoffEmailUser, language: "en" | "fr") {
  const appName = env.APP_NAME || "Oddzz";
  const copy = kickoffCopy(language, user.nickname, appName);
  const appUrl = env.APP_URL || "https://oddzz.xyz";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#fff7ed;font-family:Arial,Helvetica,sans-serif;color:#091833;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff7ed;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:26px;border:1px solid #f0dfcf;overflow:hidden;box-shadow:0 18px 44px rgba(92,64,42,0.10);">
            <tr>
              <td style="padding:34px 30px 28px;background:#061735;color:#ffffff;">
                <div style="font-size:13px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;color:#1fd36b;">${escapeHtml(copy.eyebrow)}</div>
                <h1 style="margin:12px 0 0;font-size:31px;line-height:1.08;">${escapeHtml(copy.title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#344054;">${escapeHtml(copy.intro)}</p>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#344054;">${escapeHtml(copy.body)}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;border-collapse:collapse;">
                  <tr>
                    <td style="padding:18px 20px;border-radius:18px;background:#f4f8ff;border:1px solid #d7e2f0;color:#091833;font-size:16px;line-height:1.55;font-weight:800;">
                      ${escapeHtml(copy.invite)}
                    </td>
                  </tr>
                </table>
                <div style="text-align:center;margin:28px 0 22px;">
                  <a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#1fd36b;color:#041225;text-decoration:none;font-weight:900;">${escapeHtml(copy.cta)}</a>
                </div>
                <p style="margin:0;font-size:14px;line-height:1.55;color:#667085;text-align:center;">${escapeHtml(copy.footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function kickoffText(env: Env, user: KickoffEmailUser, language: "en" | "fr") {
  const appName = env.APP_NAME || "Oddzz";
  const appUrl = env.APP_URL || "https://oddzz.xyz";
  const copy = kickoffCopy(language, user.nickname, appName);
  return `${copy.text}\n\n${copy.cta}: ${appUrl}`;
}

export async function sendKickoffEmailToUser(env: Env, user: KickoffEmailUser) {
  if (!env.RESEND_API_KEY) {
    console.warn("Kickoff email skipped: RESEND_API_KEY is not configured.");
    return { ok: false, skipped: "missing_resend_key" };
  }

  const existing = await env.DB.prepare("SELECT id FROM kickoff_emails WHERE user_id = ?")
    .bind(user.id)
    .first<{ id: string }>();
  if (existing) return { ok: true, skipped: "already_sent" };

  const language = user.email_language === "fr" ? "fr" : "en";
  const copy = kickoffCopy(language, user.nickname, env.APP_NAME || "Oddzz");

  await sendEmail(env, {
    to: user.email,
    subject: copy.subject,
    text: kickoffText(env, user, language),
    html: kickoffHtml(env, user, language),
    fromName: "Oddzz",
  });

  await env.DB.prepare(`
    INSERT INTO kickoff_emails (id, user_id, sent_at, language)
    VALUES (?, ?, ?, ?)
  `).bind(crypto.randomUUID(), user.id, nowIso(), language).run();

  return { ok: true, sent: true };
}

export async function sendPendingKickoffEmails(env: Env, limit = 200) {
  const rows = await env.DB.prepare(`
    SELECT users.id, users.email, users.nickname, users.email_language
    FROM users
    LEFT JOIN kickoff_emails sent ON sent.user_id = users.id
    WHERE users.nickname IS NOT NULL
      AND sent.id IS NULL
    ORDER BY users.created_at ASC
    LIMIT ?
  `).bind(limit).all<KickoffEmailUser>();

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ user_id: string; error: string }> = [];

  for (const user of rows.results ?? []) {
    try {
      const result = await sendKickoffEmailToUser(env, user);
      if ("sent" in result && result.sent) sent += 1;
      else skipped += 1;
    } catch (error) {
      errors.push({ user_id: user.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { ok: errors.length === 0, sent, skipped, errors, considered: rows.results?.length ?? 0 };
}

export async function sendKickoffPreviewEmail(request: Request, env: Env) {
  const body = await readJson<{ to?: string; language?: "en" | "fr"; nickname?: string }>(request);
  const to = body.to?.trim() || "labs@neokta.com";
  const language = body.language === "fr" ? "fr" : "en";
  const user: KickoffEmailUser = {
    id: "preview",
    email: to,
    nickname: body.nickname?.trim() || "Julien",
    email_language: language,
  };
  const copy = kickoffCopy(language, user.nickname, env.APP_NAME || "Oddzz");

  try {
    const resend = await sendEmail(env, {
      to,
      subject: `${copy.subject} preview`,
      text: kickoffText(env, user, language),
      html: kickoffHtml(env, user, language),
      fromName: "Oddzz",
    });
    return json({ ok: true, to, language, resend });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Resend failed." }, { status: 502 });
  }
}
