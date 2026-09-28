/**
 * Hyphaneural Django map — authenticated organism chamber (local app)
 * -------------------------------------------------------------------
 * WHAT: Canvas map of organisms with pan/zoom, chamber detail, compare.
 * WHY:  Separate from the static Pages demo; same Quiet Protomol tokens.
 * LOAD: Minified → static/js/map.js. Edit src/js/map.js.
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

  // Quiet Protomol — living teal threads (#0B8A8F-ish), ember only on special foci
  const TEAL = [11, 138, 143];
  const TEAL_SOFT = [61, 158, 143];
  const EMBER = [196, 120, 74];
  const VOID = "#07090b";

  const cam = { x: 0, y: 0, z: 1 };
  let coreNodes = [];
  let procNodes = new Map(); // key "cx,cy" -> node
  let filaments = []; // organic hyphal strands
  let selected = null;
  let compareMode = false;
  let comparePair = [];
  let hover = null;
  let dragging = false;
  let lastPtr = null;
  let dim = 0;
  let animT = 0;
  let needsRebuild = true;

  const CELL = 260;
  const PROC_R = 3.8;
  const CORE_R = 7;

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

  function seeded(h) {
    // return next-hash + float in [0,1)
    const n = (Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul((h << 13) ^ h, 3266489909)) >>> 0;
    return { h: n, v: (n % 10000) / 10000 };
  }

  function makeProcNode(cx, cy) {
    const h = hash2(cx, cy);
    // Sparse tips — mycelium density, not a dense graph
    if (rand01(h) > 0.46) return null;
    const ox = (rand01(h >> 3) - 0.5) * CELL * 0.72;
    const oy = (rand01(h >> 7) - 0.5) * CELL * 0.72;
    const x = cx * CELL + CELL / 2 + ox;
    const y = cy * CELL + CELL / 2 + oy;
    for (const c of coreNodes) {
      const dx = c.x - x;
      const dy = c.y - y;
      if (dx * dx + dy * dy < 70 * 70) return null;
    }
    const ember = rand01(h >> 11) < 0.04;
    return {
      id: `p-${cx}-${cy}`,
      x,
      y,
      r: PROC_R * (0.45 + rand01(h >> 15) * 0.7),
      glow: ember ? EMBER : TEAL_SOFT,
      procedural: true,
      born: performance.now(),
      label: null,
      common_name: null,
      degree: 0,
    };
  }

  function ensureProcedural() {
    const margin = 1.4;
    const halfW = (window.innerWidth / cam.z) * 0.5 * margin;
    const halfH = (window.innerHeight / cam.z) * 0.5 * margin;
    const exploreBoost = Math.max(0, Math.log2(1 / cam.z + 0.01)) * 0.45;
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
        procNodes.set(key, n);
        if (n) added = true;
      }
    }
    if (added) needsRebuild = true;
  }

  function allNodes() {
    const list = coreNodes.slice();
    for (const n of procNodes.values()) {
      if (n) list.push(n);
    }
    return list;
  }

  /**
   * Build organic control points between two world positions.
   * Multi-segment wavy polyline with irregular perpendicular offsets.
   */
  function organicControls(ax, ay, bx, by, seed, ampScale) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    // More segments → visibly wavy, not a single soft arc
    const segs = Math.max(4, Math.min(10, Math.round(len / 38)));
    const pts = [{ x: ax, y: ay }];
    let h = seed;
    // Strong bow + secondary S-curve so strands wander like hyphae
    const bow = (seeded(h).v - 0.5) * len * 0.22 * ampScale;
    h = seeded(h).h;
    const bow2 = (seeded(h).v - 0.5) * len * 0.16 * ampScale;
    h = seeded(h).h;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const envelope = Math.sin(t * Math.PI);
      const sCurve = Math.sin(t * Math.PI * 2);
      const s = seeded(h);
      h = s.h;
      const s2 = seeded(h);
      h = s2.h;
      const wobble = (s.v - 0.5) * len * (0.12 + 0.16 * ampScale) * envelope;
      const along = (s2.v - 0.5) * (len / segs) * 0.55;
      const lateral = nx * (wobble + bow * envelope + bow2 * sCurve) + (dx / len) * along;
      const lateraly = ny * (wobble + bow * envelope + bow2 * sCurve) + (dy / len) * along;
      pts.push({ x: ax + dx * t + lateral, y: ay + dy * t + lateraly });
    }
    pts.push({ x: bx, y: by });
    return pts;
  }

  /** Catmull-Rom → cubic Bezier segments for smooth organic stroke */
  function strokeCatmull(ctx, pts, tension) {
    if (pts.length < 2) return;
    const t = tension == null ? 0.5 : tension;
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
      return;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : pts.length - 1];
      const cp1x = p1.x + ((p2.x - p0.x) * t) / 6;
      const cp1y = p1.y + ((p2.y - p0.y) * t) / 6;
      const cp2x = p2.x - ((p3.x - p1.x) * t) / 6;
      const cp2y = p2.y - ((p3.y - p1.y) * t) / 6;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  function sampleCatmull(pts, samples) {
    // Approximate polyline for tapered multi-stroke
    if (pts.length < 2) return pts.slice();
    const out = [];
    const n = Math.max(samples, pts.length * 3);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const f = u * (pts.length - 1);
      const i0 = Math.floor(f);
      const t = f - i0;
      const p0 = pts[Math.max(0, i0 - 1)];
      const p1 = pts[i0];
      const p2 = pts[Math.min(pts.length - 1, i0 + 1)];
      const p3 = pts[Math.min(pts.length - 1, i0 + 2)];
      const t2 = t * t;
      const t3 = t2 * t;
      // Catmull-Rom
      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out.push({ x, y });
    }
    return out;
  }

  function makeFilament(a, b, opts) {
    opts = opts || {};
    const seed = opts.seed != null ? opts.seed : hash2(Math.floor(a.x * 10), Math.floor(b.y * 10) ^ Math.floor(b.x));
    const amp = opts.amp != null ? opts.amp : 1;
    const controls = organicControls(a.x, a.y, b.x, b.y, seed, amp);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    return {
      a,
      b,
      controls,
      seed,
      w: opts.w != null ? opts.w : Math.max(0.15, 1 - dist / 380),
      shared: !!opts.shared,
      genes: opts.genes || null,
      kind: opts.kind || "primary",
      born: opts.born != null ? opts.born : performance.now(),
      hubA: !!(a && (a.id || a.common_name) && !a.procedural),
      hubB: !!(b && (b.id || b.common_name) && !b.procedural),
    };
  }

  function rebuildFilaments() {
    filaments = [];
    const nodes = allNodes();
    for (const n of nodes) n.degree = 0;

    const maxDist = 300;
    const maxDist2 = maxDist * maxDist;
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
    const now = performance.now();

    // Sparse primary hyphae — fewer graph edges, more curve
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const bx = Math.floor(a.x / bSize);
      const by = Math.floor(a.y / bSize);
      const candidates = [];
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
            if (d2 > maxDist2 || d2 < 48 * 48) continue;
            candidates.push({ j, b, d2 });
          }
        }
      }
      candidates.sort((u, v) => u.d2 - v.d2);
      let degree = 0;
      const maxDeg = a.procedural ? 2 : 3;
      for (const c of candidates) {
        if (degree >= maxDeg) break;
        if (c.b.degree >= (c.b.procedural ? 2 : 4)) continue;
        const h = hash2(Math.floor(a.x), Math.floor(c.b.x) ^ Math.floor(c.b.y * 3));
        if (rand01(h) > 0.48 && degree >= 1) continue;
        const key = i < c.j ? i + "-" + c.j : c.j + "-" + i;
        if (linked.has(key)) continue;
        linked.add(key);
        const fil = makeFilament(a, c.b, {
          seed: h,
          w: 1 - Math.sqrt(c.d2) / maxDist,
          kind: "primary",
          amp: 1.05 + rand01(h >> 5) * 0.45,
          born: a.born || c.b.born || now,
        });
        filaments.push(fil);
        a.degree++;
        c.b.degree++;
        degree++;

        // Mid-hypha forks (1–2) — the mycelial signature
        const forks = rand01(h >> 9) < 0.55 ? (rand01(h >> 11) < 0.4 ? 2 : 1) : 0;
        for (let f = 0; f < forks; f++) {
          const ctrls = fil.controls;
          const idx = Math.max(1, Math.min(ctrls.length - 2, Math.floor(ctrls.length * (0.35 + rand01(h >> (14 + f)) * 0.35))));
          const mid = ctrls[idx];
          const baseAng = Math.atan2(ctrls[idx].y - ctrls[idx - 1].y, ctrls[idx].x - ctrls[idx - 1].x);
          const ang = baseAng + (rand01(h >> (16 + f)) - 0.5) * Math.PI * 1.1 + (f === 1 ? Math.PI * 0.55 : 0);
          const blen = 55 + rand01(h >> (18 + f)) * 120;
          // Multi-segment wandering tip (not a straight stub)
          let px = mid.x;
          let py = mid.y;
          let pang = ang;
          let prev = mid;
          const steps = 2 + Math.floor(rand01(h >> (20 + f)) * 2);
          for (let s = 0; s < steps; s++) {
            const slen = blen / steps;
            pang += (rand01(hash2(h, s + f * 9)) - 0.5) * 0.9;
            px += Math.cos(pang) * slen;
            py += Math.sin(pang) * slen;
            const tip = { x: px, y: py, procedural: true, r: 2 };
            filaments.push(
              makeFilament(prev, tip, {
                seed: h ^ (0xabc1 + f * 97 + s * 13),
                w: fil.w * (0.5 - s * 0.12),
                kind: "branch",
                amp: 1.25,
                born: fil.born,
              })
            );
            prev = tip;
          }
        }
      }
    }

    // Exploratory secondary filaments from every tip/hub — weave density
    for (const n of nodes) {
      const h0 = hash2(Math.floor(n.x * 2), Math.floor(n.y * 2));
      const count = n.procedural
        ? rand01(h0) < 0.62
          ? 1 + (rand01(h0 >> 2) < 0.35 ? 1 : 0)
          : (rand01(h0 >> 5) < 0.2 ? 1 : 0)
        : 1 + (rand01(h0) < 0.45 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const h = h0 ^ (k * 7919);
        let ang = rand01(h >> 4) * Math.PI * 2;
        let px = n.x;
        let py = n.y;
        let prev = n;
        const steps = 2 + Math.floor(rand01(h >> 8) * 3);
        const blen = 45 + rand01(h >> 10) * 130;
        for (let s = 0; s < steps; s++) {
          ang += (rand01(hash2(h, s + 3)) - 0.5) * 1.0;
          const slen = blen / steps;
          px += Math.cos(ang) * slen;
          py += Math.sin(ang) * slen;
          const tip = { x: px, y: py, procedural: true, r: 1.5 };
          filaments.push(
            makeFilament(prev, tip, {
              seed: h ^ (0x55aa + s * 31),
              w: 0.18 + rand01(h >> 12) * 0.22 * (1 - s / steps),
              kind: "secondary",
              amp: 1.3,
              born: n.born || now,
            })
          );
          prev = tip;
        }
      }
    }

    // Cell-local wandering felt — filaments that are NOT node-to-node edges
    for (const [key, n] of procNodes) {
      if (!n) continue;
      const parts = key.split(",");
      const cx = +parts[0];
      const cy = +parts[1];
      const h = hash2(cx * 17, cy * 29);
      if (rand01(h) > 0.5) continue;
      const ang0 = rand01(h >> 2) * Math.PI * 2;
      let px = n.x + (rand01(h >> 5) - 0.5) * 30;
      let py = n.y + (rand01(h >> 7) - 0.5) * 30;
      let prev = { x: px, y: py, procedural: true, r: 1 };
      let ang = ang0;
      const steps = 3 + Math.floor(rand01(h >> 9) * 3);
      for (let s = 0; s < steps; s++) {
        ang += (rand01(hash2(h, s + 40)) - 0.5) * 1.15;
        const slen = 28 + rand01(hash2(h, s + 50)) * 42;
        px += Math.cos(ang) * slen;
        py += Math.sin(ang) * slen;
        const tip = { x: px, y: py, procedural: true, r: 1 };
        filaments.push(
          makeFilament(prev, tip, {
            seed: h ^ (0xf00d + s),
            w: 0.12 + 0.1 * (1 - s / steps),
            kind: "secondary",
            amp: 1.35,
            born: n.born || now,
          })
        );
        prev = tip;
      }
    }

    // Gentle anastomoses — merge nearby midpoints
    const primaries = filaments.filter((f) => f.kind === "primary" || f.kind === "branch");
    const maxAna = Math.min(70, Math.floor(primaries.length * 0.18));
    let ana = 0;
    for (let i = 0; i < primaries.length && ana < maxAna; i++) {
      const f1 = primaries[i];
      const m1 = f1.controls[Math.floor(f1.controls.length / 2)];
      for (let j = i + 1; j < primaries.length && ana < maxAna; j++) {
        const f2 = primaries[j];
        if (f1.a === f2.a || f1.a === f2.b || f1.b === f2.a || f1.b === f2.b) continue;
        const m2 = f2.controls[Math.floor(f2.controls.length / 2)];
        const ddx = m1.x - m2.x;
        const ddy = m1.y - m2.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 > 110 * 110 || d2 < 14 * 14) continue;
        const h = hash2(Math.floor(m1.x), Math.floor(m2.y));
        if (rand01(h) > 0.45) continue;
        filaments.push(
          makeFilament(m1, m2, {
            seed: h,
            w: 0.22,
            kind: "anastomosis",
            amp: 0.95,
            born: Math.max(f1.born, f2.born),
          })
        );
        ana++;
        break;
      }
    }

    // Shared-gene hyphae between core organisms
    for (let i = 0; i < coreNodes.length; i++) {
      for (let j = i + 1; j < coreNodes.length; j++) {
        const a = coreNodes[i];
        const b = coreNodes[j];
        const shared = (a.shared_genes || []).filter((g) => (b.shared_genes || []).includes(g));
        if (!shared.length) continue;
        filaments.push(
          makeFilament(a, b, {
            seed: hash2(Math.floor(a.x), Math.floor(b.y)),
            w: 0.9,
            shared: true,
            genes: shared,
            kind: "shared",
            amp: 1.25,
            born: now,
          })
        );
      }
    }

    needsRebuild = false;
  }

  function hitTest(sx, sy) {
    const w = worldFromScreen(sx, sy);
    let best = null;
    let bestD = Infinity;
    for (const n of allNodes()) {
      if (!n.common_name && n.procedural) {
        if (cam.z < 0.85) continue;
      }
      const dx = n.x - w.x;
      const dy = n.y - w.y;
      const hitR = (n.r || CORE_R) + 10 / cam.z;
      const d2 = dx * dx + dy * dy;
      if (d2 < hitR * hitR && d2 < bestD) {
        bestD = d2;
        best = n;
      }
    }
    return best;
  }

  function filamentAge(f) {
    if (!f.born) return 1;
    const age = Math.min(1, (animT - f.born) / 1600);
    return age * age * (3 - 2 * age);
  }

  /** Live drift: subtle perpendicular sway on control points (calm, deterministic) */
  function driftedControls(f) {
    const pts = f.controls;
    if (pts.length < 3) return pts;
    const out = new Array(pts.length);
    out[0] = pts[0];
    out[pts.length - 1] = pts[pts.length - 1];
    const phase = animT * 0.00035 + (f.seed % 1000) * 0.01;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const t = i / (pts.length - 1);
      const env = Math.sin(t * Math.PI);
      const drift = Math.sin(phase + i * 0.7) * 1.2 * env;
      // perpendicular approx from neighbors
      const dx = pts[i + 1].x - pts[i - 1].x;
      const dy = pts[i + 1].y - pts[i - 1].y;
      const len = Math.hypot(dx, dy) || 1;
      out[i] = {
        x: p.x + (-dy / len) * drift,
        y: p.y + (dx / len) * drift,
      };
    }
    return out;
  }

  /** Project filament to screen, exaggerating wander when zoomed out so hyphae stay organic */
  function screenOrganicPoints(f) {
    const pts = driftedControls(f);
    const n = pts.length;
    if (n < 3) return pts.map((p) => screenFromWorld(p.x, p.y));
    const a = pts[0];
    const b = pts[n - 1];
    // Keep screen-space curvature similar across zoom levels
    const zoomCurve = Math.min(3.0, Math.pow(1 / Math.max(cam.z, 0.2), 0.7));
    const out = new Array(n);
    out[0] = screenFromWorld(a.x, a.y);
    out[n - 1] = screenFromWorld(b.x, b.y);
    for (let i = 1; i < n - 1; i++) {
      const t = i / (n - 1);
      const chordX = a.x + (b.x - a.x) * t;
      const chordY = a.y + (b.y - a.y) * t;
      const ex = chordX + (pts[i].x - chordX) * zoomCurve;
      const ey = chordY + (pts[i].y - chordY) * zoomCurve;
      out[i] = screenFromWorld(ex, ey);
    }
    return out;
  }

  function drawFilament(f, w, h) {
    const age = filamentAge(f);
    if (age < 0.02) return;

    const screenPts = screenOrganicPoints(f);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of screenPts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = 70;
    if (maxX < -pad || minX > w + pad || maxY < -pad || minY > h + pad) return;

    const isCompare =
      comparePair.length === 2 &&
      f.a &&
      f.b &&
      ((f.a === comparePair[0] && f.b === comparePair[1]) ||
        (f.a === comparePair[1] && f.b === comparePair[0]) ||
        (f.shared && comparePair.includes(f.a) && comparePair.includes(f.b)));

    const sharedHighlight =
      comparePair.length === 2 &&
      f.shared &&
      f.a &&
      f.b &&
      comparePair.includes(f.a) &&
      comparePair.includes(f.b);

    let col = TEAL;
    let baseAlpha = 0.06 + f.w * 0.1;
    if (f.kind === "branch" || f.kind === "secondary") baseAlpha *= 0.85;
    if (f.kind === "anastomosis") baseAlpha *= 0.6;
    if (f.shared) {
      baseAlpha = 0.2;
      col = TEAL_SOFT;
    }
    if (sharedHighlight || isCompare) {
      col = EMBER;
      baseAlpha = 0.5;
    }

    if (f.shared && !sharedHighlight) {
      baseAlpha += 0.03 * Math.sin(animT * 0.0008 + (f.seed % 200) * 0.02);
    } else if (f.kind === "primary") {
      baseAlpha += 0.01 * Math.sin(animT * 0.00055 + (f.seed % 300) * 0.015);
    }

    const alpha = Math.max(0, baseAlpha * age * (1 - dim * 0.55));
    // Keep filaments readable when zoomed out (avoid star-chart dots)
    const zScale = 0.5 + 0.55 * Math.min(cam.z, 1.6);

    let hubBoost = 1;
    if (f.hubA || f.hubB) hubBoost = 1.4;
    if (f.kind === "shared") hubBoost = 1.65;
    if (f.kind === "branch" || f.kind === "secondary") hubBoost = 0.65;
    if (f.kind === "anastomosis") hubBoost = 0.5;

    const baseLw = (0.65 + f.w * 1.25) * hubBoost * zScale;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (sharedHighlight || isCompare) {
      ctx.beginPath();
      strokeCatmull(ctx, screenPts, 1.0);
      ctx.strokeStyle = `rgba(${EMBER[0]},${EMBER[1]},${EMBER[2]},${0.4 * age})`;
      ctx.lineWidth = Math.max(2.0, baseLw * 2.2);
      ctx.stroke();
    }

    // Soft outer glow — continuous organic curve
    ctx.beginPath();
    strokeCatmull(ctx, screenPts, 1.0);
    ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha * 0.38})`;
    ctx.lineWidth = Math.max(3.5, baseLw * 4.2);
    ctx.stroke();

    // Core filament — smooth Catmull-Rom (the mycelial stroke)
    ctx.beginPath();
    strokeCatmull(ctx, screenPts, 1.0);
    ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`;
    ctx.lineWidth = Math.max(0.55, baseLw);
    ctx.stroke();

    // Taper accents near hubs / tips using short smooth end-caps (not jagged polylines)
    if (screenPts.length >= 3 && (f.kind === "primary" || f.kind === "shared" || f.kind === "branch")) {
      const n = screenPts.length;
      if (f.hubA || f.kind === "shared") {
        const head = screenPts.slice(0, Math.min(4, n));
        ctx.beginPath();
        strokeCatmull(ctx, head, 1.0);
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha * 0.7})`;
        ctx.lineWidth = baseLw * 1.55;
        ctx.stroke();
      }
      if (f.hubB || f.kind === "shared") {
        const tail = screenPts.slice(Math.max(0, n - 4));
        ctx.beginPath();
        strokeCatmull(ctx, tail, 1.0);
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha * 0.7})`;
        ctx.lineWidth = baseLw * 1.55;
        ctx.stroke();
      }
      if (f.kind === "branch" || f.kind === "secondary") {
        // thicker at root, fade tip
        const root = screenPts.slice(0, Math.min(3, n));
        ctx.beginPath();
        strokeCatmull(ctx, root, 1.0);
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha * 0.75})`;
        ctx.lineWidth = baseLw * 1.45;
        ctx.stroke();
      }
    }
  }

  function draw() {
    animT = performance.now();
    ensureProcedural();
    if (needsRebuild) rebuildFilaments();

    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, w, h);

    // Soft vignette field — Meditative Expanse
    const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, "rgba(11,138,143,0.035)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Draw hyphal weave FIRST — dominant visual
    // Layer: anastomoses + secondary under, primary mid, shared on top
    const layers = { anastomosis: [], secondary: [], branch: [], primary: [], shared: [] };
    for (const f of filaments) {
      const k = layers[f.kind] ? f.kind : "primary";
      layers[k].push(f);
    }
    for (const key of ["anastomosis", "secondary", "branch", "primary", "shared"]) {
      for (const f of layers[key]) drawFilament(f, w, h);
    }

    // Nodes as soft foci / junctions / tips — subordinate to weave
    const nodes = allNodes();
    for (const n of nodes) {
      const s = screenFromWorld(n.x, n.y);
      if (s.x < -40 || s.x > w + 40 || s.y < -40 || s.y > h + 40) continue;

      let age = 1;
      if (n.born) {
        age = Math.min(1, (animT - n.born) / 1200);
        age = age * age * (3 - 2 * age);
      }

      const isCore = !n.procedural;
      const isSel = selected === n || comparePair.includes(n);
      const isHov = hover === n;
      const col = n.glow || TEAL_SOFT;
      const baseR = (n.r || (isCore ? CORE_R : PROC_R)) * age;
      const r = baseR * (isHov || isSel ? 1.3 : 1) * Math.min(1.1, 0.5 + cam.z * 0.45);

      // Soft outer bloom
      const glowR = r * (isCore ? 3.8 : 2.8);
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glowR);
      const ga = (isCore ? 0.28 : 0.12) * age * (1 - dim * 0.5);
      grad.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${ga})`);
      grad.addColorStop(0.45, `rgba(${col[0]},${col[1]},${col[2]},${ga * 0.35})`);
      grad.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Small luminous tip / junction (not big graph dots)
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(isCore ? 0.72 : 0.4) * age})`;
      ctx.fill();

      if (isSel) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${EMBER[0]},${EMBER[1]},${EMBER[2]},0.65)`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }

      if (isCore && n.common_name && cam.z > 0.45) {
        ctx.font = "11px IBM Plex Sans, system-ui, sans-serif";
        ctx.fillStyle = `rgba(212,220,226,${0.5 * age * (1 - dim * 0.4)})`;
        ctx.textAlign = "center";
        ctx.fillText(n.common_name, s.x, s.y + r + 13);
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

  function geneStubFallback(geneId) {
    const stubs = (typeof window !== "undefined" && window.HYPHA_GENES) || {};
    const g = stubs[String(geneId).toUpperCase()];
    if (g) return g;
    return {
      id: geneId,
      name: geneId,
      role: "Stub gene — wire to NCBI / Ensembl Fungi later",
      steps: [
        { stage: "DNA", label: geneId + " locus", seq_hint: "…" },
        { stage: "RNA", label: "transcript", seq_hint: "…" },
        { stage: "Protein", label: "product", seq_hint: "…" },
      ],
    };
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
    let data = null;
    try {
      const res = await fetch(`/api/genes/${encodeURIComponent(geneId)}/`, {
        credentials: "same-origin",
      });
      if (res.ok) data = await res.json();
    } catch (err) {
      /* static demo / pages — no API */
    }
    if (!data) {
      try {
        const res2 = await fetch("data/genes.json");
        if (res2.ok) {
          const all = await res2.json();
          data = all[String(geneId).toUpperCase()] || null;
        }
      } catch (err2) {
        /* ignore */
      }
    }
    if (!data) data = geneStubFallback(geneId);
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
    const els = track.querySelectorAll(".dogma-step");
    els.forEach((el, i) => {
      setTimeout(() => el.classList.add("lit"), 280 + i * 420);
    });
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
      const shared = (a.shared_genes || []).filter((g) => (b.shared_genes || []).includes(g));
      compareBanner.textContent =
        shared.length > 0
          ? `${a.common_name} ↔ ${b.common_name} · ${shared.length} shared`
          : `${a.common_name} ↔ ${b.common_name} · distant threads`;
    }
  }

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

  function mapOrganisms(list) {
    return (list || []).map((o) => ({
      ...o,
      x: o.map_x != null ? o.map_x : o.x,
      y: o.map_y != null ? o.map_y : o.y,
      r: CORE_R,
      glow: o.glow && (o.glow.startsWith("#c") || o.glow.startsWith("#C")) ? EMBER : TEAL_SOFT,
      procedural: false,
      born: performance.now(),
      degree: 0,
    }));
  }

  async function loadOrganismsPayload() {
    // 1) Django API (login session) when available
    try {
      const res = await fetch("/api/organisms/", { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        if (data && data.organisms && data.organisms.length) return data.organisms;
      }
    } catch (err) {
      /* Pages / static — expected */
    }
    // 2) Embedded seed from demo HTML
    if (typeof window !== "undefined" && window.HYPHA_SEED && window.HYPHA_SEED.length) {
      return window.HYPHA_SEED;
    }
    // 3) Relative JSON next to the demo page
    const candidates = ["data/organisms.json", "./data/organisms.json"];
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (data && data.organisms && data.organisms.length) return data.organisms;
      } catch (err) {
        /* try next */
      }
    }
    return [];
  }

  async function boot() {
    resize();
    try {
      const list = await loadOrganismsPayload();
      coreNodes = mapOrganisms(list);
      for (const n of coreNodes) {
        if (n.slug && n.slug.includes("psilocybe")) n.glow = EMBER;
      }
      if (!coreNodes.length) console.warn("organisms: no seed / API data");
    } catch (err) {
      console.warn("organisms load failed", err);
      coreNodes = [];
    }
    needsRebuild = true;
    requestAnimationFrame(draw);
  }

  boot();
})();
