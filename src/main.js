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
let authInitialized = false;
onAuthStateChange((session, event) => {
  const path = window.location.hash.replace(/^#/, "") || "/";

  // Guard: on first fire (page load with existing session), only redirect
  // if we're already on the login page — don't yank the user away from landing.
  if (!authInitialized) {
    authInitialized = true;
    if (session && path === "/login") {
      window.location.hash = "#/app";
    }
    return;
  }

  // Signed out while on /app — kick to login.
  if (path.startsWith("/app") && !session) {
    window.location.hash = "#/login";
    return;
  }

  // OAuth / magic-link callback: Supabase fires SIGNED_IN and we're on the
  // root URL (no hash) — push into the app.
  if (session && (path === "/" || path === "" || path === "/login")) {
    window.location.hash = "#/app";
  }
});

startRouter();
