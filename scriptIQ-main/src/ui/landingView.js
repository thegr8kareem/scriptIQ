/**
 * Marketing landing page — feature showcase from the ScriptIQ proposal/README.
 *
 * Routes visitors to login or directly to the app if already authenticated.
 */
import { getSession } from "../auth/authService.js";
import { animateHero, animateFeatureCards, animateStats, fadeInPage } from "./animations.js";

/** Feature cards aligned with README phases and proposal highlights. */
const FEATURES = [
  {
    icon: "📦",
    title: "Batch ZIP upload",
    text: "Drop a whole class at once — PDF, DOCX, TXT, or a .zip archive. Nested folders and archive noise are filtered automatically.",
  },
  {
    icon: "📊",
    title: "TF-IDF similarity",
    text: "Corpus-wide cosine scoring finds shared wording across submissions. Common boilerplate is down-weighted via IDF.",
  },
  {
    icon: "🔀",
    title: "Side-by-side diff",
    text: "Word-level LCS diff with rewritten passages highlighted in amber — ideal for spotting paraphrasing at a glance.",
  },
  {
    icon: "🕸️",
    title: "Similarity graph",
    text: "D3 force-directed network for batches of 3+. Click a high-risk edge to jump straight into that pair's comparison.",
  },
  {
    icon: "🧠",
    title: "AI semantic layer",
    text: "Optional in-browser MiniLM embeddings catch meaning-level overlap that word matching misses — no API key, fully local.",
  },
  {
    icon: "🛡️",
    title: "Local-first privacy",
    text: "Submissions and history live in IndexedDB on your machine. Auth verifies identity only — analysis never leaves the browser.",
  },
];

/**
 * Render the landing page into #app.
 * @param {{ navigate: Function }} ctx
 * @returns {() => void} cleanup
 */
export function renderLanding(ctx) {
  const root = document.getElementById("app");
  root.innerHTML = `
    <div class="mesh-bg" aria-hidden="true"></div>
    <div class="landing-page page-enter">
      <nav class="landing-nav">
        <div class="brand">
          <span class="brand-mark">S</span>
          <div>
            <h1>ScriptIQ</h1>
            <p class="tagline">Plagiarism detection for lecturers</p>
          </div>
        </div>
        <div class="header-actions">
          <button type="button" class="btn-ghost-dark" data-nav="login">Sign in</button>
          <button type="button" class="btn-glow" data-nav="app">Launch app</button>
        </div>
      </nav>

      <section class="landing-hero">
        <p class="hero-badge muted" style="letter-spacing:0.12em;text-transform:uppercase;font-size:0.78rem;margin-bottom:1rem;">
          Built for Ghanaian universities · Free · Browser-based
        </p>
        <h1 class="hero-title">
          Detect plagiarism <span class="text-gradient">without subscriptions</span>
        </h1>
        <p class="lead">
          Upload a class batch, explore similarity clusters on an interactive graph,
          and review side-by-side diffs — all running locally on your machine.
        </p>
        <div class="hero-actions">
          <button type="button" class="btn-glow" data-nav="app">Get started</button>
          <button type="button" class="btn-ghost-dark" data-nav="login">Sign in securely</button>
        </div>
      </section>

      <section class="feature-grid" aria-label="Features">
        ${FEATURES.map(
          (f) => `
          <article class="feature-card glass-panel">
            <div class="feature-icon" aria-hidden="true">${f.icon}</div>
            <h3>${f.title}</h3>
            <p>${f.text}</p>
          </article>`
        ).join("")}
      </section>

      <section class="stats-strip" aria-label="Highlights">
        <div class="stat-item">
          <div class="stat-value" data-count-to="300" data-count-suffix="+">0+</div>
          <div class="stat-label">Documents per batch</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" data-count-to="100" data-count-suffix="%">0%</div>
          <div class="stat-label">Client-side processing</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" data-count-to="0" data-count-suffix="">0</div>
          <div class="stat-label">Submissions sent to cloud</div>
        </div>
      </section>

      <footer class="landing-footer">
        <p>ScriptIQ · Secure sign-in gates access · Plagiarism analysis stays on your device</p>
      </footer>
    </div>
  `;

  fadeInPage(root);
  animateHero(root);
  const cleanupCards = animateFeatureCards(root);
  animateStats(root);

  /** Navigate to login or app; app route redirects unauthenticated users later. */
  async function onNavClick(e) {
    const btn = e.target.closest("[data-nav]");
    if (!btn) return;
    const dest = btn.dataset.nav;
    if (dest === "app") {
      const session = await getSession();
      ctx.navigate(session ? "/app" : "/login");
    } else {
      ctx.navigate(`/${dest}`);
    }
  }

  root.addEventListener("click", onNavClick);

  return () => {
    root.removeEventListener("click", onNavClick);
    cleanupCards();
  };
}
