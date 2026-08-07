/**
 * ScriptIQ — file parsing layer.
 *
 * Extracts plain text from uploaded submissions, entirely in the browser:
 *   - ZIP  → JSZip, expanded into its entries (a whole class in one upload)
 *   - PDF  → PDF.js (page by page text content)
 *   - DOCX → JSZip + DOMParser (a .docx is a zip; the text lives in
 *            word/document.xml as <w:t> runs grouped into <w:p> paragraphs)
 *   - TXT/MD → TextDecoder
 *
 * Public API:
 *   ScriptIQ.parser.expand(file)            → Promise<{entries, skipped}>
 *   ScriptIQ.parser.extractText(entry)      → Promise<string>
 *
 * An "entry" is {name, size, buffer} — either a plain uploaded file or one
 * member of a ZIP, so the caller treats both identically.
 */
window.ScriptIQ = window.ScriptIQ || {};

ScriptIQ.parser = (function () {
  "use strict";

  // Point PDF.js at its worker on the same CDN. If the browser refuses a
  // cross-origin worker (e.g. when running from file://), PDF.js silently
  // falls back to running the parser on the main thread — slower but fine
  // for essay-sized documents.
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const SUPPORTED_EXTENSIONS = ["pdf", "docx", "txt", "md"];

  /** Limits for ZIP expansion — a malicious or accidental archive should
   *  fail loudly rather than exhaust the tab's memory. */
  const MAX_ARCHIVE_ENTRIES = 300;
  const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024; // 250 MB uncompressed

  function extensionOf(filename) {
    const dot = filename.lastIndexOf(".");
    return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
  }

  function isSupported(name) {
    return SUPPORTED_EXTENSIONS.includes(extensionOf(name));
  }

  /**
   * Archive noise that should never be treated as a submission:
   * macOS resource forks (__MACOSX/, ._Name), .DS_Store, Windows
   * thumbnails, and anything else hidden.
   */
  function isArchiveNoise(path) {
    const base = path.split("/").pop() || "";
    return (
      path.startsWith("__MACOSX/") ||
      path.includes("/__MACOSX/") ||
      base.startsWith(".") ||
      base === "Thumbs.db" ||
      base === "desktop.ini"
    );
  }

  /**
   * Turn an uploaded File into a flat list of parseable entries.
   *
   * A ZIP is expanded into its members (nested folders are fine — JSZip
   * reports full paths and directory entries are skipped). Anything else
   * becomes a single entry, so callers have one code path.
   *
   * @returns {Promise<{entries: Array, skipped: Array}>}
   *          entries: [{ name, size, buffer, source }]
   *          skipped: [{ name, reason }]  — reported, not thrown, so one
   *                   stray file doesn't sink a 50-submission batch.
   */
  async function expand(file) {
    if (extensionOf(file.name) !== "zip") {
      return {
        entries: [
          { name: file.name, size: file.size, buffer: await file.arrayBuffer() },
        ],
        skipped: [],
      };
    }

    if (!window.JSZip) {
      throw new Error("JSZip failed to load — check your internet connection (it is served from a CDN).");
    }

    let zip;
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch {
      throw new Error(`"${file.name}" is not a readable ZIP archive.`);
    }

    // Survey before extracting so we can refuse an oversized archive
    // without first decompressing all of it into memory.
    const members = [];
    for (const path of Object.keys(zip.files)) {
      const zipped = zip.files[path];
      if (zipped.dir || isArchiveNoise(path)) continue;
      members.push({ path, zipped });
    }

    const skipped = [];
    const parseable = [];
    for (const m of members) {
      if (isSupported(m.path)) parseable.push(m);
      else {
        skipped.push({
          name: m.path,
          reason: `unsupported type ".${extensionOf(m.path) || "?"}"`,
        });
      }
    }

    if (parseable.length === 0) {
      throw new Error(
        `"${file.name}" contains no PDF, DOCX, or TXT files` +
          (skipped.length ? ` (${skipped.length} other file(s) ignored).` : ".")
      );
    }
    if (parseable.length > MAX_ARCHIVE_ENTRIES) {
      throw new Error(
        `"${file.name}" contains ${parseable.length} documents — the limit is ` +
          `${MAX_ARCHIVE_ENTRIES}. Split it into smaller archives.`
      );
    }

    const entries = [];
    let totalBytes = 0;
    for (const m of parseable) {
      const buffer = await m.zipped.async("arraybuffer");
      totalBytes += buffer.byteLength;
      if (totalBytes > MAX_ARCHIVE_BYTES) {
        throw new Error(
          `"${file.name}" expands to more than ` +
            `${Math.round(MAX_ARCHIVE_BYTES / 1024 / 1024)} MB. Split it into ` +
            `smaller archives.`
        );
      }
      entries.push({
        // Keep only the leaf name for display — LMS exports nest everything
        // under a folder, and the full path makes every card unreadable.
        name: m.path.split("/").pop(),
        path: m.path,
        size: buffer.byteLength,
        buffer,
        source: file.name,
      });
    }

    return { entries, skipped };
  }

  /** PDF → text. Joins each page's text items, inserting line breaks
   *  where PDF.js marks end-of-line, and blank lines between pages. */
  async function parsePdf(arrayBuffer) {
    if (!window.pdfjsLib) {
      throw new Error("PDF.js failed to load — check your internet connection (it is served from a CDN).");
    }
    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    } catch (err) {
      if (err && err.name === "PasswordException") {
        throw new Error("This PDF is password-protected — remove the password and re-upload it.");
      }
      if (err && err.name === "InvalidPDFException") {
        throw new Error("This file is corrupt or is not actually a PDF.");
      }
      throw err;
    }
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let pageText = "";
      for (const item of content.items) {
        pageText += item.str;
        pageText += item.hasEOL ? "\n" : " ";
      }
      pages.push(pageText.trim());
    }
    return pages.join("\n\n");
  }

  /** DOCX → text. Unzip, then walk word/document.xml:
   *  each <w:p> is a paragraph; text lives in <w:t>; <w:tab> is a tab. */
  async function parseDocx(arrayBuffer) {
    if (!window.JSZip) {
      throw new Error("JSZip failed to load — check your internet connection (it is served from a CDN).");
    }
    let zip;
    try {
      zip = await JSZip.loadAsync(arrayBuffer);
    } catch {
      throw new Error(
        "This file is corrupt or is not a real .docx (older .doc files are not supported — re-save as .docx)."
      );
    }
    const docEntry = zip.file("word/document.xml");
    if (!docEntry) {
      throw new Error("Not a valid .docx file (missing word/document.xml).");
    }
    const xmlText = await docEntry.async("string");
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) {
      throw new Error("Could not parse the document XML inside this .docx.");
    }

    // getElementsByTagName with the "w:" prefix works across browsers for
    // this namespaced XML; paragraphs → lines.
    const paragraphs = doc.getElementsByTagName("w:p");
    const lines = [];
    for (const p of paragraphs) {
      let line = "";
      for (const node of p.getElementsByTagName("*")) {
        if (node.tagName === "w:t") line += node.textContent;
        else if (node.tagName === "w:tab") line += "\t";
      }
      lines.push(line);
    }
    return lines.join("\n").trim();
  }

  /** Plain text / markdown → text. */
  async function parseTxt(arrayBuffer) {
    return new TextDecoder("utf-8").decode(arrayBuffer);
  }

  /**
   * Extract plain text from one entry (from `expand`).
   * Throws with a human-readable message on unsupported/corrupt input.
   */
  async function extractText(entry) {
    const ext = extensionOf(entry.name);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported file type ".${ext}" — use PDF, DOCX, or TXT.`);
    }
    if (!entry.buffer || entry.buffer.byteLength === 0) {
      throw new Error("This file is empty (0 bytes).");
    }

    let text;
    switch (ext) {
      case "pdf":  text = await parsePdf(entry.buffer); break;
      case "docx": text = await parseDocx(entry.buffer); break;
      default:     text = await parseTxt(entry.buffer); break;
    }

    if (!text || !text.trim()) {
      throw new Error(
        "No text could be extracted — this may be a scanned/image-only document."
      );
    }
    return text;
  }

  return {
    expand,
    extractText,
    isSupported,
    extensionOf,
    isArchiveNoise,
    SUPPORTED_EXTENSIONS,
    MAX_ARCHIVE_ENTRIES,
  };
})();
