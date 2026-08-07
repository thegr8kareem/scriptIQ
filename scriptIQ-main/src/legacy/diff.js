/**
 * ScriptIQ — TextDiff (Phase 3).
 *
 * Word-level diff between two documents built on the classic Longest
 * Common Subsequence dynamic program, implemented from scratch.
 *
 * Output is a list of ops over TOKEN INDEX ranges (not characters):
 *   { type: "equal"|"del"|"ins"|"mod", aStart, aEnd, bStart, bEnd }
 * where [aStart, aEnd) indexes into tokensA and [bStart, bEnd) into
 * tokensB. "del" ops have an empty B range, "ins" ops an empty A range,
 * and "mod" (a deletion immediately followed by an insertion — i.e. text
 * that was rewritten in place) has both.
 *
 * Public API: ScriptIQ.diff.diffTokens(tokensA, tokensB) → { ops, stats }
 */
window.ScriptIQ = window.ScriptIQ || {};

ScriptIQ.diff = (function () {
  "use strict";

  /**
   * The DP table is O(n·m) cells. 25M cells (a Uint32Array of ~100 MB,
   * e.g. two 5,000-word documents that share nothing) is where we stop —
   * beyond that the pair is degraded to one coarse "rewritten" block
   * rather than risking an out-of-memory tab. Essays are far below this.
   */
  const MAX_CELLS = 25_000_000;

  /**
   * Diff two offset-token arrays (from pipeline.tokenizeWithOffsets).
   * Comparison uses each token's `norm` form, so case and curly-quote
   * differences don't register as changes.
   */
  function diffTokens(tokensA, tokensB) {
    const n = tokensA.length;
    const m = tokensB.length;

    // Cheap wins first: shared prefix and suffix need no DP table, and
    // trimming them shrinks the quadratic part dramatically for the
    // common "same essay, edited in the middle" case.
    let prefix = 0;
    while (
      prefix < n &&
      prefix < m &&
      tokensA[prefix].norm === tokensB[prefix].norm
    ) {
      prefix++;
    }
    let suffix = 0;
    while (
      suffix < n - prefix &&
      suffix < m - prefix &&
      tokensA[n - 1 - suffix].norm === tokensB[m - 1 - suffix].norm
    ) {
      suffix++;
    }

    const midN = n - prefix - suffix;
    const midM = m - prefix - suffix;

    let ops = [];
    if (prefix > 0) {
      ops.push({ type: "equal", aStart: 0, aEnd: prefix, bStart: 0, bEnd: prefix });
    }

    if (midN > 0 || midM > 0) {
      if (midN * midM <= MAX_CELLS) {
        ops = ops.concat(
          lcsOps(tokensA, prefix, n - suffix, tokensB, prefix, m - suffix)
        );
      } else {
        // Degenerate fallback: mark the whole differing middle as one
        // rewritten block. Only reachable for very large, very different
        // document pairs.
        console.warn(
          `ScriptIQ.diff: pair too large for word-level LCS ` +
            `(${midN} × ${midM} words) — showing a coarse diff.`
        );
        ops.push({
          type: "mod",
          aStart: prefix, aEnd: n - suffix,
          bStart: prefix, bEnd: m - suffix,
        });
      }
    }

    if (suffix > 0) {
      ops.push({
        type: "equal",
        aStart: n - suffix, aEnd: n,
        bStart: m - suffix, bEnd: m,
      });
    }

    ops = pairModifications(ops);
    return { ops, stats: computeStats(ops) };
  }

  /**
   * Classic LCS dynamic program + backtrack over a sub-range of each
   * token list.
   *
   * table[i][j] = length of the LCS of A[..i) and B[..j):
   *   A[i-1] == B[j-1]  →  table[i-1][j-1] + 1
   *   otherwise         →  max(table[i-1][j], table[i][j-1])
   *
   * Stored as one flat Uint32Array (row-major) — same math, far less
   * memory churn than an array of arrays.
   *
   * Backtracking from (n, m) recovers, per token, whether it is part of
   * the LCS ("equal") or unique to one side ("del" from A / "ins" to B).
   * Consecutive same-type tokens are coalesced into range ops.
   */
  function lcsOps(A, aLo, aHi, B, bLo, bHi) {
    const n = aHi - aLo;
    const m = bHi - bLo;
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);

    for (let i = 1; i <= n; i++) {
      const aNorm = A[aLo + i - 1].norm;
      const row = i * width;
      const prevRow = row - width;
      for (let j = 1; j <= m; j++) {
        table[row + j] =
          aNorm === B[bLo + j - 1].norm
            ? table[prevRow + j - 1] + 1
            : Math.max(table[prevRow + j], table[row + j - 1]);
      }
    }

    // Backtrack, collecting per-token ops in reverse order.
    const reversed = []; // entries: "equal" | "del" | "ins"
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
      if (A[aLo + i - 1].norm === B[bLo + j - 1].norm) {
        reversed.push("equal");
        i--; j--;
      } else if (table[(i - 1) * width + j] >= table[i * width + j - 1]) {
        reversed.push("del");
        i--;
      } else {
        reversed.push("ins");
        j--;
      }
    }
    while (i > 0) { reversed.push("del"); i--; }
    while (j > 0) { reversed.push("ins"); j--; }

    // Walk forward again, coalescing runs into range ops.
    const ops = [];
    let ai = aLo;
    let bi = bLo;
    for (let k = reversed.length - 1; k >= 0; k--) {
      const type = reversed[k];
      const last = ops[ops.length - 1];
      const aAdvance = type !== "ins" ? 1 : 0;
      const bAdvance = type !== "del" ? 1 : 0;
      if (last && last.type === type) {
        last.aEnd += aAdvance;
        last.bEnd += bAdvance;
      } else {
        ops.push({
          type,
          aStart: ai, aEnd: ai + aAdvance,
          bStart: bi, bEnd: bi + bAdvance,
        });
      }
      ai += aAdvance;
      bi += bAdvance;
    }
    return ops;
  }

  /**
   * A deletion run directly followed by an insertion run (or vice versa)
   * is text that was rewritten in place — present that as one "mod" op
   * (amber in the UI) instead of unrelated red + green blocks.
   */
  function pairModifications(ops) {
    const out = [];
    let k = 0;
    while (k < ops.length) {
      const cur = ops[k];
      const next = ops[k + 1];
      const isPair =
        next &&
        ((cur.type === "del" && next.type === "ins") ||
          (cur.type === "ins" && next.type === "del"));
      if (isPair) {
        const del = cur.type === "del" ? cur : next;
        const ins = cur.type === "ins" ? cur : next;
        out.push({
          type: "mod",
          aStart: del.aStart, aEnd: del.aEnd,
          bStart: ins.bStart, bEnd: ins.bEnd,
        });
        k += 2;
      } else {
        out.push(cur);
        k += 1;
      }
    }
    return out;
  }

  /** Word counts per category, for the summary line. */
  function computeStats(ops) {
    const stats = { equal: 0, del: 0, ins: 0, modA: 0, modB: 0 };
    for (const op of ops) {
      const aLen = op.aEnd - op.aStart;
      const bLen = op.bEnd - op.bStart;
      if (op.type === "equal") stats.equal += aLen;
      else if (op.type === "del") stats.del += aLen;
      else if (op.type === "ins") stats.ins += bLen;
      else { stats.modA += aLen; stats.modB += bLen; }
    }
    return stats;
  }

  return { diffTokens };
})();
