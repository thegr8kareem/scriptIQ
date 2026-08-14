/**
 * ScriptIQ — persistence layer (Phase 5).
 *
 * IndexedDB wrapper. Two object stores:
 *
 *   submissions  { id, name, size, uploadedAt, raw }
 *     keyPath "id" — a content hash, so re-uploading the same file
 *     overwrites its record instead of duplicating it. Only the raw
 *     extracted text is stored; tokens/vectors are cheap to recompute
 *     on load, and storing them would just bloat the database.
 *
 *   comparisons  { id (auto), aId, bId, aName, bName,
 *                  tfidfScore, semanticScore|null, comparedAt }
 *     an append-only log of every comparison the lecturer ran.
 *
 * Every method returns a Promise. If IndexedDB is unavailable the open
 * fails and callers degrade gracefully — the app still works, it just
 * forgets everything on reload.
 */
window.ScriptIQ = window.ScriptIQ || {};

ScriptIQ.storage = (function () {
  "use strict";

  const DB_NAME = "scriptiq";
  const DB_VERSION = 3;

  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          reject(new Error("IndexedDB is not available in this browser."));
          return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("submissions")) {
            db.createObjectStore("submissions", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("comparisons")) {
            const store = db.createObjectStore("comparisons", {
              keyPath: "id",
              autoIncrement: true,
            });
            store.createIndex("comparedAt", "comparedAt");
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  /** Run `fn(objectStore)` in a transaction; resolves with the request's
   *  result once the transaction commits. */
  function withStore(storeName, mode, fn) {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(storeName, mode);
          const request = fn(t.objectStore(storeName));
          t.oncomplete = () => resolve(request ? request.result : undefined);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        })
    );
  }

  // ---------- submissions ----------

  function saveSubmission(record) {
    const userId = window.ScriptIQ?.currentUser?.id || "anonymous";
    return withStore("submissions", "readwrite", (s) => s.put({ ...record, userId }));
  }

  function getAllSubmissions() {
    const userId = window.ScriptIQ?.currentUser?.id || "anonymous";
    return withStore("submissions", "readonly", (s) => s.getAll()).then(
      (records) => (records || []).filter((r) => r.userId === userId)
    );
  }

  function deleteAllSubmissions() {
    const userId = window.ScriptIQ?.currentUser?.id || "anonymous";
    return withStore("submissions", "readwrite", (s) => {
      s.getAll().onsuccess = (e) => {
        const records = e.target.result || [];
        for (const r of records) {
          if (r.userId === userId) {
            s.delete(r.id);
          }
        }
      };
    });
  }

  // ---------- comparison history ----------

  function logComparison(entry) {
    const userId = window.ScriptIQ?.currentUser?.id || "anonymous";
    return withStore("comparisons", "readwrite", (s) => s.add({ ...entry, userId }));
  }

  /** Latest `limit` comparisons, newest first. */
  function getComparisons(limit = 50) {
    const userId = window.ScriptIQ?.currentUser?.id || "anonymous";
    return withStore("comparisons", "readonly", (s) => s.getAll()).then(
      (rows) =>
        (rows || [])
          .filter((r) => r.userId === userId)
          .sort((a, b) => new Date(b.comparedAt) - new Date(a.comparedAt))
          .slice(0, limit)
    );
  }

  function clearComparisons() {
    const userId = window.ScriptIQ?.currentUser?.id || "anonymous";
    return withStore("comparisons", "readwrite", (s) => {
      s.getAll().onsuccess = (e) => {
        const rows = e.target.result || [];
        for (const r of rows) {
          if (r.userId === userId) {
            s.delete(r.id);
          }
        }
      };
    });
  }

  return {
    open,
    saveSubmission,
    getAllSubmissions,
    deleteAllSubmissions,
    logComparison,
    getComparisons,
    clearComparisons,
  };
})();
