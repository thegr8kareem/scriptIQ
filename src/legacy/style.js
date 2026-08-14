window.ScriptIQ = window.ScriptIQ || {};

ScriptIQ.style = (function () {
  "use strict";

  function mean(a) {
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  }

  function sd(a) {
    const m = mean(a);
    if (a.length < 2) return 0;
    return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1));
  }

  function splitSentences(text) {
    const matches = text.match(/[^.!?…]+[.!?…]+["')\]]*|\S+[.!?…]+$/g) || [];
    return matches.map((s) => s.trim()).filter(Boolean);
  }

  function profile(rawText) {
    const text = (rawText || "").replace(/\s+/g, " ").trim();
    const toks = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) || [];
    const sents = splitSentences(text);
    const lengths = sents.map((s) => s.split(/\s+/).length).filter((n) => n > 0);
    const wordLens = toks.map((t) => t.length);
    const paras = text
      .split(/\n{1,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const paraWords = paras.map((p) => p.split(/\s+/).length).filter((n) => n > 0);

    const avgSentenceWords = mean(lengths);
    const sdSentenceWords = sd(lengths);

    return {
      sentenceCount: sents.length,
      avgSentenceWords: +avgSentenceWords.toFixed(1),
      sdSentenceWords: +sdSentenceWords.toFixed(1),
      cvSentenceWords:
        lengths.length > 2 && avgSentenceWords > 0
          ? +(sdSentenceWords / avgSentenceWords).toFixed(2)
          : 0,
      avgWordLength: +mean(wordLens).toFixed(2),
      vocabRatio: toks.length ? +(new Set(toks).size / toks.length).toFixed(2) : 1,
      avgParagraphWords: paraWords.length ? +mean(paraWords).toFixed(1) : 0,
      commas: (text.match(/,/g) || []).length,
      semicolons: (text.match(/;/g) || []).length,
      quotes: (text.match(/["“”]/g) || []).length,
      exclamations: (text.match(/!/g) || []).length,
      questions: (text.match(/\?/g) || []).length,
    };
  }

  function sectionDeviation(rawText) {
    const text = (rawText || "").replace(/\s+/g, " ").trim();
    const baseline = profile(text);
    const wordCount = text.split(/\s+/).length;
    if (!text || wordCount < 80) return { flags: [], baseline };

    const paras = text
      .split(/\n{1,}/)
      .map((p) => p.trim())
      .filter((p) => p.split(/\s+/).length >= 30);
    const flags = [];

    for (let i = 0; i < paras.length; i++) {
      const p = paras[i];
      const pProfile = profile(p);
      const reasons = [];
      const zCv =
        baseline.cvSentenceWords > 0.2
          ? (pProfile.cvSentenceWords - baseline.cvSentenceWords) /
            (baseline.cvSentenceWords || 1)
          : 0;
      if (Math.abs(zCv) > 1.5) {
        reasons.push(
          zCv > 0
            ? "sentence rhythm unusually varied"
            : "sentence rhythm unusually uniform"
        );
      }
      const zWords =
        (pProfile.avgSentenceWords - baseline.avgSentenceWords) /
        (baseline.sdSentenceWords || 1);
      if (Math.abs(zWords) > 1.8) {
        reasons.push(
          zWords > 0 ? "unusually long sentences" : "unusually short sentences"
        );
      }
      const vocabDelta = pProfile.vocabRatio - baseline.vocabRatio;
      if (Math.abs(vocabDelta) > 0.12) {
        reasons.push(
          vocabDelta > 0
            ? "much richer vocabulary than elsewhere"
            : "much simpler vocabulary than elsewhere"
        );
      }
      if (reasons.length) {
        flags.push({ index: i, excerpt: p.slice(0, 160), reasons });
      }
    }
    return { flags: flags.slice(0, 6), baseline };
  }

  function similarity(profileA, profileB) {
    const keys = [
      "cvSentenceWords",
      "avgWordLength",
      "vocabRatio",
      "avgParagraphWords",
      "commas",
      "semicolons",
      "quotes",
    ];
    const ranges = {
      cvSentenceWords: 1,
      avgWordLength: 4,
      vocabRatio: 0.6,
      avgParagraphWords: 120,
      commas: 80,
      semicolons: 20,
      quotes: 60,
    };
    let sum = 0;
    for (const key of keys) {
      const range = ranges[key] || 1;
      sum += ((profileA[key] - profileB[key]) / range) ** 2;
    }
    const dist = Math.sqrt(sum / keys.length);
    return Math.max(0, Math.min(1, 1 - dist));
  }

  return { profile, sectionDeviation, similarity };
})();
