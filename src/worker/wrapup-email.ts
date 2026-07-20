import type { Env } from "./types";
import { sendEmail } from "./email";
import { buildComputedLeaderboardRows } from "./leaderboard-aggregation";
import { json, nowIso, readJson } from "./utils";

type Language = "en" | "fr";

type WrapupEmailUser = {
  id: string;
  email: string;
  nickname: string | null;
  email_language: Language | null;
};

type PodiumRow = {
  rank: number;
  nickname: string;
  points: number;
  exact_scores: number;
  correct_results: number;
};

type UserLeagueRank = {
  league: string;
  rank: number;
  players: number;
  points: number;
  exact_scores: number;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function userLanguage(user: WrapupEmailUser): Language {
  return user.email_language === "fr" ? "fr" : "en";
}

async function globalPodium(env: Env): Promise<PodiumRow[]> {
  return (await buildComputedLeaderboardRows(env))
    .filter((row) => !!row.nickname)
    .slice(0, 3)
    .map((row, index) => ({
      rank: index + 1,
      nickname: row.nickname || "Player",
      points: row.points,
      exact_scores: row.exact_scores,
      correct_results: row.correct_results,
    }));
}

async function userLeagueRanks(env: Env, userId: string): Promise<UserLeagueRank[]> {
  const leagues = await env.DB.prepare(`
    SELECT leagues.id, leagues.name
    FROM league_members
    JOIN leagues ON leagues.id = league_members.league_id
    WHERE league_members.user_id = ?
      AND league_members.removed_at IS NULL
    ORDER BY leagues.name COLLATE NOCASE ASC
  `).bind(userId).all<{ id: string; name: string }>();

  const ranks: UserLeagueRank[] = [];
  for (const league of leagues.results ?? []) {
    const board = await buildComputedLeaderboardRows(env, { leagueId: league.id });
    const row = board.find((item) => item.user_id === userId);
    if (!row) continue;
    ranks.push({
      league: league.name,
      rank: row.rank,
      players: board.filter((item) => !!item.nickname).length,
      points: row.points,
      exact_scores: row.exact_scores,
    });
  }
  return ranks;
}

function rankLabel(rank: number, language: Language) {
  if (language === "fr") return `#${rank}`;
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  return "3rd";
}

function copy(language: Language, appName: string) {
  return language === "fr"
    ? {
      subject: `${appName} - Merci d'avoir joué`,
      eyebrow: "Bilan Coupe du Monde",
      title: `Merci d'avoir joué à ${appName}`,
      greeting: "Bonjour à toutes et à tous,",
      open: `Ouvrir ${appName}`,
      globalPodium: "Podium global",
      rank: "Rang",
      player: "Joueur",
      points: "Points",
      exact: "Exacts",
      yourLeagues: "Tes classements par ligue",
      league: "Ligue",
      paragraphs: (podium: PodiumRow[]) => [
        "La compétition est maintenant terminée, et je voulais vous envoyer un dernier message pour vous remercier sincèrement d'avoir participé.",
        "Félicitations à l'Espagne, championne du monde, et bravo à tous ceux qui ont vibré, douté, changé de prono au dernier moment, tenté des scores audacieux ou regretté un bonus utilisé trop tôt.",
        `Un immense bravo au podium global : ${podium.map((row) => `${rankLabel(row.rank, language)} ${row.nickname} (${row.points} pts)`).join(", ")}.`,
        "Félicitations également à tous les leaders de ligue. Chaque ligue a eu sa petite histoire, ses remontées, ses mauvais choix douloureux et ses moments de gloire.",
        `Ce qui avait commencé comme une petite expérimentation personnelle est devenu un vrai jeu partagé entre amis, collègues, familles et passionnés de football. Voir autant de personnes utiliser ${appName}, créer des ligues et suivre les classements jusqu'au bout a été beaucoup plus motivant que ce que j'avais imaginé.`,
        `Merci encore d'avoir donné sa chance à ${appName}, d'avoir partagé vos retours, et d'avoir rendu ce projet vivant tout au long du tournoi.`,
        "À la prochaine compétition,",
        "Julien",
      ],
    }
    : {
      subject: `${appName} - Thank you for playing`,
      eyebrow: "World Cup wrap-up",
      title: `Thank you for playing ${appName}`,
      greeting: "Hello everyone,",
      open: `Open ${appName}`,
      globalPodium: "Global podium",
      rank: "Rank",
      player: "Player",
      points: "Points",
      exact: "Exact",
      yourLeagues: "Your league rankings",
      league: "League",
      paragraphs: (podium: PodiumRow[]) => [
        "The competition is now over, and I wanted to send one last message to say a genuine thank you for taking part.",
        "Congratulations to Spain, World Cup winners, and well played to everyone who lived through the drama, changed predictions at the last minute, trusted bold scorelines, or regretted using a bonus too early.",
        `A huge congratulations to the global podium: ${podium.map((row) => `${rankLabel(row.rank, language)} ${row.nickname} (${row.points} pts)`).join(", ")}.`,
        "Congratulations as well to all league leaders. Every private league had its own little story, comebacks, painful calls, and moments of glory.",
        `What started as a small personal experiment became a real little tournament between friends, colleagues, families, and football fans. Seeing people use ${appName}, create leagues, and follow the rankings until the end made the whole project feel more alive than I ever expected.`,
        `Thank you again for giving ${appName} a try, for sharing feedback, and for helping turn a simple idea into something people actually used throughout the World Cup.`,
        "See you on the next competition,",
        "Julien",
      ],
    };
}

function podiumLine(row: PodiumRow, language: Language) {
  return `${rankLabel(row.rank, language)} - ${row.nickname}: ${row.points} pts, ${row.exact_scores} exact scores, ${row.correct_results} correct results`;
}

function wrapupText(env: Env, language: Language, podium: PodiumRow[], leagueRanks: UserLeagueRank[]) {
  const appName = env.APP_NAME || "Oddzz";
  const appUrl = env.APP_URL || "https://oddzz.xyz";
  const c = copy(language, appName);
  const exactLabel = language === "fr" ? "scores exacts" : "exact scores";
  const correctLabel = language === "fr" ? "bons résultats" : "correct results";

  return [
    c.greeting,
    "",
    ...c.paragraphs(podium).flatMap((paragraph) => [paragraph, ""]),
    c.globalPodium,
    "",
    ...podium.map((row) => `${rankLabel(row.rank, language)} - ${row.nickname}: ${row.points} pts, ${row.exact_scores} ${exactLabel}, ${row.correct_results} ${correctLabel}`),
    "",
    ...(leagueRanks.length ? [
      c.yourLeagues,
      "",
      ...leagueRanks.map((row) => `${row.league}: ${rankLabel(row.rank, language)} / ${row.players} - ${row.points} pts, ${row.exact_scores} ${exactLabel}`),
      "",
    ] : []),
    `${c.open}: ${appUrl}`,
  ].join("\n");
}

function wrapupHtml(env: Env, language: Language, podium: PodiumRow[], leagueRanks: UserLeagueRank[]) {
  const appName = env.APP_NAME || "Oddzz";
  const appUrl = env.APP_URL || "https://oddzz.xyz";
  const c = copy(language, appName);
  const paragraphs = [c.greeting, ...c.paragraphs(podium)];
  const paragraphHtml = paragraphs.map((paragraph) => `
                <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#344054;">${escapeHtml(paragraph)}</p>`).join("");
  const podiumHtml = podium.map((row) => `
                  <tr>
                    <td style="padding:14px 12px;border-bottom:1px solid #dbe7ee;font-weight:900;color:#061735;">${escapeHtml(rankLabel(row.rank, language))}</td>
                    <td style="padding:14px 12px;border-bottom:1px solid #dbe7ee;font-weight:900;color:#061735;">${escapeHtml(row.nickname)}</td>
                    <td style="padding:14px 12px;border-bottom:1px solid #dbe7ee;text-align:right;color:#344054;">${row.points} pts</td>
                    <td style="padding:14px 12px;border-bottom:1px solid #dbe7ee;text-align:right;color:#344054;">${row.exact_scores}</td>
                  </tr>`).join("");
  const leagueRanksHtml = leagueRanks.map((row) => `
                  <tr>
                    <td style="padding:14px 12px;border-bottom:1px solid #eadfcf;font-weight:900;color:#061735;">${escapeHtml(row.league)}</td>
                    <td style="padding:14px 12px;border-bottom:1px solid #eadfcf;color:#344054;">${escapeHtml(rankLabel(row.rank, language))} / ${row.players}</td>
                    <td style="padding:14px 12px;border-bottom:1px solid #eadfcf;text-align:right;color:#344054;">${row.points} pts</td>
                    <td style="padding:14px 12px;border-bottom:1px solid #eadfcf;text-align:right;color:#344054;">${row.exact_scores}</td>
                  </tr>`).join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6fbff;font-family:Arial,Helvetica,sans-serif;color:#091833;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6fbff;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;background:#ffffff;border-radius:28px;border:1px solid #dbe7ee;overflow:hidden;box-shadow:0 18px 44px rgba(6,23,53,0.10);">
            <tr>
              <td style="padding:34px 30px 28px;background:#061735;color:#ffffff;">
                <div style="font-size:13px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;color:#1fd36b;">${escapeHtml(c.eyebrow)}</div>
                <h1 style="margin:12px 0 0;font-size:31px;line-height:1.08;">${escapeHtml(c.title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px;">
${paragraphHtml}
                <div style="margin:26px 0;padding:20px;border-radius:22px;background:#edf9f2;border:1px solid #c8eed7;">
                  <div style="font-size:13px;font-weight:900;letter-spacing:.10em;text-transform:uppercase;color:#138a48;margin-bottom:12px;">${escapeHtml(c.globalPodium)}</div>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;border-radius:16px;overflow:hidden;">
                    <tr>
                      <th align="left" style="padding:12px;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(c.rank)}</th>
                      <th align="left" style="padding:12px;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(c.player)}</th>
                      <th align="right" style="padding:12px;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(c.points)}</th>
                      <th align="right" style="padding:12px;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(c.exact)}</th>
                    </tr>
${podiumHtml}
                  </table>
                </div>
                ${leagueRanks.length ? `
                <div style="margin:26px 0;padding:20px;border-radius:22px;background:#fff7ed;border:1px solid #eadfcf;">
                  <div style="font-size:13px;font-weight:900;letter-spacing:.10em;text-transform:uppercase;color:#c05621;margin-bottom:12px;">${escapeHtml(c.yourLeagues)}</div>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;border-radius:16px;overflow:hidden;">
                    <tr>
                      <th align="left" style="padding:12px;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(c.league)}</th>
                      <th align="left" style="padding:12px;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(c.rank)}</th>
                      <th align="right" style="padding:12px;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(c.points)}</th>
                      <th align="right" style="padding:12px;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(c.exact)}</th>
                    </tr>
${leagueRanksHtml}
                  </table>
                </div>` : ""}
                <div style="text-align:center;margin:28px 0 8px;">
                  <a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#1fd36b;color:#041225;text-decoration:none;font-weight:900;">${escapeHtml(c.open)}</a>
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

async function wrapupData(env: Env, userId?: string) {
  const [podium, leagueRanks] = await Promise.all([
    globalPodium(env),
    userId ? userLeagueRanks(env, userId) : Promise.resolve([]),
  ]);
  return { podium, leagueRanks };
}

export async function sendWrapupEmailToUser(env: Env, user: WrapupEmailUser) {
  if (!env.RESEND_API_KEY) {
    console.warn("Wrap-up email skipped: RESEND_API_KEY is not configured.");
    return { ok: false, skipped: "missing_resend_key" };
  }

  const existing = await env.DB.prepare("SELECT id FROM wrapup_emails WHERE user_id = ?")
    .bind(user.id)
    .first<{ id: string }>();
  if (existing) return { ok: true, skipped: "already_sent" };

  const language = userLanguage(user);
  const appName = env.APP_NAME || "Oddzz";
  const c = copy(language, appName);
  const { podium, leagueRanks } = await wrapupData(env, user.id);

  await sendEmail(env, {
    to: user.email,
    subject: c.subject,
    text: wrapupText(env, language, podium, leagueRanks),
    html: wrapupHtml(env, language, podium, leagueRanks),
    fromName: "Oddzz",
  });

  await env.DB.prepare(`
    INSERT INTO wrapup_emails (id, user_id, sent_at, language)
    VALUES (?, ?, ?, ?)
  `).bind(crypto.randomUUID(), user.id, nowIso(), language).run();

  return { ok: true, sent: true };
}

export async function sendPendingWrapupEmails(env: Env, limit = 200) {
  const rows = await env.DB.prepare(`
    SELECT users.id, users.email, users.nickname, users.email_language
    FROM users
    LEFT JOIN wrapup_emails sent ON sent.user_id = users.id
    WHERE users.nickname IS NOT NULL
      AND sent.id IS NULL
    ORDER BY users.created_at ASC
    LIMIT ?
  `).bind(limit).all<WrapupEmailUser>();

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ user_id: string; error: string }> = [];

  for (const user of rows.results ?? []) {
    try {
      const result = await sendWrapupEmailToUser(env, user);
      if ("sent" in result && result.sent) sent += 1;
      else skipped += 1;
    } catch (error) {
      errors.push({ user_id: user.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { ok: errors.length === 0, sent, skipped, errors, considered: rows.results?.length ?? 0 };
}

export async function sendWrapupPreviewEmail(request: Request, env: Env) {
  const body = await readJson<{ to?: string; language?: Language }>(request);
  const to = body.to?.trim() || "juliiengariin@gmail.com";
  const savedUser = await env.DB.prepare(`
    SELECT id, email, nickname, email_language
    FROM users
    WHERE lower(email) = lower(?)
    LIMIT 1
  `).bind(to).first<WrapupEmailUser>();
  const user: WrapupEmailUser = savedUser ?? {
    id: "preview",
    email: to,
    nickname: "Julien",
    email_language: body.language === "fr" ? "fr" : "en",
  };
  const language = body.language === "fr" || body.language === "en" ? body.language : userLanguage(user);
  const appName = env.APP_NAME || "Oddzz";
  const c = copy(language, appName);
  const { podium, leagueRanks } = await wrapupData(env, savedUser?.id);

  try {
    const resend = await sendEmail(env, {
      to,
      subject: `${c.subject} preview`,
      text: wrapupText(env, language, podium, leagueRanks),
      html: wrapupHtml(env, language, podium, leagueRanks),
      fromName: "Oddzz",
    });
    return json({ ok: true, to, language, podium, league_ranks: leagueRanks, resend });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Resend failed." }, { status: 502 });
  }
}
