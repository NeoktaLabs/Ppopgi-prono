type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      appearance?: "always" | "execute" | "interaction-only";
    },
  ) => string;
};

type GateWindow = Window & { turnstile?: TurnstileApi };

async function getSiteKey() {
  const response = await fetch("/api/config", { credentials: "include" });
  if (!response.ok) return null;
  const config = await response.json().catch(() => ({})) as { turnstileSiteKey?: string | null };
  return config.turnstileSiteKey || null;
}

function loadScript() {
  if (document.querySelector("script[data-turnstile-api]")) return;
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  script.setAttribute("data-turnstile-api", "true");
  document.head.appendChild(script);
}

function waitForTurnstile() {
  return new Promise<TurnstileApi | null>((resolve) => {
    const started = Date.now();
    const interval = window.setInterval(() => {
      const api = (window as GateWindow).turnstile;
      if (api) {
        window.clearInterval(interval);
        resolve(api);
      }
      if (Date.now() - started > 8000) {
        window.clearInterval(interval);
        resolve(null);
      }
    }, 150);
  });
}

export async function runTurnstileGate() {
  if (sessionStorage.getItem("ppopgi_turnstile_gate") === "passed") return true;

  const siteKey = await getSiteKey();
  if (!siteKey) return true;

  document.body.classList.add("gate-active");
  const gate = document.createElement("div");
  gate.className = "site-gate";
  gate.innerHTML = `
    <div class="site-gate-card">
      <div class="site-gate-badge">World Cup 2026</div>
      <h1>Ppopgi Prono</h1>
      <p>Verify once, then enter the prediction arena.</p>
      <div class="site-gate-widget" data-turnstile-gate></div>
    </div>
  `;
  document.body.appendChild(gate);

  loadScript();
  const api = await waitForTurnstile();
  const container = gate.querySelector<HTMLElement>("[data-turnstile-gate]");
  if (!api || !container) {
    gate.remove();
    document.body.classList.remove("gate-active");
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    api.render(container, {
      sitekey: siteKey,
      appearance: "always",
      callback: () => {
        sessionStorage.setItem("ppopgi_turnstile_gate", "passed");
        gate.remove();
        document.body.classList.remove("gate-active");
        resolve(true);
      },
      "expired-callback": () => undefined,
      "error-callback": () => {
        gate.remove();
        document.body.classList.remove("gate-active");
        resolve(true);
      },
    });
  });
}
