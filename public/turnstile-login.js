(() => {
  let turnstileToken = null;

  async function getConfig() {
    try {
      const response = await fetch('/api/config', { credentials: 'include' });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  function findLoginFormRow() {
    const emailInput = document.querySelector('input[type="email"]');
    if (!emailInput) return null;
    return emailInput.closest('.form-row') || emailInput.parentElement;
  }

  function renderTurnstile(siteKey) {
    const row = findLoginFormRow();
    if (!row || !window.turnstile || document.querySelector('[data-turnstile-login]')) return;

    const container = document.createElement('div');
    container.setAttribute('data-turnstile-login', 'true');
    container.className = 'turnstile-login';
    row.insertAdjacentElement('afterend', container);

    window.turnstile.render(container, {
      sitekey: siteKey,
      callback: (token) => {
        turnstileToken = token;
      },
      'expired-callback': () => {
        turnstileToken = null;
      },
      'error-callback': () => {
        turnstileToken = null;
      },
    });
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes('/api/auth/request-link') && init.body && turnstileToken) {
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

  async function init() {
    const config = await getConfig();
    if (!config?.turnstileSiteKey) return;

    const tryRender = () => renderTurnstile(config.turnstileSiteKey);
    const interval = window.setInterval(tryRender, 500);
    window.setTimeout(() => window.clearInterval(interval), 10000);
    tryRender();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
