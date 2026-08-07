/**
 * Login / registration panel — Google OAuth, passkeys, email/password, magic link.
 *
 * When Supabase is not configured, shows a dev demo sign-in for local UI testing.
 */
import {
  isAuthConfigured,
  isDemoModeEnabled,
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

/**
 * Render the authentication view.
 * @param {{ navigate: Function }} ctx
 * @returns {() => void} cleanup
 */
export function renderLogin(ctx) {
  const root = document.getElementById("app");
  let mode = "signin"; // signin | signup | magic

  function render() {
    const configWarning = !isAuthConfigured()
      ? `<div class="auth-config-warning" role="alert">
           Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code>
           and add your project URL + anon key for production auth. A production build fails closed until these credentials are configured.
         </div>`
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

          ${configWarning}
          <div id="auth-message" hidden></div>

          <button type="button" class="auth-btn" id="btn-google" ${!isAuthConfigured() ? "disabled" : ""}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.083 36 24 36c-5.514 0-10-4.486-10-10s4.486-10 10-10c2.521 0 4.822.938 6.607 2.478l6.086-6.086C33.436 9.247 28.956 7 24 7 13.507 7 5 15.507 5 26s8.507 19 19 19 19-8.507 19-19c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 13 24 13c2.521 0 4.822.938 6.607 2.478l6.086-6.086C33.436 9.247 28.956 7 24 7 16.318 7 9.656 11.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 45c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 36.091 26.715 37 24 37c-5.099 0-9.444-3.277-11.012-7.846l-6.52 5.02C9.505 41.556 16.227 45 24 45z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 45 30.638 45 26c0-1.341-.138-2.65-.389-3.917z"/></svg>
            Continue with Google
          </button>

          <button type="button" class="auth-btn" id="btn-passkey" ${!isAuthConfigured() || !isPasskeySupported() ? "disabled" : ""}>
            🔐 Sign in with passkey
          </button>

          <div class="auth-divider">or email</div>

          <form id="auth-form" novalidate>
            <div class="auth-field">
              <label for="auth-email">Email</label>
              <input id="auth-email" type="email" autocomplete="email" required placeholder="you@university.edu.gh">
            </div>
            ${
              mode !== "magic"
                ? `<div class="auth-field">
                     <label for="auth-password">Password</label>
                     <input id="auth-password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" minlength="12" placeholder="••••••••">
                   </div>`
                : ""
            }
            <button type="submit" class="auth-btn auth-btn-primary" id="btn-submit">
              ${mode === "signup" ? "Create account" : mode === "magic" ? "Send magic link" : "Sign in"}
            </button>
          </form>

          <div class="auth-links">
            ${
              mode === "signin"
                ? `<button type="button" data-mode="signup">Create account</button>
                   <button type="button" data-mode="magic">Magic link</button>`
                : `<button type="button" data-mode="signin">Back to sign in</button>`
            }
          </div>

          ${
            isDemoModeEnabled()
              ? `<div class="auth-divider">development</div>
                 <button type="button" class="auth-btn" id="btn-demo">Continue in demo mode (local only)</button>`
              : `<div class="auth-divider">passkey setup</div>
                 <button type="button" class="auth-btn" id="btn-register-passkey">
                   Register a passkey (after email sign-in)
                 </button>`
          }

          <div class="auth-links" style="margin-top:1.5rem;justify-content:center;">
            <button type="button" data-nav="landing">← Back to home</button>
          </div>
        </div>
      </div>
    `;

    const card = root.querySelector(".auth-card");
    animateAuthCard(card);
    bindEvents();
  }

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

  function bindEvents() {
    root.querySelector("#btn-google")?.addEventListener("click", async () => {
      setLoading(true);
      showMessage("Redirecting to Google…", "info");
      try {
        await signInWithGoogle();
      } catch (err) {
        showMessage(err.message, "error");
        setLoading(false);
      }
    });

    root.querySelector("#btn-passkey")?.addEventListener("click", async () => {
      setLoading(true);
      try {
        await signInWithPasskey();
        ctx.navigate("/app");
      } catch (err) {
        showMessage(err.message, "error");
      } finally {
        setLoading(false);
      }
    });

    root.querySelector("#btn-register-passkey")?.addEventListener("click", async () => {
      setLoading(true);
      try {
        await registerPasskey();
        showMessage("Passkey registered — you can sign in with it next time.", "success");
      } catch (err) {
        showMessage(err.message, "error");
      } finally {
        setLoading(false);
      }
    });

    root.querySelector("#btn-demo")?.addEventListener("click", () => {
      const email = root.querySelector("#auth-email")?.value || "demo@scriptiq.local";
      signInDemo(email);
      ctx.navigate("/app");
    });

    root.querySelector("#auth-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = root.querySelector("#auth-email").value.trim();
      const password = root.querySelector("#auth-password")?.value || "";

      if (!email) {
        showMessage("Enter your email address.", "error");
        return;
      }

      setLoading(true);
      try {
        if (mode === "magic") {
          await signInWithMagicLink(email);
          showMessage("Check your inbox for the magic link.", "success");
        } else if (mode === "signup") {
          if (password.length < 12) {
            showMessage("Password must be at least 12 characters and include a letter and a number.", "error");
            setLoading(false);
            return;
          }
          await signUpWithEmail(email, password);
          showMessage("Account created — check email to confirm, or sign in if confirmation is disabled.", "success");
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

    root.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        mode = btn.dataset.mode;
        render();
      });
    });

    root.querySelector("[data-nav='landing']")?.addEventListener("click", () => ctx.navigate("/"));
  }

  // If already signed in, skip login.
  getSession().then((session) => {
    if (session) ctx.navigate("/app");
    else render();
  });

  return () => {};
}
