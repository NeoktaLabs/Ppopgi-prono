import type { Env } from "./types";
import { json } from "./utils";

function digestHtml(appName: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f8ff;font-family:Arial,Helvetica,sans-serif;color:#091833;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f8ff;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:26px;border:1px solid #d7e2f0;overflow:hidden;box-shadow:0 18px 44px rgba(6,23,53,0.10);">
            <tr>
              <td style="padding:32px 30px 24px;background:#061735;color:#ffffff;">
                <div style="font-size:13px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;color:#1fd36b;">World Cup 2026 league update</div>
                <h1 style="margin:12px 0 0;font-size:34px;line-height:1.05;">Your Oddzz daily summary</h1>
                <p style="margin:14px 0 0;font-size:16px;line-height:1.55;color:#c9d8eb;">A preview of the optional match-day digest for your leagues.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px;">
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#334155;">
                  JGA Admin remains first in BFleXion league after yesterday's games, while Julien Garin made the biggest move with an exact 2-1 prediction on Mexico vs South Africa. FKU slipped two places after missing the Canada fixture, and OddzzAI stayed in the race with a correct result. In the global leaderboard, 12characters moved into the top 10.
                </p>

                <h2 style="margin:24px 0 12px;font-size:20px;color:#091833;">Yesterday's scores</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 8px;">
                  <tr>
                    <td style="padding:12px 14px;border-radius:14px;background:#f4f8ff;font-weight:800;">Mexico 2-1 South Africa</td>
                    <td align="right" style="padding:12px 14px;border-radius:14px;background:#f4f8ff;color:#53627a;">3 exact scores</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 14px;border-radius:14px;background:#f4f8ff;font-weight:800;">Canada 1-1 Bosnia & Herzegovina</td>
                    <td align="right" style="padding:12px 14px;border-radius:14px;background:#f4f8ff;color:#53627a;">6 correct results</td>
                  </tr>
                </table>

                <h2 style="margin:24px 0 12px;font-size:20px;color:#091833;">League movement</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 8px;">
                  <tr>
                    <td style="padding:12px 14px;border-radius:14px;background:#ecfdf3;font-weight:800;">Julien Garin</td>
                    <td align="right" style="padding:12px 14px;border-radius:14px;background:#ecfdf3;color:#067647;font-weight:800;">+3 places</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 14px;border-radius:14px;background:#fff1f3;font-weight:800;">FKU</td>
                    <td align="right" style="padding:12px 14px;border-radius:14px;background:#fff1f3;color:#b4232c;font-weight:800;">-2 places</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 14px;border-radius:14px;background:#f4f8ff;font-weight:800;">JGA Admin</td>
                    <td align="right" style="padding:12px 14px;border-radius:14px;background:#f4f8ff;color:#53627a;font-weight:800;">Still #1</td>
                  </tr>
                </table>

                <h2 style="margin:24px 0 12px;font-size:20px;color:#091833;">Today's reminder</h2>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#53627a;">Three matches close today. You still have two predictions missing, including Portugal vs Uzbekistan.</p>

                <div style="text-align:center;margin-top:28px;">
                  <a href="https://oddzz.xyz" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#1fd36b;color:#041225;text-decoration:none;font-weight:900;">Open ${appName}</a>
                </div>
                <p style="margin:26px 0 0;font-size:12px;line-height:1.5;color:#667085;text-align:center;">
                  This is a preview email sent to a site administrator. Future digests should be optional and configurable from your Oddzz profile.
                  <br><a href="https://oddzz.xyz" style="color:#0f9f50;">Manage email preferences</a>
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

export async function sendDigestPreviewEmail(request: Request, env: Env) {
  const body = await request.json().catch(() => ({})) as { to?: string };
  const to = body.to?.trim() || "labs@neokta.com";
  const appName = env.APP_NAME || "Oddzz";
  const subject = `${appName}: daily digest preview`;
  const text = [
    "Your Oddzz daily summary.",
    "",
    "JGA Admin remains first in BFleXion league. Julien Garin climbed 3 places with an exact score on Mexico vs South Africa. FKU moved down after missing the Canada fixture.",
    "",
    "Yesterday: Mexico 2-1 South Africa; Canada 1-1 Bosnia & Herzegovina.",
    "Today: three matches close soon. Two predictions are still missing.",
    "",
    "This is a preview email sent to a site administrator. Future digests should be optional and configurable from your Oddzz profile.",
  ].join("\n");

  if (!env.RESEND_API_KEY) return json({ error: "RESEND_API_KEY is not configured." }, { status: 503 });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Oddzz <${env.EMAIL_FROM}>`,
      to: [to],
      reply_to: env.EMAIL_REPLY_TO || env.EMAIL_FROM,
      subject,
      text,
      html: digestHtml(appName),
      headers: {
        "List-Unsubscribe": `<mailto:${env.EMAIL_REPLY_TO || env.EMAIL_FROM}?subject=unsubscribe>`,
      },
    }),
  });

  const payload = await response.text();
  if (!response.ok) return json({ error: `Resend failed (${response.status})`, details: payload }, { status: 502 });
  return json({ ok: true, to, resend: JSON.parse(payload) });
}
