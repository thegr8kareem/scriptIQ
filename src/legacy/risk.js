window.ScriptIQ = window.ScriptIQ || {};

ScriptIQ.risk = (function () {
  "use strict";

  const HIGH = 0.6;
  const MODERATE = 0.3;

  function levelOf(score) {
    if (score >= HIGH) return "high";
    if (score >= MODERATE) return "moderate";
    return "low";
  }

  function rankDocuments(docs, pairScore) {
    const result = new Map();
    for (const doc of docs) {
      const scores = [];
      for (const other of docs) {
        if (other.id === doc.id) continue;
        const s = pairScore(doc.id, other.id);
        if (s == null || Number.isNaN(s)) continue;
        scores.push({ id: other.id, name: other.name, score: s });
      }
      scores.sort((a, b) => b.score - a.score);

      const topScore = scores.length ? scores[0].score : 0;
      const strongPairs = scores.filter((s) => s.score >= HIGH).length;
      const moderatePairs = scores.filter(
        (s) => s.score >= MODERATE && s.score < HIGH
      ).length;

      let level = "low";
      if (topScore >= HIGH || strongPairs >= 2 || (strongPairs >= 1 && moderatePairs >= 2)) {
        level = "high";
      } else if (topScore >= MODERATE || moderatePairs >= 3) {
        level = "moderate";
      }

      result.set(doc.id, {
        level,
        topScore,
        strongPairs,
        moderatePairs,
        closest: scores.slice(0, 3),
      });
    }
    return result;
  }

  return { rankDocuments, levelOf, HIGH, MODERATE };
})();
