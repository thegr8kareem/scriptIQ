# ScriptIQ

Free, browser-based plagiarism detection for lecturers — built for Ghanaian
universities that can't afford commercial subscriptions. Everything runs
client-side: submissions never leave the lecturer's machine.

## Quick start

```bash
npm install
cp .env.example .env   # add Supabase URL + anon key (see PLAN.md)
npm run dev            # http://localhost:5173
```

Open the app → **Sign in** (or use demo mode if `.env` is not configured) → upload submissions.

Production build:

```bash
npm run build
npm run preview
```

Deploy the `dist/` folder to any static host with HTTPS (required for passkeys).

## Authentication

ScriptIQ uses **Supabase Auth** (identity-only):

| Method | How |
|--------|-----|
| Google | OAuth — configure in Supabase Dashboard |
| Email | Password sign-in / sign-up + optional magic link |
| Passkeys | WebAuthn — enable in Dashboard → Authentication → Passkeys |

Copy `.env.example` to `.env`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Important:** Only the anon (publishable) key goes in the frontend. Auth gates access to the app; plagiarism analysis still runs locally.

Without `.env`, **demo sign-in** is available for local development only.

See [PLAN.md](./PLAN.md) for full Supabase setup steps.

## Batch uploads

Upload files individually, or drop in a **`.zip` of a whole class** — the same
JSZip already used for `.docx` expands it. Nested folders are fine; macOS and
Windows archive noise (`__MACOSX/`, `.DS_Store`, `Thumbs.db`, dotfiles) is
ignored, and non-document members are reported rather than failing the batch.
Limits: 300 documents and 250 MB uncompressed per archive.

Above five documents the extracted-text panel switches to a compact roster —
one scrollable row per submission with its word counts, each text collapsed
behind a toggle. Two files still show their text inline as before.

## Demo walkthrough

Upload all four files in `samples/` at once, then:

1. **Batch overview** — a graph appears. Three essays cluster together (the
   original, a paraphrase of it, and a partial copy); the cocoa-farming essay
   sits apart. Drag the threshold slider to see weaker links appear.
2. **Click the thickest red edge** — it jumps straight into that pair's diff.
3. **Text diff tab** — amber blocks show passages rewritten in place; that's
   the paraphrasing.
4. **Shared passages tab** — the TF-IDF score plus verbatim runs highlighted
   by length (yellow 3–4 words, amber 5–7, red 8+).
5. **Enable AI semantic analysis** — downloads the model once, then scores
   meaning rather than wording. The paraphrase pair scores much higher here
   than TF-IDF alone suggests.
6. **Reload the page** — documents, graph, and comparison history all come
   back from IndexedDB.

## Tests

```
npm test                                    # algorithms — no dependencies
npm install jszip && node tests/test-archive.js   # ZIP batch upload
```

## Project structure

```
index.html              Vite entry + CDN libs (PDF.js, JSZip, D3)
src/
  main.js               SPA bootstrap + routing
  auth/                 Supabase client + auth service
  ui/                   Landing, login, app shell + GSAP animations
  legacy/               ScriptIQ engine (parser, similarity, graph, …)
  styles/main.css       Tailwind + futuristic theme
js/                     Original modules (kept for reference / tests)
PLAN.md                 Proposal + architecture notes
samples/                demo documents
```

## Dependencies

| Package | Use |
|---------|-----|
| Vite | Dev server + production bundle |
| Tailwind CSS v4 | Dark glass UI |
| GSAP | Hero, panel, and score animations |
| Lenis | Smooth scroll on landing page |
| @supabase/supabase-js | Google / email / passkey auth |
| PDF.js, JSZip, D3 (CDN) | Parsing and graph (legacy engine) |
| transformers.js (CDN) | Optional in-browser semantic embeddings |

## The AI layer

There is no backend API key for analysis. "Enable AI semantic analysis"
downloads a MiniLM sentence-embedding model once (cached by the browser) and
runs it locally via transformers.js. It scores *meaning*, so heavy paraphrase
that TF-IDF underrates still registers. If the model can't load, everything
else keeps working TF-IDF-only.

## Roadmap

- [x] **Phase 1** — upload + text extraction (PDF/DOCX/TXT) + text pipeline
- [x] **Phase 2** — TF-IDF + cosine similarity, highlighted matches
- [x] **Phase 3** — LCS side-by-side diff view
- [x] **Phase 4** — D3.js similarity network graph for batches
- [x] **Phase 5** — semantic (embedding) similarity layer + IndexedDB history
- [x] **Phase 6** — edge cases, polish, demo walkthrough
- [x] **Phase 7** — Vite SPA, futuristic UI, Supabase auth (identity-only)
