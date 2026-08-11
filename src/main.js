/**
 * ScriptIQ SPA bootstrap — routing, auth gate, smooth scroll, global styles.
 *
 * Flow: landing (/) → login (/login) → authenticated app (/app).
 * Plagiarism analysis runs locally after auth; Supabase verifies identity only.
 */
import "./styles/main.css";
import Lenis from "lenis";
import { registerRoute, startRouter } from "./router.js";
import { onAuthStateChange } from "./auth/authService.js";
import { renderLanding } from "./ui/landingView.js";
import { renderLogin } from "./ui/loginView.js";
import { renderApp } from "./ui/appView.js";

/** Smooth scroll on marketing pages (disabled inside the dense app workflow). */
let lenis = null;

function initLenis() {
  if (lenis) return;
  lenis = new Lenis({ smoothWheel: true, lerp: 0.08 });
  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
}

function destroyLenis() {
  if (lenis) {
    lenis.destroy();
    lenis = null;
  }
}

registerRoute("/", (ctx) => {
  initLenis();
  return renderLanding(ctx);
});

registerRoute("/login", (ctx) => {
  initLenis();
  return renderLogin(ctx);
});

registerRoute("/app", (ctx) => {
  destroyLenis();
  renderApp(ctx);
  return () => { };
});

// Keep session in sync across tabs; redirect from /app if signed out elsewhere.
// Also handles the OAuth callback — when Supabase fires SIGNED_IN after exchanging
// the ?code= param, navigate the user into the app automatically.
onAuthStateChange((session) => {
  const path = window.location.hash.replace(/^#/, "") || "/";
  if (path.startsWith("/app") && !session) {
    window.location.hash = "#/login";
  }
  // After Google / magic-link OAuth lands back on the root URL, push to /app.
  if (session && (path === "/" || path === "" || path === "/login")) {
    window.location.hash = "#/app";
  }
});

startRouter();
