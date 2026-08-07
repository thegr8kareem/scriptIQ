/**
 * Authentication service for Google OAuth, email credentials, magic links, and passkeys.
 * All analysis data remains in IndexedDB; Supabase is used only to verify identity.
 */
import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

/** Storage key reserved for an explicitly enabled local demonstration session. */
const DEMO_SESSION_KEY = "scriptiq_demo_session";

/** Demo mode is never available in a production bundle or by default in development. */
const isDemoAuthEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_AUTH === "true";

/** Cache the most recently observed session to keep auth event handling responsive. */
let cachedSession = null;

/** Subscribe to sign-in, sign-out, and token refresh events. */
export function onAuthStateChange(callback) {
  if (!supabase) {
    callback(isDemoAuthEnabled ? readDemoSession() : null);
    return () => {};
  }
  const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
    cachedSession = session;
    callback(session);
  });
  return () => subscription.subscription.unsubscribe();
}

/** Return a server-verified session, not merely a deserialized local browser value. */
export async function getSession() {
  if (!supabase) return isDemoAuthEnabled ? readDemoSession() : null;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    cachedSession = null;
    return null;
  }
  cachedSession = data.session;
  // getUser validates the access token remotely before the workspace is unlocked.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    cachedSession = null;
    return null;
  }
  return { ...data.session, user: userData.user };
}

/** Start the PKCE-protected Google OAuth flow. */
export async function signInWithGoogle() {
  requireSupabase();
  const redirectTo = `${window.location.origin}${window.location.pathname}#/app`;
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (error) throw error;
}

/** Authenticate an existing email/password account. */
export async function signInWithEmail(email, password) {
  requireSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** Create an email account after applying a client-side password-strength baseline. */
export async function signUpWithEmail(email, password) {
  requireSupabase();
  assertStrongPassword(password);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}#/app` },
  });
  if (error) throw error;
  return data;
}

/** Send a one-time sign-in link to the supplied mailbox. */
export async function signInWithMagicLink(email) {
  requireSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}#/app` },
  });
  if (error) throw error;
}

/** Trigger a discoverable WebAuthn passkey sign-in. */
export async function signInWithPasskey() {
  requireSupabase();
  if (!isPasskeySupported()) throw new Error("Passkeys require HTTPS (or localhost) and a compatible browser.");
  const { data, error } = await supabase.auth.signInWithPasskey();
  if (error) throw error;
  return data;
}

/** Register a hardware- or platform-backed passkey for the verified current user. */
export async function registerPasskey() {
  requireSupabase();
  if (!await getSession()) throw new Error("Sign in first before registering a passkey.");
  if (!isPasskeySupported()) throw new Error("Passkeys require HTTPS (or localhost) and a compatible browser.");
  const { data, error } = await supabase.auth.registerPasskey();
  if (error) throw error;
  return data;
}

/** Revoke the active session locally and with Supabase. */
export async function signOut() {
  if (!supabase) {
    localStorage.removeItem(DEMO_SESSION_KEY);
    cachedSession = null;
    return;
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  cachedSession = null;
}

/** Create a clearly labeled local-only session for interface testing. */
export function signInDemo(email) {
  if (isSupabaseConfigured || !isDemoAuthEnabled) {
    throw new Error("Demo sign-in is disabled. Set VITE_ENABLE_DEMO_AUTH=true only for local development.");
  }
  const session = { user: { email: email || "demo@scriptiq.local", id: "demo-user" }, demo: true };
  localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
  cachedSession = session;
  return session;
}

/** Report whether real Supabase credentials are available. */
export function isAuthConfigured() {
  return isSupabaseConfigured;
}

/** Report whether the intentionally insecure demonstration path is enabled. */
export function isDemoModeEnabled() {
  return isDemoAuthEnabled;
}

/** Report browser and secure-context support for WebAuthn passkeys. */
export function isPasskeySupported() {
  return Boolean(window.PublicKeyCredential && window.isSecureContext);
}

/** Fail closed if a real provider action is requested without project credentials. */
function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured. Copy .env.example to .env and add the project URL and anon key.");
}

/** Read the non-production local demo session defensively. */
function readDemoSession() {
  try {
    const raw = localStorage.getItem(DEMO_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Enforce a strong baseline before the server-side Supabase password policy runs. */
function assertStrongPassword(password) {
  if (password.length < 12 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
    throw new Error("Use at least 12 characters with a letter and a number.");
  }
}
