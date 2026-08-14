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

  // Local backend path (mock Google Auth selector)
  const defaultGoogleEmail = "google-user@university.edu.gh";
  const userEmail = window.prompt("Mock Google Sign-In — Enter Google Email to select account:", defaultGoogleEmail);
  if (userEmail === null) {
    throw new Error("Google Sign-In canceled.");
  }
  if (!userEmail.trim()) {
    throw new Error("A valid email address is required.");
  }

  const data = await callBackend("/api/auth/google", "POST", { email: userEmail.trim() });
  saveLocalSession(data);
  return localToSession(data);
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
    const demoSess = session.user;
    return {
      id: demoSess.id || "demo-user",
      email: demoSess.email || "demo@scriptiq.local",
      name: defaultName,
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      institution: "Demo Institution",
      accountType: "Guest Lecturer"
    };
  }

  return null;
}

export async function updateProfile(profileData) {
  if (supabase) {
    const { data, error } = await supabase.auth.updateUser({
      data: {
        full_name: profileData.name,
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

  throw new Error("Cannot update profile in demo mode.");
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
