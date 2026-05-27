import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initTurnstileLogin } from "./turnstile-login";
import { runTurnstileGate } from "./turnstile-gate";
import "./styles.css";

async function bootstrap() {
  try {
    await runTurnstileGate();
  } catch (error) {
    console.warn("Turnstile gate failed", error);
  }

  initTurnstileLogin().catch((error) => {
    console.warn("Turnstile initialization failed", error);
  });

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
