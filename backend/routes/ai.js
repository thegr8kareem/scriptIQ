/**
 * ScriptIQ Express Backend — Protected AI Routes
 *
 * Provides endpoints for backend script analysis, paraphrase risk evaluation,
 * and semantic comparison. Protected with `requireAuth` middleware.
 *
 * Endpoints:
 *   POST /api/ai/analyze-script        — analyze single script layout & insights
 *   POST /api/ai/semantic-similarity   — compare pair of scripts backend-side
 */

import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { analyzeScreenplay, calculateKeywordSimilarity } from "../services/aiService.js";

const router = Router();

// Protect all AI endpoints
router.use(requireAuth);

/**
 * POST /api/ai/analyze-script
 * Body: { scriptText: string, title?: string }
 */
router.post("/analyze-script", (req, res) => {
  try {
    const { scriptText, title } = req.body || {};

    if (!scriptText || typeof scriptText !== "string") {
      return res.status(422).json({ error: "scriptText string is required for analysis." });
    }

    const result = analyzeScreenplay(scriptText, title);
    res.json({
      success: true,
      analysis: result,
      analyzedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to analyze script." });
  }
});

/**
 * POST /api/ai/semantic-similarity
 * Body: { scriptA: string, scriptB: string }
 */
router.post("/semantic-similarity", (req, res) => {
  try {
    const { scriptA, scriptB } = req.body || {};

    if (!scriptA || !scriptB) {
      return res.status(422).json({ error: "Both scriptA and scriptB text are required." });
    }

    const similarity = calculateKeywordSimilarity(scriptA, scriptB);

    res.json({
      success: true,
      similarity,
      evaluatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to evaluate semantic similarity." });
  }
});

export default router;
