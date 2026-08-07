/**
 * Authenticated app shell — wraps the legacy ScriptIQ plagiarism workflow.
 *
 * Loads legacy modules (parser, similarity, graph, etc.) and mounts the
 * original upload → compare → graph → history UI behind the auth gate.
 */
import { getSession, signOut } from "../auth/authService.js";
import { fetchScriptAnalysis } from "../ai/aiService.js";
import { fadeInPage, revealAppPanels } from "./animations.js";

/** Tracks whether legacy engine modules have been imported. */
let modulesLoaded = false;

/**
 * HTML template for the plagiarism workflow (migrated from index.html).
 * IDs and structure must match js/app.js expectations.
 */
const APP_HTML = `
  <div class="mesh-bg" aria-hidden="true" style="opacity:0.35;"></div>
  <div class="app-layout page-enter">
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark">S</span>
        <div>
          <h1>ScriptIQ</h1>
          <p class="tagline">Plagiarism detection workspace</p>
        </div>
        <div class="header-actions">
          <div class="user-pill" id="user-pill">
            <span class="user-avatar" id="user-avatar">?</span>
            <span class="user-chip" id="user-email" title="Signed-in user"></span>
          </div>
          <button type="button" class="btn btn-export" id="btn-export" title="Export comparison report" hidden>
            ↓ Export report
          </button>
          <button type="button" class="btn btn-ghost" id="btn-sign-out">Sign out</button>
        </div>
      </div>
      <div id="upload-progress-bar" class="upload-progress-bar" hidden>
        <div class="upload-progress-fill" id="upload-progress-fill"></div>
      </div>
    </header>

    <main class="app-main">
      <section class="panel reveal-ready" id="upload-panel">
        <h2>1 · Upload submissions</h2>
        <div id="drop-zone" class="drop-zone" tabindex="0" role="button"
             aria-label="Upload files by clicking or dragging them here">
          <div class="drop-zone-inner">
            <div class="drop-icon">⇪</div>
            <p><strong>Drag &amp; drop</strong> student submissions here</p>
            <p class="muted">or click to browse — PDF, DOCX, text, or source code</p>
            <p class="muted">a <strong>.zip</strong> of a whole class works too</p>
          </div>
             <input type="file" id="file-input" multiple
               accept=".pdf,.docx,.txt,.md,.js,.jsx,.ts,.tsx,.py,.java,.c,.h,.cpp,.cc,.hpp,.cs,.go,.rs,.php,.rb,.swift,.kt,.kts,.html,.htm,.css,.scss,.json,.xml,.yml,.yaml,.sql,.sh,.bat,.ps1,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/zip">
        </div>
        <p id="upload-status" class="upload-status" aria-live="polite"></p>
      </section>

      <section class="panel reveal-ready" id="documents-panel" hidden>
        <div class="panel-heading-row">
          <h2>2 · Extracted text</h2>
          <button id="clear-all" class="btn btn-ghost" type="button">Clear all</button>
        </div>
        <div id="document-list" class="document-grid"></div>
      </section>

      <section class="panel reveal-ready" id="graph-panel" hidden>
        <div class="panel-heading-row">
          <h2>3 · Batch overview</h2>
          <label class="threshold-control">
            Show pairs above <output id="threshold-value">25%</output>
            <input type="range" id="threshold-slider" min="5" max="90" step="5" value="25">
          </label>
        </div>
        <p id="graph-info" class="muted"></p>
        <svg id="graph-svg" role="img" aria-label="Similarity network graph of the uploaded batch"></svg>
        <div class="legend graph-legend">
          <span><span class="edge-chip edge-chip-high"></span> ≥60% — high risk</span>
          <span><span class="edge-chip edge-chip-med"></span> 30–59% — moderate</span>
          <span><span class="edge-chip edge-chip-low"></span> below 30%</span>
          <span class="muted">thicker edge = more similar · click an edge to open the pair's diff · drag nodes to untangle</span>
        </div>
      </section>

      <section class="panel reveal-ready" id="compare-panel" hidden>
        <h2>4 · Compare a pair</h2>
        <div class="compare-controls">
          <select id="select-a" aria-label="First document"></select>
          <span class="vs">vs</span>
          <select id="select-b" aria-label="Second document"></select>
          <button id="compare-btn" class="btn btn-primary" type="button">Compare</button>
        </div>

        <div class="ai-strip">
          <button id="ai-enable" class="btn" type="button">Enable AI semantic analysis</button>
          <span id="ai-status" class="muted">
            Optional — downloads a ~25 MB language model once, then runs fully in your
            browser. Catches paraphrasing that word-matching misses.
          </span>
        </div>

        <div id="compare-results" hidden>
          <div class="score-row">
            <div class="score-card">
              <div class="score-value" id="score-value">—</div>
              <div class="score-label" id="score-label"></div>
              <div class="score-sub">TF-IDF cosine similarity</div>
            </div>
            <div class="score-card">
              <div class="score-value" id="semantic-value">—</div>
              <div class="score-label" id="semantic-label">AI semantic similarity</div>
              <div class="score-sub" id="semantic-sub">enable AI to compute</div>
            </div>
            <div class="score-meta">
              <p id="coverage-a"></p>
              <p id="coverage-b"></p>
              <div class="legend">
                <span><mark class="hl-weak">3–4 words</mark></span>
                <span><mark class="hl-medium">5–7 words</mark></span>
                <span><mark class="hl-strong">8+ words</mark></span>
                <span class="muted">shared word runs, by length</span>
              </div>
            </div>
          </div>

          <div class="view-toggle" role="tablist">
            <button class="tab active" data-view="matches" type="button">Shared passages</button>
            <button class="tab" data-view="diff" type="button">Text diff</button>
          </div>

          <div id="view-matches">
            <div class="compare-grid">
              <div class="compare-pane">
                <h3 id="pane-title-a"></h3>
                <div class="compare-text" id="pane-text-a"></div>
              </div>
              <div class="compare-pane">
                <h3 id="pane-title-b"></h3>
                <div class="compare-text" id="pane-text-b"></div>
              </div>
            </div>
          </div>

          <div id="view-diff" hidden>
            <div class="diff-meta">
              <p id="diff-summary" class="diff-summary"></p>
              <div class="legend">
                <span><mark class="df-del">only in left</mark></span>
                <span><mark class="df-ins">only in right</mark></span>
                <span><mark class="df-mod">rewritten</mark></span>
                <span class="muted">word-level LCS diff</span>
              </div>
            </div>
            <div class="compare-grid">
              <div class="compare-pane">
                <h3 id="diff-title-a"></h3>
                <div class="compare-text" id="diff-text-a"></div>
              </div>
              <div class="compare-pane">
                <h3 id="diff-title-b"></h3>
                <div class="compare-text" id="diff-text-b"></div>
              </div>
            </div>
          </div>

          <div class="ai-insights-panel glass-panel" id="ai-insights-panel" style="margin-top:1.5rem;" hidden>
            <div class="panel-heading-row" style="margin-bottom:0.75rem;">
              <h3>✨ AI Screenplay Feedback &amp; Structural Insights</h3>
              <span class="auth-mode-badge" style="margin-left:auto;font-size:0.75rem;">
                <span class="auth-mode-dot dot-supabase"></span> ScriptIQ AI Engine
              </span>
            </div>
            <div class="ai-insights-grid">
              <div class="ai-insight-card">
                <h4 id="ai-insights-title-a" style="margin-bottom:0.5rem;font-size:0.9rem;color:var(--text-main);">Script A Analysis</h4>
                <div id="ai-insights-content-a" class="ai-insights-text">Click compare to analyze script structure</div>
              </div>
              <div class="ai-insight-card">
                <h4 id="ai-insights-title-b" style="margin-bottom:0.5rem;font-size:0.9rem;color:var(--text-main);">Script B Analysis</h4>
                <div id="ai-insights-content-b" class="ai-insights-text">Click compare to analyze script structure</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel reveal-ready" id="history-panel" hidden>
        <div class="panel-heading-row">
          <h2>5 · Comparison history</h2>
          <button id="clear-history" class="btn btn-ghost" type="button">Clear history</button>
        </div>
        <div class="table-wrap">
          <table class="history-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Pair</th>
                <th>TF-IDF</th>
                <th>Semantic</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="history-body"></tbody>
          </table>
        </div>
      </section>
    </main>

    <footer class="app-footer">
      <p>ScriptIQ runs entirely in your browser — submissions never leave this machine.</p>
    </footer>
  </div>
`;

/**
 * Render the authenticated app; redirects to login if no session.
 * @param {{ navigate: Function }} ctx
 * @returns {Promise<() => void>} cleanup
 */
export async function renderApp(ctx) {
  const session = await getSession();
  if (!session) {
    ctx.navigate("/login");
    return () => { };
  }

  const root = document.getElementById("app");
  root.innerHTML = APP_HTML;

  const email = session.user?.email || "Signed in";
  const emailEl = root.querySelector("#user-email");
  if (emailEl) emailEl.textContent = email;

  // User avatar — initials from email or name
  const avatarEl = root.querySelector("#user-avatar");
  if (avatarEl) {
    const parts = email.split("@")[0].split(/[._-]/);
    avatarEl.textContent = parts.map((p) => p[0]?.toUpperCase() || "").join("").slice(0, 2) || "U";
  }

  root.querySelector("#btn-sign-out")?.addEventListener("click", async () => {
    await signOut();
    ctx.navigate("/login");
  });

  // Export report button & AI insights panel update — shown after a comparison runs
  const exportBtn = root.querySelector("#btn-export");
  const aiInsightsPanel = root.querySelector("#ai-insights-panel");
  const aiInsightsA = root.querySelector("#ai-insights-content-a");
  const aiInsightsB = root.querySelector("#ai-insights-content-b");
  const aiTitleA = root.querySelector("#ai-insights-title-a");
  const aiTitleB = root.querySelector("#ai-insights-title-b");

  root.addEventListener("scriptiq:comparison-complete", async (evt) => {
    if (exportBtn) exportBtn.hidden = false;
    const detail = evt.detail || {};
    if (detail.docA && detail.docB && aiInsightsPanel) {
      aiInsightsPanel.hidden = false;
      if (aiTitleA) aiTitleA.textContent = `${detail.docA.name} Analysis`;
      if (aiTitleB) aiTitleB.textContent = `${detail.docB.name} Analysis`;
      if (aiInsightsA) aiInsightsA.innerHTML = "<p class='muted'>Analyzing script structure...</p>";
      if (aiInsightsB) aiInsightsB.innerHTML = "<p class='muted'>Analyzing script structure...</p>";

      try {
        const [analysisA, analysisB] = await Promise.all([
          fetchScriptAnalysis(detail.docA.raw, detail.docA.name),
          fetchScriptAnalysis(detail.docB.raw, detail.docB.name),
        ]);

        if (aiInsightsA) {
          aiInsightsA.innerHTML = `
            <div class="ai-insight-meta" style="margin-bottom:0.5rem;font-size:0.8rem;color:var(--text-muted);">
              <span>Scenes: <strong>${analysisA.sceneCount}</strong></span> · 
              <span>Words: <strong>${analysisA.wordCount}</strong></span> · 
              <span>Dialogue: <strong>${analysisA.dialogueRatio}%</strong></span>
            </div>
            <ul class="ai-insight-list" style="margin:0;padding-left:1.2rem;font-size:0.85rem;line-height:1.4;">
              ${analysisA.insights.map((i) => `<li>${i}</li>`).join("")}
            </ul>`;
        }

        if (aiInsightsB) {
          aiInsightsB.innerHTML = `
            <div class="ai-insight-meta" style="margin-bottom:0.5rem;font-size:0.8rem;color:var(--text-muted);">
              <span>Scenes: <strong>${analysisB.sceneCount}</strong></span> · 
              <span>Words: <strong>${analysisB.wordCount}</strong></span> · 
              <span>Dialogue: <strong>${analysisB.dialogueRatio}%</strong></span>
            </div>
            <ul class="ai-insight-list" style="margin:0;padding-left:1.2rem;font-size:0.85rem;line-height:1.4;">
              ${analysisB.insights.map((i) => `<li>${i}</li>`).join("")}
            </ul>`;
        }
      } catch (err) {
        console.warn("AI Script Analysis error:", err);
      }
    }
  });
  exportBtn?.addEventListener("click", () => exportComparisonReport(root, email));

  // Load legacy engine modules once, then bind app.js to the fresh DOM each visit.
  if (!modulesLoaded) {
    await import("../legacy/textPipeline.js");
    await import("../legacy/parser.js");
    await import("../legacy/similarity.js");
    await import("../legacy/diff.js");
    await import("../legacy/graph.js");
    await import("../legacy/storage.js");
    await import("../legacy/semantic.js");
    modulesLoaded = true;
  }

  const { initScriptIQApp } = await import("../legacy/app.js");
  initScriptIQApp();

  fadeInPage(root);
  revealAppPanels(root);

  return () => {};
}

/**
 * Export the current comparison results as a self-contained HTML report.
 * @param {HTMLElement} root
 * @param {string} userEmail
 */
function exportComparisonReport(root, userEmail) {
  const scoreVal = root.querySelector("#score-value")?.textContent || "—";
  const scoreLabel = root.querySelector("#score-label")?.textContent || "";
  const paneA = root.querySelector("#pane-title-a")?.textContent || "Document A";
  const paneB = root.querySelector("#pane-title-b")?.textContent || "Document B";
  const semanticVal = root.querySelector("#semantic-value")?.textContent || "—";
  const coverageA = root.querySelector("#coverage-a")?.textContent || "";
  const coverageB = root.querySelector("#coverage-b")?.textContent || "";
  const when = new Date().toLocaleString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ScriptIQ Report — ${paneA} vs ${paneB}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 820px; margin: 2rem auto; padding: 1rem; color: #1e293b; }
    h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
    .meta { color: #64748b; font-size: 0.85rem; margin-bottom: 2rem; }
    .score-row { display: flex; gap: 1rem; margin-bottom: 2rem; }
    .score-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem 1.5rem; text-align: center; min-width: 160px; }
    .score-val { font-size: 2rem; font-weight: 700; }
    .score-lbl { font-size: 0.85rem; color: #64748b; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; text-align: left; }
    th { background: #f8fafc; }
    footer { margin-top: 2rem; font-size: 0.75rem; color: #94a3b8; }
  </style>
</head>
<body>
  <h1>ScriptIQ Plagiarism Report</h1>
  <p class="meta">Generated: ${when} · Reviewer: ${userEmail}</p>
  <div class="score-row">
    <div class="score-card">
      <div class="score-val">${scoreVal}</div>
      <div class="score-lbl">TF-IDF similarity<br>${scoreLabel}</div>
    </div>
    <div class="score-card">
      <div class="score-val">${semanticVal}</div>
      <div class="score-lbl">AI semantic similarity</div>
    </div>
  </div>
  <table>
    <tr><th>Document A</th><td>${paneA}</td></tr>
    <tr><th>Document B</th><td>${paneB}</td></tr>
    <tr><th>Coverage A</th><td>${coverageA}</td></tr>
    <tr><th>Coverage B</th><td>${coverageB}</td></tr>
  </table>
  <footer>ScriptIQ — Analysis runs entirely in the browser. Submissions never leave your machine.</footer>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scriptiq-report-${Date.now()}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
