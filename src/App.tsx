import { useEffect, useMemo, useState } from "react";

type Language = "en" | "fr";
type Countdown = {
  years: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};
type HallOfFameMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  stage: string | null;
  venue: string | null;
  finalHome: number | null;
  finalAway: number | null;
};
type HallOfFamePrediction = {
  matchId: string;
  homeScore: number | null;
  awayScore: number | null;
  points: number;
  exact: boolean;
  correctResult: boolean;
  bonusUsed: boolean;
};
type HallOfFameRanking = {
  userId: string;
  nickname: string | null;
  isAi?: boolean;
  rank: number;
  points: number;
  exactScores: number;
  correctResults: number;
  predictionsCount: number;
  bonusesUsed: number;
  predictions: HallOfFamePrediction[];
};
type HallOfFameCompetition = {
  id: string;
  name: string;
  winner: string;
  generatedAt?: string | null;
  matches: HallOfFameMatch[];
  rankings: HallOfFameRanking[];
};
type HallOfFameArchive = {
  generatedAt: string | null;
  competitions: HallOfFameCompetition[];
};

const EURO_2028_OPENING_TARGET = new Date("2028-06-09T19:00:00.000Z");

const copy = {
  en: {
    languageLabel: "Language",
    eyebrow: "Oddzz World Cup Predictions",
    title: "Thank you for playing.",
    intro:
      "The World Cup edition of Oddzz is now over. Huge thanks to every player who joined, predicted, climbed leaderboards, challenged OddzzAI, and made the tournament more fun together.",
    next: "Next main event",
    event: "UEFA EURO 2028",
    countdownLabel: "Countdown to the opening evening",
    years: "Years",
    days: "Days",
    hours: "Hours",
    minutes: "Minutes",
    seconds: "Seconds",
    closing: "See you in 2028 for the next prediction battle.",
    hallTitle: "Hall of Fame",
    hallIntro: "A permanent snapshot of past Oddzz competitions, starting with the World Cup 2026 final ranking.",
    hallEmpty: "The World Cup 2026 Hall of Fame is being prepared.",
    hallLoading: "Loading Hall of Fame…",
    champion: "Champion",
    finalRanking: "Final ranking",
    player: "Player",
    points: "Points",
    exact: "Exact",
    correct: "Correct",
    predicted: "Predicted",
    predictionsTitle: "Prediction history",
    finalScore: "Final score",
    pick: "Pick",
    noPick: "N/A",
    bonus: "Bonus x5",
    close: "Close",
    footer: "Oddzz - Built with love and care by Neokta Labs",
  },
  fr: {
    languageLabel: "Langue",
    eyebrow: "Oddzz World Cup Predictions",
    title: "Merci d’avoir joué.",
    intro:
      "L’édition Coupe du Monde d’Oddzz est maintenant terminée. Un immense merci à tous les joueurs qui ont participé, pronostiqué, grimpé dans les classements, défié OddzzAI, et rendu le tournoi plus fun ensemble.",
    next: "Prochain grand rendez-vous",
    event: "UEFA EURO 2028",
    countdownLabel: "Compte à rebours avant la soirée d’ouverture",
    years: "Années",
    days: "Jours",
    hours: "Heures",
    minutes: "Minutes",
    seconds: "Secondes",
    closing: "Rendez-vous en 2028 pour la prochaine bataille de pronostics.",
    hallTitle: "Hall of Fame",
    hallIntro: "Un snapshot permanent des anciennes compétitions Oddzz, en commençant par le classement final de la Coupe du Monde 2026.",
    hallEmpty: "Le Hall of Fame Coupe du Monde 2026 est en préparation.",
    hallLoading: "Chargement du Hall of Fame…",
    champion: "Champion",
    finalRanking: "Classement final",
    player: "Joueur",
    points: "Points",
    exact: "Exacts",
    correct: "Corrects",
    predicted: "Pronostiqués",
    predictionsTitle: "Historique des pronostics",
    finalScore: "Score final",
    pick: "Prono",
    noPick: "N/A",
    bonus: "Bonus x5",
    close: "Fermer",
    footer: "Oddzz - Built with love and care by Neokta Labs",
  },
} satisfies Record<Language, Record<string, string>>;

function initialLanguage(): Language {
  const stored = localStorage.getItem("oddzz_language");
  if (stored === "en" || stored === "fr") return stored;
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function getCountdown(target: Date): Countdown {
  const now = new Date();
  if (now >= target) return { years: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

  let years = target.getFullYear() - now.getFullYear();
  const anniversary = new Date(now);
  anniversary.setFullYear(now.getFullYear() + years);

  if (anniversary > target) {
    years -= 1;
    anniversary.setFullYear(now.getFullYear() + years);
  }

  const remaining = Math.max(0, target.getTime() - anniversary.getTime());
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  return { years, days, hours, minutes, seconds };
}

function formatDate(value: string, language: Language) {
  return new Date(value).toLocaleDateString(language === "fr" ? "fr-CH" : "en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function predictionClass(prediction: HallOfFamePrediction) {
  if (prediction.homeScore === null || prediction.awayScore === null || prediction.points === 0) return "wrong";
  if (prediction.exact) return "exact";
  if (prediction.correctResult) return "correct";
  return "wrong";
}

function App() {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [countdown, setCountdown] = useState(() => getCountdown(EURO_2028_OPENING_TARGET));
  const [archive, setArchive] = useState<HallOfFameArchive | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<HallOfFameRanking | null>(null);
  const t = copy[language];
  const competition = archive?.competitions[0] ?? null;

  const countdownItems = useMemo(
    () => [
      { label: t.years, value: countdown.years },
      { label: t.days, value: countdown.days },
      { label: t.hours, value: countdown.hours },
      { label: t.minutes, value: countdown.minutes },
      { label: t.seconds, value: countdown.seconds },
    ],
    [countdown, t],
  );

  useEffect(() => {
    localStorage.setItem("oddzz_language", language);
    document.documentElement.lang = language;
    document.title =
      language === "fr"
        ? "Oddzz - Merci pour la Coupe du Monde"
        : "Oddzz - Thank you for the World Cup";
  }, [language]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown(getCountdown(EURO_2028_OPENING_TARGET));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/hall-of-fame/world-cup-2026.json")
      .then(async (response) => (response.ok ? ((await response.json()) as HallOfFameArchive) : null))
      .then((payload) => setArchive(payload))
      .catch(() => setArchive(null));
  }, []);

  return (
    <main className="season-closed-page">
      <nav className="season-nav" aria-label={t.languageLabel}>
        <a className="brand" href="/" aria-label="Oddzz home">
          Oddzz
        </a>
        <div className="language-switch">
          <button
            type="button"
            className={language === "en" ? "active" : ""}
            onClick={() => setLanguage("en")}
          >
            EN
          </button>
          <button
            type="button"
            className={language === "fr" ? "active" : ""}
            onClick={() => setLanguage("fr")}
          >
            FR
          </button>
        </div>
      </nav>

      <section className="thank-you-hero" aria-labelledby="season-title">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 id="season-title">{t.title}</h1>
        <p className="intro">{t.intro}</p>

        <div className="next-event">
          <span>{t.next}</span>
          <strong>{t.event}</strong>
        </div>

        <div className="countdown" aria-label={t.countdownLabel}>
          {countdownItems.map((item) => (
            <div className="countdown-tile" key={item.label}>
              <strong>{String(item.value).padStart(2, "0")}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <p className="closing">{t.closing}</p>
      </section>

      <section className="hall-of-fame" aria-labelledby="hall-title">
        <div className="hall-copy">
          <p className="eyebrow">{t.hallTitle}</p>
          <h2 id="hall-title">{competition?.name ?? "World Cup 2026"}</h2>
          <p>{t.hallIntro}</p>
          <span>
            {t.champion}: <strong>{competition?.winner ?? "Spain"}</strong>
          </span>
        </div>

        {!archive ? (
          <p className="hall-empty">{t.hallLoading}</p>
        ) : !competition || competition.rankings.length === 0 ? (
          <p className="hall-empty">{t.hallEmpty}</p>
        ) : (
          <div className="hall-table" aria-label={t.finalRanking}>
            <div className="hall-row hall-head">
              <span>#</span>
              <span>{t.player}</span>
              <span>{t.points}</span>
              <span>{t.exact}</span>
              <span>{t.correct}</span>
              <span>{t.predicted}</span>
            </div>
            {competition.rankings.map((row) => (
              <button
                type="button"
                className={`hall-row rank-${row.rank} ${row.isAi ? "is-ai" : ""}`}
                key={row.userId}
                onClick={() => setSelectedPlayer(row)}
              >
                <span>#{row.rank}</span>
                <strong>
                  {row.nickname ?? "—"}
                  {row.isAi && <small>AI</small>}
                </strong>
                <span>{row.points}</span>
                <span>{row.exactScores}</span>
                <span>{row.correctResults}</span>
                <span>{row.predictionsCount}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedPlayer && competition && (
        <div className="fame-modal" role="dialog" aria-modal="true" aria-label={`${t.predictionsTitle}: ${selectedPlayer.nickname ?? ""}`}>
          <div className="fame-modal-card">
            <button className="modal-close" type="button" onClick={() => setSelectedPlayer(null)} aria-label={t.close}>
              ×
            </button>
            <p className="eyebrow">{t.predictionsTitle}</p>
            <h3>
              #{selectedPlayer.rank} {selectedPlayer.nickname}
            </h3>
            <div className="prediction-archive-list">
              {selectedPlayer.predictions.map((prediction) => {
                const match = competition.matches.find((item) => item.id === prediction.matchId);
                if (!match) return null;
                const hasPick = prediction.homeScore !== null && prediction.awayScore !== null;
                return (
                  <article className={`prediction-archive-card ${predictionClass(prediction)}`} key={prediction.matchId}>
                    <div>
                      <span>{formatDate(match.kickoffAt, language)}</span>
                      {match.stage && <span>{match.stage}</span>}
                      {match.venue && <span>{match.venue}</span>}
                    </div>
                    <strong>
                      {match.homeTeam} vs {match.awayTeam}
                    </strong>
                    <div className="prediction-scores">
                      <span>
                        <small>{t.finalScore}</small>
                        <b>
                          {match.finalHome ?? "–"}:{match.finalAway ?? "–"}
                        </b>
                      </span>
                      <span>
                        <small>{t.pick}</small>
                        <b>
                          {hasPick ? `${prediction.homeScore}:${prediction.awayScore}` : t.noPick}
                        </b>
                      </span>
                      <span>
                        <small>{t.points}</small>
                        <b>{prediction.points}</b>
                      </span>
                    </div>
                    {prediction.bonusUsed && <em>{t.bonus}</em>}
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <footer className="season-footer">{t.footer}</footer>
    </main>
  );
}

export default App;
