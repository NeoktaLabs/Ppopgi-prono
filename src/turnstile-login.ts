type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => void;
};

type AppWindow = Window & {
  turnstile?: TurnstileApi;
};

let turnstileToken: string | null = null;
let scriptLoading = false;

async function getTurnstileSiteKey() {
  const response = await fetch("/api/config", { credentials: "include" });
  if (!response.ok) return null;
  const config = await response.json().catch(() => ({})) as { turnstileSiteKey?: string | null };
  return config.turnstileSiteKey || null;
}

function loadTurnstileScript() {
  if (scriptLoading || document.querySelector("script[data-turnstile-api]")) return;
  scriptLoading = true;
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  script.setAttribute("data-turnstile-api", "true");
  document.head.appendChild(script);
}

function findLoginFormRow() {
  const emailInput = document.querySelector('input[type="email"]');
  if (!emailInput) return null;
  return emailInput.closest(".form-row") ?? emailInput.parentElement;
}

function renderTurnstile(siteKey: string) {
  const appWindow = window as AppWindow;
  const row = findLoginFormRow();
  if (!row || !appWindow.turnstile || document.querySelector("[data-turnstile-login]")) return;

  const container = document.createElement("div");
  container.setAttribute("data-turnstile-login", "true");
  container.className = "turnstile-login";
  row.insertAdjacentElement("afterend", container);

  appWindow.turnstile.render(container, {
    sitekey: siteKey,
    callback: (token) => {
      turnstileToken = token;
    },
    "expired-callback": () => {
      turnstileToken = null;
    },
    "error-callback": () => {
      turnstileToken = null;
    },
  });
}

function patchFetch() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("/api/auth/request-link") && init?.body && turnstileToken) {
      try {
        const body = JSON.parse(String(init.body));
        init = {
          ...init,
          body: JSON.stringify({ ...body, turnstileToken }),
        };
      } catch {
        // Leave the request unchanged if the body is not JSON.
      }
    }

    return originalFetch(input, init);
  };
}

export async function initTurnstileLogin() {
  patchFetch();
  const siteKey = await getTurnstileSiteKey();
  if (!siteKey) return;

  loadTurnstileScript();
  const interval = window.setInterval(() => renderTurnstile(siteKey), 500);
  window.setTimeout(() => window.clearInterval(interval), 10000);
}
