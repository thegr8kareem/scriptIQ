# Vercel Setup — ScriptIQ

This file lists the environment variables and recommended settings for deploying the frontend to Vercel.

Required public Vite environment variables (set these in Vercel Project → Settings → Environment Variables):

- `VITE_SUPABASE_URL` — your Supabase project URL (e.g. https://xyz.supabase.co)
- `VITE_SUPABASE_ANON_KEY` — the Supabase anon (publishable) key
- `VITE_BACKEND_URL` — URL of your backend API (if you're hosting the backend separately). Defaults to `http://localhost:3001` for local dev.
- `VITE_ENABLE_DEMO_AUTH` — optional; set to `true` for DEV preview builds only (do NOT enable in Production).

Backend-related environment variables (if you deploy the `backend/` service separately):

- `PORT` — (optional) port for local runs; ignored by many PaaS providers
- `JWT_SECRET` — secret used to sign JSON Web Tokens (keep this private)
- `JWT_EXPIRES_IN` — JWT expiration (for example `7d`)

Notes:
- Copy `.env.example` to your local `.env` for local dev, but never commit `.env` to the repo.
- On Vercel, add the `VITE_*` keys under the Project → Environment Variables. Use the same key names.
- The frontend is built with Vite; the `build` script runs `vite build` and outputs into `dist` (configured in `vercel.json`).

If you want me to help add serverless API routes for the backend inside `/api`, tell me and I can migrate the Express `backend/server.js` into Vercel serverless functions.
