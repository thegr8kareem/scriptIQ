/**
 * Authenticated app shell — wraps the legacy ScriptIQ plagiarism workflow.
 *
 * Loads legacy modules (parser, similarity, graph, etc.) and mounts the
 * original upload → compare → graph → history UI behind the auth gate.
 */
import { getSession, signOut, getProfile, updateProfile } from "../auth/authService.js";
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
        <div class="panel-heading-row" style="margin-bottom: 1.25rem;">
          <h2>1 · Upload submissions</h2>
          <button id="btn-back-home" class="btn btn-ghost" type="button">← Back to Home</button>
        </div>
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

      <!-- Plagiarism Standards & Grading Policies -->
      <section class="panel reveal-ready" id="standards-panel" hidden>
        <div class="panel-heading-row">
          <h2>3 · Plagiarism Standards &amp; Grading</h2>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; margin-top: 1rem;">
          <div class="glass-panel" style="padding: 1.25rem;">
            <label style="display: block; font-size: 0.78rem; font-family: 'DM Mono', monospace; text-transform: uppercase; color: var(--accent); margin-bottom: 0.5rem; letter-spacing: 0.05em;">Select Institution Standard</label>
            <select id="standards-institution" class="select-glow" style="width: 100%; padding: 0.55rem; border-radius: 8px; background: rgba(10, 16, 36, 0.6); color: var(--ink); border: 1px solid var(--panel-border); outline: none;">
              <option value="knust">KNUST (Kwame Nkrumah Univ.)</option>
              <option value="ug">University of Ghana (UG)</option>
              <option value="ashesi">Ashesi University</option>
              <option value="custom" selected>Custom Policy</option>
            </select>
            <p style="font-size: 0.8rem; color: var(--muted); margin: 0.75rem 0 0; line-height: 1.4;" id="standards-description">
              Configure similarity thresholds to grade student submissions.
            </p>
          </div>
          
          <div class="glass-panel" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem;">
            <div>
              <label style="display: flex; justify-content: space-between; font-size: 0.78rem; font-family: 'DM Mono', monospace; text-transform: uppercase; color: var(--muted); margin-bottom: 0.25rem; letter-spacing: 0.05em;">
                <span>Low Risk Limit (Green)</span>
                <span id="label-val-low">15%</span>
              </label>
              <input type="range" id="standards-low" min="5" max="30" step="5" value="15" style="width: 100%; accent-color: var(--accent);">
            </div>
            <div>
              <label style="display: flex; justify-content: space-between; font-size: 0.78rem; font-family: 'DM Mono', monospace; text-transform: uppercase; color: var(--muted); margin-bottom: 0.25rem; letter-spacing: 0.05em;">
                <span>High Risk Limit (Red)</span>
                <span id="label-val-high">30%</span>
              </label>
              <input type="range" id="standards-high" min="20" max="80" step="5" value="30" style="width: 100%; accent-color: var(--accent-2);">
            </div>
          </div>

          <div class="glass-panel" style="padding: 1.25rem; border-color: var(--accent-soft);">
            <label style="display: block; font-size: 0.78rem; font-family: 'DM Mono', monospace; text-transform: uppercase; color: var(--accent); margin-bottom: 0.5rem; letter-spacing: 0.05em;">Policy Verdict Rules</label>
            <ul style="margin: 0; padding-left: 1.1rem; font-size: 0.8rem; line-height: 1.45; color: var(--ink); display: flex; flex-direction: column; gap: 0.25rem;">
              <li><strong style="color: var(--success);">Green (Low):</strong> Standard citations; acceptable.</li>
              <li><strong style="color: #fbbf24;">Amber (Medium):</strong> Flags for manual review.</li>
              <li><strong style="color: var(--danger);">Red (High):</strong> Plagiarism check failure; standard penalty.</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Batch Overview Graph and Table List -->
      <section class="panel reveal-ready" id="graph-panel" hidden>
        <div class="panel-heading-row">
          <h2>4 · Batch overview</h2>
          <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
            <label class="threshold-control">
              Show pairs above <output id="threshold-value">25%</output>
              <input type="range" id="threshold-slider" min="5" max="90" step="5" value="25">
            </label>
            <button id="btn-collect-similar" class="btn btn-primary btn-small" type="button" style="display: none; padding: 0.35rem 0.75rem; font-size: 0.8rem; border-radius: 8px;">
              ↓ Collect similar works (.zip)
            </button>
          </div>
        </div>
        
        <div class="graph-layout" style="display: flex; gap: 1.5rem; flex-wrap: wrap; margin-top: 1.25rem;">
          <div style="flex: 1.8; min-width: 320px;">
            <p id="graph-info" class="muted" style="margin-bottom: 0.5rem; font-size: 0.85rem;"></p>
            <div class="glass-panel" style="background: rgba(10, 16, 36, 0.4); border-radius: 12px; overflow: hidden; display: grid; place-items: center; border: 1px solid var(--panel-border);">
              <svg id="graph-svg" role="img" aria-label="Similarity network graph of the uploaded batch" style="max-height: 380px; width: 100%;"></svg>
            </div>
            <div class="legend graph-legend" style="margin-top: 0.75rem; font-size: 0.78rem;">
              <span><span class="edge-chip edge-chip-high"></span> High Risk</span>
              <span><span class="edge-chip edge-chip-med"></span> Moderate Risk</span>
              <span><span class="edge-chip edge-chip-low"></span> Low Risk</span>
              <span class="muted">Click connection to compare · Drag dots to untangle</span>
            </div>
          </div>
          
          <div class="glass-panel" style="flex: 1.2; min-width: 280px; padding: 1.25rem; display: flex; flex-direction: column;">
            <h3 style="margin-top: 0; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem; color: var(--ink);">
              📋 Flagged Similarity List
            </h3>
            <p style="font-size: 0.8rem; color: var(--muted); margin: 0 0 1rem; line-height: 1.4;">
              Tabular view of all pairs exceeding your active plagiarism thresholds.
            </p>
            <div style="flex: 1; overflow-y: auto; max-height: 350px;">
              <table class="history-table" style="width: 100%; font-size: 0.8rem;" id="graph-pairs-table">
                <thead>
                  <tr>
                    <th>Submissions Pair</th>
                    <th style="text-align: right; width: 60px;">Score</th>
                    <th style="text-align: center; width: 80px;">Action</th>
                  </tr>
                </thead>
                <tbody id="graph-pairs-body">
                  <tr>
                    <td colspan="3" class="muted" style="text-align: center; padding: 2rem;">No pairs flagged yet.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Closely Similar Submissions List -->
        <div id="similar-duplicates-panel" style="margin-top: 1.75rem; display: none;" class="glass-panel">
          <div style="padding: 1.25rem; border-bottom: 1px solid var(--panel-border); background: rgba(255, 77, 109, 0.04);">
            <h3 style="margin: 0; font-size: 1rem; color: var(--danger); display: flex; align-items: center; gap: 0.5rem; text-transform: none; letter-spacing: normal;">
              <span>🚨</span> Closely Similar Submissions (Potential Copies)
            </h3>
            <p style="margin: 0.25rem 0 0; font-size: 0.8rem; color: var(--muted); text-transform: none;">
              The following student submissions have been flagged as closely similar to each other.
            </p>
          </div>
          <div id="similar-duplicates-list" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;">
            <!-- Dynamic items go here -->
          </div>
        </div>
      </section>

      <!-- Compare a Pair -->
      <section class="panel reveal-ready" id="compare-panel" hidden>
        <h2>5 · Compare a pair</h2>
        <div class="compare-controls">
          <select id="select-a" aria-label="First document"></select>
          <span class="vs">vs</span>
          <select id="select-b" aria-label="Second document"></select>
          <button id="compare-btn" class="btn btn-primary" type="button">Compare</button>
        </div>

        <div class="glass-panel" style="padding: 1.25rem; margin-top: 1.25rem; margin-bottom: 1.25rem; border-color: var(--accent-soft);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div style="flex: 1; min-width: 260px;">
              <h4 style="margin: 0 0 0.25rem; font-size: 0.95rem; color: var(--ink); display: flex; align-items: center; gap: 0.5rem;">
                🤖 Local AI Semantic Engine
              </h4>
              <p style="margin: 0; font-size: 0.82rem; color: var(--muted); line-height: 1.45;">
                Uses Hugging Face's <code style="color: var(--accent); font-family: 'DM Mono', monospace;">all-MiniLM-L6-v2</code> model. Runs <strong>100% locally</strong> in your browser via ONNX Runtime WebAssembly. Your student papers are never sent to external servers (ensuring absolute privacy).
              </p>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
              <span id="ai-status" class="muted" style="font-size: 0.8rem; font-family: 'DM Mono', monospace;"></span>
              <button id="ai-enable" class="btn btn-glow" type="button" style="padding: 0.5rem 1rem; font-size: 0.85rem; border-radius: 8px;">Enable AI</button>
            </div>
          </div>
        </div>

        <div id="compare-results" hidden>
          <div class="score-row" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-bottom: 1.25rem;">
            <div class="score-card glass-panel" style="padding: 1.25rem; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
              <div class="score-value" id="score-value" style="font-size: 2.2rem; font-weight: 800; color: var(--accent);">—</div>
              <div class="score-label" id="score-label" style="font-size: 0.85rem; font-weight: 600; color: var(--ink); margin-top: 0.35rem;">TF-IDF similarity</div>
              <div class="score-sub" style="font-size: 0.72rem; color: var(--muted); margin-top: 0.25rem;">Exact word matching</div>
            </div>
            <div class="score-card glass-panel" style="padding: 1.25rem; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
              <div class="score-value" id="semantic-value" style="font-size: 2.2rem; font-weight: 800; color: var(--accent-2);">—</div>
              <div class="score-label" id="semantic-label" style="font-size: 0.85rem; font-weight: 600; color: var(--ink); margin-top: 0.35rem;">AI semantic similarity</div>
              <div class="score-sub" id="semantic-sub" style="font-size: 0.72rem; color: var(--muted); margin-top: 0.25rem;">enable AI to compute</div>
            </div>
            <div class="score-card glass-panel" id="verdict-card" style="padding: 1.25rem; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; border-color: var(--border);">
              <div class="score-value" id="verdict-value" style="font-size: 1.3rem; font-weight: 800; color: var(--muted); text-transform: uppercase;">—</div>
              <div class="score-label" id="verdict-label" style="font-size: 0.85rem; font-weight: 600; color: var(--ink); margin-top: 0.35rem;">Plagiarism Verdict</div>
              <div class="score-sub" id="verdict-sub" style="font-size: 0.72rem; color: var(--muted); margin-top: 0.25rem;">KNUST / Course policy</div>
            </div>
          </div>

          <!-- Score Method Explanations Key -->
          <div class="glass-panel" style="padding: 1rem; margin-bottom: 1.25rem; font-size: 0.8rem; line-height: 1.45; color: var(--muted); display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.25rem;">
            <div>
              <strong style="color: var(--accent); display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; margin-bottom: 0.25rem;">📝 TF-IDF Similarity (Word-Matching)</strong>
              Measures matching words and phrasing. Excellent at catching direct copy-pasting, but can be bypassed if the writer changes words or uses synonyms.
            </div>
            <div>
              <strong style="color: var(--accent-2); display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; margin-bottom: 0.25rem;">🤖 AI Semantic Similarity (Meaning-Matching)</strong>
              Measures high-level concept similarity using local context embeddings. Perfect for identifying paraphrasing, restructured sentences, or rewritten texts.
            </div>
          </div>
          
          <div class="glass-panel" style="padding: 1rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div style="display: flex; gap: 1.5rem; font-size: 0.82rem; color: var(--ink);">
              <span id="coverage-a" style="font-weight: 600;"></span>
              <span id="coverage-b" style="font-weight: 600;"></span>
            </div>
            <div class="legend" style="margin: 0; font-size: 0.78rem;">
              <span><mark class="hl-weak">3–4 words</mark></span>
              <span><mark class="hl-medium">5–7 words</mark></span>
              <span><mark class="hl-strong">8+ words</mark></span>
              <span class="muted">shared runs</span>
            </div>
          </div>

          <!-- Similarity / Rephrasing Alert & Collection -->
          <div id="rephrasings-alert" class="glass-panel" style="margin-top: 1.25rem; padding: 1.25rem; border: 1px solid var(--danger); background: rgba(255, 77, 109, 0.08); display: none;">
            <h4 style="margin: 0 0 0.5rem; color: var(--danger); display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; font-weight: 700;" id="rephrase-alert-title">
              <span>⚠️</span> Similarity &amp; Paraphrase Alert
            </h4>
            <p style="margin: 0; font-size: 0.9rem; line-height: 1.5; color: var(--ink); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
              <span id="rephrase-alert-text">
                This pair shows significant similarity (exact matching: <strong id="rephrase-tfidf">—</strong>, semantic similarity: <strong id="rephrase-semantic">—</strong>).
              </span>
              <button id="btn-collect-pair" class="btn btn-primary btn-small" type="button" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; border-radius: 8px;">
                ↓ Download pair (.zip)
              </button>
            </p>
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

    <!-- PROFILE MODAL -->
    <div id="profile-modal" class="modal-backdrop" hidden>
      <div class="profile-card glass-panel" role="dialog" aria-labelledby="profile-title">
        <div class="profile-header">
          <div class="profile-avatar-large" id="profile-avatar-large">?</div>
          <div class="profile-meta-large">
            <h3 id="profile-title">User Profile</h3>
            <p id="profile-email-label" class="muted">email@example.com</p>
          </div>
          <button type="button" class="btn-close" id="profile-modal-close" aria-label="Close profile">×</button>
        </div>
        
        <div class="profile-body">
          <div class="profile-info-group">
            <label>Account ID</label>
            <input type="text" id="profile-uid" readonly class="profile-input-readonly">
          </div>
          
          <div class="profile-info-group">
            <label>Full Name</label>
            <input type="text" id="profile-input-name" placeholder="Enter your name">
          </div>

          <div class="profile-info-group">
            <label>Institution</label>
            <input type="text" id="profile-input-institution" placeholder="University of Ghana">
          </div>

          <div class="profile-info-group">
            <label>Account Type</label>
            <select id="profile-input-role">
              <option value="Lecturer">Lecturer</option>
              <option value="Teaching Assistant">Teaching Assistant</option>
              <option value="Administrator">Administrator</option>
            </select>
          </div>

          <div class="profile-info-group">
            <label>Member Since</label>
            <input type="text" id="profile-created-at" readonly class="profile-input-readonly">
          </div>
        </div>

        <div class="profile-actions">
          <button type="button" class="btn btn-ghost" id="profile-btn-cancel">Close</button>
          <button type="button" class="btn btn-primary" id="profile-btn-save">Save Changes</button>
        </div>
        
        <div id="profile-status-message" aria-live="polite"></div>
      </div>
    </div>
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

  root.querySelector("#btn-back-home")?.addEventListener("click", () => {
    ctx.navigate("/");
  });

  // Profile modal logic
  const userPill = root.querySelector("#user-pill");
  const profileModal = root.querySelector("#profile-modal");
  const profileClose = root.querySelector("#profile-modal-close");
  const profileCancel = root.querySelector("#profile-btn-cancel");
  const profileSave = root.querySelector("#profile-btn-save");
  const profileStatus = root.querySelector("#profile-status-message");

  const openProfileModal = async () => {
    if (!profileModal) return;
    if (profileStatus) {
      profileStatus.textContent = "";
      profileStatus.className = "";
    }
    try {
      const profile = await getProfile();
      if (profile) {
        const nameInput = root.querySelector("#profile-input-name");
        const instInput = root.querySelector("#profile-input-institution");
        const roleInput = root.querySelector("#profile-input-role");
        const uidInput = root.querySelector("#profile-uid");
        const createdInput = root.querySelector("#profile-created-at");
        const emailLabel = root.querySelector("#profile-email-label");
        const titleEl = root.querySelector("#profile-title");
        const avatarLarge = root.querySelector("#profile-avatar-large");

        if (nameInput) nameInput.value = profile.name || "";
        if (instInput) instInput.value = profile.institution || "University of Ghana";
        if (roleInput) roleInput.value = profile.accountType || "Lecturer";
        if (uidInput) uidInput.value = profile.id || "";
        if (emailLabel) emailLabel.textContent = profile.email || "";
        if (titleEl) titleEl.textContent = profile.name || "User Profile";
        
        if (createdInput) {
          const dateStr = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "N/A";
          createdInput.value = dateStr;
        }

        if (avatarLarge) {
          const initials = (profile.name || profile.email)
            .split(" ")
            .map((p) => p[0]?.toUpperCase() || "")
            .join("")
            .slice(0, 2) || "U";
          avatarLarge.textContent = initials;
        }
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    }
    profileModal.hidden = false;
    setTimeout(() => profileModal.classList.add("show"), 10);
  };

  const closeProfileModal = () => {
    if (!profileModal) return;
    profileModal.classList.remove("show");
    setTimeout(() => { profileModal.hidden = true; }, 300);
  };

  userPill?.addEventListener("click", openProfileModal);
  profileClose?.addEventListener("click", closeProfileModal);
  profileCancel?.addEventListener("click", closeProfileModal);
  profileModal?.addEventListener("click", (e) => {
    if (e.target === profileModal) {
      closeProfileModal();
    }
  });

  profileSave?.addEventListener("click", async () => {
    const nameInput = root.querySelector("#profile-input-name");
    const instInput = root.querySelector("#profile-input-institution");
    const roleInput = root.querySelector("#profile-input-role");

    const name = nameInput?.value?.trim();
    const institution = instInput?.value?.trim();
    const accountType = roleInput?.value;

    if (!name) {
      if (profileStatus) {
        profileStatus.textContent = "Name cannot be empty.";
        profileStatus.className = "profile-msg-error";
      }
      return;
    }

    if (profileSave) {
      profileSave.disabled = true;
      profileSave.textContent = "Saving...";
    }

    try {
      await updateProfile({ name, institution, accountType });
      
      const avatarEl = root.querySelector("#user-avatar");
      if (avatarEl) {
        const initials = name
          .split(" ")
          .map((p) => p[0]?.toUpperCase() || "")
          .join("")
          .slice(0, 2) || "U";
        avatarEl.textContent = initials;
      }
      
      const titleEl = root.querySelector("#profile-title");
      const avatarLarge = root.querySelector("#profile-avatar-large");
      if (titleEl) titleEl.textContent = name;
      if (avatarLarge) {
        const initials = name
          .split(" ")
          .map((p) => p[0]?.toUpperCase() || "")
          .join("")
          .slice(0, 2) || "U";
        avatarLarge.textContent = initials;
      }

      if (profileStatus) {
        profileStatus.textContent = "Profile updated successfully!";
        profileStatus.className = "profile-msg-success";
      }
      setTimeout(closeProfileModal, 1000);
    } catch (err) {
      if (profileStatus) {
        profileStatus.textContent = err.message || "Failed to update profile.";
        profileStatus.className = "profile-msg-error";
      }
    } finally {
      if (profileSave) {
        profileSave.disabled = false;
        profileSave.textContent = "Save Changes";
      }
    }
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
  window.ScriptIQ = window.ScriptIQ || {};
  window.ScriptIQ.currentUser = session.user;
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
