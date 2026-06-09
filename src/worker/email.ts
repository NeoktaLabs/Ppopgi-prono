import type { Env } from "./types";

export async function sendEmail(env: Env, message: {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  fromName?: string;
  headers?: Record<string, string>;
}) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");

  const fromName = message.fromName ?? env.EMAIL_FROM_NAME ?? env.APP_NAME;
  const replyTo = env.EMAIL_REPLY_TO || env.EMAIL_FROM;
  const defaultHeaders = {
    "Auto-Submitted": "auto-generated",
    "X-Auto-Response-Suppress": "All",
    "List-ID": `${env.APP_NAME || "Oddzz"} <notifications.oddzz.xyz>`,
    "List-Unsubscribe": `<mailto:${replyTo}?subject=unsubscribe>`,
  };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromName ? `${fromName} <${env.EMAIL_FROM}>` : env.EMAIL_FROM,
      to: Array.isArray(message.to) ? message.to : [message.to],
      reply_to: replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: { ...defaultHeaders, ...(message.headers ?? {}) },
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend email failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}
