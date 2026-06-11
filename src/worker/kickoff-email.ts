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
      greeting: "Bonjour à toutes et à tous,",
      paragraphs: [
        `La Coupe du Monde débute ce soir, je voulais prendre un instant pour vous remercier d'avoir rejoint ${appName}.`,
        `Pour être honnête, ${appName} n'était pas censé devenir un « vrai » projet. Il y a quelques mois, je l'ai commencé principalement par curiosité. J'avais envie de découvrir ce qu'il était possible de construire avec l'aide de l'IA, malgré une expérience limitée en développement.`,
        "Ce qui a commencé comme une simple expérimentation s'est progressivement transformé en quelque chose de plus grand : une plateforme de pronostics où amis, collègues et membres de la famille peuvent s'affronter, comparer leurs classements, créer des ligues privées et profiter ensemble de la compétition.",
        "Aujourd'hui, nous sommes près de 50 joueurs, bien plus que ce que j'aurais imaginé lorsque j'ai écrit les premiers prompts. Voir des personnes s'inscrire, créer des ligues et commencer à faire leurs pronostics a été extrêmement motivant. Plus que tout, cette aventure m'a montré à quel point l'IA peut ouvrir de nouvelles portes et permettre de concrétiser des idées beaucoup plus rapidement qu'auparavant.",
        "Dans le cadre de cette expérience, j'ai également décidé de créer OddzzAI, un joueur virtuel qui participe à la compétition comme n'importe quel autre joueur. Il analyse les statistiques et les données des matchs afin d'établir ses propres pronostics. Tout au long du tournoi, vous aurez donc l'occasion de mesurer votre flair footballistique non seulement à celui de vos amis et collègues, mais aussi à celui d'une “intelligence artificielle”. Rendez-vous à la fin du tournoi pour voir qui sortira vainqueur ! 🤖⚽",
        "Merci donc de faire partie de cette aventure et d'avoir accordé votre confiance à ce petit projet.",
        "Comme pour tout nouveau projet, il est possible que quelques bugs ou surprises inattendues se glissent en cours de route. Si quelque chose ne fonctionne pas comme prévu, n'hésitez pas à me le signaler.",
        "Mais assez parlé : la Coupe du Monde est enfin là !",
        "Je vous souhaite à toutes et à tous d'excellents pronostics, de grands moments de football, de belles soirées entre amis, quelques barbecues, quelques bières et pizzas et, surtout, beaucoup de plaisir tout au long du tournoi. 😄",
        "N'oubliez pas de faire vos pronostics avant le coup d'envoi des matchs, et que le meilleur gagne ! 🏆⚽",
        "Julien",
      ],
      cta: `Ouvrir ${appName}`,
      text: [
        "Bonjour à toutes et à tous,",
        "",
        `La Coupe du Monde débute ce soir, je voulais prendre un instant pour vous remercier d'avoir rejoint ${appName}.`,
        "",
        `Pour être honnête, ${appName} n'était pas censé devenir un « vrai » projet. Il y a quelques mois, je l'ai commencé principalement par curiosité. J'avais envie de découvrir ce qu'il était possible de construire avec l'aide de l'IA, malgré une expérience limitée en développement.`,
        "",
        "Ce qui a commencé comme une simple expérimentation s'est progressivement transformé en quelque chose de plus grand : une plateforme de pronostics où amis, collègues et membres de la famille peuvent s'affronter, comparer leurs classements, créer des ligues privées et profiter ensemble de la compétition.",
        "",
        "Aujourd'hui, nous sommes près de 50 joueurs, bien plus que ce que j'aurais imaginé lorsque j'ai écrit les premiers prompts. Voir des personnes s'inscrire, créer des ligues et commencer à faire leurs pronostics a été extrêmement motivant. Plus que tout, cette aventure m'a montré à quel point l'IA peut ouvrir de nouvelles portes et permettre de concrétiser des idées beaucoup plus rapidement qu'auparavant.",
        "",
        "Dans le cadre de cette expérience, j'ai également décidé de créer OddzzAI, un joueur virtuel qui participe à la compétition comme n'importe quel autre joueur. Il analyse les statistiques et les données des matchs afin d'établir ses propres pronostics. Tout au long du tournoi, vous aurez donc l'occasion de mesurer votre flair footballistique non seulement à celui de vos amis et collègues, mais aussi à celui d'une “intelligence artificielle”. Rendez-vous à la fin du tournoi pour voir qui sortira vainqueur ! 🤖⚽",
        "",
        "Merci donc de faire partie de cette aventure et d'avoir accordé votre confiance à ce petit projet.",
        "",
        "Comme pour tout nouveau projet, il est possible que quelques bugs ou surprises inattendues se glissent en cours de route. Si quelque chose ne fonctionne pas comme prévu, n'hésitez pas à me le signaler.",
        "",
        "Mais assez parlé : la Coupe du Monde est enfin là !",
        "",
        "Je vous souhaite à toutes et à tous d'excellents pronostics, de grands moments de football, de belles soirées entre amis, quelques barbecues, quelques bières et pizzas et, surtout, beaucoup de plaisir tout au long du tournoi. 😄",
        "",
        "N'oubliez pas de faire vos pronostics avant le coup d'envoi des matchs, et que le meilleur gagne ! 🏆⚽",
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
        `${appName} was never supposed to become a “real” project. A few months ago, I started it mostly out of curiosity. I wanted to discover what could be built with the help of AI, despite having very limited coding experience myself.`,
        "What began as a simple experiment gradually turned into something bigger: a prediction platform where friends, family, and colleagues can compete, compare rankings, create private leagues, and enjoy the tournament together.",
        "Today, we are almost 50 players, which is far more than I ever expected when I wrote the first prompts. Seeing people sign up, create leagues, and start making predictions has been incredibly motivating. More than anything, it has shown me how AI can open new doors and enable people to turn ideas into reality much faster than ever before.",
        "As part of the experiment, I also decided to create OddzzAI, a virtual player that competes alongside everyone else. It analyzes football statistics and match data to make its own predictions. Throughout the tournament, you'll have the opportunity to test your football instincts not only against friends and colleagues, but also against an AI. Let's see who comes out on top. 🤖⚽",
        "So thank you for being part of this adventure and for trusting this little project enough to give it a try.",
        "As with any new project, there may still be a few glitches, bugs, or unexpected surprises along the way. If something doesn't work as expected, please let me know.",
        "But enough about the technology—the World Cup is finally here!",
        "I wish you all great predictions, unforgettable football moments, sunny evenings with friends, a few barbecues, a few beers and pizzas, and above all, plenty of fun throughout the tournament. 😄",
        "Don't forget to submit your predictions before kickoff, and may the best forecaster win! 🏆⚽",
        "Julien",
      ],
      cta: `Open ${appName}`,
      text: [
        "Hello everyone,",
        "",
        `With the World Cup kicking off this evening, I wanted to take a moment to thank all of you for joining ${appName}.`,
        "",
        `${appName} was never supposed to become a “real” project. A few months ago, I started it mostly out of curiosity. I wanted to discover what could be built with the help of AI, despite having very limited coding experience myself.`,
        "",
        "What began as a simple experiment gradually turned into something bigger: a prediction platform where friends, family, and colleagues can compete, compare rankings, create private leagues, and enjoy the tournament together.",
        "",
        "Today, we are almost 50 players, which is far more than I ever expected when I wrote the first prompts. Seeing people sign up, create leagues, and start making predictions has been incredibly motivating. More than anything, it has shown me how AI can open new doors and enable people to turn ideas into reality much faster than ever before.",
        "",
        "As part of the experiment, I also decided to create OddzzAI, a virtual player that competes alongside everyone else. It analyzes football statistics and match data to make its own predictions. Throughout the tournament, you'll have the opportunity to test your football instincts not only against friends and colleagues, but also against an AI. Let's see who comes out on top. 🤖⚽",
        "",
        "So thank you for being part of this adventure and for trusting this little project enough to give it a try.",
        "",
        "As with any new project, there may still be a few glitches, bugs, or unexpected surprises along the way. If something doesn't work as expected, please let me know.",
        "",
        "But enough about the technology—the World Cup is finally here!",
        "",
        "I wish you all great predictions, unforgettable football moments, sunny evenings with friends, a few barbecues, a few beers and pizzas, and above all, plenty of fun throughout the tournament. 😄",
        "",
        "Don't forget to submit your predictions before kickoff, and may the best forecaster win! 🏆⚽",
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
