import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./lib/api";

type User = { id: string; email: string; nickname: string | null; is_global_admin?: boolean };
type League = { id: string; name: string; code: string; role: string };
type Match = { id: string; home_team: string; away_team: string; kickoff_at: string; stage: string | null; points_multiplier: number; status: string; final_home: number | null; final_away: number | null; manual_final_home?: number | null; manual_final_away?: number | null; score_source?: "api" | "manual" | "none"; live_home_score?: number | null; live_away_score?: number | null; live_minute?: number | null; effective_home_score?: number | null; effective_away_score?: number | null; effective_final_home?: number | null; effective_final_away?: number | null; is_live?: boolean };
type VisiblePrediction = { nickname: string | null; home_score: number; away_score: number; points: number };
type MyPrediction = { match_id: string; home_score: number; away_score: number; updated_at: string };
type PredictionDraft = { home: string; away: string };
type MeResponse = { user: User | null; leagues: League[] };
type LeaderboardRow = { user_id: string; nickname: string | null; points: number; rank: number; official_rank: number; rank_delta: number; movement_type: "live" | "last_match" };
type LeagueHome = { mode: "live" | "official"; leaderboard: LeaderboardRow[]; matches: Match[]; poll_seconds: number };
type Language = "en" | "fr";
type LeaguePage = "home" | "rules" | "profile" | "admin";
type Copy = Record<string, string>;

const copy: Record<Language, Copy> = {
  en: {
    loading: "Loading…",
    worldCup: "World Cup 2026",
    intro: "Create private leagues, predict every match, follow the live leaderboard and challenge your friends during the World Cup.",
    emailPlaceholder: "you@example.com",
    sendLoginLink: "Enter the arena",
    magicLinkSentTitle: "Magic link sent ✉️",
    magicLinkSent: "Check your inbox and spam folder. Your login link is on its way.",
  },
  fr: {
    loading: "Chargement…",
    worldCup: "Coupe du Monde 2026",
    intro: "Crée des ligues privées, pronostique chaque match, suis le classement en direct et affronte tes collègues pendant la Coupe du Monde.",
    emailPlaceholder: "toi@example.com",
    sendLoginLink: "Entrer dans l’arène",
    magicLinkSentTitle: "Lien magique envoyé ✉️",
    magicLinkSent: "Vérifie ta boîte mail et tes spams. Ton lien de connexion arrive.",
  },
};

function getInitialLanguage(): Language {
  const stored = localStorage.getItem("language");
  if (stored === "en" || stored === "fr") return stored;
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function LanguageToggle({ language, setLanguage }: { language: Language; setLanguage: (language: Language) => void }) {
  return <div className="language-toggle"><button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button><button className={language === "fr" ? "active" : ""} onClick={() => setLanguage("fr")}>FR</button></div>;
}

function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage());
  const [me, setMe] = useState<MeResponse | null>(null);
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const t = copy[language];

  useEffect(() => {
    localStorage.setItem("language", language);
  }, [language]);

  useEffect(() => {
    api<MeResponse>("/api/me")
      .then(setMe)
      .catch(() => setMe({ user: null, leagues: [] }));
  }, []);

  async function requestLink() {
    await api("/api/auth/request-link", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setLinkSent(true);
  }

  if (!me) {
    return <main className="shell auth-shell"><div className="panel centered">{t.loading}</div></main>;
  }

  if (!me.user) {
    return (
      <main className="shell auth-shell">
        <section className="panel hero-card landing-card">
          <div className="landing-top">
            <LanguageToggle language={language} setLanguage={setLanguage} />
            <div className="world-badge">🏆 {t.worldCup}</div>
          </div>

          <div className="landing-hero">
            <div className="hero-kicker">Prediction League</div>
            <h1>Ppopgi Prono</h1>
            <p className="landing-intro">{t.intro}</p>

            <div className="hero-tags">
              <span>⚽ Live leaderboard</span>
              <span>🔥 Private leagues</span>
              <span>🎯 Exact score points</span>
              <span>📱 Mobile friendly</span>
            </div>
          </div>

          {linkSent ? (
            <div className="magic-sent landing-success">
              <div className="magic-sent-icon">✉️</div>
              <h2>{t.magicLinkSentTitle}</h2>
              <p>{t.magicLinkSent}</p>
            </div>
          ) : (
            <div className="landing-login">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.emailPlaceholder}
                type="email"
              />
              <button onClick={requestLink}>{t.sendLoginLink}</button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return <main className="shell"><div className="panel centered">App loaded.</div></main>;
}

export default App;
