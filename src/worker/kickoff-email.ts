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
      subject: `${appName} - Que la Coupe du Monde commence !`,
      eyebrow: "Coup d'envoi Coupe du Monde 2026",
      title: "Que la Coupe du Monde commence !",
      greeting: "Bonjour à tous,",
      paragraphs: [
        `Alors que la Coupe du Monde commence ce soir, je voulais prendre un moment pour vous remercier d'avoir rejoint ${appName}.`,
        `Pour être honnête, ${appName} n'était pas censé devenir un “vrai” projet. Il y a quelques mois, je l'ai commencé surtout par curiosité. Je voulais découvrir ce qu'il était possible de construire avec des outils de code assisté par IA, malgré mon expérience limitée en développement.`,
        "Ce qui n'était au départ qu'une simple expérimentation s'est peu à peu transformé en quelque chose de plus grand : une plateforme de pronostics où amis, familles et collègues peuvent s'affronter, comparer leurs classements, créer des ligues privées et vivre le tournoi ensemble.",
        "L'un des aspects les plus amusants a aussi été de créer OddzzAI : un petit adversaire virtuel qui analyse les données disponibles, propose ses propres pronostics et se glisse dans les classements comme un joueur à battre.",
        "Aujourd'hui, nous sommes presque 50 joueurs, bien plus que ce que j'imaginais lorsque j'ai écrit les premiers prompts. Voir des personnes s'inscrire, créer des ligues et commencer à faire leurs pronostics a été incroyablement motivant. Plus que tout, cela m'a montré à quel point l'IA peut ouvrir de nouvelles portes et permettre de transformer des idées en réalité beaucoup plus vite qu'avant.",
        "Alors merci de faire partie de cette aventure, et merci d'avoir fait suffisamment confiance à ce petit projet pour l'essayer.",
        "Comme pour tout nouveau projet, il peut encore y avoir quelques bugs, petits soucis ou surprises inattendues en chemin. Si quelque chose ne fonctionne pas comme prévu, dites-le-moi. Je suis pleinement engagé à corriger rapidement les problèmes et à améliorer la plateforme tout au long du tournoi.",
        "Mais assez parlé de technologie : la Coupe du Monde est enfin là !",
        "Bonne chance pour vos pronostics, profitez bien des matchs, n'oubliez pas d'enregistrer vos scores avant le coup d'envoi, et que le meilleur pronostiqueur gagne.",
        "Rendez-vous sur le classement !",
        "Julien",
      ],
      cta: `Ouvrir ${appName}`,
      text: [
        "Bonjour à tous,",
        "",
        `Alors que la Coupe du Monde commence ce soir, je voulais prendre un moment pour vous remercier d'avoir rejoint ${appName}.`,
        "",
        `Pour être honnête, ${appName} n'était pas censé devenir un “vrai” projet. Il y a quelques mois, je l'ai commencé surtout par curiosité. Je voulais découvrir ce qu'il était possible de construire avec des outils de code assisté par IA, malgré mon expérience limitée en développement.`,
        "",
        "Ce qui n'était au départ qu'une simple expérimentation s'est peu à peu transformé en quelque chose de plus grand : une plateforme de pronostics où amis, familles et collègues peuvent s'affronter, comparer leurs classements, créer des ligues privées et vivre le tournoi ensemble.",
        "",
        "L'un des aspects les plus amusants a aussi été de créer OddzzAI : un petit adversaire virtuel qui analyse les données disponibles, propose ses propres pronostics et se glisse dans les classements comme un joueur à battre.",
        "",
        "Aujourd'hui, nous sommes presque 50 joueurs, bien plus que ce que j'imaginais lorsque j'ai écrit les premiers prompts. Voir des personnes s'inscrire, créer des ligues et commencer à faire leurs pronostics a été incroyablement motivant. Plus que tout, cela m'a montré à quel point l'IA peut ouvrir de nouvelles portes et permettre de transformer des idées en réalité beaucoup plus vite qu'avant.",
        "",
        "Alors merci de faire partie de cette aventure, et merci d'avoir fait suffisamment confiance à ce petit projet pour l'essayer.",
        "",
        "Comme pour tout nouveau projet, il peut encore y avoir quelques bugs, petits soucis ou surprises inattendues en chemin. Si quelque chose ne fonctionne pas comme prévu, dites-le-moi. Je suis pleinement engagé à corriger rapidement les problèmes et à améliorer la plateforme tout au long du tournoi.",
        "",
        "Mais assez parlé de technologie : la Coupe du Monde est enfin là !",
        "",
        "Bonne chance pour vos pronostics, profitez bien des matchs, n'oubliez pas d'enregistrer vos scores avant le coup d'envoi, et que le meilleur pronostiqueur gagne.",
        "",
        "Rendez-vous sur le classement !",
        "",
        "Julien",
      ].join("\n"),
    }
    : {
      subject: `${appName} - Let the World Cup Begin!`,
      eyebrow: "World Cup 2026 kickoff",
      title: "Let the World Cup Begin!",
      greeting: "Hello everyone,",
      paragraphs: [
        `With the World Cup kicking off this evening, I wanted to take a moment to thank all of you for joining ${appName}.`,
        `${appName} was never supposed to become a “real” project. A few months ago, I started it mostly out of curiosity. I wanted to discover what could be built with the help of AI coding tools, despite having limited coding experience myself.`,
        "What began as a simple experiment gradually turned into something bigger: a prediction platform where friends, family, and colleagues can compete, compare rankings, create private leagues, and enjoy the tournament together.",
        "One of the most fun parts was creating OddzzAI too: a small virtual opponent that looks at the available data, makes its own predictions, and joins the leaderboards as another player to beat.",
        "Today, we are almost 50 players, which is far more than I ever expected when I wrote the first prompts. Seeing people sign up, create leagues, and start making predictions has been incredibly motivating. More than anything, it has shown me how AI can open new doors and enable people to turn ideas into reality much faster than ever before.",
        "So thank you for being part of this adventure and for trusting this little project enough to give it a try.",
        "As with any new project, there may still be a few glitches, bugs, or unexpected surprises along the way. If something does not work as expected, please let me know. I am fully committed to fixing issues quickly and continuously improving the platform throughout the tournament.",
        "But enough about the technology: the World Cup is finally here!",
        "Good luck with your predictions, enjoy the matches, do not forget to submit your scores before kickoff, and may the best forecaster win.",
        "See you on the leaderboard!",
        "Julien",
      ],
      cta: `Open ${appName}`,
      text: [
        "Hello everyone,",
        "",
        `With the World Cup kicking off this evening, I wanted to take a moment to thank all of you for joining ${appName}.`,
        "",
        `${appName} was never supposed to become a “real” project. A few months ago, I started it mostly out of curiosity. I wanted to discover what could be built with the help of AI coding tools, despite having limited coding experience myself.`,
        "",
        "What began as a simple experiment gradually turned into something bigger: a prediction platform where friends, family, and colleagues can compete, compare rankings, create private leagues, and enjoy the tournament together.",
        "",
        "One of the most fun parts was creating OddzzAI too: a small virtual opponent that looks at the available data, makes its own predictions, and joins the leaderboards as another player to beat.",
        "",
        "Today, we are almost 50 players, which is far more than I ever expected when I wrote the first prompts. Seeing people sign up, create leagues, and start making predictions has been incredibly motivating. More than anything, it has shown me how AI can open new doors and enable people to turn ideas into reality much faster than ever before.",
        "",
        "So thank you for being part of this adventure and for trusting this little project enough to give it a try.",
        "",
        "As with any new project, there may still be a few glitches, bugs, or unexpected surprises along the way. If something does not work as expected, please let me know. I am fully committed to fixing issues quickly and continuously improving the platform throughout the tournament.",
        "",
        "But enough about the technology: the World Cup is finally here!",
        "",
        "Good luck with your predictions, enjoy the matches, do not forget to submit your scores before kickoff, and may the best forecaster win.",
        "",
        "See you on the leaderboard!",
        "",
        "Julien",
      ].join("\n"),
    };
}

function kickoffHtml(env: Env, user: KickoffEmailUser, language: "en" | "fr") {
  const appName = env.APP_NAME || "Oddzz";
  const copy = kickoffCopy(language, user.nickname, appName);
  const appUrl = env.APP_URL || "https://oddzz.xyz";
  const paragraphHtml = [copy.greeting, ...copy.paragraphs].map((paragraph) => `
                <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#344054;">${escapeHtml(paragraph)}</p>`).join("");

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
${paragraphHtml}
                <div style="text-align:center;margin:28px 0 22px;">
                  <a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#1fd36b;color:#041225;text-decoration:none;font-weight:900;">${escapeHtml(copy.cta)}</a>
                </div>
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
