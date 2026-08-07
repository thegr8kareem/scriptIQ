# ScriptIQ — Project Plan

Free, browser-based plagiarism detection for Ghanaian university lecturers.

## Goals

1. **Affordable access** — no commercial Turnitin-style subscriptions.
2. **Privacy by default** — student submissions stay on the lecturer's machine (IndexedDB).
3. **Secure identity** — sign-in gates the app; analysis is not uploaded to cloud.
4. **Actionable review** — TF-IDF, diff, batch graph, optional AI semantic layer.

## Architecture

| Layer | Technology | Notes |
|-------|------------|-------|
| SPA shell | Vite + vanilla JS | Landing → Login → App routing |
| Auth | Supabase | Google OAuth, email/password, magic link, passkeys (WebAuthn) |
| UI | Tailwind CSS v4 + GSAP | Dark glass theme, panel animations |
| Engine | Legacy `ScriptIQ.*` modules | Parser, TF-IDF, diff, D3 graph, transformers.js |
| Storage | IndexedDB | Submissions + comparison history (local only) |

## Feature phases (implemented)

- [x] Upload + text extraction (PDF / DOCX / TXT / ZIP batch)
- [x] TF-IDF cosine similarity + highlighted shared passages
- [x] Word-level LCS diff view
- [x] D3 similarity network for batches (3+ documents)
- [x] Optional in-browser semantic embeddings (MiniLM)
- [x] IndexedDB session restore + comparison history
- [x] Futuristic UI + marketing landing page
- [x] Authentication (Google, email, passkeys) — identity-only gate

## Auth scope

**Identity-only (chosen):** Supabase verifies who is using the tool. Plagiarism scoring, graphs, and student text remain 100% client-side. No submission data is synced to Supabase.

Future optional phase: encrypted cloud backup of batches (requires RLS + client-side encryption design).

## Supabase setup checklist

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` → `.env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
3. **Authentication → Providers:** enable Email and Google (add Google Cloud OAuth client).
4. **Authentication → Passkeys:** enable passkeys (requires HTTPS; localhost works in dev).
5. Set **Site URL** and **Redirect URLs** to your dev/prod origin (e.g. `http://localhost:5173`).

## UI routes

| Route | Purpose |
|-------|---------|
| `#/` | Marketing landing + feature cards |
| `#/login` | Google, passkey, email sign-in / sign-up |
| `#/app` | Authenticated plagiarism workflow |

## Demo mode

If `.env` is not configured, the login page offers **demo sign-in** for local UI testing only — not for production.


## Phase 8 — Trust-centred access and interface refresh

- [x] Verified route gate: ScriptIQ now validates the active identity with Supabase before showing the workspace.
- [x] PKCE OAuth: Google authentication uses PKCE, preventing OAuth tokens from being placed in the SPA router fragment.
- [x] Fail-closed defaults: without Supabase environment variables, the workspace cannot open. Local demo mode requires a development build and VITE_ENABLE_DEMO_AUTH=true.
- [x] Credential baseline: new email passwords require 12+ characters with a letter and number. Configure Supabase password strength, leaked-password protection, CAPTCHA, MFA, and rate limits in the dashboard as server-side enforcement.
- [x] Passkey readiness: passkey controls require a secure context and a compatible browser. Enable the Passkeys provider and deploy over HTTPS.
- [x] Futuristic UI system: an animated mesh, drifting grid, luminous controls, glass depth, responsive refinements, and reduced-motion fallback now unify the landing, sign-in, and workspace views.

### Required production hardening

1. Set password policy, leaked-password protection, CAPTCHA, and rate limits in Supabase Authentication.
2. Enable Google and Passkeys, then register only the final HTTPS site URL and redirect URLs.
3. Keep VITE_ENABLE_DEMO_AUTH unset in every deployed environment.
4. Never place a Supabase service-role key in this project; only the anon/publishable key belongs in .env.
