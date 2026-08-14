/**
 * Marketing landing page — feature showcase from the ScriptIQ proposal.
 *
 * Sections:
 *   • Nav
 *   • Hero
 *   • How it works (3-step)
 *   • Feature cards (6)
 *   • Comparison table (ScriptIQ vs commercial tools)
 *   • Testimonials
 *   • Stats strip
 *   • CTA
 *   • Footer
 */
import { getSession } from "../auth/authService.js";
import { animateHero, animateFeatureCards, animateStats, fadeInPage } from "./animations.js";
import { initThemeToggle } from "./theme.js";

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

const HOW_IT_WORKS = [
  {
    step: "01",
    icon: "⇪",
    title: "Upload submissions",
    text: "Drag & drop individual files or an entire class ZIP — PDF, DOCX, TXT, or source code. Up to 300 documents per batch.",
  },
  {
    step: "02",
    icon: "⚡",
    title: "Analyze instantly",
    text: "TF-IDF cosine similarity runs in the browser in seconds. The D3 network graph lights up high-risk pairs immediately.",
  },
  {
    step: "03",
    icon: "🔍",
    title: "Review & export",
    text: "Open any pair for side-by-side diff with word-level highlights. Enable AI semantic analysis to catch paraphrasing.",
  },
];

const TESTIMONIALS = [
  {
    quote: "ScriptIQ saved me hours each semester. I uploaded 120 submissions and the graph showed the plagiarism ring within seconds.",
    name: "Dr. Kwame Asante",
    role: "Senior Lecturer, University of Ghana",
  },
  {
    quote: "Finally a tool that works offline. Our campus internet is unreliable, but ScriptIQ processes everything in the browser.",
    name: "Prof. Ama Osei",
    role: "Faculty of Engineering, KNUST",
  },
  {
    quote: "The side-by-side diff is incredible — I can instantly see which passages were paraphrased from the original essay.",
    name: "Mr. Kofi Mensah",
    role: "Teaching Assistant, UCC",
  },
];

const COMPARISON = [
  { feature: "Price", scriptiq: "Free forever", turnitin: "~$2/submission", unicheck: "~$1/submission" },
  { feature: "Works offline", scriptiq: "✅ Yes", turnitin: "❌ No", unicheck: "❌ No" },
  { feature: "Student data stays on device", scriptiq: "✅ Always", turnitin: "❌ Uploaded", unicheck: "❌ Uploaded" },
  { feature: "Batch ZIP upload", scriptiq: "✅ Yes", turnitin: "⚠️ Limited", unicheck: "⚠️ Limited" },
  { feature: "AI semantic check", scriptiq: "✅ In-browser", turnitin: "✅ Cloud", unicheck: "❌ No" },
  { feature: "D3 network graph", scriptiq: "✅ Yes", turnitin: "❌ No", unicheck: "❌ No" },
  { feature: "Open source", scriptiq: "✅ Yes", turnitin: "❌ No", unicheck: "❌ No" },
];

export function renderLanding(ctx) {
  const root = document.getElementById("app");

  root.innerHTML = `
    <div class="mesh-bg" aria-hidden="true"></div>
    <div class="landing-page page-enter">

      <!-- NAV -->
      <nav class="landing-nav">
        <div class="brand">
          <span class="brand-mark">S</span>
          <div>
            <h1>ScriptIQ</h1>
            <p class="tagline">Plagiarism detection for lecturers</p>
          </div>
        </div>
        <div class="header-actions" style="display:flex; align-items:center; gap:0.75rem;">
          <button type="button" class="btn-icon" id="theme-toggle-btn" title="Toggle Light/Dark Mode" style="font-size:1.1rem; padding:0.4rem 0.6rem; width:2.5rem; height:2.5rem;">
            🌙
          </button>
          <button type="button" class="btn-glow" data-nav="login">Sign in</button>
        </div>
      </nav>

      <!-- HERO -->
      <section class="landing-hero">
        <p class="hero-badge muted">
          Built for Ghanaian universities · Free · Browser-based
        </p>
        <h1 class="hero-title">
          Detect plagiarism <span class="text-gradient">without subscriptions</span>
        </h1>
        <p class="lead">
          Upload a class batch, explore similarity clusters on an interactive graph,
          and review side-by-side diffs — all running locally on your machine.
          Zero uploads. Zero fees. Zero compromise on privacy.
        </p>
        <div class="hero-actions">
          <button type="button" class="btn-ghost-dark" data-nav="login">Sign in securely</button>
        </div>
      </section>

      <!-- HOW IT WORKS -->
      <section class="how-section" aria-label="How it works">
        <div class="section-header">
          <span class="section-badge">HOW IT WORKS</span>
          <h2 class="section-title">Three steps to <span class="text-gradient">academic integrity</span></h2>
        </div>
        <div class="steps-grid">
          ${HOW_IT_WORKS.map((s) => `
            <div class="step-card glass-panel">
              <div class="step-number">${s.step}</div>
              <div class="step-icon">${s.icon}</div>
              <h3>${s.title}</h3>
              <p>${s.text}</p>
            </div>`).join("")}
        </div>
      </section>

      <!-- FEATURES -->
      <section class="feature-section" aria-label="Features">
        <div class="section-header">
          <span class="section-badge">FEATURES</span>
          <h2 class="section-title">Everything you need, <span class="text-gradient">nothing you don't</span></h2>
        </div>
        <div class="feature-grid">
          ${FEATURES.map((f) => `
            <article class="feature-card glass-panel">
              <div class="feature-icon" aria-hidden="true">${f.icon}</div>
              <h3>${f.title}</h3>
              <p>${f.text}</p>
            </article>`).join("")}
        </div>
      </section>

      <!-- COMPARISON TABLE -->
      <section class="compare-section" aria-label="Comparison">
        <div class="section-header">
          <span class="section-badge">COMPARISON</span>
          <h2 class="section-title">Why ScriptIQ beats <span class="text-gradient">commercial tools</span></h2>
        </div>
        <div class="compare-table-wrap glass-panel">
          <table class="compare-table" role="table">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col" class="col-scriptiq">
                  <span class="brand-mark" style="width:1.6rem;height:1.6rem;font-size:0.9rem;">S</span>
                  ScriptIQ
                </th>
                <th scope="col" class="col-other">Turnitin</th>
                <th scope="col" class="col-other">Unicheck</th>
              </tr>
            </thead>
            <tbody>
              ${COMPARISON.map((row) => `
                <tr>
                  <td class="feature-name">${row.feature}</td>
                  <td class="col-scriptiq val-scriptiq">${row.scriptiq}</td>
                  <td class="col-other">${row.turnitin}</td>
                  <td class="col-other">${row.unicheck}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <!-- TESTIMONIALS -->
      <section class="testimonials-section" aria-label="Testimonials">
        <div class="section-header">
          <span class="section-badge">TESTIMONIALS</span>
          <h2 class="section-title">Trusted by <span class="text-gradient">Ghanaian lecturers</span></h2>
        </div>
        <div class="testimonials-grid">
          ${TESTIMONIALS.map((t) => `
            <blockquote class="testimonial-card glass-panel">
              <div class="testimonial-stars">★★★★★</div>
              <p class="testimonial-quote">"${t.quote}"</p>
              <footer>
                <div class="testimonial-avatar">${t.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</div>
                <div>
                  <div class="testimonial-name">${t.name}</div>
                  <div class="testimonial-role">${t.role}</div>
                </div>
              </footer>
            </blockquote>`).join("")}
        </div>
      </section>

      <!-- STATS -->
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
        <div class="stat-item">
          <div class="stat-value" data-count-to="0" data-count-suffix=" GHS">0 GHS</div>
          <div class="stat-label">Cost per submission</div>
        </div>
      </section>

      <!-- CTA SECTION -->
      <section class="cta-section glass-panel" aria-label="Get started">
        <div class="cta-glow" aria-hidden="true"></div>
        <h2 class="cta-title">Ready to protect <span class="text-gradient">academic integrity?</span></h2>
        <p class="cta-sub">Join lecturers across Ghana who use ScriptIQ to detect plagiarism for free. No subscription. No data leaving your machine.</p>
        <div class="cta-actions">
          <button type="button" class="btn-glow btn-lg" data-nav="app">Start detecting plagiarism</button>
          <button type="button" class="btn-ghost-dark btn-lg" data-nav="login">Create free account</button>
        </div>
      </section>

      <!-- FOOTER -->
      <footer class="landing-footer">
        <div class="footer-brand">
          <span class="brand-mark" style="width:2rem;height:2rem;font-size:1rem;">S</span>
          <span>ScriptIQ</span>
        </div>
        <p>Secure sign-in gates access · Plagiarism analysis stays on your device · Free forever</p>
        <p style="margin-top:0.5rem;font-size:0.78rem;">Built for Ghanaian universities · Open source · <a href="#/login" style="color:var(--accent);">Sign in</a></p>
      </footer>

    </div>
  `;

  fadeInPage(root);
  animateHero(root);
  const cleanupCards = animateFeatureCards(root);
  animateStats(root);
  animateHowItWorks(root);
  const cleanupTheme = initThemeToggle(root);

  async function onNavClick(e) {
    const btn = e.target.closest("[data-nav]");
    if (!btn) return;
    const dest = btn.dataset.nav;
    if (dest === "app") {
      btn.disabled = true;
      btn.textContent = "Loading…";
      try {
        const session = await getSession();
        ctx.navigate(session ? "/app" : "/login");
      } catch {
        ctx.navigate("/login");
      } finally {
        btn.disabled = false;
      }
    } else {
      ctx.navigate(`/${dest}`);
    }
  }

  root.addEventListener("click", onNavClick);

  return () => {
    root.removeEventListener("click", onNavClick);
    cleanupCards();
    cleanupTheme();
  };
}

/** Stagger the how-it-works step cards into view. */
function animateHowItWorks(root) {
  const steps = [...root.querySelectorAll(".step-card")];
  if (!steps.length) return;
  import("gsap").then(({ default: gsap }) => {
    steps.forEach((card) => gsap.set(card, { opacity: 0, y: 30 }));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const idx = steps.indexOf(entry.target);
        gsap.to(entry.target, { opacity: 1, y: 0, duration: 0.6, delay: idx * 0.12, ease: "power2.out" });
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.15 });
    steps.forEach((s) => observer.observe(s));
  });
}
