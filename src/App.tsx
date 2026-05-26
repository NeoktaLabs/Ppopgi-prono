import { useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";

type User = { id: string; email: string; nickname: string | null };
type League = { id: string; name: string; code: string; role: string };
type Match = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  stage: string | null;
  points_multiplier: number;
  status: string;
  final_home: number | null;
  final_away: number | null;
  live_home_score?: number | null;
  live_away_score?: number | null;
  live_minute?: number | null;
  effective_home_score?: number | null;
  effective_away_score?: number | null;
  is_live?: boolean;
  predictions?: MatchPrediction[];
};
type MatchPrediction = { user_id: string; nickname: string | null; home_score: number; away_score: number; points: number; live_points?: number };
type MeResponse = { user: User | null; leagues: League[] };
type LeaderboardRow = { user_id: string; nickname: string | null; points: number; rank: number; official_rank: number; rank_delta: number; movement_type: "live" | "last_match" };
type LeagueHome = { mode: "live" | "official"; leaderboard: LeaderboardRow[]; matches: Match[]; poll_seconds: number };
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
    liveLeaderboard: "Live leaderboard",
    officialLeaderboard: "Leaderboard",
    liveExplanation: "Provisional movement if live scores stay like this.",
    lastMatchExplanation: "Movement since the latest finalized match.",
    todaysMatches: "Today’s matches",
    noMatchesToday: "No matches today.",
    live: "LIVE",
    minute: "min",
    predictions: "Predictions",
    noPredictions: "No visible predictions yet.",
    points: "pts",
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
    liveLeaderboard: "Classement live",
    officialLeaderboard: "Classement",
    liveExplanation: "Mouvement provisoire si les scores live restent comme ça.",
    lastMatchExplanation: "Mouvement depuis le dernier match finalisé.",
    todaysMatches: "Matches du jour",
    noMatchesToday: "Aucun match aujourd’hui.",
    live: "LIVE",
    minute: "min",
    predictions: "Pronostics",
    noPredictions: "Aucun prono visible pour le moment.",
    points: "pts",
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

function Movement({ delta }: { delta: number }) {
  if (delta > 0) return <span className="movement up">▲{delta}</span>;
  if (delta < 0) return <span className="movement down">▼{Math.abs(delta)}</span>;
  return <span className="movement neutral">—</span>;
}

function App() {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const t: Copy = copy[language];
  const [me, setMe] = useState<MeResponse | null>(null);
  const [home, setHome] = useState<LeagueHome | null>(null);
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

  async function loadLeagueHome(leagueId: string) {
    const nextHome = await api<LeagueHome>(`/api/leagues/${leagueId}/home`);
    setHome(nextHome);
    setMatches(nextHome.matches);
    return nextHome;
  }

  async function refresh() {
    const nextMe = await api<MeResponse>("/api/auth/me");
    setMe(nextMe);
    if (nextMe.leagues[0]) {
      await loadLeagueHome(nextMe.leagues[0].id);
    } else {
      const today = await api<{ matches: Match[] }>("/api/worldcup/today");
      setMatches(today.matches);
      setHome(null);
    }
  }
  useEffect(() => { refresh().catch(() => setMe({ user: null, leagues: [] })); }, []);
  useEffect(() => {
    if (!currentLeague) return;
    const seconds = home?.poll_seconds ?? 60;
    const id = window.setInterval(() => { loadLeagueHome(currentLeague.id).catch(() => undefined); }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [currentLeague?.id, home?.poll_seconds]);

  async function requestLink() { await api("/api/auth/request-link", { method: "POST", body: JSON.stringify({ email }) }); setMessage(t.magicLinkSent); }
  async function saveNickname() { await api("/api/me/profile", { method: "PATCH", body: JSON.stringify({ nickname }) }); await refresh(); }
  async function createLeague() { await api("/api/leagues", { method: "POST", body: JSON.stringify({ name: leagueName }) }); setLeagueName(""); await refresh(); }
  async function joinLeague() { await api("/api/leagues/join", { method: "POST", body: JSON.stringify({ code: joinCode }) }); setJoinCode(""); await refresh(); }
  async function logout() { await api("/api/auth/logout", { method: "POST" }); setMe({ user: null, leagues: [] }); setHome(null); }

  if (!me) return <main className="shell"><div className="card"><LanguageToggle language={language} setLanguage={setLanguage} />{t.loading}</div></main>;
  if (!me.user) return <main className="shell hero"><section className="card hero-card"><LanguageToggle language={language} setLanguage={setLanguage} /><p className="eyebrow">{t.worldCup}</p><h1>Ppopgi Prono ⚽</h1><p className="lead">{t.intro}</p><div className="form-row"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPlaceholder} type="email" /><button onClick={requestLink}>{t.sendLoginLink}</button></div>{message && <p className="notice">{message}</p>}</section></main>;
  if (!me.user.nickname) return <main className="shell"><section className="card"><LanguageToggle language={language} setLanguage={setLanguage} /><h1>{t.welcome}</h1><p>{t.chooseNickname}</p><div className="form-row"><input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t.nicknamePlaceholder} /><button onClick={saveNickname}>{t.continue}</button></div></section></main>;

  return <main className="shell"><header className="topbar"><div><p className="eyebrow">{t.signedIn} {me.user.email}</p><h1>{t.hi} {me.user.nickname} 👋</h1></div><div className="top-actions"><LanguageToggle language={language} setLanguage={setLanguage} /><button className="ghost" onClick={logout}>{t.signOut}</button></div></header><section className="grid"><div className="card"><h2>{t.myLeagues}</h2>{me.leagues.length === 0 ? <p>{t.noLeagues}</p> : <ul className="league-list">{me.leagues.map((league) => <li key={league.id}><strong>{league.name}</strong><span>{t.code} {league.code}</span><span>{league.role}</span></li>)}</ul>}<div className="split"><input value={leagueName} onChange={(e) => setLeagueName(e.target.value)} placeholder={t.leagueNamePlaceholder} /><button onClick={createLeague}>{t.create}</button></div><div className="split"><input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder={t.leagueCodePlaceholder} /><button onClick={joinLeague}>{t.join}</button></div></div><div className="card"><h2>{home?.mode === "live" ? t.liveLeaderboard : t.officialLeaderboard}</h2><p className="muted">{home?.mode === "live" ? t.liveExplanation : t.lastMatchExplanation}</p><div className="leaderboard-live">{(home?.leaderboard ?? []).slice(0, 8).map((row) => <div className="leaderboard-row" key={row.user_id}><span className="rank">#{row.rank}</span><strong>{row.nickname ?? "—"}</strong><span>{row.points} {t.points}</span><Movement delta={row.rank_delta} /></div>)}</div></div></section><section className="card"><h2>{t.todaysMatches}</h2><div className="matches">{matches.length === 0 ? <p>{t.noMatchesToday}</p> : matches.map((match) => <article className={`match ${match.is_live ? "live-match" : ""}`} key={match.id}>{match.is_live && <span className="live-pill"><span className="pulse" />{t.live} {match.live_minute ? `${match.live_minute} ${t.minute}` : ""}</span>}<span className="badge">x{match.points_multiplier}</span><h3>{match.home_team} {match.effective_home_score ?? "-"} - {match.effective_away_score ?? "-"} {match.away_team}</h3><p>{new Date(match.kickoff_at).toLocaleString(language === "fr" ? "fr-CH" : "en-GB")}</p><p>{match.status}</p>{match.predictions && match.predictions.length > 0 && <div className="prediction-list"><h4>{t.predictions}</h4>{match.predictions.map((prediction) => <div className="prediction-row" key={prediction.user_id}><span>{prediction.nickname ?? "—"}</span><span>{prediction.home_score}-{prediction.away_score}</span><strong>{prediction.live_points ?? prediction.points} {t.points}</strong></div>)}</div>}</article>)}</div></section><nav className="bottom-nav"><a>{t.standings}</a><a>{t.picks}</a><a>{t.worldCupNav}</a><a>{t.rules}</a><a>{t.profile}</a></nav></main>;
}
export default App;
