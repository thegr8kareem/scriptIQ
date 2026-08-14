window.ScriptIQ = window.ScriptIQ || {};

ScriptIQ.aidetect = (function () {
  "use strict";

  const HEDGE_WORDS = [
    "additionally", "moreover", "furthermore", "however", "therefore",
    "nevertheless", "nonetheless", "consequently", "subsequently", "ultimately",
    "overall", "increasingly", "particularly", "significantly", "importantly",
    "notably", "crucially", "essentially", "fundamentally", "conversely",
    "similarly", "likewise", "delve", "tapestry", "landscape", "foster",
    "underscore", "highlight", "pivotal", "paramount", "myriad", "utilize",
    "leverage", "facilitate", "robust", "seamless", "comprehensive", "intricate",
    "multifaceted", "nuanced", "holistic", "lastly", "firstly", "secondly",
    "thirdly",
  ];
  const HEDGE_PHRASES = [
    "in conclusion", "it is important to note", "it is worth noting",
    "plays a crucial role", "plays a vital role", "in today's world",
    "in today’s world", "in the modern era", "as previously mentioned",
    "in essence",
  ];

  const hedgeWordRe = new RegExp("\\b(" + HEDGE_WORDS.join("|") + ")\\b", "gi");

  function mean(a) {
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  }

  function sd(a) {
    const m = mean(a);
    if (a.length < 2) return 0;
    return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1));
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function splitSentences(text) {
    const matches = text.match(/[^.!?…]+[.!?…]+["')\]]*|\S+[.!?…]+$/g) || [];
    return matches.map((s) => s.trim()).filter(Boolean);
  }

  function tokens(text) {
    return text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) || [];
  }

  function countOccurrences(text, phrase) {
    let count = 0;
    let at = 0;
    const lower = text.toLowerCase();
    while ((at = lower.indexOf(phrase, at)) !== -1) {
      count++;
      at += phrase.length;
    }
    return count;
  }

  function repeatedPhraseRatio(text) {
    const toks = tokens(text);
    if (toks.length < 12) return 0;
    const STOP = ScriptIQ.pipeline.STOPWORDS;
    const N = 6;
    const seen = new Map();
    for (let i = 0; i + N <= toks.length; i++) {
      let key = toks[i];
      for (let k = 1; k < N; k++) key += "\u0000" + toks[i + k];
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    let flaggedWords = 0;
    for (const [key, count] of seen) {
      if (count < 2) continue;
      const words = key.split("\u0000");
      if (!words.some((w) => !STOP.has(w))) continue;
      flaggedWords += words.length * count;
    }
    return toks.length ? Math.min(1, flaggedWords / toks.length) : 0;
  }

  function hedgeDensity(text) {
    const toks = tokens(text);
    if (!toks.length) return 0;
    const single = (text.match(hedgeWordRe) || []).length;
    const multi = HEDGE_PHRASES.reduce(
      (sum, p) => sum + countOccurrences(text, p),
      0
    );
    return (single + multi) / (toks.length / 1000);
  }

  function paragraphSignals(text) {
    const paras = text
      .split(/\n{1,}/)
      .map((p) => p.trim())
      .filter((p) => p.split(/\s+/).length >= 30);
    const flags = [];
    for (const p of paras) {
      const pSents = splitSentences(p);
      const pLens = pSents.map((s) => s.split(/\s+/).length).filter((n) => n > 0);
      const pCv = pLens.length > 2 ? sd(pLens) / (mean(pLens) || 1) : 1;
      const pPhrase = repeatedPhraseRatio(p);
      const reasons = [];
      if (pLens.length >= 4 && pCv < 0.4) {
        reasons.push("very uniform sentence lengths");
      }
      if (pPhrase > 0.25) reasons.push("repeated stock phrasing");
      if (reasons.length) flags.push({ excerpt: p.slice(0, 160), reasons });
    }
    return flags.slice(0, 5);
  }

  function analyze(rawText) {
    const text = (rawText || "").replace(/\s+/g, " ").trim();
    if (!text) return { score: 0, level: "low", signals: {}, flags: [] };

    const sents = splitSentences(text);
    const lengths = sents.map((s) => s.split(/\s+/).length).filter((n) => n > 0);
    const sentenceCv = lengths.length > 3 ? sd(lengths) / (mean(lengths) || 1) : 1;

    const toks = tokens(text);
    const ttr = toks.length ? new Set(toks).size / toks.length : 1;
    const phraseDensity = repeatedPhraseRatio(text);
    const hedgeCount = hedgeDensity(text);

    const signals = {
      sentenceUniformity: +clamp((0.7 - sentenceCv) / 0.4, 0, 1).toFixed(2),
      vocabularyDiversity: +clamp((0.6 - ttr) / 0.25, 0, 1).toFixed(2),
      repeatedPhrases: +clamp(phraseDensity / 0.3, 0, 1).toFixed(2),
      hedges: +clamp(hedgeCount / 12, 0, 1).toFixed(2),
    };

    const weights = {
      sentenceUniformity: 0.35,
      vocabularyDiversity: 0.2,
      repeatedPhrases: 0.3,
      hedges: 0.15,
    };
    let score = 0;
    for (const key in weights) score += signals[key] * weights[key];
    score = Math.round(score * 100);

    const level = score >= 70 ? "high" : score >= 45 ? "moderate" : "low";

    return {
      score,
      level,
      signals,
      flags: paragraphSignals(text),
    };
  }

  return { analyze, splitSentences, tokens };
})();
