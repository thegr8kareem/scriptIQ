/**
 * ScriptIQ — AI semantic similarity layer (Phase 5).
 *
 * Fully client-side sentence embeddings via transformers.js — no API key,
 * no backend, nothing leaves the browser. The MiniLM model (~25 MB) is
 * fetched from a CDN the first time the lecturer enables the feature and
 * is cached by the browser after that.
 *
 * Why this catches what TF-IDF misses: TF-IDF only sees which words are
 * used. An embedding model maps *meaning* to a vector, so "the study was
 * conducted in Kumasi" and "the research took place in the Ashanti
 * capital" land close together despite sharing almost no words.
 *
 * Everything is optional: if the model can't load (offline, old browser),
 * status becomes "error" and the app keeps working TF-IDF-only.
 *
 * Public API:
 *   ScriptIQ.semantic.enable(onProgress) → Promise (loads the model once)
 *   ScriptIQ.semantic.getStatus()        → "idle"|"loading"|"ready"|"error"
 *   ScriptIQ.semantic.embedDocument(id, rawText) → Promise<Float32Array>
 *   ScriptIQ.semantic.cosine(a, b)       → 0..1
 *   ScriptIQ.semantic.chunkText(raw)     → string[] (exposed for testing)
 */
window.ScriptIQ = window.ScriptIQ || {};

ScriptIQ.semantic = (function () {
  "use strict";

  const CDN_URL = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
  const MODEL = "Xenova/all-MiniLM-L6-v2";

  /** MiniLM truncates input at 256 model tokens, so long essays must be
   *  embedded in chunks. ~170 words keeps each chunk under that limit. */
  const CHUNK_WORDS = 170;

  let status = "idle"; // idle → loading → ready | error
  let extractor = null;
  let loadPromise = null;
  const cache = new Map(); // doc id (content hash) → Float32Array embedding

  /**
   * Download and initialize the model. Idempotent — concurrent callers
   * share one load. `onProgress` receives transformers.js progress events
   * ({ status, progress, file, ... }) for the UI.
   */
  function enable(onProgress) {
    if (loadPromise) return loadPromise;
    status = "loading";
    loadPromise = (async () => {
      // Dynamic import so the 1 MB library itself is only fetched when
      // the lecturer opts in.
      const { pipeline, env } = await import(CDN_URL);
      env.allowLocalModels = false;
      extractor = await pipeline("feature-extraction", MODEL, {
        progress_callback: onProgress,
      });
      status = "ready";
    })().catch((err) => {
      status = "error";
      loadPromise = null; // allow a retry
      throw err;
    });
    return loadPromise;
  }

  function getStatus() {
    return status;
  }

  /** Split raw text into ~CHUNK_WORDS-word chunks on whitespace. */
  function chunkText(rawText) {
    const words = (rawText || "").trim().split(/\s+/).filter(Boolean);
    const chunks = [];
    for (let i = 0; i < words.length; i += CHUNK_WORDS) {
      chunks.push(words.slice(i, i + CHUNK_WORDS).join(" "));
    }
    return chunks;
  }

  /**
   * Embed a whole document: embed each chunk (mean-pooled, normalized by
   * the model), average the chunk vectors, then re-normalize to unit
   * length. Cached by document id — ids are content hashes, so the cache
   * can never go stale.
   */
  async function embedDocument(docId, rawText) {
    if (status !== "ready") {
      throw new Error("Semantic model is not loaded.");
    }
    if (cache.has(docId)) return cache.get(docId);

    const chunks = chunkText(rawText);
    if (chunks.length === 0) {
      throw new Error("Document has no text to embed.");
    }

    let acc = null;
    for (const chunk of chunks) {
      const out = await extractor(chunk, { pooling: "mean", normalize: true });
      const vec = out.data;
      if (!acc) acc = new Float64Array(vec.length);
      for (let i = 0; i < vec.length; i++) acc[i] += vec[i];
    }

    // Average and re-normalize to unit length so cosine is a plain dot.
    let norm = 0;
    for (let i = 0; i < acc.length; i++) {
      acc[i] /= chunks.length;
      norm += acc[i] * acc[i];
    }
    norm = Math.sqrt(norm) || 1;
    const embedding = new Float32Array(acc.length);
    for (let i = 0; i < acc.length; i++) embedding[i] = acc[i] / norm;

    cache.set(docId, embedding);
    return embedding;
  }

  /** Cosine of two unit vectors = dot product, clamped to [0, 1]. */
  function cosine(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return Math.max(0, Math.min(1, dot));
  }

  return { enable, getStatus, embedDocument, cosine, chunkText };
})();
