/**
 * Supabase client singleton for ScriptIQ authentication.
 * Only the publishable anon key is permitted in this browser bundle.
 */
import { createClient } from "@supabase/supabase-js";

/** Read deployment-specific public configuration from Vite's environment. */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

/** Reject template placeholders so the app fails closed until properly configured. */
export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  !supabaseUrl.includes("your-project") &&
  !supabaseAnonKey.includes("your-anon");

/** Create the identity client only when valid public credentials are supplied. */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        // PKCE prevents OAuth tokens from being exposed in a fragment used by our hash router.
        flowType: "pkce",
        // Enable Supabase's WebAuthn ceremony helpers for passkey actions.
        experimental: { passkey: true },
      },
    })
  : null;
