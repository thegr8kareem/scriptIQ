/**
 * ScriptIQ — similarity network graph (Phase 4).
 *
 * D3 force-directed graph over a batch of submissions:
 *   - one node per document (red ring = involved in a high-risk pair)
 *   - one edge per pair at/above the similarity threshold
 *   - edge thickness ∝ similarity score
 *   - edge color: red ≥ 60% (high risk), amber ≥ 30%, gray below
 *   - clicking an edge hands the pair to the app (jump to diff view)
 *
 * Public API:
 *   ScriptIQ.graph.render({ svg, nodes, links, threshold, onEdgeClick })
 *   ScriptIQ.graph.applyThreshold(t) → number of visible edges
 *
 * `links` must include EVERY pair with its score; the threshold only
 * hides edges and removes their pull on the layout — so moving the
 * slider never rebuilds the graph, and nodes keep their positions.
 */
window.ScriptIQ = window.ScriptIQ || {};

ScriptIQ.graph = (function () {
  "use strict";

  const HIGH_RISK = 0.6;
  const MODERATE = 0.3;
  const HEIGHT = 440;
  const NODE_RADIUS = 14;

  let state = null; // { svg, simulation, links, linkSel, nodeSel, threshold }

  function edgeClass(score) {
    if (score >= HIGH_RISK) return "edge-high";
    if (score >= MODERATE) return "edge-med";
    return "edge-low";
  }

  /** Shortened label: filename minus extension, capped for the layout. */
  function labelOf(name) {
    const base = name.replace(/\.[^.]+$/, "");
    return base.length > 16 ? base.slice(0, 15) + "…" : base;
  }

  function render({ svg: svgEl, nodes, links, threshold, onEdgeClick }) {
    if (!window.d3) {
      svgEl.outerHTML =
        "<p class='doc-error'>D3.js failed to load — check your internet connection (it is served from a CDN).</p>";
      return;
    }

    // Keep positions of nodes that survived a re-render (new upload into
    // an existing batch) so the layout doesn't reshuffle under the user.
    if (state) {
      const prev = new Map(state.nodeSel.data().map((n) => [n.id, n]));
      for (const n of nodes) {
        const old = prev.get(n.id);
        if (old) {
          n.x = old.x;
          n.y = old.y;
        }
      }
      state.simulation.stop();
    }

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    const width = svgEl.clientWidth || 800;
    svg.attr("viewBox", `0 0 ${width} ${HEIGHT}`);

    // Documents in at least one high-risk pair get a warning ring,
    // regardless of where the display threshold sits.
    const highRiskIds = new Set();
    for (const l of links) {
      if (l.score >= HIGH_RISK) {
        highRiskIds.add(l.source).add(l.target);
      }
    }

    const linkSel = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", (d) => "graph-edge " + edgeClass(d.score))
      .attr("stroke-width", (d) => 1 + d.score * 7)
      .style("cursor", "pointer")
      .on("click", (event, d) => onEdgeClick(d.source.id, d.target.id));

    linkSel
      .append("title")
      .text((d) => {
        // Before the simulation starts, source/target are still raw ids.
        const a = typeof d.source === "object" ? d.source.name : d.source;
        const b = typeof d.target === "object" ? d.target.name : d.target;
        return `${a} ↔ ${b}: ${Math.round(d.score * 100)}% similar — click to open diff`;
      });

    const nodeSel = svg
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", (d) =>
        "graph-node" + (highRiskIds.has(d.id) ? " node-risky" : "")
      );

    nodeSel.append("circle").attr("r", NODE_RADIUS);
    nodeSel
      .append("text")
      .attr("dy", NODE_RADIUS + 14)
      .attr("text-anchor", "middle")
      .text((d) => labelOf(d.name));
    nodeSel.append("title").text((d) => d.name);

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links.filter((l) => l.score >= threshold))
          .id((d) => d.id)
          // Similar documents sit closer together and pull harder —
          // that's what makes copying clusters visually obvious.
          .distance((d) => 70 + (1 - d.score) * 180)
          .strength((d) => 0.2 + 0.6 * d.score)
      )
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(width / 2, HEIGHT / 2))
      .force("collide", d3.forceCollide(NODE_RADIUS + 22));

    simulation.on("tick", () => {
      // Clamp so labels stay inside the viewBox.
      for (const n of nodes) {
        n.x = Math.max(30, Math.min(width - 30, n.x));
        n.y = Math.max(30, Math.min(HEIGHT - 34, n.y));
      }
      linkSel
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
      nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    nodeSel.call(
      d3
        .drag()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    state = { svg, simulation, links, linkSel, nodeSel, threshold };
    return applyThreshold(threshold);
  }

  /**
   * Show only edges at/above `t` and let only those pull on the layout.
   * Node positions persist; the simulation just re-settles.
   */
  function applyThreshold(t) {
    if (!state) return 0;
    state.threshold = t;
    state.linkSel.style("display", (d) => (d.score >= t ? null : "none"));
    const active = state.links.filter((d) => d.score >= t);
    state.simulation.force("link").links(active);
    state.simulation.alpha(0.4).restart();
    return active.length;
  }

  return { render, applyThreshold, HIGH_RISK, MODERATE };
})();
