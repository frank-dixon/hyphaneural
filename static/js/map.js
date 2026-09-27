/**
 * Hyphaneural map — expanding hyphal network.
 * Core organisms from API; procedural nodes grow in as camera pans/zooms.
 */
(function () {
  "use strict";

  const canvas = document.getElementById("hypha-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const readout = document.getElementById("readout");
  const chamber = document.getElementById("chamber");
  const chamberBody = document.getElementById("chamber-body");
  const chamberTitle = document.getElementById("chamber-title");
  const chamberSci = document.getElementById("chamber-sci");
  const compareBanner = document.getElementById("compare-banner");
  const app = document.getElementById("map-app");

  const TEAL = [61, 158, 143];
  const EMBER = [196, 120, 74];
  const VOID = "#07090b";

  const cam = { x: 0, y: 0, z: 1 };
  let coreNodes = [];
  let procNodes = new Map(); // key "cx,cy" -> node
  let edges = [];
  let selected = null;
  let compareMode = false;
  let comparePair = [];
  let hover = null;
  let dragging = false;
  let lastPtr = null;
  let dim = 0;
  let animT = 0;
  let needsEdgeRebuild = true;

  const CELL = 280;
  const PROC_R = 9;
  const CORE_R = 14;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function worldFromScreen(sx, sy) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return {
      x: (sx - cx) / cam.z + cam.x,
      y: (sy - cy) / cam.z + cam.y,
    };
  }

  function screenFromWorld(wx, wy) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return {
      x: (wx - cam.x) * cam.z + cx,
      y: (wy - cam.y) * cam.z + cy,
    };
  }

  function hash2(ix, iy) {
    let n = ix * 374761393 + iy * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return (n ^ (n >> 16)) >>> 0;
  }

  function rand01(h) {
    return (h % 10000) / 10000;
  }

  function makeProcNode(cx, cy) {
    const h = hash2(cx, cy);
    // Sparse: only ~38% of cells spawn a visible node
    if (rand01(h) > 0.28) return null;
    const ox = (rand01(h >> 3) - 0.5) * CELL * 0.7;
    const oy = (rand01(h >> 7) - 0.5) * CELL * 0.7;
    const x = cx * CELL + CELL / 2 + ox;
    const y = cy * CELL + CELL / 2 + oy;
    // Skip if too close to a core organism
    for (const c of coreNodes) {
      const dx = c.x - x;
      const dy = c.y - y;
      if (dx * dx + dy * dy < 90 * 90) return null;
    }
    const ember = rand01(h >> 11) < 0.06;
    return {
      id: `p-${cx}-${cy}`,
      x,
      y,
      r: PROC_R * (0.55 + rand01(h >> 15) * 0.55),
      glow: ember ? EMBER : TEAL,
      procedural: true,
      born: performance.now(),
      label: null,
      common_name: null,
    };
  }

  function ensureProcedural() {
    // Expand generation radius with zoom-out (more world visible → more mycelium)
    const margin = 1.35;
    const halfW = (window.innerWidth / cam.z) * 0.5 * margin;
    const halfH = (window.innerHeight / cam.z) * 0.5 * margin;
    // Extra ring grows as user explores (zoom-out fills more cells)
    const exploreBoost = Math.max(0, Math.log2(1 / cam.z + 0.01)) * 0.4;
    const pad = (1 + exploreBoost) * CELL;

    const x0 = Math.floor((cam.x - halfW - pad) / CELL);
    const x1 = Math.ceil((cam.x + halfW + pad) / CELL);
    const y0 = Math.floor((cam.y - halfH - pad) / CELL);
    const y1 = Math.ceil((cam.y + halfH + pad) / CELL);

    let added = false;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = cx + "," + cy;
        if (procNodes.has(key)) continue;
        const n = makeProcNode(cx, cy);
        procNodes.set(key, n); // null = visited empty
        if (n) added = true;
      }
    }
    if (added) needsEdgeRebuild = true;
  }

  function allNodes() {
    const list = coreNodes.slice();
    for (const n of procNodes.values()) {
      if (n) list.push(n);
    }
    return list;
  }

  function rebuildEdges() {
    edges = [];
    const nodes = allNodes();
    const maxDist = 320;
    const maxDist2 = maxDist * maxDist;
    // Spatial buckets
    const buckets = new Map();
    const bSize = maxDist;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const bx = Math.floor(n.x / bSize);
      const by = Math.floor(n.y / bSize);
      const k = bx + "," + by;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    }
    const linked = new Set();
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const bx = Math.floor(a.x / bSize);
      const by = Math.floor(a.y / bSize);
      let degree = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cell = buckets.get(bx + ox + "," + (by + oy));
          if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > maxDist2 || d2 < 1) continue;
            // Prefer fewer edges for meditative feel
            const h = hash2(Math.floor(a.x), Math.floor(b.x) ^ Math.floor(b.y));
            if (rand01(h) > 0.42 && degree >= 2) continue;
            const key = i < j ? i + "-" + j : j + "-" + i;
            if (linked.has(key)) continue;
            linked.add(key);
            edges.push({ a, b, w: 1 - Math.sqrt(d2) / maxDist });
            degree++;
            if (degree >= 3) break;
          }
          if (degree >= 3) break;
        }
        if (degree >= 3) break;
      }
    }
    // Shared-gene edges between core nodes (stronger visual)
    for (let i = 0; i < coreNodes.length; i++) {
      for (let j = i + 1; j < coreNodes.length; j++) {
        const a = coreNodes[i];
        const b = coreNodes[j];
        const shared = (a.shared_genes || []).filter((g) =>
          (b.shared_genes || []).includes(g)
        );
        if (!shared.length) continue;
        edges.push({ a, b, w: 0.85, shared: true, genes: shared });
      }
    }
    needsEdgeRebuild = false;
  }

  function hitTest(sx, sy) {
    const w = worldFromScreen(sx, sy);
    let best = null;
    let bestD = Infinity;
    for (const n of allNodes()) {
      if (!n.common_name && n.procedural) {
        // procedural: only pickable when zoomed in
        if (cam.z < 0.85) continue;
      }
      const dx = n.x - w.x;
      const dy = n.y - w.y;
      const hitR = (n.r || CORE_R) + 8 / cam.z;
      const d2 = dx * dx + dy * dy;
      if (d2 < hitR * hitR && d2 < bestD) {
        bestD = d2;
        best = n;
      }
    }
    return best;
  }

  function draw() {
    animT = performance.now();
    ensureProcedural();
    if (needsEdgeRebuild) rebuildEdges();

    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, w, h);

    // Soft vignette field
    const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, "rgba(61,158,143,0.03)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const dimAlpha = dim;

    // Threads
    for (const e of edges) {
      const sa = screenFromWorld(e.a.x, e.a.y);
      const sb = screenFromWorld(e.b.x, e.b.y);
      // Cull offscreen
      if (
        (sa.x < -80 && sb.x < -80) ||
        (sa.x > w + 80 && sb.x > w + 80) ||
        (sa.y < -80 && sb.y < -80) ||
        (sa.y > h + 80 && sb.y > h + 80)
      )
        continue;

      const isCompare =
        comparePair.length === 2 &&
        ((e.a === comparePair[0] && e.b === comparePair[1]) ||
          (e.a === comparePair[1] && e.b === comparePair[0]) ||
          (e.shared &&
            comparePair.includes(e.a) &&
            comparePair.includes(e.b)));

      const sharedHighlight =
        comparePair.length === 2 &&
        e.shared &&
        ((comparePair[0] === e.a && comparePair[1] === e.b) ||
          (comparePair[0] === e.b && comparePair[1] === e.a) ||
          (comparePair.includes(e.a) && comparePair.includes(e.b)));

      let alpha = (e.shared ? 0.2 : 0.07 + e.w * 0.1) * (1 - dimAlpha * 0.55);
      let col = TEAL;
      let lw = (e.shared ? 1.4 : 0.6 + e.w * 0.7) * Math.min(cam.z, 1.4);

      if (sharedHighlight || isCompare) {
        col = EMBER;
        alpha = 0.55;
        lw = 2.2;
      }

      // Gentle pulse along shared hyphae
      if (e.shared && !sharedHighlight) {
        alpha += 0.04 * Math.sin(animT * 0.001 + e.a.x * 0.01);
      }

      ctx.beginPath();
      // Soft curve
      const mx = (sa.x + sb.x) / 2 + (sa.y - sb.y) * 0.08;
      const my = (sa.y + sb.y) / 2 + (sb.x - sa.x) * 0.08;
      ctx.moveTo(sa.x, sa.y);
      ctx.quadraticCurveTo(mx, my, sb.x, sb.y);
      ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${Math.max(0, alpha)})`;
      ctx.lineWidth = lw;
      ctx.stroke();
    }

    // Nodes
    const nodes = allNodes();
    for (const n of nodes) {
      const s = screenFromWorld(n.x, n.y);
      if (s.x < -40 || s.x > w + 40 || s.y < -40 || s.y > h + 40) continue;

      let age = 1;
      if (n.born) {
        age = Math.min(1, (animT - n.born) / 1200);
        // ease
        age = age * age * (3 - 2 * age);
      }

      const isCore = !n.procedural;
      const isSel = selected === n || comparePair.includes(n);
      const isHov = hover === n;
      const col = n.glow || TEAL;
      const baseR = (n.r || (isCore ? CORE_R : PROC_R)) * age;
      const r = baseR * (isHov || isSel ? 1.25 : 1) * Math.min(1.15, 0.55 + cam.z * 0.5);

      // Outer glow
      const glowR = r * (isCore ? 3.2 : 2.4);
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glowR);
      const ga = (isCore ? 0.35 : 0.18) * age * (1 - dimAlpha * 0.5);
      grad.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${ga})`);
      grad.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Core disc
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(isCore ? 0.85 : 0.55) * age})`;
      ctx.fill();

      if (isSel) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${EMBER[0]},${EMBER[1]},${EMBER[2]},0.7)`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Labels for core (and nearby procedural when zoomed)
      if (isCore && n.common_name && cam.z > 0.45) {
        ctx.font = "11px IBM Plex Sans, system-ui, sans-serif";
        ctx.fillStyle = `rgba(212,220,226,${0.55 * age * (1 - dimAlpha * 0.4)})`;
        ctx.textAlign = "center";
        ctx.fillText(n.common_name, s.x, s.y + r + 14);
      }
    }

    if (readout) {
      readout.textContent = `x ${cam.x.toFixed(0)}  y ${cam.y.toFixed(0)}  ×${cam.z.toFixed(2)}`;
    }

    requestAnimationFrame(draw);
  }

  function openChamber(node) {
    if (!node || !node.common_name) return;
    selected = node;
    dim = 0.35;
    chamber.classList.add("open");
    chamberTitle.textContent = node.common_name;
    chamberSci.textContent = node.scientific_name || "";
    const note = node.note
      ? `<div class="chamber-note">${escapeHtml(node.note)}</div>`
      : "";
    const shared = (node.shared_genes || [])
      .map((g) => `<button type="button" class="chip" data-gene="${escapeHtml(g)}">${escapeHtml(g)}</button>`)
      .join("");
    const unique = (node.unique_genes || [])
      .map((g) => `<button type="button" class="chip unique" data-gene="${escapeHtml(g)}">${escapeHtml(g)}</button>`)
      .join("");
    chamberBody.innerHTML = `
      <p>${escapeHtml(node.short_blurb || "")}</p>
      ${note}
      <div class="gene-block">
        <h3>Shared genes</h3>
        <div class="gene-chips">${shared || "<span style='color:var(--mist-dim)'>—</span>"}</div>
      </div>
      <div class="gene-block">
        <h3>Unique genes</h3>
        <div class="gene-chips">${unique || "<span style='color:var(--mist-dim)'>—</span>"}</div>
      </div>
      <div class="dogma" id="dogma" hidden>
        <h3>Follow a gene</h3>
        <p style="font-size:0.8rem;color:var(--mist-dim);margin-bottom:0.75rem" id="dogma-role"></p>
        <div class="dogma-track" id="dogma-track"></div>
      </div>
    `;
    chamberBody.querySelectorAll("[data-gene]").forEach((btn) => {
      btn.addEventListener("click", () => followGene(btn.getAttribute("data-gene"), btn));
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function followGene(geneId, btn) {
    chamberBody.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
    if (btn) btn.classList.add("selected");
    const dogma = document.getElementById("dogma");
    const track = document.getElementById("dogma-track");
    const role = document.getElementById("dogma-role");
    dogma.hidden = false;
    track.innerHTML = "";
    role.textContent = "Loading…";
    try {
      const res = await fetch(`/api/genes/${encodeURIComponent(geneId)}/`, {
        credentials: "same-origin",
      });
      const data = await res.json();
      role.textContent = data.role || "";
      const steps = data.steps || [];
      track.innerHTML = steps
        .map(
          (st, i) => `
        <div class="dogma-step ${st.stage === "Protein" ? "protein" : ""}" data-i="${i}">
          <div class="dogma-node"></div>
          <div class="dogma-label">
            <div class="stage">${escapeHtml(st.stage)}</div>
            <div class="name">${escapeHtml(st.label)}</div>
            <div class="hint-seq">${escapeHtml(st.seq_hint || "")}</div>
          </div>
        </div>`
        )
        .join("");
      // Stepped glow along DNA → RNA → protein
      const els = track.querySelectorAll(".dogma-step");
      els.forEach((el, i) => {
        setTimeout(() => el.classList.add("lit"), 280 + i * 420);
      });
    } catch (err) {
      role.textContent = "Could not load gene stub.";
    }
  }

  function closeChamber() {
    chamber.classList.remove("open");
    selected = null;
    dim = 0;
  }

  function updateCompareBanner() {
    if (!compareBanner) return;
    if (!compareMode) {
      compareBanner.classList.remove("visible");
      return;
    }
    compareBanner.classList.add("visible");
    if (comparePair.length === 0) {
      compareBanner.textContent = "Compare — select two organisms";
    } else if (comparePair.length === 1) {
      compareBanner.textContent = `Compare — ${comparePair[0].common_name} + ?`;
    } else {
      const a = comparePair[0];
      const b = comparePair[1];
      const shared = (a.shared_genes || []).filter((g) =>
        (b.shared_genes || []).includes(g)
      );
      compareBanner.textContent =
        shared.length > 0
          ? `${a.common_name} ↔ ${b.common_name} · ${shared.length} shared`
          : `${a.common_name} ↔ ${b.common_name} · distant threads`;
    }
  }

  // Pointer
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    dragging = true;
    canvas.classList.add("dragging");
    lastPtr = { x: e.clientX, y: e.clientY, moved: false };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (dragging && lastPtr) {
      const dx = e.clientX - lastPtr.x;
      const dy = e.clientY - lastPtr.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) lastPtr.moved = true;
      cam.x -= dx / cam.z;
      cam.y -= dy / cam.z;
      lastPtr.x = e.clientX;
      lastPtr.y = e.clientY;
      needsEdgeRebuild = true;
    } else {
      hover = hitTest(e.clientX, e.clientY);
      canvas.style.cursor = hover && hover.common_name ? "pointer" : "grab";
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    const moved = lastPtr && lastPtr.moved;
    dragging = false;
    canvas.classList.remove("dragging");
    lastPtr = null;
    if (moved) return;
    const n = hitTest(e.clientX, e.clientY);
    if (!n || !n.common_name) {
      if (!compareMode) closeChamber();
      return;
    }
    if (compareMode) {
      if (comparePair.includes(n)) {
        comparePair = comparePair.filter((x) => x !== n);
      } else if (comparePair.length >= 2) {
        comparePair = [n];
      } else {
        comparePair.push(n);
      }
      updateCompareBanner();
      if (comparePair.length === 2) {
        // Open chamber for first with overlap note
        openChamber(comparePair[0]);
        const shared = (comparePair[0].shared_genes || []).filter((g) =>
          (comparePair[1].shared_genes || []).includes(g)
        );
        const note = document.createElement("div");
        note.className = "chamber-note";
        note.textContent = `Overlap with ${comparePair[1].common_name}: ${
          shared.length ? shared.join(", ") : "no stub-shared genes — hyphae still reach"
        }`;
        chamberBody.insertBefore(note, chamberBody.firstChild);
      }
      return;
    }
    openChamber(n);
  });
  canvas.addEventListener("pointercancel", () => {
    dragging = false;
    canvas.classList.remove("dragging");
    lastPtr = null;
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const before = worldFromScreen(e.clientX, e.clientY);
      const factor = e.deltaY > 0 ? 0.92 : 1.09;
      cam.z = Math.min(3.2, Math.max(0.22, cam.z * factor));
      const after = worldFromScreen(e.clientX, e.clientY);
      cam.x += before.x - after.x;
      cam.y += before.y - after.y;
      needsEdgeRebuild = true;
    },
    { passive: false }
  );

  document.getElementById("btn-close-chamber")?.addEventListener("click", closeChamber);
  document.getElementById("btn-compare")?.addEventListener("click", () => {
    compareMode = !compareMode;
    comparePair = [];
    const btn = document.getElementById("btn-compare");
    btn.classList.toggle("active", compareMode);
    updateCompareBanner();
    if (!compareMode) closeChamber();
  });
  document.getElementById("btn-calm")?.addEventListener("click", () => {
    app.classList.toggle("calm");
  });

  window.addEventListener("resize", resize);

  async function boot() {
    resize();
    try {
      const res = await fetch("/api/organisms/", { credentials: "same-origin" });
      const data = await res.json();
      coreNodes = (data.organisms || []).map((o) => ({
        ...o,
        r: CORE_R,
        glow: o.glow && o.glow.startsWith("#c") ? EMBER : TEAL,
        procedural: false,
        born: performance.now(),
      }));
      for (const n of coreNodes) {
        if (n.slug && n.slug.includes("psilocybe")) n.glow = EMBER;
      }
    } catch (err) {
      console.warn("organisms fetch failed", err);
      coreNodes = [];
    }
    needsEdgeRebuild = true;
    requestAnimationFrame(draw);
  }

  boot();
})();
