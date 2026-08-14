/**
 * Authentication service for ScriptIQ.
 *
 * Strategy (in priority order):
 *  1. Supabase  — when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set.
 *  2. Local backend — POST /api/auth/* on the Express dev server.
 *  3. Demo (read-only, no backend) — VITE_ENABLE_DEMO_AUTH=true in DEV only.
 *
 * Plagiarism analysis always runs client-side; auth only gates the workspace.
 */
import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

/* ── constants ────────────────────────────────────────────────────────── */

const DEMO_SESSION_KEY = "scriptiq_demo_session";
const LOCAL_SESSION_KEY = "scriptiq_local_session";
const isDemoAuthEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_AUTH === "true";

/** Base URL for the local Express API (default: http://localhost:3001). */
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:3001";

let cachedSession = null;

/* ── internal helpers ─────────────────────────────────────────────────── */

/**
 * Call the local Express backend.
 * @param {string} path - e.g. "/api/auth/login"
 * @param {"GET"|"POST"} method
 * @param {object} [body]
 * @returns {Promise<object>}
 */
async function callBackend(path, method = "GET", body) {
  const token = readLocalSession()?.token;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let resp;
  try {
    resp = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    console.error("[ScriptIQ Auth Error]", err);
    throw new Error(
      `Unable to connect to backend server at ${BACKEND_URL}. Please ensure the Express backend is running (run 'npm run dev:full' or 'npm run dev:backend').`
    );
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `Request failed (${resp.status})`);
  }
  return data;
}

/** Check that the local backend is reachable before trying auth calls. */
async function isBackendReachable() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/health`, { method: "GET" });
    return resp.ok;
  } catch {
    return false;
  }
}

function readLocalSession() {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocalSession(data) {
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(data));
  cachedSession = data;
}

function clearLocalSession() {
  localStorage.removeItem(LOCAL_SESSION_KEY);
  cachedSession = null;
}

function readDemoSession() {
  try {
    const raw = localStorage.getItem(DEMO_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Shape the local-backend response to match the Supabase session shape. */
function localToSession(data) {
  if (!data?.user) return null;
  return {
    token: data.token,
    user: {
      id: data.user.id,
      email: data.user.email,
    },
    _source: "local",
  };
}

/* ── public API ───────────────────────────────────────────────────────── */

/** Subscribe to sign-in / sign-out events (Supabase path only). */
export function onAuthStateChange(callback) {
  if (supabase) {
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      cachedSession = session;
      callback(session, event);
    });
    return () => subscription.subscription.unsubscribe();
  }
  // For local / demo paths, fire once with the current session.
  getSession().then((s) => callback(s, "INITIAL_SESSION"));
  return () => { };
}

/**
 * Return the active session (Supabase, local backend, or demo).
 * Returns null if the user is not authenticated.
 */
export async function getSession() {
  // ① Supabase
  if (supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) { cachedSession = null; return null; }
    cachedSession = data.session;
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) { cachedSession = null; return null; }
    return { ...data.session, user: userData.user };
  }

  // ② Local backend
  const stored = readLocalSession();
  if (stored?.token) {
    try {
      const data = await callBackend("/api/auth/me");
      const session = localToSession({ ...stored, user: data.user });
      cachedSession = session;
      return session;
    } catch {
      clearLocalSession();
      return null;
    }
  }

  // ③ Demo mode
  if (isDemoAuthEnabled) {
    return readDemoSession();
  }

  return null;
}

/* ── sign-in methods ──────────────────────────────────────────────────── */

/**
 * Google OAuth.
 * Tries Supabase first; falls back to mock Google sign-in on local backend.
 */
export async function signInWithGoogle() {
  // Supabase path
  if (supabase) {
    // Use the bare origin as the redirect — Supabase appends its own ?code= param.
    // detectSessionInUrl in the client will exchange the code, then onAuthStateChange
    // fires and main.js navigates to /app. Do NOT include #/app here — it breaks PKCE.
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) throw error;
    return;
  }

  // Local backend path (custom styled Google Account Chooser dialog)
  return new Promise((resolve, reject) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.id = "google-auth-backdrop";
    backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(4, 10, 24, 0.85);
      backdrop-filter: blur(8px);
      display: grid;
      place-items: center;
      opacity: 0;
      transition: opacity 0.25s ease;
      font-family: 'Roboto', 'Segoe UI', Arial, sans-serif;
    `;

    backdrop.innerHTML = `
      <div class="google-card" style="
        background: white;
        color: #1f1f1f;
        width: 90%;
        max-width: 380px;
        padding: 2.25rem 2rem 2rem;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        display: flex;
        flex-direction: column;
        transform: translateY(20px);
        transition: transform 0.25s ease;
      ">
        <div style="display: flex; justify-content: center; margin-bottom: 1rem;">
          <svg width="74" height="24" viewBox="0 0 74 24" fill="none">
            <path fill="#EA4335" d="M21.9 12c0-.7-.1-1.4-.2-2h-9.5v3.8h5.5c-.2 1.3-1 2.3-2.1 3l3.2 2.5c1.9-1.8 3.1-4.4 3.1-7.3z"/>
            <path fill="#4285F4" d="M12.2 21.9c2.7 0 4.9-.9 6.5-2.5l-3.2-2.5c-.9.6-2 .9-3.3.9-2.5 0-4.7-1.7-5.5-4L3.4 16.3c1.7 3.3 5.1 5.6 8.8 5.6z"/>
            <path fill="#FBBC05" d="M6.7 13.8c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8L3.4 7.7c-.8 1.6-1.2 3.4-1.2 5.3s.4 3.7 1.2 5.3l3.3-2.5z"/>
            <path fill="#34A853" d="M12.2 5.6c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17.1 2.5 14.9 1.5 12.2 1.5 8.5 1.5 5.1 3.8 3.4 7.1l3.3 2.5c.8-2.3 3-4 5.5-4z"/>
            <text x="26" y="17" fill="#5f6368" font-family="system-ui, sans-serif" font-weight="bold" font-size="15">oogle</text>
          </svg>
        </div>
        <h2 style="font-size: 1.3rem; font-weight: 400; text-align: center; margin: 0 0 0.25rem; color: #202124;">Choose an account</h2>
        <p style="font-size: 0.88rem; text-align: center; margin: 0 0 1.5rem; color: #5f6368;">to continue to <strong style="color: #202124;">ScriptIQ</strong></p>
        
        <div style="display: flex; flex-direction: column; border-top: 1px solid #dadce0; border-bottom: 1px solid #dadce0; margin-bottom: 1.5rem;" id="google-account-list">
          <div class="google-row" data-email="razak@knust.edu.gh" data-name="Razak Kareem" style="display: flex; align-items: center; padding: 0.75rem 0.5rem; cursor: pointer; border-bottom: 1px solid #f1f3f4; gap: 0.75rem;">
            <div style="width: 2rem; height: 2rem; border-radius: 50%; background: #e8f0fe; color: #1a73e8; display: grid; place-items: center; font-weight: 700; font-size: 0.9rem;">R</div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 0.88rem; font-weight: 500; color: #3c4043;">Razak Kareem</div>
              <div style="font-size: 0.78rem; color: #5f6368;">razak@knust.edu.gh</div>
            </div>
          </div>
          
          <div class="google-row" data-email="lecturer@ug.edu.gh" data-name="Test Lecturer" style="display: flex; align-items: center; padding: 0.75rem 0.5rem; cursor: pointer; border-bottom: 1px solid #f1f3f4; gap: 0.75rem;">
            <div style="width: 2rem; height: 2rem; border-radius: 50%; background: #e2fbf5; color: #00b4d8; display: grid; place-items: center; font-weight: 700; font-size: 0.9rem;">T</div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 0.88rem; font-weight: 500; color: #3c4043;">Test Lecturer</div>
              <div style="font-size: 0.78rem; color: #5f6368;">lecturer@ug.edu.gh</div>
            </div>
          </div>

          <div id="google-another-btn" style="display: flex; align-items: center; padding: 0.75rem 0.5rem; cursor: pointer; gap: 0.75rem;">
            <div style="width: 2rem; height: 2rem; border-radius: 50%; background: #f1f3f4; color: #5f6368; display: grid; place-items: center; font-size: 1.1rem;">👤</div>
            <div style="font-size: 0.88rem; font-weight: 500; color: #1a73e8;">Use another account</div>
          </div>
        </div>

        <div id="google-email-input-container" style="display: none; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem;">
          <div style="display: flex; flex-direction: column; gap: 0.25rem;">
            <label style="font-size: 0.78rem; font-weight: 600; color: #3c4043;">Email or phone</label>
            <input type="email" id="google-input-email" placeholder="Enter Google Email" style="font-family: inherit; font-size: 0.92rem; padding: 0.55rem 0.75rem; border: 1px solid #dadce0; border-radius: 4px; outline: none;" value="google-user@university.edu.gh">
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <button type="button" id="google-back-btn" style="background: transparent; border: none; color: #1a73e8; font-size: 0.88rem; cursor: pointer; font-weight: 500;">Back</button>
            <button type="button" id="google-next-btn" style="background: #1a73e8; border: none; color: white; padding: 0.5rem 1rem; border-radius: 4px; font-size: 0.88rem; cursor: pointer; font-weight: 500;">Next</button>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; font-size: 0.88rem;">
          <button type="button" id="google-cancel-btn" style="background: transparent; border: none; padding: 0.5rem; cursor: pointer; color: #5f6368; font-weight: 500;">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    requestAnimationFrame(() => {
      backdrop.style.opacity = "1";
      const card = backdrop.querySelector(".google-card");
      if (card) card.style.transform = "translateY(0)";
    });

    const cleanup = () => {
      backdrop.style.opacity = "0";
      const card = backdrop.querySelector(".google-card");
      if (card) card.style.transform = "translateY(20px)";
      setTimeout(() => {
        backdrop.remove();
      }, 250);
    };

    const handleEmail = async (email) => {
      cleanup();
      try {
        const data = await callBackend("/api/auth/google", "POST", { email: email.trim() });
        saveLocalSession(data);
        resolve(localToSession(data));
      } catch (err) {
        reject(err);
      }
    };

    backdrop.querySelectorAll(".google-row").forEach(row => {
      row.addEventListener("click", () => {
        handleEmail(row.dataset.email);
      });
    });

    const anotherBtn = backdrop.querySelector("#google-another-btn");
    const accountList = backdrop.querySelector("#google-account-list");
    const inputContainer = backdrop.querySelector("#google-email-input-container");
    const inputEmail = backdrop.querySelector("#google-input-email");

    anotherBtn.addEventListener("click", () => {
      accountList.style.display = "none";
      inputContainer.style.display = "flex";
      inputEmail.focus();
    });

    backdrop.querySelector("#google-back-btn").addEventListener("click", () => {
      inputContainer.style.display = "none";
      accountList.style.display = "flex";
    });

    backdrop.querySelector("#google-next-btn").addEventListener("click", () => {
      const val = inputEmail.value.trim();
      if (!val) return;
      handleEmail(val);
    });

    inputEmail.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = inputEmail.value.trim();
        if (val) handleEmail(val);
      }
    });

    backdrop.querySelector("#google-cancel-btn").addEventListener("click", () => {
      cleanup();
      reject(new Error("Google Sign-In canceled."));
    });
  });
}

/**
 * Email + password sign-in.
 * Tries Supabase first; falls back to local backend.
 */
export async function signInWithEmail(email, password) {
  // Supabase path
  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  // Local backend path
  const data = await callBackend("/api/auth/login", "POST", { email, password });
  saveLocalSession(data);
  return localToSession(data);
}

/**
 * Email + password sign-up.
 * Tries Supabase first; falls back to local backend.
 */
export async function signUpWithEmail(email, password) {
  assertStrongPassword(password);

  // Supabase path
  if (supabase) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw error;
    return data;
  }

  // Local backend path
  const data = await callBackend("/api/auth/register", "POST", { email, password });
  saveLocalSession(data);
  return localToSession(data);
}

/** Magic link (Supabase only). */
export async function signInWithMagicLink(email) {
  requireSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

/** WebAuthn passkey sign-in (Supabase only). */
export async function signInWithPasskey() {
  requireSupabase();
  if (!isPasskeySupported()) throw new Error("Passkeys require HTTPS (or localhost) and a compatible browser.");
  const { data, error } = await supabase.auth.signInWithPasskey();
  if (error) throw error;
  return data;
}

/** Register a passkey for the currently signed-in user (Supabase only). */
export async function registerPasskey() {
  requireSupabase();
  if (!await getSession()) throw new Error("Sign in first before registering a passkey.");
  if (!isPasskeySupported()) throw new Error("Passkeys require HTTPS (or localhost) and a compatible browser.");
  const { data, error } = await supabase.auth.registerPasskey();
  if (error) throw error;
  return data;
}

/** Sign out from whichever auth source is active. */
export async function signOut() {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    cachedSession = null;
    return;
  }

  // Local backend — notify server (best-effort) then clear token.
  try { await callBackend("/api/auth/logout", "POST"); } catch { /* ignore */ }
  clearLocalSession();

  // Demo
  localStorage.removeItem(DEMO_SESSION_KEY);
  cachedSession = null;
}

/** Create a local-only demo session (DEV + VITE_ENABLE_DEMO_AUTH=true only). */
export function signInDemo(email) {
  if (isSupabaseConfigured || !isDemoAuthEnabled) {
    throw new Error("Demo sign-in is disabled. Set VITE_ENABLE_DEMO_AUTH=true only for local development.");
  }
  const session = { user: { email: email || "demo@scriptiq.local", id: "demo-user" }, demo: true };
  localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
  cachedSession = session;
  return session;
}

/* ── capability flags ─────────────────────────────────────────────────── */

export function isAuthConfigured() {
  return isSupabaseConfigured;
}

export function isDemoModeEnabled() {
  return isDemoAuthEnabled;
}

export function isPasskeySupported() {
  return Boolean(window.PublicKeyCredential && window.isSecureContext);
}

/** True if the local Express backend should be used for auth. */
export function isLocalBackendMode() {
  return !isSupabaseConfigured;
}

export async function getProfile() {
  const session = await getSession();
  if (!session) return null;

  // ① Supabase path
  if (supabase) {
    const user = session.user;
    const emailParts = user.email.split("@")[0];
    const defaultName = emailParts.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    return {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.user_metadata?.name || defaultName,
      username: user.user_metadata?.username || user.user_metadata?.name || emailParts,
      avatarUrl: user.user_metadata?.avatar_url || null,
      createdAt: user.created_at,
      institution: user.user_metadata?.institution || "Supabase Workspace",
      accountType: user.user_metadata?.accountType || "Lecturer"
    };
  }

  // ② Local backend path
  const stored = readLocalSession();
  if (stored?.token) {
    try {
      const data = await callBackend("/api/auth/profile");
      return data.profile;
    } catch (err) {
      console.error("Failed to get profile from local backend:", err);
      const emailParts = session.user.email.split("@")[0];
      const defaultName = emailParts.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
      return {
        id: session.user.id,
        email: session.user.email,
        name: defaultName,
        username: emailParts,
        avatarUrl: null,
        createdAt: session.user.createdAt || new Date().toISOString(),
        institution: "University of Ghana",
        accountType: "Lecturer"
      };
    }
  }

  // ③ Demo mode
  if (session.demo || readDemoSession()) {
    const emailParts = session.user.email.split("@")[0];
    const defaultName = emailParts.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    const demoSess = readDemoSession()?.user || session.user;
    return {
      id: demoSess.id || "demo-user",
      email: demoSess.email || "demo@scriptiq.local",
      name: demoSess.name || defaultName,
      username: demoSess.username || emailParts,
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      institution: demoSess.institution || "Demo Institution",
      accountType: demoSess.accountType || "Guest Lecturer"
    };
  }

  return null;
}

export async function updateProfile(profileData) {
  if (supabase) {
    const { data, error } = await supabase.auth.updateUser({
      data: {
        full_name: profileData.name,
        username: profileData.username,
        institution: profileData.institution,
        accountType: profileData.accountType
      }
    });
    if (error) throw error;
    return data;
  }

  const stored = readLocalSession();
  if (stored?.token) {
    return await callBackend("/api/auth/profile", "POST", profileData);
  }

  if (cachedSession?.demo || readDemoSession()) {
    const demoSess = readDemoSession();
    if (demoSess) {
      demoSess.user = demoSess.user || {};
      demoSess.user.name = profileData.name;
      demoSess.user.username = profileData.username;
      demoSess.user.institution = profileData.institution;
      demoSess.user.accountType = profileData.accountType;
      localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoSess));
      cachedSession = demoSess;
      return { profile: demoSess.user };
    }
  }

  throw new Error("Cannot update profile: no session.");
}

export { isBackendReachable };

/* ── private guards ───────────────────────────────────────────────────── */

function requireSupabase() {
  if (!supabase) throw new Error("This sign-in method requires Supabase. Copy .env.example to .env and add your project credentials.");
}

function assertStrongPassword(password) {
  if (!password || password.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }
  if (!/[a-z]/.test(password)) {
    throw new Error("Password must contain at least one lowercase letter.");
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("Password must contain at least one uppercase letter.");
  }
  if (!/\d/.test(password)) {
    throw new Error("Password must contain at least one number.");
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    throw new Error("Password must contain at least one special character.");
  }
}
