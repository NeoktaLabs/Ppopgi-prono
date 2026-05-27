import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initTurnstileLogin } from "./turnstile-login";
import "./styles.css";

initTurnstileLogin().catch((error) => {
  console.warn("Turnstile initialization failed", error);
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
