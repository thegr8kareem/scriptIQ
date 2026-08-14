import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JSZip = require("jszip");
global.window = global;
global.JSZip = JSZip;

const ZIP_A = path.join(__dirname, "..", "samples", "group_a.zip");
const ZIP_B = path.join(__dirname, "..", "samples", "group_b.zip");

function fakeFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    size: buf.length,
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

(async function run() {
  // Dynamically import to ensure window and JSZip global shims are set first
  await import("../src/legacy/textPipeline.js");
  await import("../src/legacy/similarity.js");
  await import("../src/legacy/parser.js");

  console.log("Expanding Group A...");
  const resA = await ScriptIQ.parser.expand(fakeFile(ZIP_A));
  console.log(`Group A expanded: ${resA.entries.length} entries`);

  console.log("Expanding Group B...");
  const resB = await ScriptIQ.parser.expand(fakeFile(ZIP_B));
  console.log(`Group B expanded: ${resB.entries.length} entries`);

  // Process all docs
  const docs = [];
  for (const entry of resA.entries) {
    const raw = await ScriptIQ.parser.extractText(entry);
    docs.push({ name: "A_" + entry.name, ...ScriptIQ.pipeline.process(raw) });
  }
  for (const entry of resB.entries) {
    const raw = await ScriptIQ.parser.extractText(entry);
    docs.push({ name: "B_" + entry.name, ...ScriptIQ.pipeline.process(raw) });
  }

  console.log(`Total documents processed: ${docs.length}`);

  // Build vectors using all documents
  const vecs = ScriptIQ.similarity.buildVectors(docs.map((d) => d.filteredTokens));
  
  // Calculate similarity between all pairs
  const pairs = [];
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      pairs.push({
        name1: docs[i].name,
        name2: docs[j].name,
        score: ScriptIQ.similarity.cosine(vecs[i], vecs[j])
      });
    }
  }

  // Sort by score descending
  pairs.sort((a, b) => b.score - a.score);

  console.log("\nTop 15 similar pairs found:");
  pairs.slice(0, 15).forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.name1} <-> ${p.name2}: ${(p.score * 100).toFixed(2)}%`);
  });

  // Verify that our 5 pairs are at the top and others are low
  console.log("\nChecking filler similarity levels...");
  const fillers = pairs.filter(p => !((p.name1.includes("STU001") && p.name2.includes("STU021")) ||
                                      (p.name1.includes("STU005") && p.name2.includes("STU025")) ||
                                      (p.name1.includes("STU010") && p.name2.includes("STU030")) ||
                                      (p.name1.includes("STU015") && p.name2.includes("STU035")) ||
                                      (p.name1.includes("STU020") && p.name2.includes("STU040"))));
  
  console.log(`Max similarity between non-paired documents: ${(fillers[0].score * 100).toFixed(2)}%`);
})().catch(console.error);
