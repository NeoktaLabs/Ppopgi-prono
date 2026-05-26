import { useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";

type User = { id: string; email: string; nickname: string | null };
type League = { id: string; name: string; code: string; role: string };
type Match = { id: string; home_team: string; away_team: string; kickoff_at: string; stage: string | null; points_multiplier: number; status: string; final_home: number | null; final_away: number | null };
type MeResponse = { user: User | null; leagues: League[] };
type Language = "en" | "fr";
type Copy = typeof copy.en;

const copy = {
  en: {
    loading: "Loading…",
    worldCup: "World Cup",
    intro: "Create or join a private league, predict matches, and climb the leaderboard.",
    emailPlaceholder: "you@example.com",
    sendLoginLink: "Send me a login link",
    magicLinkSent: "Magic link sent. Check your inbox.",
    welcome: "Welcome 👋",
    chooseNickname: "Choose the nickname that will appear in league standings.",
    nicknamePlaceholder: "Nickname",
    continue: "Continue",
    signedIn: "Signed in:",
    hi: "Hi",
    signOut: "Sign out",
    myLeagues: "My leagues",
    noLeagues: "No leagues yet.",
    code: "Code:",
    leagueNamePlaceholder: "League name",
    create: "Create",
    leagueCodePlaceholder: "League code",
    join: "Join",
    leagueHome: "League home",
    leagueHomeSuffix: "home",
    leagueIntro: "The leaderboard, your score, and today’s matches will appear here.",
    gold: "🥇 Gold",
    silver: "🥈 Silver",
    bronze: "🥉 Bronze",
    bottomThree: "The bottom 3 will be highlighted in red.",
    todaysMatches: "Today’s matches",
    noMatchesToday: "No matches today.",
    standings: "🏆 Standings",
    picks: "⚽ Picks",
    worldCupNav: "📅 World Cup",
    rules: "📜 Rules",
    profile: "👤 Profile",
  },
  fr: {
    loading: "Chargement…",
    worldCup: "Coupe du Monde",
    intro: "Crée ou rejoins une ligue privée, pronostique les matches et grimpe au classement.",
    emailPlaceholder: "toi@example.com",
    sendLoginLink: "Recevoir mon lien de connexion",
    magicLinkSent: "Lien magique envoyé. Vérifie ta boîte e-mail.",
    welcome: "Bienvenue 👋",
    chooseNickname: "Choisis le pseudo qui apparaîtra dans les classements.",
    nicknamePlaceholder: "Pseudo",
    continue: "Continuer",
    signedIn: "Connecté :",
    hi: "Salut",
    signOut: "Déconnexion",
    myLeagues: "Mes ligues",
    noLeagues: "Aucune ligue pour le moment.",
    code: "Code :",
    leagueNamePlaceholder: "Nom de la ligue",
    create: "Créer",
    leagueCodePlaceholder: "Code de ligue",
    join: "Rejoindre",
    leagueHome: "Accueil de la ligue",
    leagueHomeSuffix: "accueil",
    leagueIntro: "Le classement, ton score et les matches du jour apparaîtront ici.",
    gold: "🥇 Or",
    silver: "🥈 Argent",
    bronze: "🥉 Bronze",
    bottomThree: "Les 3 derniers seront affichés en rouge.",
    todaysMatches: "Matches du jour",
    noMatchesToday: "Aucun match aujourd’hui.",
    standings: "🏆 Classement",
    picks: "⚽ Pronos",
    worldCupNav: "📅 Coupe du Monde",
    rules: "📜 Règles",
    profile: "👤 Profil",
  },
} as const;

function getInitialLanguage(): Language {
  const stored = localStorage.getItem("language");
  if (stored === "en" || stored === "fr") return stored;
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function LanguageToggle({ language, setLanguage }: { language: Language; setLanguage: (language: Language) => void }) {
  return <div className="language-toggle" aria-label="Language selector"><button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button><button className={language === "fr" ? "active" : ""} onClick={() => setLanguage("fr")}>FR</button></div>;
}

function App() {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const t: Copy = copy[language];
  const [me, setMe] = useState<MeResponse | null>(null);
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState("");
  const currentLeague = useMemo(() => me?.leagues?.[0], [me]);

  function setLanguage(nextLanguage: Language) {
    setLanguageState(nextLanguage);
    localStorage.setItem("language", nextLanguage);
  }

  async function refresh() {
    const nextMe = await api<MeResponse>("/api/auth/me");
    setMe(nextMe);
    const today = await api<{ matches: Match[] }>("/api/worldcup/today");
    setMatches(today.matches);
  }
  useEffect(() => { refresh().catch(() => setMe({ user: null, leagues: [] })); }, []);

  async function requestLink() { await api("/api/auth/request-link", { method: "POST", body: JSON.stringify({ email }) }); setMessage(t.magicLinkSent); }
  async function saveNickname() { await api("/api/me/profile", { method: "PATCH", body: JSON.stringify({ nickname }) }); await refresh(); }
  async function createLeague() { await api("/api/leagues", { method: "POST", body: JSON.stringify({ name: leagueName }) }); setLeagueName(""); await refresh(); }
  async function joinLeague() { await api("/api/leagues/join", { method: "POST", body: JSON.stringify({ code: joinCode }) }); setJoinCode(""); await refresh(); }
  async function logout() { await api("/api/auth/logout", { method: "POST" }); setMe({ user: null, leagues: [] }); }

  if (!me) return <main className="shell"><div className="card"><LanguageToggle language={language} setLanguage={setLanguage} />{t.loading}</div></main>;
  if (!me.user) return <main className="shell hero"><section className="card hero-card"><LanguageToggle language={language} setLanguage={setLanguage} /><p className="eyebrow">{t.worldCup}</p><h1>Ppopgi Prono ⚽</h1><p className="lead">{t.intro}</p><div className="form-row"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPlaceholder} type="email" /><button onClick={requestLink}>{t.sendLoginLink}</button></div>{message && <p className="notice">{message}</p>}</section></main>;
  if (!me.user.nickname) return <main className="shell"><section className="card"><LanguageToggle language={language} setLanguage={setLanguage} /><h1>{t.welcome}</h1><p>{t.chooseNickname}</p><div className="form-row"><input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t.nicknamePlaceholder} /><button onClick={saveNickname}>{t.continue}</button></div></section></main>;

  return <main className="shell"><header className="topbar"><div><p className="eyebrow">{t.signedIn} {me.user.email}</p><h1>{t.hi} {me.user.nickname} 👋</h1></div><div className="top-actions"><LanguageToggle language={language} setLanguage={setLanguage} /><button className="ghost" onClick={logout}>{t.signOut}</button></div></header><section className="grid"><div className="card"><h2>{t.myLeagues}</h2>{me.leagues.length === 0 ? <p>{t.noLeagues}</p> : <ul className="league-list">{me.leagues.map((league) => <li key={league.id}><strong>{league.name}</strong><span>{t.code} {league.code}</span><span>{league.role}</span></li>)}</ul>}<div className="split"><input value={leagueName} onChange={(e) => setLeagueName(e.target.value)} placeholder={t.leagueNamePlaceholder} /><button onClick={createLeague}>{t.create}</button></div><div className="split"><input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder={t.leagueCodePlaceholder} /><button onClick={joinLeague}>{t.join}</button></div></div><div className="card"><h2>{currentLeague ? `${currentLeague.name} ${t.leagueHomeSuffix}` : t.leagueHome}</h2><p className="muted">{t.leagueIntro}</p><div className="podium"><span>{t.gold}</span><span>{t.silver}</span><span>{t.bronze}</span></div><p className="danger">{t.bottomThree}</p></div></section><section className="card"><h2>{t.todaysMatches}</h2><div className="matches">{matches.length === 0 ? <p>{t.noMatchesToday}</p> : matches.map((match) => <article className="match" key={match.id}><span className="badge">x{match.points_multiplier}</span><h3>{match.home_team} - {match.away_team}</h3><p>{new Date(match.kickoff_at).toLocaleString(language === "fr" ? "fr-CH" : "en-GB")}</p><p>{match.status}</p></article>)}</div></section><nav className="bottom-nav"><a>{t.standings}</a><a>{t.picks}</a><a>{t.worldCupNav}</a><a>{t.rules}</a><a>{t.profile}</a></nav></main>;
}
export default App;
