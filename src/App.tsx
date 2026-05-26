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

  async function requestLink() { await api("/api/auth/request-link", { method: "POST", body: JSON.stringify({ email }) }); setMessage("Magic link sent. Check your inbox."); }
  async function saveNickname() { await api("/api/me/profile", { method: "PATCH", body: JSON.stringify({ nickname }) }); await refresh(); }
  async function createLeague() { await api("/api/leagues", { method: "POST", body: JSON.stringify({ name: leagueName }) }); setLeagueName(""); await refresh(); }
  async function joinLeague() { await api("/api/leagues/join", { method: "POST", body: JSON.stringify({ code: joinCode }) }); setJoinCode(""); await refresh(); }
  async function logout() { await api("/api/auth/logout", { method: "POST" }); setMe({ user: null, leagues: [] }); }

  if (!me) return <main className="shell"><div className="card">Loading…</div></main>;
  if (!me.user) return <main className="shell hero"><section className="card hero-card"><p className="eyebrow">World Cup</p><h1>Ppopgi Prono ⚽</h1><p className="lead">Create or join a private league, predict matches, and climb the leaderboard.</p><div className="form-row"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" /><button onClick={requestLink}>Send me a login link</button></div>{message && <p className="notice">{message}</p>}</section></main>;
  if (!me.user.nickname) return <main className="shell"><section className="card"><h1>Welcome 👋</h1><p>Choose the nickname that will appear in league standings.</p><div className="form-row"><input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Nickname" /><button onClick={saveNickname}>Continue</button></div></section></main>;

  return <main className="shell"><header className="topbar"><div><p className="eyebrow">Signed in: {me.user.email}</p><h1>Hi {me.user.nickname} 👋</h1></div><button className="ghost" onClick={logout}>Sign out</button></header><section className="grid"><div className="card"><h2>My leagues</h2>{me.leagues.length === 0 ? <p>No leagues yet.</p> : <ul className="league-list">{me.leagues.map((league) => <li key={league.id}><strong>{league.name}</strong><span>Code: {league.code}</span><span>{league.role}</span></li>)}</ul>}<div className="split"><input value={leagueName} onChange={(e) => setLeagueName(e.target.value)} placeholder="League name" /><button onClick={createLeague}>Create</button></div><div className="split"><input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="League code" /><button onClick={joinLeague}>Join</button></div></div><div className="card"><h2>{currentLeague ? `${currentLeague.name} home` : "League home"}</h2><p className="muted">The leaderboard, your score, and today’s matches will appear here.</p><div className="podium"><span>🥇 Gold</span><span>🥈 Silver</span><span>🥉 Bronze</span></div><p className="danger">The bottom 3 will be highlighted in red.</p></div></section><section className="card"><h2>Today’s matches</h2><div className="matches">{matches.length === 0 ? <p>No matches today.</p> : matches.map((match) => <article className="match" key={match.id}><span className="badge">x{match.points_multiplier}</span><h3>{match.home_team} - {match.away_team}</h3><p>{new Date(match.kickoff_at).toLocaleString("en-GB")}</p><p>{match.status}</p></article>)}</div></section><nav className="bottom-nav"><a>🏆 Standings</a><a>⚽ Picks</a><a>📅 World Cup</a><a>📜 Rules</a><a>👤 Profile</a></nav></main>;
}
export default App;
