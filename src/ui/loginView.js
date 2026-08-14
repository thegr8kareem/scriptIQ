/**
 * ScriptIQ Login / Registration view.
 *
 * Supports:
 *  • Google OAuth (Supabase only)
 *  • Passkeys (Supabase only)
 *  • Email/password sign-in + sign-up via Supabase OR local backend
 *  • Magic link (Supabase only)
 *  • Demo session (DEV + VITE_ENABLE_DEMO_AUTH=true)
 */
import {
  isAuthConfigured,
  isDemoModeEnabled,
  isLocalBackendMode,
  isPasskeySupported,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signInWithMagicLink,
  signInWithPasskey,
  registerPasskey,
  signInDemo,
  getSession,
} from "../auth/authService.js";
import { animateAuthCard } from "./animations.js";

export function renderLogin(ctx) {
  const root = document.getElementById("app");
  let mode = "signin"; // signin | signup | magic

  function render() {
    const backendMode = isLocalBackendMode();
    const supabaseMode = isAuthConfigured();

    /* ── mode label ─────────────────────────────────────────────────── */
    const modeLabel = supabaseMode
      ? "Supabase Auth"
      : "Local Backend Auth";

    const modeBadge = `
      <div class="auth-mode-badge">
        <span class="auth-mode-dot ${supabaseMode ? "dot-supabase" : "dot-local"}"></span>
        ${modeLabel}
      </div>`;

    /* ── OAuth / passkey buttons ────────────────────────────────────── */
    const googleButton = `
      <button type="button" class="auth-btn" id="btn-google">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.083 36 24 36c-5.514 0-10-4.486-10-10s4.486-10 10-10c2.521 0 4.822.938 6.607 2.478l6.086-6.086C33.436 9.247 28.956 7 24 7 13.507 7 5 15.507 5 26s8.507 19 19 19 19-8.507 19-19c0-1.341-.138-2.65-.389-3.917z"/>
          <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 13 24 13c2.521 0 4.822.938 6.607 2.478l6.086-6.086C33.436 9.247 28.956 7 24 7 16.318 7 9.656 11.337 6.306 14.691z"/>
          <path fill="#4CAF50" d="M24 45c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 36.091 26.715 37 24 37c-5.099 0-9.444-3.277-11.012-7.846l-6.52 5.02C9.505 41.556 16.227 45 24 45z"/>
          <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 45 30.638 45 26c0-1.341-.138-2.65-.389-3.917z"/>
        </svg>
        Continue with Google
      </button>`;

    const passkeyButton = supabaseMode
      ? `<button type="button" class="auth-btn" id="btn-passkey" ${!isPasskeySupported() ? "disabled title='Requires HTTPS and a compatible browser'" : ""}>
          🔐 Sign in with passkey
        </button>`
      : "";

    const oauthSection = `
      ${googleButton}
      ${passkeyButton}
      <div class="auth-divider">or email</div>`;

    /* ── password field ─────────────────────────────────────────────── */
    const passwordField = mode !== "magic"
      ? `
        <div class="auth-field">
          <label for="auth-password">Password ${mode === "signup" ? '<span class="auth-hint">(min 12 chars + upper + lower + num + special)</span>' : ""}</label>
          <input id="auth-password" type="password"
            autocomplete="${mode === "signup" ? "new-password" : "current-password"}"
            minlength="12" placeholder="••••••••••••">
          ${mode === "signup" ? '<div class="password-strength" id="pwd-strength" aria-live="polite"></div>' : ""}
        </div>` : "";

    /* ── submit label ───────────────────────────────────────────────── */
    const submitLabel =
      mode === "signup" ? "Create account" :
      mode === "magic"  ? "Send magic link" :
                          "Sign in";

    /* ── magic link (Supabase only) ─────────────────────────────────── */
    const magicLinkOption = supabaseMode
      ? `<button type="button" data-mode="magic">Magic link</button>`
      : "";

    /* ── extra options below form ───────────────────────────────────── */
    const extraSection = isDemoModeEnabled()
      ? `<div class="auth-divider">development</div>
         <button type="button" class="auth-btn" id="btn-demo">Continue in demo mode (local only)</button>`
      : supabaseMode
        ? `<div class="auth-divider">passkey setup</div>
           <button type="button" class="auth-btn" id="btn-register-passkey">Register a passkey (after email sign-in)</button>`
        : "";

    root.innerHTML = `
      <div class="mesh-bg" aria-hidden="true"></div>
      <div class="auth-shell page-enter">
        <div class="auth-card glass-panel" role="dialog" aria-labelledby="auth-title">

          <div class="brand" style="margin-bottom:1.25rem;">
            <span class="brand-mark">S</span>
            <div>
              <h1 id="auth-title" style="font-size:1.15rem;margin:0;">ScriptIQ</h1>
              <p class="tagline">Secure access to your workspace</p>
            </div>
          </div>

          ${modeBadge}
          <div id="auth-message" hidden></div>

          ${oauthSection}

          <form id="auth-form" novalidate>
            <div class="auth-field">
              <label for="auth-email">Email</label>
              <input id="auth-email" type="email" autocomplete="email"
                required placeholder="you@university.edu.gh">
            </div>
            ${passwordField}
            <button type="submit" class="auth-btn auth-btn-primary" id="btn-submit">
              ${submitLabel}
            </button>
          </form>

          <div class="auth-links">
            ${mode === "signin"
              ? `<button type="button" data-mode="signup">Create account</button>
                 ${magicLinkOption}`
              : `<button type="button" data-mode="signin">Back to sign in</button>`
            }
          </div>

          ${extraSection}

          <div class="auth-links" style="margin-top:1.5rem;justify-content:center;">
            <button type="button" data-nav="landing">← Back to home</button>
          </div>
        </div>
      </div>
    `;

    animateAuthCard(root.querySelector(".auth-card"));
    bindEvents();
  }

  /* ── helpers ──────────────────────────────────────────────────────── */

  function showMessage(text, type = "info") {
    const el = root.querySelector("#auth-message");
    if (!el) return;
    el.hidden = false;
    el.className = `auth-message ${type}`;
    el.textContent = text;
  }

  function setLoading(loading) {
    root.querySelectorAll("button, input").forEach((el) => {
      if (el.id === "btn-demo") return;
      el.disabled = loading;
    });
  }

  function updatePasswordStrength(password) {
    const el = root.querySelector("#pwd-strength");
    if (!el) return;
    const checks = [
      password.length >= 12,
      /[a-z]/i.test(password),
      /\d/.test(password),
      /[^a-z0-9]/i.test(password),
    ];
    const score = checks.filter(Boolean).length;
    const labels = ["", "Weak", "Fair", "Good", "Strong"];
    const colors = ["", "#ff4d6d", "#fbbf24", "#4ade80", "#00f5d4"];
    el.innerHTML = score > 0
      ? `<div class="pwd-bar-wrap"><div class="pwd-bar" style="width:${score * 25}%;background:${colors[score]}"></div></div>
         <span style="color:${colors[score]};font-size:0.75rem;">${labels[score]}</span>`
      : "";
  }

  /* ── events ───────────────────────────────────────────────────────── */

  function bindEvents() {
    /* Google */
    root.querySelector("#btn-google")?.addEventListener("click", async () => {
      setLoading(true);
      showMessage("Redirecting to Google…", "info");
      try { await signInWithGoogle(); }
      catch (err) { showMessage(err.message, "error"); setLoading(false); }
    });

    /* Passkey sign-in */
    root.querySelector("#btn-passkey")?.addEventListener("click", async () => {
      setLoading(true);
      try { await signInWithPasskey(); ctx.navigate("/app"); }
      catch (err) { showMessage(err.message, "error"); }
      finally { setLoading(false); }
    });

    /* Register passkey */
    root.querySelector("#btn-register-passkey")?.addEventListener("click", async () => {
      setLoading(true);
      try {
        await registerPasskey();
        showMessage("Passkey registered — you can sign in with it next time.", "success");
      } catch (err) { showMessage(err.message, "error"); }
      finally { setLoading(false); }
    });

    /* Demo */
    root.querySelector("#btn-demo")?.addEventListener("click", () => {
      const email = root.querySelector("#auth-email")?.value || "demo@scriptiq.local";
      signInDemo(email);
      ctx.navigate("/app");
    });

    /* Password strength meter */
    root.querySelector("#auth-password")?.addEventListener("input", (e) => {
      updatePasswordStrength(e.target.value);
    });

    /* Form submit */
    root.querySelector("#auth-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = root.querySelector("#auth-email").value.trim();
      const password = root.querySelector("#auth-password")?.value || "";

      if (!email) { showMessage("Enter your email address.", "error"); return; }

      setLoading(true);
      try {
        if (mode === "magic") {
          await signInWithMagicLink(email);
          showMessage("Check your inbox for the magic link.", "success");
        } else if (mode === "signup") {
          await signUpWithEmail(email, password);
          // Local backend returns a session immediately; Supabase needs confirmation.
          if (isLocalBackendMode()) {
            showMessage("Account created! Signing you in…", "success");
            setTimeout(() => ctx.navigate("/app"), 800);
          } else {
            showMessage("Account created — check your email to confirm, then sign in.", "success");
          }
        } else {
          await signInWithEmail(email, password);
          ctx.navigate("/app");
        }
      } catch (err) {
        showMessage(err.message, "error");
      } finally {
        setLoading(false);
      }
    });

    /* Mode switches */
    root.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => { mode = btn.dataset.mode; render(); });
    });

    /* Back to landing */
    root.querySelector("[data-nav='landing']")?.addEventListener("click", () => ctx.navigate("/"));
  }

  /* Skip login if already authenticated */
  getSession().then((session) => {
    if (session) ctx.navigate("/app");
    else render();
  });

  return () => {};
}
