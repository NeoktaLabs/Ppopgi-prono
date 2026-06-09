import type { Env } from "./types";
import { nowIso } from "./utils";
import { sendEmail } from "./email";

type MissingPredictionRow = {
  user_id: string;
  email: string;
  nickname: string | null;
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

function reminderHtml(env: Env, nickname: string | null, matches: MissingPredictionRow[]) {
  const appName = env.APP_NAME || "Oddzz";
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
                <div style="font-size:13px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;color:#1fd36b;">World Cup 2026 reminder</div>
                <h1 style="margin:12px 0 0;font-size:32px;line-height:1.08;">${escapeHtml(nickname || "Hey")}, predictions close soon</h1>
                <p style="margin:14px 0 0;font-size:16px;line-height:1.55;color:#c9d8eb;">You still have ${matches.length} match${matches.length === 1 ? "" : "es"} to predict in the next 24 hours.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;">
                  ${rows}
                </table>
                <div style="text-align:center;margin-top:28px;">
                  <a href="${escapeHtml(env.APP_URL || "https://oddzz.xyz")}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#1fd36b;color:#041225;text-decoration:none;font-weight:900;">Open ${escapeHtml(appName)}</a>
                </div>
                <p style="margin:26px 0 0;font-size:12px;line-height:1.5;color:#667085;text-align:center;">
                  One daily reminder only, sent when you have missing predictions for matches starting in the next 24 hours.
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

function reminderText(env: Env, nickname: string | null, matches: MissingPredictionRow[]) {
  return [
    `${nickname || "Hey"}, predictions close soon.`,
    "",
    `You still have ${matches.length} match${matches.length === 1 ? "" : "es"} to predict in the next 24 hours:`,
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
    const subject = `${env.APP_NAME || "Oddzz"}: ${matches.length} prediction${matches.length === 1 ? "" : "s"} close soon`;

    await sendEmail(env, {
      to: first.email,
      subject,
      text: reminderText(env, first.nickname, matches),
      html: reminderHtml(env, first.nickname, matches),
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
