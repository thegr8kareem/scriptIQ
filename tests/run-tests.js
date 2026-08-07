/**
 * ScriptIQ — algorithm test suite.
 *
 * Runs the core modules (pipeline, similarity, diff) under Node with a
 * fake `window`, covering the Phase 6 edge cases: identical documents,
 * empty files, non-English text, and large batches.
 *
 * Run with:  node tests/run-tests.js
 */
"use strict";

global.window = global;
// The application is an ES module package, while the small algorithm files
// are browser scripts that attach themselves to `window`. Dynamic imports
// let the test harness initialise that browser-like global before loading
// those scripts.
await import("../js/textPipeline.js");
await import("../js/similarity.js");
await import("../js/diff.js");

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = path.join(__dirname, "..", "samples");
const read = (name) => fs.readFileSync(path.join(SAMPLES, name), "utf8");

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`);
  }
}

function section(title) {
  console.log("\n" + title);
}

/** Score a pair of raw texts within a corpus of all supplied texts. */
function scorePair(texts, i, j) {
  const docs = texts.map((t) => ScriptIQ.pipeline.process(t));
  const vecs = ScriptIQ.similarity.buildVectors(docs.map((d) => d.filteredTokens));
  return ScriptIQ.similarity.cosine(vecs[i], vecs[j]);
}

// ---------------------------------------------------------------- pipeline

section("Text pipeline");
{
  const p = ScriptIQ.pipeline;

  check(
    "normalizes curly quotes, dashes, case and whitespace",
    p.normalize("  The  “Test”—Don’t  ") === 'the "test"-don\'t'
  );

  check("empty input yields no tokens", p.process("").tokens.length === 0);
  check(
    "whitespace-only input yields no tokens",
    p.process("   \n\t  ").tokens.length === 0
  );

  const accented = p.process("La détection du plagiat à l'université");
  check(
    "keeps accented (French) words intact",
    accented.tokens.includes("détection") && accented.tokens.includes("plagiat"),
    accented.tokens.join(",")
  );
  // Known behaviour: the apostrophe rule that keeps English contractions
  // whole ("don't") also keeps French elisions whole ("l'université").
  // Harmless for comparison — both documents tokenize the same way — but
  // it means "l'université" won't match a bare "université".
  check(
    "French elisions stay attached to their article",
    accented.tokens.includes("l'université"),
    accented.tokens.join(",")
  );

  const cyrillic = p.process("Обнаружение плагиата в университете");
  check("tokenizes Cyrillic script", cyrillic.tokens.length === 4, cyrillic.tokens.join(","));

  const chinese = p.process("这是一个测试");
  check(
    "does not crash on scripts without spaces",
    Array.isArray(chinese.tokens)
  );

  check(
    "strips stopwords but keeps content words",
    p.process("the cat sat on the mat").filteredTokens.join(" ") === "cat sat mat"
  );

  // Offset tokens must point at the exact characters in the RAW text.
  const raw = "The Quick brown FOX.";
  const offs = p.tokenizeWithOffsets(raw);
  check(
    "offset tokens slice back to the original text",
    offs.every((t) => raw.slice(t.start, t.end).toLowerCase().replace(/[‘’ʼ]/g, "'") === t.norm),
    JSON.stringify(offs)
  );
  check("offsets are strictly increasing", offs.every((t, k) => k === 0 || t.start >= offs[k - 1].end));
}

// -------------------------------------------------------------- similarity

section("TF-IDF + cosine similarity");
{
  const original = read("essay-original.txt");
  const paraphrase = read("essay-paraphrased.txt");
  const partial = read("essay-partial-copy.txt");
  const unrelated = read("essay-unrelated.txt");

  check(
    "identical documents score 1.0",
    Math.abs(scorePair([original, original], 0, 1) - 1) < 1e-9
  );

  const unrelatedScore = scorePair([original, unrelated], 0, 1);
  check(
    "unrelated documents score near 0",
    unrelatedScore < 0.1,
    unrelatedScore.toFixed(3)
  );

  const paraScore = scorePair([original, paraphrase], 0, 1);
  check(
    "paraphrase scores well above unrelated",
    paraScore > 0.5 && paraScore > unrelatedScore * 5,
    paraScore.toFixed(3)
  );

  const partialScore = scorePair([original, partial], 0, 1);
  check(
    "partial copy scores in the moderate-to-high band",
    partialScore > 0.4,
    partialScore.toFixed(3)
  );

  // Empty documents must not produce NaN — cosine guards zero vectors.
  const emptyScore = scorePair([original, ""], 0, 1);
  check("empty vs non-empty scores exactly 0", emptyScore === 0, String(emptyScore));
  check("empty vs empty scores exactly 0", scorePair(["", ""], 0, 1) === 0);

  // Scores are bounded and symmetric.
  const docs = [original, paraphrase, partial, unrelated].map((t) =>
    ScriptIQ.pipeline.process(t)
  );
  const vecs = ScriptIQ.similarity.buildVectors(docs.map((d) => d.filteredTokens));
  let bounded = true;
  let symmetric = true;
  for (let i = 0; i < vecs.length; i++) {
    for (let j = 0; j < vecs.length; j++) {
      const s = ScriptIQ.similarity.cosine(vecs[i], vecs[j]);
      if (!(s >= 0 && s <= 1 + 1e-9)) bounded = false;
      if (Math.abs(s - ScriptIQ.similarity.cosine(vecs[j], vecs[i])) > 1e-12) {
        symmetric = false;
      }
    }
  }
  check("all scores fall within [0, 1]", bounded);
  check("cosine is symmetric", symmetric);

  // Non-English documents still compare sensibly.
  const fr1 = "Le plagiat universitaire est un problème sérieux au Ghana aujourd'hui.";
  const fr2 = "Le plagiat universitaire est un problème sérieux au Ghana aujourd'hui.";
  const fr3 = "Les récoltes de cacao dépendent fortement des précipitations saisonnières.";
  check(
    "identical French documents score 1.0",
    Math.abs(scorePair([fr1, fr2, fr3], 0, 1) - 1) < 1e-9
  );
  check(
    "different French documents score low",
    scorePair([fr1, fr2, fr3], 0, 2) < 0.2
  );
}

// ------------------------------------------------------------ n-gram match

section("Shared-passage matching");
{
  const tok = ScriptIQ.pipeline.tokenizeWithOffsets;
  const original = read("essay-original.txt");
  const partial = read("essay-partial-copy.txt");

  const self = ScriptIQ.similarity.findMatches(tok(original), tok(original));
  check(
    "a document matched against itself has ~full coverage",
    self.coverageA > 0.95,
    self.coverageA.toFixed(3)
  );

  const m = ScriptIQ.similarity.findMatches(tok(original), tok(partial));
  check("partial copy produces matches", m.spansA.length > 0);
  check(
    "coverage is a fraction between 0 and 1",
    m.coverageA >= 0 && m.coverageA <= 1 && m.coverageB >= 0 && m.coverageB <= 1
  );

  const inBounds = m.spansA.every(
    (s) => s.start >= 0 && s.end <= original.length && s.end > s.start
  );
  check("spans stay inside the raw text", inBounds);

  let disjoint = true;
  for (let k = 1; k < m.spansA.length; k++) {
    if (m.spansA[k].start < m.spansA[k - 1].end) disjoint = false;
  }
  check("merged spans are sorted and non-overlapping", disjoint);

  const none = ScriptIQ.similarity.findMatches(tok(original), tok(read("essay-unrelated.txt")));
  check(
    "unrelated documents produce little or no match coverage",
    none.coverageA < 0.1,
    none.coverageA.toFixed(3)
  );

  check("empty input yields no spans", ScriptIQ.similarity.findMatches([], tok(original)).spansA.length === 0);

  // Stopword-only runs must be discarded as coincidence.
  const stopOnly = ScriptIQ.similarity.findMatches(
    tok("and so on the way"),
    tok("and so on the road")
  );
  check("stopword-only runs are not reported", stopOnly.spansA.length === 0);
}

// --------------------------------------------------------------- LCS diff

section("LCS diff");
{
  const tok = ScriptIQ.pipeline.tokenizeWithOffsets;

  /** Ops must tile both token lists exactly, in order, with no gaps. */
  function tiles(A, B) {
    const { ops } = ScriptIQ.diff.diffTokens(A, B);
    let ai = 0;
    let bi = 0;
    for (const op of ops) {
      if (op.aStart !== ai || op.bStart !== bi) return false;
      if (op.aEnd < op.aStart || op.bEnd < op.bStart) return false;
      ai = op.aEnd;
      bi = op.bEnd;
    }
    return ai === A.length && bi === B.length;
  }

  const original = tok(read("essay-original.txt"));
  const paraphrase = tok(read("essay-paraphrased.txt"));

  check("diff tiles both documents (essay pair)", tiles(original, paraphrase));
  check("diff tiles both documents (identical)", tiles(original, original));
  check("diff tiles both documents (empty vs full)", tiles([], original));
  check("diff tiles both documents (both empty)", tiles([], []));

  const same = ScriptIQ.diff.diffTokens(original, original);
  check(
    "identical documents collapse to one equal op",
    same.ops.length === 1 && same.ops[0].type === "equal"
  );
  check("identical documents report zero changes", same.stats.del === 0 && same.stats.ins === 0);

  const empty = ScriptIQ.diff.diffTokens([], []);
  check("empty vs empty yields no ops", empty.ops.length === 0);

  const insOnly = ScriptIQ.diff.diffTokens([], original);
  check(
    "empty vs full is a single insertion",
    insOnly.ops.length === 1 && insOnly.ops[0].type === "ins"
  );

  const mod = ScriptIQ.diff.diffTokens(
    tok("the quick brown fox jumps"),
    tok("the quick red fox leaps high")
  );
  check(
    "in-place rewrites are reported as modifications",
    mod.ops.some((o) => o.type === "mod")
  );

  const cased = ScriptIQ.diff.diffTokens(tok("The Cat"), tok("the cat"));
  check(
    "case differences are not reported as changes",
    cased.ops.length === 1 && cased.ops[0].type === "equal"
  );

  // Non-English diff.
  check(
    "diff tiles non-English documents",
    tiles(tok("le plagiat est un problème"), tok("le plagiat est un défi majeur"))
  );
}

// ------------------------------------------------------------ large batch

section("Large batch");
{
  // 60 synthetic submissions, two of which are near-duplicates.
  const base =
    "mobile money financial inclusion ghana rural banking transactions " +
    "electronic levy digital literacy fraud consumer protection policy";
  // Each submission gets a distinctive term so that no two are accidentally
  // identical — single characters are dropped by the stopword filter, so a
  // bare index number would not distinguish them.
  const texts = [];
  for (let i = 0; i < 60; i++) {
    texts.push(
      base.split(" ").slice(i % 6, (i % 6) + 8).join(" ") + " submission topic subject" + i
    );
  }
  texts[7] = texts[3]; // planted duplicate pair

  const t0 = Date.now();
  const docs = texts.map((t) => ScriptIQ.pipeline.process(t));
  const vecs = ScriptIQ.similarity.buildVectors(docs.map((d) => d.filteredTokens));

  let best = { score: -1, i: -1, j: -1 };
  let allFinite = true;
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      const s = ScriptIQ.similarity.cosine(vecs[i], vecs[j]);
      if (!Number.isFinite(s)) allFinite = false;
      if (s > best.score) best = { score: s, i, j };
    }
  }
  const elapsed = Date.now() - t0;

  check("60-document batch produces finite scores for all 1,770 pairs", allFinite);
  check(
    "the planted duplicate pair ranks highest",
    (best.i === 3 && best.j === 7) || (best.i === 7 && best.j === 3),
    `top pair was ${best.i}/${best.j} @ ${best.score.toFixed(3)}`
  );
  check(`60-document batch scores in under 2s (took ${elapsed}ms)`, elapsed < 2000);
}

// -------------------------------------------------------- AI service & dataset
section("AI Service & Screenplay Analysis");
{
  const { analyzeScreenplay, calculateKeywordSimilarity } = await import("../backend/services/aiService.js");

  const sampleScriptA = `
  INT. BANK VAULT - NIGHT
  KOBINA picks the electronic lock. Sweat drips onto his screen.
  KOBINA
  Three seconds. If the security grid cycles, we're trapped.
  `;

  const sampleScriptB = `
  INT. BANK VAULT - NIGHT
  KOBINA picks the electronic lock. Sweat drips onto his screen.
  KOBINA
  Three seconds. If the security grid cycles, we're trapped.
  `;

  const analysis = analyzeScreenplay(sampleScriptA, "Test Script");
  check("analyzes screenplay scenes and word count", analysis.wordCount > 10 && analysis.sceneCount >= 1);
  check("generates insights array", Array.isArray(analysis.insights) && analysis.insights.length > 0);

  const sim = calculateKeywordSimilarity(sampleScriptA, sampleScriptB);
  check("identical scripts score keyword similarity 1.0", sim.cosineScore === 1.0);
}

// ------------------------------------------------------------------ report

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
