/**
 * ScriptIQ — application shell (Phase 1).
 *
 * Wires the upload UI to the parser + pipeline and renders extracted text.
 * Parsed documents are kept in ScriptIQ.documents so later phases
 * (similarity scoring, diff, graph) can consume them without re-parsing.
 */
window.ScriptIQ = window.ScriptIQ || {};

/** In-memory registry of processed documents, keyed by a generated id. */
ScriptIQ.documents = new Map();

/**
 * Boot the upload/compare UI. Safe to call after each SPA navigation to /app
 * because the DOM nodes are recreated on every render.
 */
export function initScriptIQApp() {
  "use strict";

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const statusEl = document.getElementById("upload-status");
  const documentsPanel = document.getElementById("documents-panel");
  const documentList = document.getElementById("document-list");
  const clearAllBtn = document.getElementById("clear-all");

  const comparePanel = document.getElementById("compare-panel");
  const selectA = document.getElementById("select-a");
  const selectB = document.getElementById("select-b");
  const compareBtn = document.getElementById("compare-btn");
  const compareResults = document.getElementById("compare-results");
  const viewMatches = document.getElementById("view-matches");
  const viewDiff = document.getElementById("view-diff");
  const viewToggle = document.querySelector(".view-toggle");

  const graphPanel = document.getElementById("graph-panel");
  const graphSvg = document.getElementById("graph-svg");
  const graphInfo = document.getElementById("graph-info");
  const thresholdSlider = document.getElementById("threshold-slider");
  const thresholdValue = document.getElementById("threshold-value");

  const aiEnableBtn = document.getElementById("ai-enable");
  const aiStatus = document.getElementById("ai-status");
  const historyPanel = document.getElementById("history-panel");
  const historyBody = document.getElementById("history-body");
  const clearHistoryBtn = document.getElementById("clear-history");

  const standardsPanel = document.getElementById("standards-panel");

  // Reset in-memory state when the SPA remounts the app shell (navigation back to /app).
  ScriptIQ.documents.clear();
  documentList.innerHTML = "";
  documentsPanel.hidden = true;
  standardsPanel.hidden = true;
  comparePanel.hidden = true;
  compareResults.hidden = true;
  graphPanel.hidden = true;
  historyPanel.hidden = true;

  /** The pair currently on screen; diff is computed lazily per pair. */
  let currentPair = null; // { idA, idB, diffRendered }
  let currentLinks = [];

  /**
   * TF-IDF vectors are corpus-wide (IDF depends on every document), so
   * they're built once per document-set change and reused by both the
   * compare panel and the graph — bump `docsVersion` on any add/remove
   * and the next caller rebuilds. Matters for big batches, where a
   * rebuild per comparison would be O(batch) work on every click.
   */
  let docsVersion = 0;
  let corpusCache = { version: -1, docs: [], byId: new Map() };

  /** Total pair count when the graph had to drop weak edges; 0 otherwise. */
  let graphTrimmed = 0;

  function getCorpusVectors() {
    if (corpusCache.version !== docsVersion) {
      const docs = [...ScriptIQ.documents.values()];
      const vectors = ScriptIQ.similarity.buildVectors(
        docs.map((d) => d.filteredTokens)
      );
      corpusCache = {
        version: docsVersion,
        docs,
        byId: new Map(docs.map((d, i) => [d.id, vectors[i]])),
      };
    }
    return corpusCache;
  }

  let nextId = 1;

  // ---------- upload wiring ----------

  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  ["dragenter", "dragover"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
    })
  );

  dropZone.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));
  fileInput.addEventListener("change", () => {
    handleFiles(fileInput.files);
    fileInput.value = ""; // allow re-uploading the same file
  });

  clearAllBtn.addEventListener("click", () => {
    ScriptIQ.documents.clear();
    docsVersion++;
    documentList.innerHTML = "";
    documentsPanel.hidden = true;
    standardsPanel.hidden = true;
    comparePanel.hidden = true;
    compareResults.hidden = true;
    graphPanel.hidden = true;
    currentPair = null;
    setStatus("");
    ScriptIQ.storage
      .deleteAllSubmissions()
      .then(() => refreshHistory()) // rows lose their "Open" buttons
      .catch(() => {});
  });

  thresholdSlider.addEventListener("input", () => {
    thresholdValue.textContent = thresholdSlider.value + "%";
    const visible = ScriptIQ.graph.applyThreshold(thresholdSlider.value / 100);
    updateGraphInfo(visible);
  });

  compareBtn.addEventListener("click", () => {
    if (selectA.value && selectB.value) {
      comparePair(selectA.value, selectB.value);
    }
  });

  // Changing either dropdown compares immediately — the button stays as
  // an explicit affordance, but nobody should have to find it.
  for (const sel of [selectA, selectB]) {
    sel.addEventListener("change", () => {
      if (selectA.value && selectB.value && selectA.value !== selectB.value) {
        comparePair(selectA.value, selectB.value);
      }
    });
  }

  // Helper for generating text reports
  function generateTextReport(docA, docB, tfidfScore, semanticScore) {
    const pctTfidf = Math.round(tfidfScore * 100);
    const pctSemantic = semanticScore !== null ? Math.round(semanticScore * 100) + "%" : "Not Computed";
    
    let report = `ScriptIQ Plagiarism Detection Report\n`;
    report += `=====================================\n`;
    report += `Generated at: ${new Date().toLocaleString()}\n\n`;
    report += `Compared Submissions:\n`;
    report += `- Document A: ${docA.name} (${docA.raw.length} characters)\n`;
    report += `- Document B: ${docB.name} (${docB.raw.length} characters)\n\n`;
    report += `Similarity Scores:\n`;
    report += `- TF-IDF cosine similarity: ${pctTfidf}%\n`;
    report += `- AI Semantic similarity: ${pctSemantic}\n\n`;
    
    const matches = ScriptIQ.similarity.findMatches(docA.offsetTokens, docB.offsetTokens);
    report += `Coverage Stats:\n`;
    report += `- ${docA.name}: ${Math.round(matches.coverageA * 100)}% words matched\n`;
    report += `- ${docB.name}: ${Math.round(matches.coverageB * 100)}% words matched\n\n`;
    
    report += `=====================================\n`;
    report += `Disclaimer: This report was generated locally on-device by ScriptIQ. Concept similarities do not imply plagiarized intent without academic review.\n`;
    return report;
  }

  // Export report as PDF (via formatted Print view)
  async function downloadPdfReport(idA, idB) {
    const docA = ScriptIQ.documents.get(idA);
    const docB = ScriptIQ.documents.get(idB);
    if (!docA || !docB) return;
    
    try {
      const { byId } = getCorpusVectors();
      const tfidf = ScriptIQ.similarity.cosine(byId.get(idA), byId.get(idB));
      
      let semantic = null;
      if (ScriptIQ.semantic.getStatus() === "ready") {
        try {
          const embA = await ScriptIQ.semantic.embedDocument(idA, docA.raw);
          const embB = await ScriptIQ.semantic.embedDocument(idB, docB.raw);
          semantic = ScriptIQ.semantic.cosine(embA, embB);
        } catch {}
      }
      
      const matches = ScriptIQ.similarity.findMatches(docA.offsetTokens, docB.offsetTokens);
      
      const printWindow = window.open("", "_blank");
      printWindow.document.write('<html><head><title>Plagiarism Report — ' + docA.name + ' vs ' + docB.name + '</title><style>body { font-family: "Segoe UI", Arial, sans-serif; line-height: 1.6; color: #202124; padding: 40px; margin: 0; } .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; margin-bottom: 20px; } .header h1 { margin: 0; color: #1a73e8; font-size: 24px; } .score-container { display: flex; gap: 20px; margin: 20px 0; } .score-card { flex: 1; border: 1px solid #dadce0; border-radius: 8px; padding: 15px; text-align: center; } .score-card h3 { margin: 0 0 10px 0; font-size: 14px; color: #5f6368; } .score-value { font-size: 32px; font-weight: bold; color: #1a73e8; } .score-card.high .score-value { color: #d93025; } .score-card.semantic .score-value { color: #724ae8; } table { width: 100%; border-collapse: collapse; margin: 20px 0; } th, td { border: 1px solid #dadce0; padding: 12px 15px; text-align: left; } th { background-color: #f8f9fa; font-weight: 600; } .disclaimer { background-color: #f8f9fa; border-left: 4px solid #1a73e8; padding: 15px; margin-top: 40px; font-size: 14px; color: #5f6368; } @media print { body { padding: 0; } button { display: none; } }</style></head><body><div class="header"><h1>ScriptIQ Plagiarism Detection Report</h1><button onclick="window.print()" style="background: #1a73e8; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: 500; cursor: pointer;">Print / Save PDF</button></div><p>Generated at: ' + new Date().toLocaleString() + '</p><h2>Similarity Summary</h2><div class="score-container"><div class="score-card ' + (tfidf >= 0.3 ? 'high' : '') + '"><h3>TF-IDF Similarity</h3><div class="score-value">' + Math.round(tfidf * 100) + '%</div></div><div class="score-card semantic"><h3>AI Semantic Similarity</h3><div class="score-value">' + (semantic !== null ? Math.round(semantic * 100) + '%' : 'Not Computed') + '</div></div><div class="score-card"><h3>Verdict</h3><div class="score-value" style="font-size: 20px; margin-top: 10px;">' + (tfidf >= 0.3 ? 'High Risk Plagiarism Warning' : tfidf >= 0.15 ? 'Moderate Risk' : 'Low Risk / Acceptable') + '</div></div></div><h2>Comparison Details</h2><table><tr><th>Document A</th><td>' + docA.name + ' (' + docA.raw.length.toLocaleString() + ' characters)</td></tr><tr><th>Document B</th><td>' + docB.name + ' (' + docB.raw.length.toLocaleString() + ' characters)</td></tr><tr><th>Shared Word Coverage (Doc A)</th><td>' + Math.round(matches.coverageA * 100) + '% of words in matching runs</td></tr><tr><th>Shared Word Coverage (Doc B)</th><td>' + Math.round(matches.coverageB * 100) + '% of words in matching runs</td></tr></table><div class="disclaimer"><strong>Verification Notice:</strong> This plagiarism report was generated locally in the browser. Concept similarities do not replace human instruction grading assessments.</div><script>window.onload = () => { setTimeout(() => { window.print(); }, 500); };</script></body></html>');
      printWindow.document.close();
    } catch (err) {
      alert("Failed to export PDF: " + err.message);
    }
  }

  // Export report as Word document fallback (.doc)
  async function downloadDocxReport(idA, idB) {
    const docA = ScriptIQ.documents.get(idA);
    const docB = ScriptIQ.documents.get(idB);
    if (!docA || !docB) return;
    
    try {
      const { byId } = getCorpusVectors();
      const tfidf = ScriptIQ.similarity.cosine(byId.get(idA), byId.get(idB));
      
      let semantic = null;
      if (ScriptIQ.semantic.getStatus() === "ready") {
        try {
          const embA = await ScriptIQ.semantic.embedDocument(idA, docA.raw);
          const embB = await ScriptIQ.semantic.embedDocument(idB, docB.raw);
          semantic = ScriptIQ.semantic.cosine(embA, embB);
        } catch {}
      }
      
      const matches = ScriptIQ.similarity.findMatches(docA.offsetTokens, docB.offsetTokens);
      
      const docHtml = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><title>Plagiarism Report</title><style>body { font-family: Arial, sans-serif; line-height: 1.5; color: #333333; padding: 20px; } h1 { color: #1a73e8; font-size: 20pt; border-bottom: 2px solid #1a73e8; padding-bottom: 5px; } h2 { color: #3c4043; font-size: 14pt; margin-top: 20px; } table { width: 100%; border-collapse: collapse; margin-top: 10px; } th, td { border: 1px solid #dadce0; padding: 8px; text-align: left; } th { background-color: #f8f9fa; font-weight: bold; } .meta-val { font-weight: bold; }</style></head><body><h1>ScriptIQ Plagiarism Detection Report</h1><p>Generated at: ' + new Date().toLocaleString() + '</p><h2>1. Comparison Metadata</h2><table><tr><th>Metric</th><th>Value</th></tr><tr><td>Document A Name</td><td class="meta-val">' + docA.name + '</td></tr><tr><td>Document B Name</td><td class="meta-val">' + docB.name + '</td></tr><tr><td>TF-IDF Similarity Score</td><td class="meta-val" style="color: #ea4335;">' + Math.round(tfidf * 100) + '%</td></tr><tr><td>AI Semantic Similarity Score</td><td class="meta-val" style="color: #7b61ff;">' + (semantic !== null ? Math.round(semantic * 100) + '%' : 'Not Computed') + '</td></tr><tr><td>Match Coverage (Doc A)</td><td class="meta-val">' + Math.round(matches.coverageA * 100) + '%</td></tr><tr><td>Match Coverage (Doc B)</td><td class="meta-val">' + Math.round(matches.coverageB * 100) + '%</td></tr></table><h2>2. Disclaimer</h2><p>This document was generated locally by ScriptIQ. Concept conceptual matching may require human review.</p></body></html>';
      
      const blob = new Blob(['\ufeff' + docHtml], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = 'scriptiq_report_' + docA.name.split(".")[0] + '_vs_' + docB.name.split(".")[0] + '.doc';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to export Word Doc: " + err.message);
    }
  }

  // Export report as ZIP
  async function downloadZipReport(idA, idB) {
    const docA = ScriptIQ.documents.get(idA);
    const docB = ScriptIQ.documents.get(idB);
    if (!docA || !docB) return;
    
    try {
      const { byId } = getCorpusVectors();
      const tfidf = ScriptIQ.similarity.cosine(byId.get(idA), byId.get(idB));
      
      let semantic = null;
      if (ScriptIQ.semantic.getStatus() === "ready") {
        try {
          const embA = await ScriptIQ.semantic.embedDocument(idA, docA.raw);
          const embB = await ScriptIQ.semantic.embedDocument(idB, docB.raw);
          semantic = ScriptIQ.semantic.cosine(embA, embB);
        } catch {}
      }
      
      const reportText = generateTextReport(docA, docB, tfidf, semantic);
      
      const zip = new JSZip();
      zip.file(docA.name.replace(/[\/\\:*?"<>|]/g, "_"), docA.raw);
      zip.file(docB.name.replace(/[\/\\:*?"<>|]/g, "_"), docB.raw);
      zip.file("scriptiq_similarity_report.txt", reportText);
      
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = 'scriptiq_bundle_' + docA.name.split(".")[0] + '_vs_' + docB.name.split(".")[0] + '.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to generate ZIP: " + err.message);
    }
  }

  // Collect similar works (batch)
  const btnCollectSimilar = document.getElementById("btn-collect-similar");
  if (btnCollectSimilar) {
    btnCollectSimilar.addEventListener("click", async () => {
      try {
        const threshold = Number(thresholdSlider.value) / 100;
        const pairs = currentLinks.filter(l => l.score >= threshold);
        if (pairs.length === 0) {
          alert("No similar works found at or above this threshold.");
          return;
        }

        const uniqueIds = new Set();
        pairs.forEach(p => {
          uniqueIds.add(p.source);
          uniqueIds.add(p.target);
        });

        const zip = new JSZip();
        
        uniqueIds.forEach(id => {
          const doc = ScriptIQ.documents.get(id);
          if (doc) {
            zip.file(doc.name.replace(/[\/\\:*?"<>|]/g, "_"), doc.raw);
          }
        });

        let report = `ScriptIQ — Plagiarism Analysis Summary Report\n`;
        report += `Generated at: ${new Date().toLocaleString()}\n`;
        report += `Similarity Threshold: ${thresholdSlider.value}%\n`;
        report += `Total Flagged Documents: ${uniqueIds.size}\n`;
        report += `Total Flagged Pairs: ${pairs.length}\n\n`;
        report += `──────────────────────────────────────────────────\n`;
        report += `FLAGGED PAIRS & SCORES:\n`;
        report += `──────────────────────────────────────────────────\n`;
        
        pairs.sort((a,b) => b.score - a.score).forEach(p => {
          const docA = ScriptIQ.documents.get(p.source);
          const docB = ScriptIQ.documents.get(p.target);
          if (docA && docB) {
            report += `• [${Math.round(p.score * 100)}%] ${docA.name} ↔ ${docB.name}\n`;
          }
        });
        
        zip.file("similarity-summary-report.txt", report);

        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `similar-submissions-threshold-${thresholdSlider.value}pct.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("ScriptIQ: failed to generate ZIP package:", err);
        alert("Failed to compile similar works package: " + err.message);
      }
    });
  }

  // Collect compared pair as ZIP
  const btnCollectPair = document.getElementById("btn-collect-pair");
  if (btnCollectPair) {
    btnCollectPair.addEventListener("click", async () => {
      if (!currentPair) return;
      const docA = ScriptIQ.documents.get(currentPair.idA);
      const docB = ScriptIQ.documents.get(currentPair.idB);
      if (!docA || !docB) return;
      try {
        const zip = new JSZip();
        zip.file(docA.name.replace(/[\/\\:*?"<>|]/g, "_"), docA.raw);
        zip.file(docB.name.replace(/[\/\\:*?"<>|]/g, "_"), docB.raw);
        
        let report = `ScriptIQ — Plagiarism Analysis Pair Report\n`;
        report += `Generated at: ${new Date().toLocaleString()}\n\n`;
        report += `File A: ${docA.name}\n`;
        report += `File B: ${docB.name}\n`;
        
        const tfidfVal = document.getElementById("score-value")?.textContent || "—";
        const semVal = document.getElementById("semantic-value")?.textContent || "—";
        
        report += `Exact Word Similarity: ${tfidfVal}\n`;
        report += `Semantic Similarity: ${semVal}\n`;
        
        zip.file("comparison-report.txt", report);
        
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `comparison-${docA.name.split(".")[0]}-vs-${docB.name.split(".")[0]}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("ScriptIQ: failed to download comparison pair ZIP:", err);
        alert("Failed to create ZIP: " + err.message);
      }
    });
  }

  viewToggle.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (btn) setActiveView(btn.dataset.view);
  });

  // ---------- Plagiarism Standards & Grading Policies ----------
  const standardsInst = document.getElementById("standards-institution");
  const standardsLow = document.getElementById("standards-low");
  const standardsHigh = document.getElementById("standards-high");
  const labelLow = document.getElementById("label-val-low");
  const labelHigh = document.getElementById("label-val-high");
  const standardsDesc = document.getElementById("standards-description");
  const graphPairsBody = document.getElementById("graph-pairs-body");

  const standardsKey = `scriptiq:standards:${window.ScriptIQ?.currentUser?.id || "anonymous"}`;
  let standards = {
    institution: "custom",
    lowLimit: 15,
    highLimit: 30
  };

  // Load from localStorage
  try {
    const saved = localStorage.getItem(standardsKey);
    if (saved) {
      standards = JSON.parse(saved);
    }
  } catch {}

  // Apply to UI
  if (standardsInst) standardsInst.value = standards.institution;
  if (standardsLow) {
    standardsLow.value = standards.lowLimit;
    if (labelLow) labelLow.textContent = standards.lowLimit + "%";
  }
  if (standardsHigh) {
    standardsHigh.value = standards.highLimit;
    if (labelHigh) labelHigh.textContent = standards.highLimit + "%";
  }
  updateStandardsDescription();

  function updateStandardsDescription() {
    if (!standardsDesc) return;
    const inst = standardsInst ? standardsInst.value : "custom";
    if (inst === "knust") {
      standardsDesc.innerHTML = "<strong>KNUST Policy:</strong> Strict similarity compliance. High risk threshold at 20%. Exceeding this triggers automatic assignment failure and review.";
    } else if (inst === "ug") {
      standardsDesc.innerHTML = "<strong>UG Policy:</strong> Moderate thresholds. High risk threshold at 25%. Cap marks at 50% for moderate risk.";
    } else if (inst === "ashesi") {
      standardsDesc.innerHTML = "<strong>Ashesi Policy:</strong> Honor Code compliance. High risk threshold at 15%. Strict review policy.";
    } else {
      standardsDesc.innerHTML = "<strong>Custom Policy:</strong> Configure custom thresholds to match your course grading guidelines.";
    }
  }

  function saveStandards() {
    try {
      localStorage.setItem(standardsKey, JSON.stringify(standards));
    } catch {}
    refreshGraph();
    if (currentPair) {
      comparePair(currentPair.idA, currentPair.idB);
    }
  }

  if (standardsInst) {
    standardsInst.addEventListener("change", () => {
      const val = standardsInst.value;
      standards.institution = val;
      if (val === "knust") {
        standards.lowLimit = 10;
        standards.highLimit = 20;
      } else if (val === "ug") {
        standards.lowLimit = 15;
        standards.highLimit = 25;
      } else if (val === "ashesi") {
        standards.lowLimit = 8;
        standards.highLimit = 15;
      }
      
      if (standardsLow) {
        standardsLow.value = standards.lowLimit;
        if (labelLow) labelLow.textContent = standards.lowLimit + "%";
      }
      if (standardsHigh) {
        standardsHigh.value = standards.highLimit;
        if (labelHigh) labelHigh.textContent = standards.highLimit + "%";
      }
      
      updateStandardsDescription();
      saveStandards();
    });
  }

  if (standardsLow) {
    standardsLow.addEventListener("input", () => {
      standards.institution = "custom";
      if (standardsInst) standardsInst.value = "custom";
      if (Number(standardsLow.value) > Number(standardsHigh.value)) {
        standardsHigh.value = standardsLow.value;
        if (labelHigh) labelHigh.textContent = standardsHigh.value + "%";
        standards.highLimit = Number(standardsHigh.value);
      }
      standards.lowLimit = Number(standardsLow.value);
      if (labelLow) labelLow.textContent = standards.lowLimit + "%";
      updateStandardsDescription();
      saveStandards();
    });
  }

  if (standardsHigh) {
    standardsHigh.addEventListener("input", () => {
      standards.institution = "custom";
      if (standardsInst) standardsInst.value = "custom";
      if (Number(standardsHigh.value) < Number(standardsLow.value)) {
        standardsLow.value = standardsHigh.value;
        if (labelLow) labelLow.textContent = standardsLow.value + "%";
        standards.lowLimit = Number(standardsLow.value);
      }
      standards.highLimit = Number(standardsHigh.value);
      if (labelHigh) labelHigh.textContent = standards.highLimit + "%";
      updateStandardsDescription();
      saveStandards();
    });
  }

  // Click handler for Flagged table and Duplicates list (Compare and Export buttons)
  if (graphPanel) {
    graphPanel.addEventListener("click", (e) => {
      const btnCompare = e.target.closest(".graph-open-pair");
      if (btnCompare) {
        const idA = btnCompare.dataset.a;
        const idB = btnCompare.dataset.b;
        selectA.value = idA;
        selectB.value = idB;
        comparePair(idA, idB);
        setActiveView("diff");
        comparePanel.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      const btnPdf = e.target.closest(".btn-export-pdf");
      if (btnPdf) {
        downloadPdfReport(btnPdf.dataset.a, btnPdf.dataset.b);
        return;
      }

      const btnDocx = e.target.closest(".btn-export-docx");
      if (btnDocx) {
        downloadDocxReport(btnDocx.dataset.a, btnDocx.dataset.b);
        return;
      }

      const btnZip = e.target.closest(".btn-export-zip");
      if (btnZip) {
        downloadZipReport(btnZip.dataset.a, btnZip.dataset.b);
        return;
      }
    });
  }

  // Synchronized scrolling helper
  function syncContainers(idA, idB) {
    const paneA = document.getElementById(idA);
    const paneB = document.getElementById(idB);
    if (!paneA || !paneB) return;
    
    // Clear any existing scroll sync handlers
    paneA.removeEventListener("scroll", paneA._syncScroll);
    paneB.removeEventListener("scroll", paneB._syncScroll);
    
    let activePane = null;
    paneA.addEventListener("mouseenter", () => { activePane = paneA; });
    paneB.addEventListener("mouseenter", () => { activePane = paneB; });
    
    const onScroll = (e) => {
      if (e.target !== activePane) return;
      const other = e.target === paneA ? paneB : paneA;
      const pct = e.target.scrollTop / (e.target.scrollHeight - e.target.clientHeight);
      other.scrollTop = pct * (other.scrollHeight - other.clientHeight);
    };
    
    paneA._syncScroll = onScroll;
    paneB._syncScroll = onScroll;
    paneA.addEventListener("scroll", onScroll);
    paneB.addEventListener("scroll", onScroll);
  }

  // Verdict display helper
  function updateVerdictCard(tfidfScore, semanticScore) {
    const verdictValue = document.getElementById("verdict-value");
    const verdictLabel = document.getElementById("verdict-label");
    const verdictSub = document.getElementById("verdict-sub");
    const verdictCard = document.getElementById("verdict-card");
    if (!verdictValue || !verdictLabel || !verdictSub || !verdictCard) return;

    const maxScore = Math.max(tfidfScore, semanticScore || 0) * 100;
    const low = standards.lowLimit;
    const high = standards.highLimit;

    let tier, text, colorClass, borderStyle;
    if (maxScore >= high) {
      tier = "High Risk";
      text = "Academic Plagiarism Warning";
      colorClass = "score-high";
      borderStyle = "1px solid var(--danger)";
    } else if (maxScore >= low) {
      tier = "Moderate Risk";
      text = "Requires Manual Review";
      colorClass = "score-moderate";
      borderStyle = "1px solid #fbbf24";
    } else {
      tier = "Low Risk";
      text = "Standard Acceptable Citations";
      colorClass = "score-low";
      borderStyle = "1px solid var(--success)";
    }

    verdictValue.textContent = tier;
    verdictValue.className = `score-value ${colorClass}`;
    verdictLabel.textContent = text;
    verdictCard.style.border = borderStyle;

    const instName = standards.institution === "knust" ? "KNUST Policy"
                   : standards.institution === "ug" ? "UG Policy"
                   : standards.institution === "ashesi" ? "Ashesi Policy"
                   : "Custom Policy";
    verdictSub.textContent = `${instName} (limits: ${low}% / ${high}%)`;
  }

  /** Switch between the shared-passages and diff views ("matches"/"diff"). */
  function setActiveView(view) {
    viewToggle
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.toggle("active", t.dataset.view === view));

    const showDiff = view === "diff";
    viewMatches.hidden = showDiff;
    viewDiff.hidden = !showDiff;

    // Compute the LCS diff only when first asked for, then keep it.
    if (showDiff && currentPair && !currentPair.diffRendered) {
      renderDiff(
        ScriptIQ.documents.get(currentPair.idA),
        ScriptIQ.documents.get(currentPair.idB)
      );
      currentPair.diffRendered = true;
    }
  }

  // ---------- processing ----------

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    documentsPanel.hidden = false;
    standardsPanel.hidden = false;

    // Step 1: expand any ZIPs so a whole class arrives as one upload.
    // Everything downstream sees a flat list of entries and no longer
    // cares whether they came loose or out of an archive.
    setStatus("Reading files…");
    const entries = [];
    const skipped = [];
    for (const file of files) {
      try {
        const expanded = await ScriptIQ.parser.expand(file);
        entries.push(...expanded.entries);
        skipped.push(...expanded.skipped);
      } catch (err) {
        // A bad archive gets its own error card rather than aborting the
        // whole upload.
        const card = renderCard("pending-" + nextId++, file.name, formatSize(file.size));
        documentList.appendChild(card);
        renderCardError(card, err.message);
      }
    }

    // Step 2: parse each entry.
    for (let f = 0; f < entries.length; f++) {
      const entry = entries[f];
      if (entries.length > 1) {
        setStatus(`Extracting text — ${f + 1} of ${entries.length}: ${entry.name}…`);
        // Yield to the browser so the status line and cards repaint
        // mid-batch instead of freezing until the last file lands.
        await new Promise((r) => setTimeout(r, 0));
      }
      const card = renderCard("pending-" + nextId++, entry.name, formatSize(entry.size));
      documentList.appendChild(card);

      try {
        const rawText = await ScriptIQ.parser.extractText(entry);

        // Content-hash id: stable across reloads (drives IndexedDB
        // persistence and the embedding cache) and makes re-uploading
        // the same file an update, not a duplicate.
        const id = await contentHash(entry.name + "\u0000" + rawText);
        const existing = ScriptIQ.documents.get(id);
        if (existing && existing.cardEl) existing.cardEl.remove();

        const processed = ScriptIQ.pipeline.process(rawText);
        const doc = {
          id,
          name: entry.name,
          size: entry.size,
          uploadedAt: new Date(),
          cardEl: card,
          ...processed,
        };
        ScriptIQ.documents.set(id, doc);
        docsVersion++;
        card.dataset.docId = id;
        renderCardResult(card, processed);

        ScriptIQ.storage
          .saveSubmission({
            id,
            name: doc.name,
            size: doc.size,
            uploadedAt: doc.uploadedAt.toISOString(),
            raw: rawText,
          })
          .catch((err) =>
            console.warn("ScriptIQ: could not persist submission:", err)
          );
      } catch (err) {
        renderCardError(card, err.message);
      }
    }

    const ok = ScriptIQ.documents.size;
    const ignored = skipped.length
      ? ` ${skipped.length} non-document file(s) in the archive were ignored.`
      : "";
    setStatus(
      (ok >= 3
        ? `${ok} documents ready — see the batch overview below.`
        : ok === 2
          ? "2 documents ready — pick a pair below to compare."
          : ok === 1
            ? "1 document ready. Upload at least one more to compare."
            : "No readable documents yet — see the errors above.") + ignored
    );
    if (skipped.length) {
      console.info("ScriptIQ: ignored non-document archive entries:", skipped);
    }
    applyDensity();
    refreshComparePanel();
    refreshGraph();
  }

  /**
   * Keep the extracted-text panel readable as the batch grows.
   *
   * With a couple of documents the lecturer wants to see the text — it is
   * how they confirm extraction worked. With fifty, that same layout is
   * an unusable wall: the panel becomes a compact one-per-row roster and
   * each text collapses behind its own disclosure toggle.
   */
  const DENSE_THRESHOLD = 5;

  function applyDensity() {
    const dense = documentList.children.length > DENSE_THRESHOLD;
    documentList.classList.toggle("dense", dense);
    // Close every preview when switching into dense mode so a big batch
    // never renders fifty text blocks at once; leave them alone otherwise.
    if (dense) {
      documentList
        .querySelectorAll("details.doc-preview[open]")
        .forEach((d) => (d.open = false));
    }
  }

  // ---------- batch graph (Phase 4) ----------

  /** Rebuild the network graph from the current document set (3+ docs). */
  function refreshGraph() {
    const docs = [...ScriptIQ.documents.values()];
    if (docs.length < 1) {
      graphPanel.hidden = true;
      return;
    }
    graphPanel.hidden = false;

    // Score every pair once; the graph handles thresholding/display.
    const { byId } = getCorpusVectors();
    const links = [];
    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        links.push({
          source: docs[i].id,
          target: docs[j].id,
          score: ScriptIQ.similarity.cosine(
            byId.get(docs[i].id),
            byId.get(docs[j].id)
          ),
        });
      }
    }
    currentLinks = links; // Store computed links globally for ZIP generation

    // Very large batches produce a hairball the force layout can't settle
    // (a 60-file class = 1,770 pairs). Keep the strongest links only —
    // the weak ones are noise for a plagiarism sweep anyway.
    const MAX_EDGES = 400;
    let trimmedTo = 0;
    if (links.length > MAX_EDGES) {
      links.sort((a, b) => b.score - a.score);
      trimmedTo = links.length;
      links.length = MAX_EDGES;
    }
    graphTrimmed = trimmedTo;

    const visible = ScriptIQ.graph.render({
      svg: graphSvg,
      nodes: docs.map((d) => ({ id: d.id, name: d.name })),
      links,
      threshold: thresholdSlider.value / 100,
      onEdgeClick: (idA, idB) => {
        selectA.value = idA;
        selectB.value = idB;
        comparePair(idA, idB);
        setActiveView("diff");
        comparePanel.scrollIntoView({ behavior: "smooth", block: "start" });
      },
      lowLimit: standards.lowLimit,
      highLimit: standards.highLimit,
    });
    updateGraphInfo(visible);
  }

  function updateGraphInfo(visibleEdges) {
    const n = ScriptIQ.documents.size;
    const pairs = (n * (n - 1)) / 2;
    const trimNote = graphTrimmed
      ? ` Showing only the 400 strongest of ${graphTrimmed.toLocaleString()} pairs.`
      : "";
    graphInfo.textContent =
      (visibleEdges === 0
        ? `No pairs at or above ${thresholdSlider.value}% similarity (${pairs.toLocaleString()} pairs checked). Lower the threshold to see weaker links.`
        : `${visibleEdges} of ${pairs.toLocaleString()} pairs at or above ${thresholdSlider.value}% similarity.`) +
      trimNote;

    // Toggle similar works button based on active threshold connections
    const btnCollect = document.getElementById("btn-collect-similar");
    if (btnCollect) {
      const threshold = Number(thresholdSlider.value) / 100;
      const count = currentLinks.filter(l => l.score >= threshold).length;
      btnCollect.style.display = count > 0 ? "inline-flex" : "none";
    }

    // Populate Flagged Similarity List Table
    const graphPairsBody = document.getElementById("graph-pairs-body");
    if (graphPairsBody) {
      const threshold = Number(thresholdSlider.value) / 100;
      const flaggedLinks = currentLinks.filter(l => l.score >= threshold);
      flaggedLinks.sort((a, b) => b.score - a.score);

      if (flaggedLinks.length === 0) {
        graphPairsBody.innerHTML = `<tr><td colspan="3" class="muted" style="text-align: center; padding: 2rem;">No pairs above threshold.</td></tr>`;
      } else {
        graphPairsBody.innerHTML = flaggedLinks.map(link => {
          const docA = ScriptIQ.documents.get(link.source);
          const docB = ScriptIQ.documents.get(link.target);
          if (!docA || !docB) return "";
          const scorePercent = Math.round(link.score * 100);
          
          let color = "var(--ink)";
          if (scorePercent >= standards.highLimit) color = "var(--danger)";
          else if (scorePercent >= standards.lowLimit) color = "#fbbf24";
          
          return `<tr>
            <td style="word-break: break-all; padding: 0.65rem 0.25rem;">
              <div style="font-weight: 600; color: var(--ink);">${escapeHtml(docA.name)} ↔ ${escapeHtml(docB.name)}</div>
              <div style="display: flex; gap: 0.4rem; margin-top: 0.35rem; align-items: center; font-size: 0.72rem;">
                <span class="muted">Export:</span>
                <button class="btn-export-pdf" data-a="${link.source}" data-b="${link.target}" type="button" style="background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; text-decoration: underline;">PDF</button>
                <span style="color: var(--panel-border);">|</span>
                <button class="btn-export-docx" data-a="${link.source}" data-b="${link.target}" type="button" style="background: none; border: none; padding: 0; color: var(--accent-2); cursor: pointer; text-decoration: underline;">Word</button>
                <span style="color: var(--panel-border);">|</span>
                <button class="btn-export-zip" data-a="${link.source}" data-b="${link.target}" type="button" style="background: none; border: none; padding: 0; color: var(--success); cursor: pointer; text-decoration: underline;">ZIP</button>
              </div>
            </td>
            <td style="text-align: right; font-weight: 700; color: ${color}; padding: 0.65rem 0.25rem; vertical-align: middle;">${scorePercent}%</td>
            <td style="text-align: center; padding: 0.65rem 0.25rem; vertical-align: middle;">
              <button class="btn btn-small btn-ghost graph-open-pair" data-a="${link.source}" data-b="${link.target}" type="button" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
                Compare
              </button>
            </td>
          </tr>`;
        }).join("");
      }
    }

    // Populate Closely Similar Submissions List
    const simPanel = document.getElementById("similar-duplicates-panel");
    const simList = document.getElementById("similar-duplicates-list");
    if (simPanel && simList) {
      const highLimit = standards.highLimit;
      const copies = currentLinks.filter(l => l.score * 100 >= highLimit);
      copies.sort((a, b) => b.score - a.score);

      if (copies.length === 0) {
        simPanel.style.display = "none";
      } else {
        simPanel.style.display = "block";
        simList.innerHTML = copies.map(link => {
          const docA = ScriptIQ.documents.get(link.source);
          const docB = ScriptIQ.documents.get(link.target);
          if (!docA || !docB) return "";
          const scorePercent = Math.round(link.score * 100);
          
          return `
            <div class="glass-panel" style="padding: 1rem; border-color: rgba(255, 77, 109, 0.25); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
              <div>
                <h4 style="margin: 0 0 0.25rem; font-size: 0.92rem; color: var(--ink);">
                  📄 ${escapeHtml(docA.name)} <span style="color: var(--danger);">↔</span> 📄 ${escapeHtml(docB.name)}
                </h4>
                <div style="font-size: 0.8rem; color: var(--muted);">
                  Plagiarism warning index: <strong style="color: var(--danger);">${scorePercent}% Match</strong>
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button class="btn btn-small btn-ghost graph-open-pair" data-a="${link.source}" data-b="${link.target}" type="button" style="padding: 0.35rem 0.6rem; font-size: 0.78rem;">
                  Compare
                </button>
                <button class="btn btn-small btn-export-pdf" data-a="${link.source}" data-b="${link.target}" type="button" style="padding: 0.35rem 0.6rem; font-size: 0.78rem; border-color: var(--accent); color: var(--accent);">
                  ↓ PDF
                </button>
                <button class="btn btn-small btn-export-docx" data-a="${link.source}" data-b="${link.target}" type="button" style="padding: 0.35rem 0.6rem; font-size: 0.78rem; border-color: var(--accent-2); color: var(--accent-2);">
                  ↓ Word
                </button>
                <button class="btn btn-small btn-export-zip" data-a="${link.source}" data-b="${link.target}" type="button" style="padding: 0.35rem 0.6rem; font-size: 0.78rem; border-color: var(--success); color: var(--success);">
                  ↓ ZIP
                </button>
              </div>
            </div>
          `;
        }).join("");
      }
    }
  }

  // ---------- comparison (Phase 2) ----------

  /** Show the compare panel and (re)fill the pair selectors. */
  function refreshComparePanel() {
    const docs = [...ScriptIQ.documents.values()];
    if (docs.length < 2) {
      comparePanel.hidden = true;
      return;
    }
    comparePanel.hidden = false;

    // When two files share a name, tag each option with a bit of its
    // content hash so the lecturer can tell them apart.
    const nameCounts = new Map();
    for (const d of docs) {
      nameCounts.set(d.name, (nameCounts.get(d.name) || 0) + 1);
    }
    const labelOf = (d) =>
      nameCounts.get(d.name) > 1 ? `${d.name} · ${d.id.slice(0, 6)}` : d.name;

    const fill = (select, selectedId) => {
      select.innerHTML = "";
      for (const doc of docs) {
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = labelOf(doc);
        select.appendChild(opt);
      }
      if (selectedId && ScriptIQ.documents.has(selectedId)) {
        select.value = selectedId;
      }
    };
    fill(selectA, selectA.value || docs[0].id);
    fill(selectB, selectB.value || docs[1].id);
    if (selectA.value === selectB.value) selectB.value = docs[docs.length - 1].id;

    // With exactly two documents the pair is unambiguous — compare it now.
    if (docs.length === 2) comparePair(docs[0].id, docs[1].id);
  }

  /** Score a pair and render highlighted matches side by side. */
  function comparePair(idA, idB) {
    const docA = ScriptIQ.documents.get(idA);
    const docB = ScriptIQ.documents.get(idB);
    if (!docA || !docB) return;

    if (idA === idB) {
      setStatus("Pick two different documents to compare.");
      return;
    }

    // IDF over the whole uploaded corpus, not just the pair — common terms
    // across many submissions get down-weighted accordingly.
    const { byId } = getCorpusVectors();
    const score = ScriptIQ.similarity.cosine(byId.get(idA), byId.get(idB));

    const matches = ScriptIQ.similarity.findMatches(
      docA.offsetTokens,
      docB.offsetTokens
    );

    currentPair = { idA, idB, diffRendered: false };
    renderComparison(docA, docB, score, matches);
    updateVerdictCard(score, null);

    // If the lecturer is sitting on the diff tab, refresh it for the new
    // pair right away instead of leaving the old diff on screen.
    if (!viewDiff.hidden) {
      renderDiff(docA, docB);
      currentPair.diffRendered = true;
    }

    updateSemanticAndLog(docA, docB, score);
    document.getElementById("app")?.dispatchEvent(new CustomEvent("scriptiq:comparison-complete", { detail: { docA, docB, score } }));
  }

  // ---------- semantic score + history logging (Phase 5) ----------

  /**
   * Fill in the AI score card (if the model is ready) and append the
   * comparison to the persistent history. Runs async after the TF-IDF
   * results are already on screen, so embeddings never block the UI.
   */
  async function updateSemanticAndLog(docA, docB, tfidfScore) {
    const pairKey = docA.id + "|" + docB.id;
    let semanticScore = null;

    if (ScriptIQ.semantic.getStatus() === "ready") {
      renderSemanticCard("computing", null);
      try {
        const embA = await ScriptIQ.semantic.embedDocument(docA.id, docA.raw);
        const embB = await ScriptIQ.semantic.embedDocument(docB.id, docB.raw);
        semanticScore = ScriptIQ.semantic.cosine(embA, embB);
      } catch (err) {
        console.warn("ScriptIQ: semantic scoring failed:", err);
      }
      // The lecturer may have switched pairs while we were embedding —
      // don't paint this result onto a different comparison.
      if (!currentPair || currentPair.idA + "|" + currentPair.idB !== pairKey) {
        return;
      }
      renderSemanticCard(semanticScore !== null ? "done" : "error", semanticScore);
    } else {
      renderSemanticCard("disabled", null);
    }

    logComparison({
      aId: docA.id,
      bId: docB.id,
      aName: docA.name,
      bName: docB.name,
      tfidfScore,
      semanticScore,
      comparedAt: new Date().toISOString(),
    });

    // Similarity / Rephrasing Alert & Collection visibility toggle
    const rephraseAlert = document.getElementById("rephrasings-alert");
    const rephraseTitle = document.getElementById("rephrase-alert-title");
    const rephraseText = document.getElementById("rephrase-alert-text");
    const rephraseTfidf = document.getElementById("rephrase-tfidf");
    const rephraseSemantic = document.getElementById("rephrase-semantic");

    if (rephraseAlert) {
      const hasSemantic = (semanticScore !== null);
      const isParaphrase = hasSemantic && (semanticScore >= 0.55 && tfidfScore < 0.50);
      const isHighlySimilar = (tfidfScore >= 0.30);

      if (isParaphrase || isHighlySimilar) {
        rephraseAlert.style.display = "block";
        if (rephraseTfidf) rephraseTfidf.textContent = Math.round(tfidfScore * 100) + "%";
        if (rephraseSemantic) rephraseSemantic.textContent = hasSemantic ? Math.round(semanticScore * 100) + "%" : "AI disabled";

        if (isParaphrase) {
          rephraseAlert.style.borderColor = "var(--danger)";
          rephraseAlert.style.background = "rgba(255, 77, 109, 0.08)";
          if (rephraseTitle) rephraseTitle.innerHTML = "<span>⚠️</span> Similarity &amp; Paraphrase Alert";
          if (rephraseText) rephraseText.innerHTML = `This pair shows high meaning-level similarity (<strong id="rephrase-semantic">${hasSemantic ? Math.round(semanticScore * 100) + "%" : "AI disabled"}</strong>) but low exact word matching (<strong id="rephrase-tfidf">${Math.round(tfidfScore * 100) + "%"}</strong>). This indicates likely manual paraphrasing or automated rewriting.`;
        } else {
          rephraseAlert.style.borderColor = "var(--border)";
          rephraseAlert.style.background = "rgba(0, 245, 212, 0.05)";
          if (rephraseTitle) rephraseTitle.innerHTML = "<span>⚠️</span> High Similarity Alert";
          if (rephraseText) rephraseText.innerHTML = `This pair shows significant direct similarity (exact word matching: <strong id="rephrase-tfidf">${Math.round(tfidfScore * 100) + "%"}</strong>, semantic similarity: <strong id="rephrase-semantic">${hasSemantic ? Math.round(semanticScore * 100) + "%" : "AI disabled"}</strong>).`;
        }
      } else {
        rephraseAlert.style.display = "none";
      }
    }
    updateVerdictCard(tfidfScore, semanticScore);
  }

  function renderSemanticCard(state, score) {
    const value = document.getElementById("semantic-value");
    const label = document.getElementById("semantic-label");
    const sub = document.getElementById("semantic-sub");

    if (state === "done") {
      const pctScore = Math.round(score * 100);
      value.textContent = pctScore + "%";
      let level, text;
      if (pctScore >= 75) { level = "high"; text = "High semantic overlap — likely paraphrase"; }
      else if (pctScore >= 55) { level = "moderate"; text = "Moderate semantic overlap"; }
      else { level = "low"; text = "Low semantic overlap"; }
      value.className = "score-value score-" + level;
      label.textContent = text;
      sub.textContent = "sentence-embedding cosine (MiniLM, in-browser)";
      return;
    }

    value.textContent = "—";
    value.className = "score-value score-idle";
    label.textContent = "AI semantic similarity";
    sub.textContent =
      state === "computing" ? "computing…"
      : state === "error" ? "semantic scoring failed — see console"
      : ScriptIQ.semantic.getStatus() === "loading" ? "model downloading…"
      : "enable AI to compute";
  }

  const pct = (s) => (s == null ? null : Math.round(s * 100));

  /**
   * Append to the history log, unless the most recent entry for this pair
   * has identical scores (re-rendering the same comparison — e.g. the
   * auto-compare after a reload — shouldn't spam the log).
   */
  async function logComparison(entry) {
    try {
      const recent = await ScriptIQ.storage.getComparisons(20);
      const prev = recent.find(
        (r) =>
          (r.aId === entry.aId && r.bId === entry.bId) ||
          (r.aId === entry.bId && r.bId === entry.aId)
      );
      const unchanged =
        prev &&
        pct(prev.tfidfScore) === pct(entry.tfidfScore) &&
        pct(prev.semanticScore) === pct(entry.semanticScore);
      if (!unchanged) await ScriptIQ.storage.logComparison(entry);
      refreshHistory();
    } catch (err) {
      console.warn("ScriptIQ: could not log comparison:", err);
    }
  }

  // ---------- history panel (Phase 5) ----------

  async function refreshHistory() {
    let rows;
    try {
      rows = await ScriptIQ.storage.getComparisons(50);
    } catch {
      return; // persistence unavailable — panel just stays hidden
    }
    historyPanel.hidden = rows.length === 0;
    historyBody.innerHTML = rows
      .map((r) => {
        const canOpen =
          ScriptIQ.documents.has(r.aId) && ScriptIQ.documents.has(r.bId);
        return `<tr>
          <td class="when-cell">${new Date(r.comparedAt).toLocaleString()}</td>
          <td class="pair-cell">${escapeHtml(r.aName)} ↔ ${escapeHtml(r.bName)}</td>
          <td>${pct(r.tfidfScore)}%</td>
          <td>${r.semanticScore == null ? "—" : pct(r.semanticScore) + "%"}</td>
          <td>${
            canOpen
              ? `<button class="btn btn-small history-open" data-a="${r.aId}" data-b="${r.bId}" type="button">Open</button>`
              : `<span class="muted">not loaded</span>`
          }</td>
        </tr>`;
      })
      .join("");
  }

  historyBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".history-open");
    if (!btn) return;
    selectA.value = btn.dataset.a;
    selectB.value = btn.dataset.b;
    comparePair(btn.dataset.a, btn.dataset.b);
    comparePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  clearHistoryBtn.addEventListener("click", async () => {
    try {
      await ScriptIQ.storage.clearComparisons();
    } catch {}
    refreshHistory();
  });

  // ---------- AI enable (Phase 5) ----------

  aiEnableBtn.addEventListener("click", async () => {
    aiEnableBtn.disabled = true;
    aiStatus.textContent = "Loading model…";
    try {
      await ScriptIQ.semantic.enable((p) => {
        if (p && p.status === "progress" && /\.onnx$/.test(p.file || "")) {
          aiStatus.textContent = `Downloading model… ${Math.round(p.progress || 0)}%`;
        }
      });
      aiEnableBtn.hidden = true;
      aiStatus.textContent =
        "AI ready — comparisons now also score meaning, not just wording.";
      // Fill in the semantic card for whatever pair is on screen.
      if (currentPair) comparePair(currentPair.idA, currentPair.idB);
    } catch (err) {
      aiEnableBtn.disabled = false;
      aiStatus.textContent =
        "Could not load the AI model (are you offline?). TF-IDF scoring still works.";
      console.warn("ScriptIQ: model load failed:", err);
    }
  });

  function renderComparison(docA, docB, score, matches) {
    compareResults.hidden = false;

    const pct = Math.round(score * 100);
    const scoreValue = document.getElementById("score-value");
    const scoreLabel = document.getElementById("score-label");
    scoreValue.textContent = pct + "%";

    let level, label;
    if (pct >= 60) { level = "high"; label = "High similarity — review closely"; }
    else if (pct >= 30) { level = "moderate"; label = "Moderate similarity"; }
    else { level = "low"; label = "Low similarity"; }
    scoreValue.className = "score-value score-" + level;
    scoreLabel.textContent = label;

    document.getElementById("coverage-a").textContent =
      `${docA.name}: ${Math.round(matches.coverageA * 100)}% of words inside shared passages`;
    document.getElementById("coverage-b").textContent =
      `${docB.name}: ${Math.round(matches.coverageB * 100)}% of words inside shared passages`;

    document.getElementById("pane-title-a").textContent = docA.name;
    document.getElementById("pane-title-b").textContent = docB.name;
    document.getElementById("pane-text-a").innerHTML =
      highlightedHtml(docA.raw, matches.spansA);
    document.getElementById("pane-text-b").innerHTML =
      highlightedHtml(docB.raw, matches.spansB);

    syncContainers("pane-text-a", "pane-text-b");

    compareResults.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- diff view (Phase 3) ----------

  function renderDiff(docA, docB) {
    const { ops, stats } = ScriptIQ.diff.diffTokens(
      docA.offsetTokens,
      docB.offsetTokens
    );

    document.getElementById("diff-summary").textContent =
      `${stats.equal.toLocaleString()} words unchanged · ` +
      `${stats.del.toLocaleString()} only in left · ` +
      `${stats.ins.toLocaleString()} only in right · ` +
      `${stats.modA.toLocaleString()} → ${stats.modB.toLocaleString()} words rewritten`;

    document.getElementById("diff-title-a").textContent = docA.name;
    document.getElementById("diff-title-b").textContent = docB.name;
    document.getElementById("diff-text-a").innerHTML =
      diffSideHtml(docA, ops, "a");
    document.getElementById("diff-text-b").innerHTML =
      diffSideHtml(docB, ops, "b");

    syncContainers("diff-text-a", "diff-text-b");
  }

  /**
   * Render one side of the diff. Each op's token range maps back to a
   * character range in that document's raw text; the text between ops
   * (whitespace/punctuation) is rendered unstyled.
   */
  function diffSideHtml(doc, ops, side) {
    const tokens = doc.offsetTokens;
    const raw = doc.raw;
    let html = "";
    let pos = 0;

    for (const op of ops) {
      const startIdx = side === "a" ? op.aStart : op.bStart;
      const endIdx = side === "a" ? op.aEnd : op.bEnd;
      if (endIdx <= startIdx) continue; // op has no text on this side

      let cls = null;
      if (op.type === "del") cls = "df-del";
      else if (op.type === "ins") cls = "df-ins";
      else if (op.type === "mod") cls = "df-mod";

      const from = tokens[startIdx].start;
      const to = tokens[endIdx - 1].end;
      html += escapeHtml(raw.slice(pos, from));
      const text = escapeHtml(raw.slice(from, to));
      html += cls ? `<mark class="${cls}">${text}</mark>` : text;
      pos = to;
    }
    html += escapeHtml(raw.slice(pos));
    return html;
  }

  /** Raw text → HTML with <mark> wrappers around matched character spans. */
  function highlightedHtml(raw, spans) {
    let html = "";
    let pos = 0;
    for (const span of spans) {
      html += escapeHtml(raw.slice(pos, span.start));
      html += `<mark class="hl-${span.strength}">` +
        escapeHtml(raw.slice(span.start, span.end)) + "</mark>";
      pos = span.end;
    }
    html += escapeHtml(raw.slice(pos));
    return html;
  }

  // ---------- rendering ----------

  function renderCard(id, name, sizeLabel) {
    const card = document.createElement("article");
    card.className = "doc-card";
    card.dataset.docId = id;
    card.innerHTML = `
      <header class="doc-card-header">
        <span class="doc-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        <span class="doc-size">${sizeLabel}</span>
      </header>
      <div class="doc-body">
        <p class="doc-status"><span class="spinner"></span> Extracting text…</p>
      </div>`;
    return card;
  }

  function renderCardResult(card, processed) {
    const { stats } = processed;
    const body = card.querySelector(".doc-body");
    // The text sits inside <details> so a fifty-file batch renders fifty
    // one-line summaries instead of fifty walls of text. Browsers don't
    // lay out collapsed <details> content, so this is a real saving, not
    // just visual. Small batches open by default (see applyDensity).
    body.innerHTML = `
      <ul class="doc-stats">
        <li><strong>${stats.words.toLocaleString()}</strong> words</li>
        <li><strong>${stats.meaningfulWords.toLocaleString()}</strong> after stopwords</li>
        <li><strong>${stats.uniqueWords.toLocaleString()}</strong> unique terms</li>
      </ul>
      <details class="doc-preview" open>
        <summary>Extracted text</summary>
        <div class="doc-tabs" role="tablist">
          <button class="tab active" data-view="raw" type="button">Extracted text</button>
          <button class="tab" data-view="processed" type="button">Processed tokens</button>
        </div>
        <pre class="doc-text" data-current="raw"></pre>
      </details>`;

    // Card previews are capped — a 200-page thesis shouldn't put megabytes
    // into the DOM. Comparison and diff views always use the full text.
    const PREVIEW_CHARS = 5000;
    const PREVIEW_TOKENS = 800;
    const rawPreview =
      processed.raw.length > PREVIEW_CHARS
        ? processed.raw.slice(0, PREVIEW_CHARS) +
          `\n\n… preview truncated (${(processed.raw.length - PREVIEW_CHARS).toLocaleString()} more characters; full text is used for scoring)`
        : processed.raw;
    const tokenPreview =
      processed.filteredTokens.length > PREVIEW_TOKENS
        ? processed.filteredTokens.slice(0, PREVIEW_TOKENS).join(" ") +
          ` … (${(processed.filteredTokens.length - PREVIEW_TOKENS).toLocaleString()} more tokens)`
        : processed.filteredTokens.join(" ");

    const pre = body.querySelector(".doc-text");
    pre.textContent = rawPreview;

    body.querySelector(".doc-tabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      body.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      pre.textContent = btn.dataset.view === "raw" ? rawPreview : tokenPreview;
    });
  }

  function renderCardError(card, message) {
    card.classList.add("doc-card-error");
    card.querySelector(".doc-body").innerHTML =
      `<p class="doc-error">⚠ ${escapeHtml(message)}</p>`;
  }

  // ---------- helpers ----------

  function setStatus(msg) {
    statusEl.textContent = msg;
    statusEl.classList.remove("status-error");
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Stable document id from name + content. SHA-256 via WebCrypto when
   * available; FNV-1a fallback for contexts without it (some file://
   * setups). Truncated — these are identifiers, not security.
   */
  async function contentHash(str) {
    if (window.crypto && crypto.subtle) {
      try {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(str)
        );
        return [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .slice(0, 24);
      } catch {
        // fall through to FNV
      }
    }
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return "fnv-" + h.toString(16) + "-" + str.length;
  }

  // ---------- global safety net ----------

  // A crash inside a render path would otherwise leave the UI frozen with a
  // spinner and no explanation. Surface it in the status line instead.
  window.addEventListener("error", (e) => {
    setStatus("Something went wrong: " + (e.message || "unknown error"));
    statusEl.classList.add("status-error");
  });
  window.addEventListener("unhandledrejection", (e) => {
    setStatus(
      "Something went wrong: " +
        ((e.reason && e.reason.message) || "unknown error")
    );
    statusEl.classList.add("status-error");
  });

  // ---------- startup: restore the previous session (Phase 5) ----------

  void (async function restoreSession() {
    let subs;
    try {
      subs = await ScriptIQ.storage.getAllSubmissions();
    } catch (err) {
      console.warn("ScriptIQ: persistence unavailable:", err);
      return;
    }

    if (subs.length > 0) {
      documentsPanel.hidden = false;
      standardsPanel.hidden = false;
      subs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
      for (const s of subs) {
        const card = renderCard(s.id, s.name, formatSize(s.size));
        documentList.appendChild(card);
        // Only raw text is persisted; tokens and vectors are recomputed.
        const processed = ScriptIQ.pipeline.process(s.raw);
        ScriptIQ.documents.set(s.id, {
          id: s.id,
          name: s.name,
          size: s.size,
          uploadedAt: new Date(s.uploadedAt),
          cardEl: card,
          ...processed,
        });
        card.dataset.docId = s.id;
        renderCardResult(card, processed);
      }
      docsVersion++;
      setStatus(
        `Restored ${subs.length} submission${subs.length === 1 ? "" : "s"} from your last session.`
      );
      applyDensity();
      refreshComparePanel();
      refreshGraph();
    }
    refreshHistory();
  })();
}
