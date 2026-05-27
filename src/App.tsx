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
type LeaguePage = "home" | "picks" | "worldcup" | "rules" | "profile";
type Copy = Record<string, string>;

const copy: Record<Language, Copy> = {
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
    hubIntro: "Create a league, join one with a code, or open an existing league.",
    noLeagues: "No leagues yet.",
    openLeague: "Open league",
    backToLeagues: "← My leagues",
    code: "Code:",
    role: "Role:",
    leagueNamePlaceholder: "League name",
    create: "Create",
    leagueCodePlaceholder: "League code",
    join: "Join",
    leagueHome: "League home",
    leagueIntro: "Leaderboard, live matches, predictions and movement for this league.",
    liveLeaderboard: "Live leaderboard",
    officialLeaderboard: "Leaderboard",
    liveExplanation: "Provisional movement if live scores stay like this.",
    lastMatchExplanation: "Movement since the latest finalized match.",
    todaysMatches: "Today’s matches",
    allMatches: "All matches",
    noMatchesToday: "No matches today.",
    noMatchesLoaded: "No matches loaded yet. If you are the global admin, trigger a sync or wait for the cron job.",
    syncMatches: "Sync matches",
    syncStarted: "Match sync triggered. Refresh in a few seconds.",
    live: "LIVE",
    minute: "min",
    predictions: "Predictions",
    noPredictions: "No visible predictions yet.",
    points: "pts",
    picksTitle: "Make predictions",
    picksIntro: "Prediction inputs will live here. For now, this page lists fixtures by date.",
    worldCupTitle: "World Cup matches",
    rulesTitle: "Rules",
    rulesText: "Predictions lock at kickoff. Other players’ picks are hidden until the match starts. Knockout multipliers are x2, x3, x4 and x5 for the final.",
    profileTitle: "Profile",
    saveProfile: "Save profile",
    profileSaved: "Profile updated.",
    standings: "🏆 Home",
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
    hubIntro: "Crée une ligue, rejoins-en une avec un code ou ouvre une ligue existante.",
    noLeagues: "Aucune ligue pour le moment.",
    openLeague: "Ouvrir la ligue",
    backToLeagues: "← Mes ligues",
    code: "Code :",
    role: "Rôle :",
    leagueNamePlaceholder: "Nom de la ligue",
    create: "Créer",
    leagueCodePlaceholder: "Code de ligue",
    join: "Rejoindre",
    leagueHome: "Accueil de la ligue",
    leagueIntro: "Classement, matches live, pronostics et mouvements pour cette ligue.",
    liveLeaderboard: "Classement live",
    officialLeaderboard: "Classement",
    liveExplanation: "Mouvement provisoire si les scores live restent comme ça.",
    lastMatchExplanation: "Mouvement depuis le dernier match finalisé.",
    todaysMatches: "Matches du jour",
    allMatches: "Tous les matches",
    noMatchesToday: "Aucun match aujourd’hui.",
    noMatchesLoaded: "Aucun match chargé pour le moment. Si tu es admin global, lance une synchro ou attends le cron.",
    syncMatches: "Synchroniser les matches",
    syncStarted: "Synchro lancée. Rafraîchis dans quelques secondes.",
    live: "LIVE",
    minute: "min",
    predictions: "Pronostics",
    noPredictions: "Aucun prono visible pour le moment.",
    points: "pts",
    picksTitle: "Faire mes pronostics",
    picksIntro: "Les champs de pronostics seront ici. Pour le moment, cette page liste les matches par date.",
    worldCupTitle: "Matches de la Coupe du Monde",
    rulesTitle: "Règles",
    rulesText: "Les pronostics sont verrouillés au coup d’envoi. Les pronos des autres sont cachés jusqu’au début du match. Les multiplicateurs sont x2, x3, x4 et x5 pour la finale.",
    profileTitle: "Profil",
    saveProfile: "Sauvegarder le profil",
    profileSaved: "Profil mis à jour.",
    standings: "🏆 Accueil",
    picks: "⚽ Pronos",
    worldCupNav: "📅 Coupe du Monde",
    rules: "📜 Règles",
    profile: "👤 Profil",
  },
};

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

function MatchCard({ match, language, t }: { match: Match; language: Language; t: Copy }) {
  return <article className={`match ${match.is_live ? "live-match" : ""}`}><div className="match-head">{match.is_live && <span className="live-pill"><span className="pulse" />{t.live} {match.live_minute ? `${match.live_minute} ${t.minute}` : ""}</span>}<span className="badge">x{match.points_multiplier}</span></div><h3>{match.home_team} {match.effective_home_score ?? match.final_home ?? "-"} - {match.effective_away_score ?? match.final_away ?? "-"} {match.away_team}</h3><p>{new Date(match.kickoff_at).toLocaleString(language === "fr" ? "fr-CH" : "en-GB")}</p><p>{match.stage ?? match.status} · {match.status}</p>{match.predictions && match.predictions.length > 0 && <div className="prediction-list"><h4>{t.predictions}</h4>{match.predictions.map((prediction) => <div className="prediction-row" key={prediction.user_id}><span>{prediction.nickname ?? "—"}</span><span>{prediction.home_score}-{prediction.away_score}</span><strong>{prediction.live_points ?? prediction.points} {t.points}</strong></div>)}</div>}</article>;
}

function App() {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const t = copy[language];
  const [me, setMe] = useState<MeResponse | null>(null);
  const [home, setHome] = useState<LeagueHome | null>(null);
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState("");
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(() => localStorage.getItem("selectedLeagueId"));
  const [page, setPage] = useState<LeaguePage>("home");
  const currentLeague = useMemo(() => me?.leagues.find((league) => league.id === selectedLeagueId) ?? null, [me, selectedLeagueId]);

  function setLanguage(nextLanguage: Language) {
    setLanguageState(nextLanguage);
    localStorage.setItem("language", nextLanguage);
  }

  function openLeague(leagueId: string) {
    setSelectedLeagueId(leagueId);
    localStorage.setItem("selectedLeagueId", leagueId);
    setPage("home");
    loadLeagueHome(leagueId).catch(() => undefined);
  }

  function closeLeague() {
    setSelectedLeagueId(null);
    localStorage.removeItem("selectedLeagueId");
    setHome(null);
    setPage("home");
  }

  async function loadLeagueHome(leagueId: string) {
    const nextHome = await api<LeagueHome>(`/api/leagues/${leagueId}/home`);
    setHome(nextHome);
    setMatches(nextHome.matches);
    return nextHome;
  }

  async function loadAllMatches() {
    const data = await api<{ matches: Match[] }>("/api/worldcup/matches");
    setAllMatches(data.matches);
    return data.matches;
  }

  async function refresh() {
    const nextMe = await api<MeResponse>("/api/auth/me");
    setMe(nextMe);
    const selected = nextMe.leagues.find((league) => league.id === selectedLeagueId);
    if (selected) await loadLeagueHome(selected.id);
  }

  useEffect(() => { refresh().catch(() => setMe({ user: null, leagues: [] })); }, []);
  useEffect(() => { if (page === "worldcup" || page === "picks") loadAllMatches().catch(() => undefined); }, [page]);
  useEffect(() => {
    if (!currentLeague) return;
    const seconds = home?.poll_seconds ?? 60;
    const id = window.setInterval(() => { loadLeagueHome(currentLeague.id).catch(() => undefined); }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [currentLeague?.id, home?.poll_seconds]);

  async function requestLink() { await api("/api/auth/request-link", { method: "POST", body: JSON.stringify({ email }) }); setMessage(t.magicLinkSent); }
  async function saveNickname() { await api("/api/me/profile", { method: "PATCH", body: JSON.stringify({ nickname }) }); setMessage(t.profileSaved); await refresh(); }
  async function createLeague() { const league = await api<{ id: string }>("/api/leagues", { method: "POST", body: JSON.stringify({ name: leagueName }) }); setLeagueName(""); await refresh(); openLeague(league.id); }
  async function joinLeague() { const joined = await api<{ leagueId: string }>("/api/leagues/join", { method: "POST", body: JSON.stringify({ code: joinCode }) }); setJoinCode(""); await refresh(); openLeague(joined.leagueId); }
  async function logout() { await api("/api/auth/logout", { method: "POST" }); setMe({ user: null, leagues: [] }); setHome(null); closeLeague(); }
  async function syncMatches() { await api("/api/admin/sync/matches", { method: "POST" }); setMessage(t.syncStarted); await loadAllMatches(); if (currentLeague) await loadLeagueHome(currentLeague.id); }

  if (!me) return <main className="shell"><div className="card"><LanguageToggle language={language} setLanguage={setLanguage} />{t.loading}</div></main>;
  if (!me.user) return <main className="shell hero"><section className="card hero-card"><LanguageToggle language={language} setLanguage={setLanguage} /><p className="eyebrow">{t.worldCup}</p><h1>Ppopgi Prono ⚽</h1><p className="lead">{t.intro}</p><div className="form-row"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPlaceholder} type="email" /><button onClick={requestLink}>{t.sendLoginLink}</button></div>{message && <p className="notice">{message}</p>}</section></main>;
  if (!me.user.nickname) return <main className="shell"><section className="card"><LanguageToggle language={language} setLanguage={setLanguage} /><h1>{t.welcome}</h1><p>{t.chooseNickname}</p><div className="form-row"><input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t.nicknamePlaceholder} /><button onClick={saveNickname}>{t.continue}</button></div></section></main>;

  const visibleMatches = page === "home" ? matches : allMatches;

  return <main className="shell"><header className="topbar"><div><p className="eyebrow">{t.signedIn} {me.user.email}</p><h1>{currentLeague ? currentLeague.name : `${t.hi} ${me.user.nickname} 👋`}</h1></div><div className="top-actions"><LanguageToggle language={language} setLanguage={setLanguage} /><button className="ghost" onClick={logout}>{t.signOut}</button></div></header>{message && <p className="notice">{message}</p>}{!currentLeague ? <section className="grid"><div className="card"><h2>{t.myLeagues}</h2><p className="muted">{t.hubIntro}</p>{me.leagues.length === 0 ? <p>{t.noLeagues}</p> : <ul className="league-list">{me.leagues.map((league) => <li key={league.id}><div><strong>{league.name}</strong><span>{t.code} {league.code}</span><span>{t.role} {league.role}</span></div><button onClick={() => openLeague(league.id)}>{t.openLeague}</button></li>)}</ul>}</div><div className="card"><h2>{t.create}</h2><div className="split"><input value={leagueName} onChange={(e) => setLeagueName(e.target.value)} placeholder={t.leagueNamePlaceholder} /><button onClick={createLeague}>{t.create}</button></div><h2>{t.join}</h2><div className="split"><input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder={t.leagueCodePlaceholder} /><button onClick={joinLeague}>{t.join}</button></div></div></section> : <><button className="ghost back-link" onClick={closeLeague}>{t.backToLeagues}</button>{page === "home" && <section className="grid"><div className="card"><h2>{home?.mode === "live" ? t.liveLeaderboard : t.officialLeaderboard}</h2><p className="muted">{home?.mode === "live" ? t.liveExplanation : t.lastMatchExplanation}</p><div className="leaderboard-live">{(home?.leaderboard ?? []).slice(0, 12).map((row) => <div className="leaderboard-row" key={row.user_id}><span className="rank">#{row.rank}</span><strong>{row.nickname ?? "—"}</strong><span>{row.points} {t.points}</span><Movement delta={row.rank_delta} /></div>)}</div></div><div className="card"><h2>{t.todaysMatches}</h2>{matches.length === 0 ? <p className="muted">{t.noMatchesToday}</p> : <div className="matches">{matches.map((match) => <MatchCard key={match.id} match={match} language={language} t={t} />)}</div>}</div></section>}{(page === "picks" || page === "worldcup") && <section className="card"><div className="section-head"><div><h2>{page === "picks" ? t.picksTitle : t.worldCupTitle}</h2><p className="muted">{page === "picks" ? t.picksIntro : t.allMatches}</p></div><button className="ghost" onClick={syncMatches}>{t.syncMatches}</button></div>{visibleMatches.length === 0 ? <p className="muted">{t.noMatchesLoaded}</p> : <div className="matches">{visibleMatches.map((match) => <MatchCard key={match.id} match={match} language={language} t={t} />)}</div>}</section>}{page === "rules" && <section className="card"><h2>{t.rulesTitle}</h2><p className="lead">{t.rulesText}</p></section>}{page === "profile" && <section className="card"><h2>{t.profileTitle}</h2><p className="muted">{me.user.email}</p><div className="split"><input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={me.user.nickname ?? t.nicknamePlaceholder} /><button onClick={saveNickname}>{t.saveProfile}</button></div></section>}<nav className="bottom-nav"><button className={page === "home" ? "active" : ""} onClick={() => setPage("home")}>{t.standings}</button><button className={page === "picks" ? "active" : ""} onClick={() => setPage("picks")}>{t.picks}</button><button className={page === "worldcup" ? "active" : ""} onClick={() => setPage("worldcup")}>{t.worldCupNav}</button><button className={page === "rules" ? "active" : ""} onClick={() => setPage("rules")}>{t.rules}</button><button className={page === "profile" ? "active" : ""} onClick={() => setPage("profile")}>{t.profile}</button></nav></>}</main>;
}
export default App;
