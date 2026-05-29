const TURNSTILE_PASSED_KEY = "turnstileGatewayPassed";

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

type AppWindow = Window & {
  turnstile?: TurnstileApi;
};

let siteKeyCache: string | null = null;

async function getTurnstileSiteKey() {
  if (siteKeyCache) return siteKeyCache;
  const response = await fetch("/api/config", { credentials: "include" });
  if (!response.ok) return null;
  const config = (await response.json().catch(() => ({}))) as { turnstileSiteKey?: string | null };
  siteKeyCache = config.turnstileSiteKey || null;
  return siteKeyCache;
}

function hasPassedGateway() {
  return localStorage.getItem(TURNSTILE_PASSED_KEY) === "1";
}

function markGatewayPassed() {
  localStorage.setItem(TURNSTILE_PASSED_KEY, "1");
}

function hasDevAuthBypassMarker() {
  return new URL(window.location.href).searchParams.get("devAuth") === "1";
}

function loadTurnstileScript() {
  if (document.querySelector("script[data-turnstile-api]")) return;
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  script.setAttribute("data-turnstile-api", "true");
  document.head.appendChild(script);
}

function createGatewayUi() {
  const overlay = document.createElement("div");
  overlay.className = "turnstile-gateway";
  overlay.innerHTML = `<div class="turnstile-gateway-card"><h2>Security check</h2><p>Please verify once to enter Oddzz.</p><div data-turnstile-gateway></div><p class="turnstile-gateway-error" hidden>Verification failed. Please try again.</p></div>`;
  document.body.appendChild(overlay);
  return overlay;
}

async function verifyGatewayToken(token: string) {
  const response = await fetch("/api/turnstile/gateway-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ turnstileToken: token }),
  });
  if (!response.ok) throw new Error("Gateway verification failed");
}

export async function initTurnstileLogin() {
  if (hasDevAuthBypassMarker()) {
    markGatewayPassed();
    return;
  }
  if (hasPassedGateway()) return;

  const siteKey = await getTurnstileSiteKey();
  if (!siteKey) return;

  const overlay = createGatewayUi();
  const errorNode = overlay.querySelector<HTMLElement>(".turnstile-gateway-error");
  const container = overlay.querySelector<HTMLElement>("[data-turnstile-gateway]");
  if (!container) return;

  loadTurnstileScript();
  const appWindow = window as AppWindow;

  await new Promise<void>((resolve) => {
    const interval = window.setInterval(() => {
      if (!appWindow.turnstile) return;
      window.clearInterval(interval);
      appWindow.turnstile.render(container, {
        sitekey: siteKey,
        appearance: "always",
        callback: (token) => {
          void (async () => {
            try {
              await verifyGatewayToken(token);
              markGatewayPassed();
              overlay.remove();
              resolve();
            } catch {
              if (errorNode) errorNode.hidden = false;
            }
          })();
        },
        "expired-callback": () => {
          if (errorNode) errorNode.hidden = false;
        },
        "error-callback": () => {
          if (errorNode) errorNode.hidden = false;
        },
      });
    }, 150);
  });
}
