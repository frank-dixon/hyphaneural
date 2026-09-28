/**
 * Hyphaneural — multi-space canvas renderer
 * -----------------------------------------
 * WHAT: One SpaceCanvas class, four visual modes (hex / strand / atlas / void).
 *       Draws faint hex lattice, growing hyphae, gene/organism nodes, and
 *       (in Strand Zoom deep lod) a teaching DNA strand near the focus gene.
 * WHY:  Ember is accent-only (SUC2 tip, rare void sparks) — never the BG wash.
 *       Camera ease + reduced-motion paths keep the Slow Ombre feel calm.
 *       Pointer: vertical-dominant pans the field; horizontal yields to the
 *       mode dial (window.__hyphaDialGesture) so spaces feel like a dial.
 * LOAD: Minified → docs/js/canvas.js. Edit src/js/canvas.js.
 */
(function (global) {
  'use strict';

  const TEAL = '#0B8A8F';
  const TEAL_BRIGHT = '#12A0A6';
  const TEAL_DEEP = '#087075';
  const EMBER = '#c4784a';
  const WHITE = 'rgba(255,255,255,';
  const FORM_COLOR = {
    yeast: '#0B8A8F',
    mold: '#7a9ec4',
    mushroom: '#a8c47a',
    pathogen: '#c4784a',
    other: '#8a9aa8',
  };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }
  function formKind(form) {
    const f = (form || '').toLowerCase();
    if (f.indexOf('pathogen') >= 0 || f.indexOf('rust') >= 0 || f.indexOf('smut') >= 0 || f.indexOf('chytrid') >= 0) return 'pathogen';
    if (f.indexOf('mushroom') >= 0 || f.indexOf('ectomycorrhizal') >= 0 || f.indexOf('white-rot') >= 0 || f.indexOf('ink-cap') >= 0) return 'mushroom';
    if (f.indexOf('mold') >= 0 || f.indexOf('filamentous') >= 0 || f.indexOf('necrotroph') >= 0 || f.indexOf('zygote') >= 0) return 'mold';
    if (f.indexOf('yeast') >= 0) return 'yeast';
    return 'other';
  }
  function bez(p0, p1, p2, t) {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    };
  }
  function seeded(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

    /** Per-space canvas. mode: hex | strand | atlas | void */
  function SpaceCanvas(canvas, mode, opts) {
    this.canvas = canvas;
    this.mode = mode || 'strand';
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.opts = opts || {};
    this.onGeneClick = this.opts.onGeneClick;
    this.onOrgClick = this.opts.onOrgClick;
    this.genes = [];
    this.orgs = [];
    this.hyphae = [];
    this.bgHyphae = [];
    this.nodes = [];
    this.highlightId = null;
    this.pulseIds = new Set();
    this.t0 = performance.now();
    this.growT0 = performance.now();
    this.running = false;
    this._raf = null;
    this._calm = reducedMotion();
    this.cam = { x: 0, y: 0, scale: 1, tx: 0, ty: 0, ts: 1 };
    this.lodLevel = 0;
    this.zoomLevel = 0; // strand: 0 field · 1 lattice · 2 strand
    this._dragging = false;
    this._lastPtr = null;
    this._moved = false;
    this.active = false;
    this._bind();
  }

  SpaceCanvas.prototype._bind = function () {
    this._resize = this.resize.bind(this);
    this._onPtr = (e) => {
      if (!this.active) return;
      if (global.__hyphaDialGesture) return;
      this._dragging = true;
      this._moved = false;
      this._ptrAxis = null;
      this._lastPtr = { x: e.clientX, y: e.clientY };
      this._ptrOrigin = { x: e.clientX, y: e.clientY };
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    };
    this._onMove = (e) => {
      if (!this.active || !this._dragging || !this._lastPtr) return;
      if (global.__hyphaDialGesture) { this._dragging = false; return; }
      const dx = e.clientX - this._lastPtr.x;
      const dy = e.clientY - this._lastPtr.y;
      const odx = e.clientX - this._ptrOrigin.x;
      const ody = e.clientY - this._ptrOrigin.y;
      if (!this._ptrAxis && Math.abs(odx) + Math.abs(ody) > 10) {
        this._ptrAxis = Math.abs(odx) > Math.abs(ody) * 1.15 ? 'x' : 'y';
        if (this._ptrAxis === 'x') {
          // yield to mode dial
          this._dragging = false;
          global.__hyphaDialGesture = true;
          return;
        }
      }
      if (this._ptrAxis === 'x') return;
      if (Math.abs(dx) + Math.abs(dy) > 3) this._moved = true;
      this.cam.tx -= dx / (this.cam.scale || 1);
      this.cam.ty -= dy / (this.cam.scale || 1);
      this._lastPtr = { x: e.clientX, y: e.clientY };
    };
    this._onUp = (e) => {
      if (!this.active) return;
      const wasDrag = this._dragging;
      const moved = this._moved;
      this._dragging = false;
      this._lastPtr = null;
      if (wasDrag && !moved) this._hit(e.clientX, e.clientY);
    };
    this._onWheel = (e) => {
      if (!this.active) return;
      if (this.mode === 'strand') {
        e.preventDefault();
        const dir = e.deltaY > 0 ? -1 : 1;
        this.setZoomLevel(clamp(this.zoomLevel + dir, 0, 2));
      } else if (this.mode === 'atlas' || this.mode === 'hex') {
        e.preventDefault();
        const f = e.deltaY > 0 ? 0.94 : 1.06;
        this.cam.ts = clamp(this.cam.ts * f, 0.45, 2.8);
      }
    };
    window.addEventListener('resize', this._resize);
    this.canvas.addEventListener('pointerdown', this._onPtr);
    this.canvas.addEventListener('pointermove', this._onMove);
    this.canvas.addEventListener('pointerup', this._onUp);
    this.canvas.addEventListener('pointercancel', this._onUp);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
  };

  SpaceCanvas.prototype.setActive = function (on) {
    this.active = !!on;
    if (on) this.resize();
  };

  SpaceCanvas.prototype.resize = function () {
    const parent = this.canvas.parentElement || this.canvas;
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.w = w;
    this.h = h;
    this.cx = w * 0.5;
    this.cy = h * 0.48;
    this._layout();
  };

  SpaceCanvas.prototype.setGenes = function (list) {
    this.genes = list || [];
    this.growT0 = performance.now();
    this._layout();
  };

  SpaceCanvas.prototype.setOrgs = function (list) {
    this.orgs = list || [];
    this._layout();
  };

  SpaceCanvas.prototype.setHighlight = function (id) {
    this.highlightId = id;
    if (id) this._focusGene(id);
  };

  SpaceCanvas.prototype.pulseGene = function (id, on) {
    if (on) this.pulseIds.add(id);
    else this.pulseIds.delete(id);
  };

  SpaceCanvas.prototype.setLod = function (level, geneId) {
    this.lodLevel = clamp(level | 0, 0, 2);
    if (this.mode === 'strand') this.setZoomLevel(this.lodLevel, geneId);
    else if (geneId) this._focusGene(geneId);
  };

  SpaceCanvas.prototype.setZoomLevel = function (z, geneId) {
    this.zoomLevel = clamp(z | 0, 0, 2);
    const zooms = this._calm ? [0.95, 1.05, 1.15] : [0.7, 1.35, 2.15];
    this.cam.ts = zooms[this.zoomLevel];
    if (geneId) this._focusGene(geneId);
    else if (this.zoomLevel === 0) { this.cam.tx = 0; this.cam.ty = 0; }
    if (this.opts.onZoom) this.opts.onZoom(this.zoomLevel);
  };

  SpaceCanvas.prototype.replayGrowth = function () {
    this.growT0 = performance.now();
    if (this.mode === 'strand') {
      this.cam.ts = this._calm ? 0.95 : 0.55;
      this.cam.tx = 0; this.cam.ty = 0;
      setTimeout(() => { this.cam.ts = this._calm ? 0.95 : 0.7; }, 80);
    }
  };

  SpaceCanvas.prototype.geneScreenPos = function (id) {
    const n = this.nodes.find((x) => x.id === id);
    if (!n) return null;
    return this._worldToScreen(n.x, n.y);
  };

  SpaceCanvas.prototype._focusGene = function (id) {
    const n = this.nodes.find((x) => x.id === id);
    if (!n) return;
    this.cam.tx = n.x;
    this.cam.ty = n.y;
  };

  SpaceCanvas.prototype._worldToScreen = function (x, y) {
    return {
      x: this.cx + (x - this.cam.x) * this.cam.scale,
      y: this.cy + (y - this.cam.y) * this.cam.scale,
    };
  };

  SpaceCanvas.prototype._screenToWorld = function (sx, sy) {
    return {
      x: this.cam.x + (sx - this.cx) / this.cam.scale,
      y: this.cam.y + (sy - this.cy) / this.cam.scale,
    };
  };

  SpaceCanvas.prototype._hit = function (clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const w = this._screenToWorld(sx, sy);
    const hitR = 28 / this.cam.scale;
    let best = null, bestD = hitR;
    this.nodes.forEach((n) => {
      const d = Math.hypot(n.x - w.x, n.y - w.y);
      if (d < bestD) { bestD = d; best = n; }
    });
    if (!best) return;
    if (best.kind === 'gene' && this.onGeneClick) this.onGeneClick(best.data);
    if (best.kind === 'org' && this.onOrgClick) this.onOrgClick(best.data);
  };

    /** Dispatch layout to the active space feel. */
  SpaceCanvas.prototype._layout = function () {
    if (!this.w) return;
    this.nodes = [];
    this.hyphae = [];
    this.bgHyphae = [];
    if (this.mode === 'hex') this._layoutHex();
    else if (this.mode === 'strand') this._layoutStrand();
    else if (this.mode === 'atlas') this._layoutAtlas();
    else this._layoutVoid();
  };

    /** Hex Reach — lattice positions + relational hyphal links. */
  SpaceCanvas.prototype._layoutHex = function () {
    const genes = this.genes.length ? this.genes : [];
    const R = Math.min(this.w, this.h) * 0.38;
    const cols = 7, rows = 5;
    const hexR = R / 4.2;
    const positions = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * hexR * 1.75;
        const y = (r - (rows - 1) / 2) * hexR * 1.55 + ((c % 2) * hexR * 0.78);
        positions.push({ x, y });
      }
    }
    genes.forEach((g, i) => {
      const p = positions[i % positions.length];
      const jitter = seeded(i + 3) * 12 - 6;
      this.nodes.push({
        id: g.id, kind: 'gene', data: g,
        x: p.x + jitter, y: p.y + jitter * 0.6,
        color: g.id === 'SUC2' ? EMBER : TEAL_BRIGHT,
        label: g.id,
      });
    });
    // connect nearby
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i], b = this.nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < hexR * 2.4) {
          this.hyphae.push({
            a, b,
            c1: { x: lerp(a.x, b.x, 0.35) + (seeded(i * j) - 0.5) * 40,
                  y: lerp(a.y, b.y, 0.35) + (seeded(i + j * 7) - 0.5) * 40 },
            grow: 0.4 + seeded(i + j) * 0.6,
          });
        }
      }
    }
    this._makeBgHyphae(18, R * 1.6);
  };

    /** Strand Zoom — hub + radial genes (SUC2 ember). */
  SpaceCanvas.prototype._layoutStrand = function () {
    const genes = this.genes.length ? this.genes : [];
    const R = Math.min(this.w, this.h) * 0.32;
    genes.forEach((g, i) => {
      const ang = -Math.PI / 2 + (i / Math.max(genes.length, 1)) * Math.PI * 1.65 + 0.2;
      const rad = R * (0.55 + seeded(i + 1) * 0.55);
      this.nodes.push({
        id: g.id, kind: 'gene', data: g,
        x: Math.cos(ang) * rad,
        y: Math.sin(ang) * rad * 0.85,
        color: g.id === 'SUC2' ? EMBER : TEAL_BRIGHT,
        label: g.id,
      });
    });
    // hub
    this.nodes.forEach((n, i) => {
      this.hyphae.push({
        a: { x: 0, y: 0 }, b: n,
        c1: {
          x: n.x * 0.4 + (seeded(i * 3) - 0.5) * 60,
          y: n.y * 0.4 + (seeded(i * 5) - 0.5) * 60,
        },
        grow: 0.5 + seeded(i) * 0.5,
      });
    });
    this._makeBgHyphae(22, R * 2.2);
  };

    /** Fungal Atlas — organism foci colored by form kind. */
  SpaceCanvas.prototype._layoutAtlas = function () {
    const orgs = this.orgs.length ? this.orgs : [];
    const R = Math.min(this.w, this.h) * 0.42;
    orgs.forEach((o, i) => {
      const ring = 1 + (i % 3);
      const ang = (i / orgs.length) * Math.PI * 2 + seeded(i) * 0.4;
      const rad = R * (0.28 + ring * 0.22) * (0.85 + seeded(i + 9) * 0.3);
      const kind = formKind(o.form);
      this.nodes.push({
        id: o.slug, kind: 'org', data: o,
        x: Math.cos(ang) * rad,
        y: Math.sin(ang) * rad * 0.78,
        color: FORM_COLOR[kind] || FORM_COLOR.other,
        label: o.common_name,
        form: kind,
      });
    });
    // sparse mycelial links
    for (let i = 0; i < this.nodes.length; i++) {
      const j = (i + 1 + (i % 5)) % this.nodes.length;
      const a = this.nodes[i], b = this.nodes[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < R * 0.9) {
        this.hyphae.push({
          a, b,
          c1: { x: (a.x + b.x) / 2 + (seeded(i) - 0.5) * 50,
                y: (a.y + b.y) / 2 + (seeded(j) - 0.5) * 50 },
          grow: 0.6,
        });
      }
    }
    this._makeBgHyphae(16, R * 1.8);
  };

    /** Void Breath — field-dominant; sparse foci + dense BG hyphae. */
  SpaceCanvas.prototype._layoutVoid = function () {
    this._makeBgHyphae(36, Math.min(this.w, this.h) * 0.85);
    // sparse soft foci
    for (let i = 0; i < 8; i++) {
      this.nodes.push({
        id: 'focus-' + i, kind: 'focus', data: null,
        x: (seeded(i * 11) - 0.5) * this.w * 0.7,
        y: (seeded(i * 17) - 0.5) * this.h * 0.55,
        color: TEAL_BRIGHT,
        label: '',
      });
    }
  };

  SpaceCanvas.prototype._makeBgHyphae = function (count, span) {
    for (let i = 0; i < count; i++) {
      const a = {
        x: (seeded(i * 2.1) - 0.5) * span * 2.2,
        y: (seeded(i * 3.7) - 0.5) * span * 1.6,
      };
      const b = {
        x: a.x + (seeded(i * 5.3) - 0.5) * span * 1.4,
        y: a.y + (seeded(i * 7.1) - 0.5) * span * 1.1,
      };
      this.bgHyphae.push({
        a, b,
        c1: {
          x: lerp(a.x, b.x, 0.4) + (seeded(i * 9) - 0.5) * span * 0.5,
          y: lerp(a.y, b.y, 0.4) + (seeded(i * 13) - 0.5) * span * 0.5,
        },
        phase: seeded(i) * Math.PI * 2,
        speed: 0.08 + seeded(i + 1) * 0.12,
        w: 0.5 + seeded(i + 2) * 1.4,
        alpha: 0.08 + seeded(i + 3) * 0.14,
      });
    }
  };

  SpaceCanvas.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.resize();
    const loop = (t) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this._draw(t);
    };
    this._raf = requestAnimationFrame(loop);
  };

  SpaceCanvas.prototype.stop = function () {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  };

    /** Frame: ease camera, clear, draw lattice/hyphae/nodes/vignette. */
  SpaceCanvas.prototype._draw = function (t) {
    const ctx = this.ctx;
    if (!this.w) return;
    // camera ease
    const ease = this._calm ? 0.08 : 0.06;
    this.cam.scale = lerp(this.cam.scale, this.cam.ts, ease);
    this.cam.x = lerp(this.cam.x, this.cam.tx, ease);
    this.cam.y = lerp(this.cam.y, this.cam.ty, ease);

    ctx.clearRect(0, 0, this.w, this.h);
    const elapsed = (t - this.t0) / 1000;
    const grow = clamp((t - this.growT0) / (this._calm ? 4000 : 2800), 0, 1);

    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.scale(this.cam.scale, this.cam.scale);
    ctx.translate(-this.cam.x, -this.cam.y);

    if (this.mode === 'hex' || this.mode === 'strand') this._drawHexLattice(ctx, elapsed);
    this._drawBgHyphae(ctx, elapsed, grow);
    this._drawHyphae(ctx, elapsed, grow);

    if (this.mode === 'strand' && this.zoomLevel >= 2) this._drawDeepStrand(ctx, elapsed);
    if (this.mode === 'void') this._drawVoidExtras(ctx, elapsed);
    this._drawNodes(ctx, elapsed, grow);

    ctx.restore();

    // soft vignette
    const g = ctx.createRadialGradient(this.cx, this.cy, this.w * 0.2, this.cx, this.cy, this.w * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(7,9,11,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  };

  SpaceCanvas.prototype._drawHexLattice = function (ctx, elapsed) {
    const size = 42;
    const rows = 14, cols = 18;
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * (this._calm ? 0.15 : 0.25));
    ctx.strokeStyle = WHITE + (0.04 + pulse * 0.025) + ')';
    ctx.lineWidth = 0.6 / this.cam.scale;
    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        const x = c * size * 1.75;
        const y = r * size * 1.55 + (c % 2 ? size * 0.78 : 0);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const px = x + Math.cos(a) * size;
          const py = y + Math.sin(a) * size;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  };

  SpaceCanvas.prototype._drawBgHyphae = function (ctx, elapsed, grow) {
    this.bgHyphae.forEach((h, i) => {
      const sway = this._calm ? 0 : Math.sin(elapsed * h.speed + h.phase) * 8;
      const c1 = { x: h.c1.x + sway, y: h.c1.y - sway * 0.6 };
      const gAmt = clamp(grow * 1.2 - i * 0.02, 0, 1);
      ctx.beginPath();
      ctx.moveTo(h.a.x, h.a.y);
      const end = bez(h.a, c1, h.b, easeInOut(gAmt));
      // approximate by drawing full curve clipped by grow via multiple samples
      ctx.beginPath();
      ctx.moveTo(h.a.x, h.a.y);
      for (let s = 0.05; s <= gAmt; s += 0.05) {
        const p = bez(h.a, c1, h.b, s);
        ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = this.mode === 'void'
        ? ('rgba(11,138,143,' + (h.alpha * 1.4) + ')')
        : ('rgba(255,255,255,' + (h.alpha * 0.7) + ')');
      ctx.lineWidth = h.w / this.cam.scale;
      ctx.lineCap = 'round';
      ctx.stroke();
      // tip glow
      if (gAmt > 0.85) {
        ctx.beginPath();
        ctx.arc(end.x, end.y, (2.5 + h.w) / this.cam.scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(11,138,143,' + (0.25 + h.alpha) + ')';
        ctx.fill();
      }
    });
  };

  SpaceCanvas.prototype._drawHyphae = function (ctx, elapsed, grow) {
    this.hyphae.forEach((h, i) => {
      const gAmt = clamp((grow - 0.05) / h.grow, 0, 1);
      if (gAmt <= 0) return;
      const sway = this._calm ? 0 : Math.sin(elapsed * 0.35 + i) * 4;
      const c1 = { x: h.c1.x + sway, y: h.c1.y };
      ctx.beginPath();
      ctx.moveTo(h.a.x, h.a.y);
      for (let s = 0.04; s <= gAmt; s += 0.04) {
        const p = bez(h.a, c1, h.b, s);
        ctx.lineTo(p.x, p.y);
      }
      const hi = this.highlightId && (h.b.id === this.highlightId || h.a.id === this.highlightId);
      ctx.strokeStyle = hi ? 'rgba(11,138,143,0.75)' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = (hi ? 1.6 : 1.0) / this.cam.scale;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
  };

  SpaceCanvas.prototype._drawNodes = function (ctx, elapsed, grow) {
    this.nodes.forEach((n, i) => {
      if (n.kind === 'focus') {
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 0.4 + i);
        ctx.beginPath();
        ctx.arc(n.x, n.y, (6 + pulse * 4) / this.cam.scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(11,138,143,' + (0.12 + pulse * 0.1) + ')';
        ctx.fill();
        return;
      }
      const appear = clamp(grow * 1.3 - i * 0.03, 0, 1);
      if (appear <= 0) return;
      const pulsing = this.pulseIds.has(n.id);
      const hi = this.highlightId === n.id;
      const r = ((n.kind === 'org' ? 7 : 5) + (hi || pulsing ? 3 : 0)) / this.cam.scale;
      const breath = this._calm ? 1 : 1 + 0.08 * Math.sin(elapsed * 0.6 + i);
      // glow
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 2.4 * breath, 0, Math.PI * 2);
      ctx.fillStyle = this._rgba(n.color, 0.18 * appear);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * breath, 0, Math.PI * 2);
      ctx.fillStyle = this._rgba(n.color, (hi ? 0.95 : 0.75) * appear);
      ctx.fill();
      // white tip ring
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * breath, 0, Math.PI * 2);
      ctx.strokeStyle = WHITE + (hi ? '0.7)' : '0.25)');
      ctx.lineWidth = 0.8 / this.cam.scale;
      ctx.stroke();

      if (n.label && (this.mode !== 'void') && (this.cam.scale > 0.85 || hi || n.kind === 'org')) {
        ctx.font = (10 / this.cam.scale) + 'px "IBM Plex Sans", sans-serif';
        ctx.fillStyle = WHITE + (hi ? '0.9)' : '0.45)');
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y + r * 2.8 + 8 / this.cam.scale);
      }
    });
  };

    /** Deep zoom teaching helix near focus (teal→ember accent). */
  SpaceCanvas.prototype._drawDeepStrand = function (ctx, elapsed) {
    // DNA-ish double helix near focus / center
    const focus = this.nodes.find((n) => n.id === this.highlightId) || this.nodes.find((n) => n.id === 'SUC2') || { x: 0, y: 0 };
    const len = 120;
    ctx.save();
    ctx.translate(focus.x, focus.y + 30);
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const y = (t - 0.5) * len;
      const ph = t * Math.PI * 6 + elapsed * 0.4;
      const x1 = Math.cos(ph) * 14;
      const x2 = Math.cos(ph + Math.PI) * 14;
      const col = t < 0.55 ? TEAL_BRIGHT : EMBER;
      ctx.beginPath();
      ctx.arc(x1, y, 1.8 / this.cam.scale, 0, Math.PI * 2);
      ctx.fillStyle = this._rgba(col, 0.7);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y, 1.8 / this.cam.scale, 0, Math.PI * 2);
      ctx.fillStyle = this._rgba(col, 0.55);
      ctx.fill();
      if (i % 3 === 0) {
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.6 / this.cam.scale;
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  SpaceCanvas.prototype._drawVoidExtras = function (ctx, elapsed) {
    // rare ember sparks
    for (let i = 0; i < 12; i++) {
      const life = (elapsed * 0.15 + seeded(i * 19)) % 1;
      if (life > 0.35) continue;
      const x = (seeded(i * 23) - 0.5) * this.w * 1.2;
      const y = (seeded(i * 29) - 0.5) * this.h * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 / this.cam.scale, 0, Math.PI * 2);
      ctx.fillStyle = this._rgba(EMBER, 0.35 * (1 - life / 0.35));
      ctx.fill();
    }
  };

  SpaceCanvas.prototype._rgba = function (hex, a) {
    if (hex.charAt(0) !== '#') return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  };

  global.HyphaChamber = SpaceCanvas;
  global.HyphaSpace = SpaceCanvas;
})(window);
