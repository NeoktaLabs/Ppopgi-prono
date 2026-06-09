import type { Env } from "./types";
import { json, nowIso } from "./utils";
import { sendEmail } from "./email";

type MissingPredictionRow = {
  user_id: string;
  email: string;
  nickname: string | null;
  email_language: "en" | "fr" | null;
  match_id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  stage: string | null;
  venue: string | null;
};

const LIVE_STATUSES = ["live", "in_play", "1h", "2h", "ht", "et", "bt", "p", "penalties", "extra_time"];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reminderDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function reminderCopy(language: "en" | "fr", count: number) {
  return language === "fr"
    ? {
      eyebrow: "Rappel Coupe du Monde 2026",
      title: (nickname: string | null) => `${nickname || "Salut"}, tes pronos ferment bientôt`,
      intro: `Il te reste ${count} match${count === 1 ? "" : "s"} à pronostiquer dans les prochaines 24 heures.`,
      cta: "Ouvrir Oddzz",
      footer: "Un seul rappel quotidien, envoyé uniquement s'il te manque des pronostics pour les matchs des prochaines 24 heures.",
      textTitle: (nickname: string | null) => `${nickname || "Salut"}, tes pronos ferment bientôt.`,
      textIntro: `Il te reste ${count} match${count === 1 ? "" : "s"} à pronostiquer dans les prochaines 24 heures :`,
      subject: `${count} prono${count === 1 ? "" : "s"} à faire bientôt`,
    }
    : {
      eyebrow: "World Cup 2026 reminder",
      title: (nickname: string | null) => `${nickname || "Hey"}, predictions close soon`,
      intro: `You still have ${count} match${count === 1 ? "" : "es"} to predict in the next 24 hours.`,
      cta: "Open Oddzz",
      footer: "One daily reminder only, sent when you have missing predictions for matches starting in the next 24 hours.",
      textTitle: (nickname: string | null) => `${nickname || "Hey"}, predictions close soon.`,
      textIntro: `You still have ${count} match${count === 1 ? "" : "es"} to predict in the next 24 hours:`,
      subject: `${count} prediction${count === 1 ? "" : "s"} close soon`,
    };
}

function reminderHtml(env: Env, nickname: string | null, matches: MissingPredictionRow[], language: "en" | "fr") {
  const copy = reminderCopy(language, matches.length);
  const rows = matches.map((match) => `
    <tr>
      <td style="padding:14px 16px;border-radius:16px;background:#f4f8ff;">
        <div style="font-size:16px;font-weight:900;color:#091833;">${escapeHtml(match.home_team)} vs ${escapeHtml(match.away_team)}</div>
        <div style="margin-top:5px;font-size:13px;line-height:1.45;color:#53627a;">${escapeHtml(formatKickoff(match.kickoff_at))}${match.stage ? ` &bull; ${escapeHtml(match.stage)}` : ""}${match.venue ? ` &bull; ${escapeHtml(match.venue)}` : ""}</div>
      </td>
    </tr>`).join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f8ff;font-family:Arial,Helvetica,sans-serif;color:#091833;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f8ff;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:26px;border:1px solid #d7e2f0;overflow:hidden;box-shadow:0 18px 44px rgba(6,23,53,0.10);">
            <tr>
              <td style="padding:32px 30px 24px;background:#061735;color:#ffffff;">
                <div style="font-size:13px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;color:#1fd36b;">${escapeHtml(copy.eyebrow)}</div>
                <h1 style="margin:12px 0 0;font-size:32px;line-height:1.08;">${escapeHtml(copy.title(nickname))}</h1>
                <p style="margin:14px 0 0;font-size:16px;line-height:1.55;color:#c9d8eb;">${escapeHtml(copy.intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;">
                  ${rows}
                </table>
                <div style="text-align:center;margin-top:28px;">
                  <a href="${escapeHtml(env.APP_URL || "https://oddzz.xyz")}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#1fd36b;color:#041225;text-decoration:none;font-weight:900;">${escapeHtml(copy.cta)}</a>
                </div>
                <p style="margin:26px 0 0;font-size:12px;line-height:1.5;color:#667085;text-align:center;">
                  ${escapeHtml(copy.footer)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function reminderText(env: Env, nickname: string | null, matches: MissingPredictionRow[], language: "en" | "fr") {
  const copy = reminderCopy(language, matches.length);
  return [
    copy.textTitle(nickname),
    "",
    copy.textIntro,
    "",
    ...matches.map((match) => `- ${match.home_team} vs ${match.away_team} - ${formatKickoff(match.kickoff_at)}${match.stage ? ` - ${match.stage}` : ""}${match.venue ? ` - ${match.venue}` : ""}`),
    "",
    `Open ${env.APP_NAME || "Oddzz"}: ${env.APP_URL || "https://oddzz.xyz"}`,
  ].join("\n");
}

export async function sendDailyPredictionReminders(env: Env, now = new Date()) {
  if (!env.RESEND_API_KEY) {
    console.warn("Prediction reminders skipped: RESEND_API_KEY is not configured.");
    return { ok: false, sent: 0, skipped: "missing_resend_key" };
  }

  const start = now.toISOString();
  const end = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
  const today = reminderDate(now);

  const rows = await env.DB.prepare(`
    SELECT
      users.id AS user_id,
      users.email,
      users.nickname,
      users.email_language,
      matches.id AS match_id,
      matches.home_team,
      matches.away_team,
      matches.kickoff_at,
      matches.stage,
      matches.venue
    FROM users
    JOIN matches
      ON matches.kickoff_at > ?
      AND matches.kickoff_at <= ?
      AND LOWER(matches.status) NOT IN (${LIVE_STATUSES.map(() => "?").join(", ")})
      AND matches.final_home IS NULL
      AND matches.manual_final_home IS NULL
    LEFT JOIN predictions
      ON predictions.user_id = users.id
      AND predictions.match_id = matches.id
    LEFT JOIN prediction_reminder_emails sent
      ON sent.user_id = users.id
      AND sent.reminder_date = ?
    WHERE users.nickname IS NOT NULL
      AND users.email_reminders_enabled = 1
      AND predictions.id IS NULL
      AND sent.id IS NULL
    ORDER BY users.id, matches.kickoff_at ASC
  `).bind(start, end, ...LIVE_STATUSES, today).all<MissingPredictionRow>();

  const byUser = new Map<string, MissingPredictionRow[]>();
  for (const row of rows.results ?? []) {
    const existing = byUser.get(row.user_id) ?? [];
    existing.push(row);
    byUser.set(row.user_id, existing);
  }

  let sent = 0;
  for (const matches of byUser.values()) {
    const first = matches[0];
    const matchIds = matches.map((match) => match.match_id);
    const language = first.email_language === "fr" ? "fr" : "en";
    const subject = `${env.APP_NAME || "Oddzz"}: ${reminderCopy(language, matches.length).subject}`;

    await sendEmail(env, {
      to: first.email,
      subject,
      text: reminderText(env, first.nickname, matches, language),
      html: reminderHtml(env, first.nickname, matches, language),
      fromName: "Oddzz",
      headers: {
        "List-Unsubscribe": `<mailto:${env.EMAIL_REPLY_TO || env.EMAIL_FROM}?subject=unsubscribe>`,
      },
    });

    await env.DB.prepare(`
      INSERT INTO prediction_reminder_emails (id, user_id, reminder_date, match_ids, sent_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), first.user_id, today, JSON.stringify(matchIds), nowIso()).run();
    sent += 1;
  }

  return { ok: true, sent, missing_predictions: rows.results?.length ?? 0 };
}

async function previewMatches(env: Env) {
  const rows = await env.DB.prepare(`
    SELECT
      '' AS user_id,
      '' AS email,
      NULL AS nickname,
      NULL AS email_language,
      id AS match_id,
      home_team,
      away_team,
      kickoff_at,
      stage,
      venue
    FROM matches
    WHERE kickoff_at > ?
      AND LOWER(status) NOT IN (${LIVE_STATUSES.map(() => "?").join(", ")})
      AND final_home IS NULL
      AND manual_final_home IS NULL
    ORDER BY kickoff_at ASC
    LIMIT 3
  `).bind(new Date().toISOString(), ...LIVE_STATUSES).all<MissingPredictionRow>();

  if (rows.results?.length) return rows.results;

  const now = Date.now();
  return [
    {
      user_id: "",
      email: "",
      nickname: null,
      email_language: null,
      match_id: "preview-1",
      home_team: "Mexico",
      away_team: "South Africa",
      kickoff_at: new Date(now + 4 * 60 * 60_000).toISOString(),
      stage: "Group Stage - 1",
      venue: "Estadio Banorte, Mexico City",
    },
    {
      user_id: "",
      email: "",
      nickname: null,
      email_language: null,
      match_id: "preview-2",
      home_team: "Canada",
      away_team: "Bosnia & Herzegovina",
      kickoff_at: new Date(now + 9 * 60 * 60_000).toISOString(),
      stage: "Group Stage - 1",
      venue: "BC Place, Vancouver",
    },
  ];
}

export async function sendPredictionReminderPreviewEmail(request: Request, env: Env) {
  const body = await request.json().catch(() => ({})) as { to?: string; language?: "en" | "fr" };
  const to = body.to?.trim() || "labs@neokta.com";
  const matches = await previewMatches(env);
  const language = body.language === "fr" ? "fr" : "en";
  const subject = `${env.APP_NAME || "Oddzz"}: ${language === "fr" ? "aperçu du rappel pronostics" : "prediction reminder preview"}`;

  try {
    const resend = await sendEmail(env, {
      to,
      subject,
      text: reminderText(env, "Julien", matches, language),
      html: reminderHtml(env, "Julien", matches, language),
      fromName: "Oddzz",
      headers: {
        "List-Unsubscribe": `<mailto:${env.EMAIL_REPLY_TO || env.EMAIL_FROM}?subject=unsubscribe>`,
      },
    });
    return json({ ok: true, to, matches: matches.length, resend });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Resend failed." }, { status: 502 });
  }
}
