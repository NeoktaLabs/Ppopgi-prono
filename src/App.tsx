import { useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";

type User = { id: string; email: string; nickname: string | null };
type League = { id: string; name: string; code: string; role: string };
type Match = { id: string; home_team: string; away_team: string; kickoff_at: string; stage: string | null; points_multiplier: number; status: string; final_home: number | null; final_away: number | null };
type MeResponse = { user: User | null; leagues: League[] };

function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState("");
  const currentLeague = useMemo(() => me?.leagues?.[0], [me]);

  async function refresh() {
    const nextMe = await api<MeResponse>("/api/auth/me");
    setMe(nextMe);
    const today = await api<{ matches: Match[] }>("/api/worldcup/today");
    setMatches(today.matches);
  }
  useEffect(() => { refresh().catch(() => setMe({ user: null, leagues: [] })); }, []);

  async function requestLink() { await api("/api/auth/request-link", { method: "POST", body: JSON.stringify({ email }) }); setMessage("Lien magique envoyé. Vérifie ta boîte e-mail."); }
  async function saveNickname() { await api("/api/me/profile", { method: "PATCH", body: JSON.stringify({ nickname }) }); await refresh(); }
  async function createLeague() { await api("/api/leagues", { method: "POST", body: JSON.stringify({ name: leagueName }) }); setLeagueName(""); await refresh(); }
  async function joinLeague() { await api("/api/leagues/join", { method: "POST", body: JSON.stringify({ code: joinCode }) }); setJoinCode(""); await refresh(); }
  async function logout() { await api("/api/auth/logout", { method: "POST" }); setMe({ user: null, leagues: [] }); }

  if (!me) return <main className="shell"><div className="card">Chargement…</div></main>;
  if (!me.user) return <main className="shell hero"><section className="card hero-card"><p className="eyebrow">Coupe du Monde</p><h1>Ppopgi Prono ⚽</h1><p className="lead">Crée ou rejoins une ligue privée, pronostique les matches et grimpe au classement.</p><div className="form-row"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ton@email.com" type="email" /><button onClick={requestLink}>Recevoir mon lien</button></div>{message && <p className="notice">{message}</p>}</section></main>;
  if (!me.user.nickname) return <main className="shell"><section className="card"><h1>Bienvenue 👋</h1><p>Choisis ton pseudo pour apparaître dans les classements.</p><div className="form-row"><input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Pseudo" /><button onClick={saveNickname}>Continuer</button></div></section></main>;

  return <main className="shell"><header className="topbar"><div><p className="eyebrow">Connecté: {me.user.email}</p><h1>Salut {me.user.nickname} 👋</h1></div><button className="ghost" onClick={logout}>Déconnexion</button></header><section className="grid"><div className="card"><h2>Mes ligues</h2>{me.leagues.length === 0 ? <p>Aucune ligue pour le moment.</p> : <ul className="league-list">{me.leagues.map((league) => <li key={league.id}><strong>{league.name}</strong><span>Code: {league.code}</span><span>{league.role}</span></li>)}</ul>}<div className="split"><input value={leagueName} onChange={(e) => setLeagueName(e.target.value)} placeholder="Nom de la ligue" /><button onClick={createLeague}>Créer</button></div><div className="split"><input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Code ligue" /><button onClick={joinLeague}>Rejoindre</button></div></div><div className="card"><h2>{currentLeague ? `Accueil ${currentLeague.name}` : "Accueil ligue"}</h2><p className="muted">Le leaderboard, le score personnel et les matches du jour seront affichés ici.</p><div className="podium"><span>🥇 Or</span><span>🥈 Argent</span><span>🥉 Bronze</span></div><p className="danger">Les 3 derniers apparaîtront en rouge.</p></div></section><section className="card"><h2>Matches du jour</h2><div className="matches">{matches.length === 0 ? <p>Aucun match aujourd’hui.</p> : matches.map((match) => <article className="match" key={match.id}><span className="badge">x{match.points_multiplier}</span><h3>{match.home_team} - {match.away_team}</h3><p>{new Date(match.kickoff_at).toLocaleString("fr-CH")}</p><p>{match.status}</p></article>)}</div></section><nav className="bottom-nav"><a>🏆 Classement</a><a>⚽ Pronos</a><a>📅 Coupe</a><a>📜 Règles</a><a>👤 Profil</a></nav></main>;
}
export default App;
