/**
 * ScriptIQ — text processing pipeline.
 *
 * Turns raw extracted text into the normalized token streams that the
 * similarity layers (TF-IDF in Phase 2, embeddings in Phase 5) consume.
 *
 * Pipeline:  raw text → normalize → tokenize → strip stopwords
 *
 * Classic script (no ES modules) so the app works when index.html is opened
 * directly from disk. Everything hangs off the global `ScriptIQ` namespace.
 */
window.ScriptIQ = window.ScriptIQ || {};

ScriptIQ.pipeline = (function () {
  "use strict";

  /**
   * Common English stopwords. These carry almost no signal for plagiarism
   * detection ("the", "of", "and" appear in every essay) and would drown
   * out the meaningful terms in the TF-IDF vectors.
   */
  const STOPWORDS = new Set([
    "a", "about", "above", "after", "again", "against", "all", "am", "an",
    "and", "any", "are", "aren't", "as", "at", "be", "because", "been",
    "before", "being", "below", "between", "both", "but", "by", "can",
    "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does",
    "doesn't", "doing", "don't", "down", "during", "each", "few", "for",
    "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't",
    "having", "he", "he'd", "he'll", "he's", "her", "here", "here's",
    "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd",
    "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's",
    "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
    "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or",
    "other", "ought", "our", "ours", "ourselves", "out", "over", "own",
    "same", "shan't", "she", "she'd", "she'll", "she's", "should",
    "shouldn't", "so", "some", "such", "than", "that", "that's", "the",
    "their", "theirs", "them", "themselves", "then", "there", "there's",
    "these", "they", "they'd", "they'll", "they're", "they've", "this",
    "those", "through", "to", "too", "under", "until", "up", "very", "was",
    "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't",
    "what", "what's", "when", "when's", "where", "where's", "which",
    "while", "who", "who's", "whom", "why", "why's", "with", "won't",
    "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've",
    "your", "yours", "yourself", "yourselves"
  ]);

  /**
   * Normalize raw extracted text:
   * - Unicode NFC so visually-identical characters compare equal
   * - unify curly quotes/dashes that Word inserts automatically
   * - lowercase
   * - collapse runs of whitespace to single spaces
   */
  function normalize(rawText) {
    return (rawText || "")
      .normalize("NFC")
      .replace(/[‘’ʼ]/g, "'")   // curly apostrophes → '
      .replace(/[“”]/g, '"')          // curly quotes → "
      .replace(/[–—]/g, "-")          // en/em dashes → -
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Split normalized text into word tokens.
   * `\p{L}` / `\p{N}` keep Unicode letters and digits, so accented and
   * non-Latin words survive (relevant for non-English submissions).
   * Apostrophes stay inside tokens ("don't" is one token).
   */
  function tokenize(normalizedText) {
    return normalizedText.match(/[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu) || [];
  }

  /** Remove stopwords and 1-character noise tokens. */
  function stripStopwords(tokens) {
    return tokens.filter((t) => t.length > 1 && !STOPWORDS.has(t));
  }

  /**
   * Tokenize the RAW text (not the normalized copy), remembering where each
   * token sits in the original string. The match highlighter needs these
   * offsets to wrap the exact characters the lecturer sees on screen.
   * Each entry: { norm, start, end } — `norm` is the comparison form.
   */
  function tokenizeWithOffsets(rawText) {
    const re = /[\p{L}\p{N}]+(?:['’ʼ][\p{L}]+)*/gu;
    const out = [];
    let m;
    while ((m = re.exec(rawText)) !== null) {
      out.push({
        norm: m[0].normalize("NFC").replace(/[‘’ʼ]/g, "'").toLowerCase(),
        start: m.index,
        end: m.index + m[0].length,
      });
    }
    return out;
  }

  /**
   * Run the full pipeline on raw extracted text.
   * Returns everything downstream phases need:
   *   raw            — untouched extraction output (shown to the lecturer)
   *   normalized     — cleaned, lowercased text (used by the diff view)
   *   tokens         — all word tokens
   *   filteredTokens — tokens minus stopwords (input to TF-IDF)
   */
  function process(rawText) {
    const normalized = normalize(rawText);
    const tokens = tokenize(normalized);
    const filteredTokens = stripStopwords(tokens);
    return {
      raw: rawText,
      normalized,
      tokens,
      filteredTokens,
      offsetTokens: tokenizeWithOffsets(rawText),
      stats: {
        characters: rawText.length,
        words: tokens.length,
        meaningfulWords: filteredTokens.length,
        uniqueWords: new Set(filteredTokens).size,
      },
    };
  }

  return {
    normalize,
    tokenize,
    stripStopwords,
    tokenizeWithOffsets,
    process,
    STOPWORDS,
  };
})();
