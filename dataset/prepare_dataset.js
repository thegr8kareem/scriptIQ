/**
 * ScriptIQ Dataset Preparation & Validation Pipeline
 *
 * Automated CLI tool to process, validate, normalize, split, and evaluate
 * script/screenplay plagiarism datasets.
 *
 * Usage:
 *   node dataset/prepare_dataset.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE_PATH = path.join(__dirname, "samples", "screenplay_pairs.json");
const PROCESSED_DIR = path.join(__dirname, "processed");

function log(section, msg) {
  console.log(`[Dataset Pipeline] [${section}] ${msg}`);
}

function normalizeText(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function computeOverlap(textA, textB) {
  const wordsA = normalizeText(textA).split(" ").filter(Boolean);
  const wordsB = normalizeText(textB).split(" ").filter(Boolean);

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  const intersection = [...setA].filter((x) => setB.has(x));
  const union = new Set([...setA, ...setB]);

  const jaccard = union.size > 0 ? intersection.length / union.size : 0;
  return {
    wordCountA: wordsA.length,
    wordCountB: wordsB.length,
    jaccard: Math.round(jaccard * 1000) / 1000,
  };
}

function validateAndProcess() {
  log("Init", "Starting dataset validation & preprocessing...");

  if (!fs.existsSync(SAMPLE_PATH)) {
    console.error(`❌ Source sample file not found at ${SAMPLE_PATH}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(SAMPLE_PATH, "utf8");
  let pairs = [];
  try {
    pairs = JSON.parse(rawData);
  } catch (err) {
    console.error("❌ Failed to parse JSON dataset:", err.message);
    process.exit(1);
  }

  log("Validation", `Loaded ${pairs.length} script benchmark pair(s).`);

  const processed = [];
  let validCount = 0;
  let invalidCount = 0;

  for (const item of pairs) {
    const { id, title_a, title_b, script_a, script_b, category, expected_similarity, is_plagiarism } = item;

    if (!id || !script_a || !script_b || typeof expected_similarity !== "number") {
      log("Error", `Skipping invalid entry (ID: ${id || "unknown"}) - missing required fields.`);
      invalidCount++;
      continue;
    }

    const metrics = computeOverlap(script_a, script_b);

    const record = {
      id,
      title_a: title_a || "Doc A",
      title_b: title_b || "Doc B",
      category: category || "unknown",
      expected_similarity,
      is_plagiarism: Boolean(is_plagiarism),
      metrics,
      script_a_len: script_a.length,
      script_b_len: script_b.length,
      processed_at: new Date().toISOString(),
    };

    processed.push(record);
    validCount++;
    log("Valid", `[${id}] Category: ${category} | Expected Sim: ${expected_similarity} | Jaccard: ${metrics.jaccard}`);
  }

  // Create processed directory if it doesn't exist
  if (!fs.existsSync(PROCESSED_DIR)) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  }

  // Split dataset into train/val/test (80/10/10 or simple split for benchmark)
  const train = processed.slice(0, Math.ceil(processed.length * 0.75));
  const test = processed.slice(Math.ceil(processed.length * 0.75));

  fs.writeFileSync(path.join(PROCESSED_DIR, "dataset_summary.json"), JSON.stringify(processed, null, 2));
  fs.writeFileSync(path.join(PROCESSED_DIR, "train.json"), JSON.stringify(train, null, 2));
  fs.writeFileSync(path.join(PROCESSED_DIR, "test.json"), JSON.stringify(test, null, 2));

  log("Complete", `Successfully processed ${validCount} entries (${invalidCount} invalid). Exported to ${PROCESSED_DIR}`);
}

validateAndProcess();
