/**
 * ScriptIQ Backend AI Service
 *
 * Provides backend AI capabilities for screenplay / script analysis,
 * paraphrase detection, structural breakdown, and AI feedback generation.
 * Formatted cleanly so future LLM / vector database backends (OpenAI, Anthropic,
 * HuggingFace Inference API, Ollama) can be plugged in seamlessly.
 */

/** Ghanaian and standard academic & screenplay stopword set */
const SCREENPLAY_STOPWORDS = new Set([
  "int", "ext", "day", "night", "cut", "fade", "scene", "continuous",
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "about", "into", "through", "after",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "can", "could", "should", "would", "will", "may",
  "this", "that", "these", "those", "it", "its", "he", "him", "his", "she",
  "her", "they", "them", "their", "knust", "university", "department"
]);

/**
 * Tokenize and normalize script text.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeScript(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !SCREENPLAY_STOPWORDS.has(t));
}

/**
 * Calculate Jaccard and Cosine keyword similarity scores between two scripts.
 * @param {string} scriptA
 * @param {string} scriptB
 * @returns {{ cosineScore: number, jaccardScore: number, sharedKeywords: string[] }}
 */
export function calculateKeywordSimilarity(scriptA, scriptB) {
  const tokensA = tokenizeScript(scriptA);
  const tokensB = tokenizeScript(scriptB);

  const freqA = new Map();
  const freqB = new Map();

  tokensA.forEach((t) => freqA.set(t, (freqA.get(t) || 0) + 1));
  tokensB.forEach((t) => freqB.set(t, (freqB.get(t) || 0) + 1));

  const allTerms = new Set([...freqA.keys(), ...freqB.keys()]);
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  const shared = [];

  for (const term of allTerms) {
    const valA = freqA.get(term) || 0;
    const valB = freqB.get(term) || 0;

    dotProduct += valA * valB;
    magA += valA * valA;
    magB += valB * valB;

    if (valA > 0 && valB > 0) {
      shared.push(term);
    }
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  const cosineScore = denominator === 0 ? 0 : dotProduct / denominator;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = [...setA].filter((x) => setB.has(x));
  const union = new Set([...setA, ...setB]);
  const jaccardScore = union.size === 0 ? 0 : intersection.length / union.size;

  return {
    cosineScore: Math.round(cosineScore * 1000) / 1000,
    jaccardScore: Math.round(jaccardScore * 1000) / 1000,
    sharedKeywords: shared.slice(0, 15),
  };
}

/**
 * Perform detailed screenplay analysis and generate feedback / insights.
 * @param {string} scriptText
 * @param {string} [title]
 * @returns {object} Analysis result
 */
export function analyzeScreenplay(scriptText, title = "Untitled Script") {
  if (!scriptText || scriptText.trim().length === 0) {
    return {
      title,
      wordCount: 0,
      sceneCount: 0,
      dialogueRatio: 0,
      riskLevel: "Low",
      insights: ["Document contains no readable text."],
      structuralBreakdown: { intro: 0, body: 0, climax: 0 },
    };
  }

  const lines = scriptText.split(/\r?\n/);
  const wordCount = scriptText.trim().split(/\s+/).length;

  // Screenplay format detection (SCENE HEADINGS: INT./EXT.)
  const sceneLines = lines.filter((l) =>
    /^\s*(INT\.|EXT\.|INT\/EXT\.|EST\.)/i.test(l)
  );
  const sceneCount = Math.max(sceneLines.length, 1);

  // Dialogue line estimation (lines starting with uppercase character names or indented)
  const dialogueLines = lines.filter((l) =>
    /^\s{4,}[A-Z\s]{2,}\s*$/.test(l) || /^\s*[A-Z]{2,}\s*\(.*?\)/.test(l)
  );
  const dialogueRatio = Math.round((dialogueLines.length / Math.max(lines.length, 1)) * 100);

  // Structural breakdown into thirds
  const totalLines = lines.length;
  const chunk1 = lines.slice(0, Math.floor(totalLines / 3)).join(" ");
  const chunk2 = lines.slice(Math.floor(totalLines / 3), Math.floor((2 * totalLines) / 3)).join(" ");
  const chunk3 = lines.slice(Math.floor((2 * totalLines) / 3)).join(" ");

  const insights = [];

  if (sceneLines.length === 0) {
    insights.push("Format note: No standard scene headings (INT./EXT.) detected. Script may be in prose or essay format.");
  } else {
    insights.push(`Structure: Detected ${sceneCount} distinct scene heading(s).`);
  }

  if (dialogueRatio > 50) {
    insights.push("Dialogue density: High character dialogue content relative to action lines.");
  } else if (dialogueRatio < 15) {
    insights.push("Action/Descriptive heavy: Low proportion of formatted dialogue.");
  } else {
    insights.push("Balanced pace: Healthy ratio of narrative action to dialogue.");
  }

  // Paraphrase & repetition check
  const words = tokenizeScript(scriptText);
  const uniqueWords = new Set(words);
  const lexicalDiversity = words.length > 0 ? (uniqueWords.size / words.length) : 0;

  if (lexicalDiversity < 0.35 && words.length > 100) {
    insights.push("Vocabulary notice: Low lexical diversity detected. Possible repetitive phrasing or templated writing.");
  } else {
    insights.push(`Vocabulary score: High lexical variety (${Math.round(lexicalDiversity * 100)}% unique words).`);
  }

  return {
    title,
    wordCount,
    sceneCount,
    dialogueRatio,
    lexicalDiversity: Math.round(lexicalDiversity * 100) / 100,
    insights,
    structuralBreakdown: {
      act1Length: Math.floor(totalLines / 3),
      act2Length: Math.floor(totalLines / 3),
      act3Length: totalLines - 2 * Math.floor(totalLines / 3),
    },
  };
}
