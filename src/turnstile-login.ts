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
  reset: (widgetId?: string) => void;
};

type AppWindow = Window & {
  turnstile?: TurnstileApi;
};

let turnstileToken: string | null = null;
let turnstileWidgetId: string | null = null;
let siteKeyCache: string | null = null;
let scriptLoading = false;
let fetchPatched = false;
let renderRequested = false;

async function getTurnstileSiteKey() {
  if (siteKeyCache) return siteKeyCache;
  const response = await fetch("/api/config", { credentials: "include" });
  if (!response.ok) return null;
  const config = await response.json().catch(() => ({})) as { turnstileSiteKey?: string | null };
  siteKeyCache = config.turnstileSiteKey || null;
  return siteKeyCache;
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

function getEmailInput() {
  return document.querySelector<HTMLInputElement>('input[type="email"]');
}

function hasReasonableEmail() {
  const value = getEmailInput()?.value.trim() ?? "";
  return value.length > 3 && value.includes("@");
}

function resetTurnstile() {
  const appWindow = window as AppWindow;
  turnstileToken = null;
  if (appWindow.turnstile && turnstileWidgetId) {
    appWindow.turnstile.reset(turnstileWidgetId);
  }
}

function renderTurnstile(siteKey: string) {
  const appWindow = window as AppWindow;
  const row = findLoginFormRow();
  if (!row || !appWindow.turnstile || document.querySelector("[data-turnstile-login]")) return false;

  const container = document.createElement("div");
  container.setAttribute("data-turnstile-login", "true");
  container.className = "turnstile-login";
  row.insertAdjacentElement("afterend", container);

  turnstileWidgetId = appWindow.turnstile.render(container, {
    sitekey: siteKey,
    appearance: "interaction-only",
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
  return true;
}

async function ensureTurnstileRendered() {
  if (renderRequested || document.querySelector("[data-turnstile-login]")) return;
  if (!hasReasonableEmail()) return;

  renderRequested = true;
  const siteKey = await getTurnstileSiteKey();
  if (!siteKey) return;

  loadTurnstileScript();
  const interval = window.setInterval(() => {
    if (renderTurnstile(siteKey)) window.clearInterval(interval);
  }, 250);
  window.setTimeout(() => window.clearInterval(interval), 6000);
}

function watchEmailIntent() {
  const interval = window.setInterval(() => {
    const input = getEmailInput();
    if (!input) return;
    window.clearInterval(interval);
    input.addEventListener("input", () => void ensureTurnstileRendered());
    input.addEventListener("blur", () => void ensureTurnstileRendered());
  }, 250);
  window.setTimeout(() => window.clearInterval(interval), 10000);
}

function patchFetch() {
  if (fetchPatched) return;
  fetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isMagicLinkRequest = url.includes("/api/auth/request-link");

    if (isMagicLinkRequest && !turnstileToken) {
      await ensureTurnstileRendered();
    }

    if (isMagicLinkRequest && init?.body && turnstileToken) {
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

    const response = await originalFetch(input, init);
    if (isMagicLinkRequest) resetTurnstile();
    return response;
  };
}

export async function initTurnstileLogin() {
  patchFetch();
  watchEmailIntent();
}
