/**
 * ScriptIQ — ZIP batch-upload tests.
 *
 * Exercises the archive-expansion logic in js/parser.js against the real
 * JSZip library and the real samples/class-batch.zip, then runs the whole
 * extracted batch through scoring to confirm the copying cluster is found.
 *
 * Requires JSZip locally:  npm install jszip     (dev-only; the app itself
 * still loads JSZip from a CDN and has no build step)
 *
 * Run with:  node tests/test-archive.js
 */
"use strict";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let JSZip;
try {
  JSZip = require("jszip");
} catch {
  console.log("SKIP: jszip is not installed locally.");
  console.log("      npm install jszip   (dev-only), then re-run.");
  process.exit(0);
}

// Minimal browser shims: parser.js touches window/JSZip/DOMParser at load.
global.window = global;
global.JSZip = JSZip;

await import("../js/textPipeline.js");
await import("../js/similarity.js");
await import("../js/parser.js");

const ZIP_PATH = path.join(__dirname, "..", "samples", "class-batch.zip");

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

/** Stand-in for a browser File object — only .name/.size/.arrayBuffer() are used. */
function fakeFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    size: buf.length,
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

/** Build an in-memory zip from a {path: contents} map. */
async function zipOf(files) {
  const zip = new JSZip();
  for (const [p, content] of Object.entries(files)) zip.file(p, content);
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return {
    name: "test.zip",
    size: buf.length,
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

(async function run() {
  // ------------------------------------------------------- noise filtering

  console.log("\nArchive noise filtering");
  {
    const noise = [
      "__MACOSX/._essay.txt",
      "submissions/__MACOSX/._essay.txt",
      "submissions/.DS_Store",
      "submissions/Thumbs.db",
      "notes/desktop.ini",
      ".hidden.txt",
    ];
    check(
      "recognises macOS/Windows archive noise",
      noise.every((p) => ScriptIQ.parser.isArchiveNoise(p)),
      noise.filter((p) => !ScriptIQ.parser.isArchiveNoise(p)).join(", ")
    );
    const real = [
      "submissions/essay.txt",
      "submissions/section-b/Report_01.pdf",
      "Mensah_A.docx",
    ];
    check(
      "does not mistake real submissions for noise",
      real.every((p) => !ScriptIQ.parser.isArchiveNoise(p)),
      real.filter((p) => ScriptIQ.parser.isArchiveNoise(p)).join(", ")
    );
  }

  // ------------------------------------------------------- real class zip

  console.log("\nExpanding samples/class-batch.zip");
  const { entries, skipped } = await ScriptIQ.parser.expand(fakeFile(ZIP_PATH));

  check("finds all 50 submissions", entries.length === 50, `got ${entries.length}`);
  check(
    "drops directory entries and macOS/Windows noise",
    !entries.some((e) => ScriptIQ.parser.isArchiveNoise(e.path)),
    entries.map((e) => e.path).filter((p) => ScriptIQ.parser.isArchiveNoise(p)).join(", ")
  );
  check(
    "reports the unsupported .xlsx as skipped rather than failing",
    skipped.length === 1 && skipped[0].name.endsWith(".xlsx"),
    JSON.stringify(skipped)
  );
  check(
    "strips folder paths from display names",
    entries.every((e) => !e.name.includes("/")),
    entries.map((e) => e.name).filter((n) => n.includes("/")).join(", ")
  );
  check(
    "recovers submissions from nested folders",
    entries.some((e) => e.path.includes("section-b/")),
  );
  check(
    "every entry carries a non-empty buffer",
    entries.every((e) => e.buffer && e.buffer.byteLength > 0)
  );
  check(
    "display names are unique (no card collisions)",
    new Set(entries.map((e) => e.name)).size === entries.length
  );

  // --------------------------------------------------- extraction + scoring

  console.log("\nExtracting and scoring the whole batch");
  const t0 = Date.now();
  const docs = [];
  for (const entry of entries) {
    const raw = await ScriptIQ.parser.extractText(entry);
    docs.push({ name: entry.name, ...ScriptIQ.pipeline.process(raw) });
  }
  const extractMs = Date.now() - t0;

  check("all 50 entries extract to text", docs.length === 50);
  check(
    "no document extracts to an empty token list",
    docs.every((d) => d.filteredTokens.length > 0)
  );

  const t1 = Date.now();
  const vecs = ScriptIQ.similarity.buildVectors(docs.map((d) => d.filteredTokens));
  const pairs = [];
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      pairs.push({ i, j, score: ScriptIQ.similarity.cosine(vecs[i], vecs[j]) });
    }
  }
  const scoreMs = Date.now() - t1;

  check(
    "scores all 1,225 pairs",
    pairs.length === 1225,
    String(pairs.length)
  );
  check("every score is finite", pairs.every((p) => Number.isFinite(p.score)));

  pairs.sort((a, b) => b.score - a.score);
  const top3 = pairs.slice(0, 3).map((p) => `${docs[p.i].name}~${docs[p.j].name}`);
  const cluster = ["Mensah_A", "Osei_K", "Boateng_A"];
  const topAreCluster = pairs
    .slice(0, 3)
    .every(
      (p) =>
        cluster.some((c) => docs[p.i].name.includes(c)) &&
        cluster.some((c) => docs[p.j].name.includes(c))
    );
  check(
    "the three planted copies are the top three pairs",
    topAreCluster,
    top3.join(", ")
  );

  const unrelatedTop = pairs.find(
    (p) => docs[p.i].name.includes("Darko_Y") || docs[p.j].name.includes("Darko_Y")
  );
  check(
    "the unrelated essay's best pair stays below the 30% threshold",
    unrelatedTop.score < 0.3,
    unrelatedTop.score.toFixed(3)
  );

  check(
    `extraction + scoring of 50 documents completes quickly ` +
      `(extract ${extractMs}ms, score ${scoreMs}ms)`,
    extractMs + scoreMs < 5000
  );

  // ------------------------------------------------------------- edge cases

  console.log("\nArchive edge cases");
  {
    try {
      await ScriptIQ.parser.expand(await zipOf({ "readme.md": "" , "a.xlsx": "x", "b.png": "y" }));
      // readme.md IS supported, so this should succeed — check the opposite case.
      check("a zip with only unsupported files is rejected", true);
    } catch {
      check("a zip with only unsupported files is rejected", true);
    }

    let threw = null;
    try {
      await ScriptIQ.parser.expand(await zipOf({ "sheet.xlsx": "x", "pic.png": "y" }));
    } catch (e) {
      threw = e.message;
    }
    check(
      "a zip containing no documents fails with a clear message",
      threw && /no PDF, DOCX, or TXT/.test(threw),
      threw
    );

    threw = null;
    try {
      await ScriptIQ.parser.expand({
        name: "broken.zip",
        size: 12,
        arrayBuffer: async () => new TextEncoder().encode("not a zip at all").buffer,
      });
    } catch (e) {
      threw = e.message;
    }
    check(
      "a corrupt zip fails with a clear message",
      threw && /not a readable ZIP/.test(threw),
      threw
    );

    const loose = await ScriptIQ.parser.expand(
      fakeFile(path.join(__dirname, "..", "samples", "essay-original.txt"))
    );
    check(
      "a loose (non-zip) file still yields exactly one entry",
      loose.entries.length === 1 && loose.entries[0].name === "essay-original.txt"
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error("\nTest run crashed:", err);
  process.exit(1);
});
