import { useEffect, useMemo, useState } from "react";

type Language = "en" | "fr";
type Countdown = {
  years: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
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

function App() {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [countdown, setCountdown] = useState(() => getCountdown(EURO_2028_OPENING_TARGET));
  const t = copy[language];

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

      <footer className="season-footer">{t.footer}</footer>
    </main>
  );
}

export default App;
