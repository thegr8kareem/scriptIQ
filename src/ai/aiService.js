/**
 * Frontend AI Integration Manager for ScriptIQ.
 *
 * Combines client-side transformers.js sentence embeddings (zero-latency,
 * private local analysis) with backend Express AI analysis endpoints
 * (screenplay feedback, structural breakdown, paraphrase risk scoring).
 */

import { getSession } from "../auth/authService.js";

/** Base URL for backend API requests. */
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:3001";

/**
 * Call protected backend AI API.
 * @param {string} endpoint - e.g. "/api/ai/analyze-script"
 * @param {object} body
 * @returns {Promise<object>}
 */
async function callBackendAI(endpoint, body) {
  const session = await getSession();
  const token = session?.token;

  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `AI analysis request failed (${response.status})`);
  }
  return data;
}

/* ── Public AI API ────────────────────────────────────────────────────── */

/**
 * Initialize client-side MiniLM sentence transformer model.
 * @param {Function} [onProgress]
 * @returns {Promise<void>}
 */
export async function enableLocalAI(onProgress) {
  if (window.ScriptIQ?.semantic) {
    return window.ScriptIQ.semantic.enable(onProgress);
  }
  throw new Error("Local semantic AI module not loaded.");
}

/**
 * Get status of local AI model ("idle" | "loading" | "ready" | "error").
 * @returns {string}
 */
export function getLocalAIStatus() {
  return window.ScriptIQ?.semantic ? window.ScriptIQ.semantic.getStatus() : "idle";
}

/**
 * Compute semantic similarity using local in-browser model.
 * @param {string} docAId
 * @param {string} rawTextA
 * @param {string} docBId
 * @param {string} rawTextB
 * @returns {Promise<number>} Cosine similarity 0.0 - 1.0
 */
export async function computeLocalSemanticScore(docAId, rawTextA, docBId, rawTextB) {
  if (!window.ScriptIQ?.semantic) {
    throw new Error("Semantic AI module is unavailable.");
  }
  const vecA = await window.ScriptIQ.semantic.embedDocument(docAId, rawTextA);
  const vecB = await window.ScriptIQ.semantic.embedDocument(docBId, rawTextB);
  return window.ScriptIQ.semantic.cosine(vecA, vecB);
}

/**
 * Send script text to backend AI for structural analysis and feedback generation.
 * @param {string} scriptText
 * @param {string} [title]
 * @returns {Promise<object>} Analysis summary and insights array
 */
export async function fetchScriptAnalysis(scriptText, title) {
  try {
    const data = await callBackendAI("/api/ai/analyze-script", { scriptText, title });
    return data.analysis;
  } catch (err) {
    console.warn("[ScriptIQ AI] Backend analysis unavailable, returning fallback analysis:", err.message);
    // Fallback client-side basic estimation if offline / local-only
    const lines = (scriptText || "").split("\n");
    const words = (scriptText || "").trim().split(/\s+/).filter(Boolean).length;
    return {
      title: title || "Untitled Script",
      wordCount: words,
      sceneCount: lines.filter((l) => /^\s*(INT\.|EXT\.)/i.test(l)).length || 1,
      dialogueRatio: 30,
      insights: ["Client fallback: Uploaded script ready for similarity scoring."],
      structuralBreakdown: { act1Length: Math.floor(lines.length / 3), act2Length: Math.floor(lines.length / 3), act3Length: Math.floor(lines.length / 3) },
    };
  }
}
