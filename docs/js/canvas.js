/**
 * Hyphaneural chamber canvas — living mycelial view inside one organism.
 * Curved hyphae only; gene nodes radiate from a yeast core.
 */
(function (global) {
  'use strict';

  const TEAL = '#3d9e8f';
  const TEAL_RGB = [61, 158, 143];
  const EMBER = '#c4784a';
  const VOID = '#0a0c0b';

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /** Quadratic bezier point */
  function bez(p0, p1, p2, t) {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    };
  }

  function ChamberCanvas(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.genes = [];
    this.hyphae = [];
    this.highlightId = null;
    this.pulseIds = new Set();
    this.t0 = performance.now();
    this.running = false;
    this.onGeneClick = opts && opts.onGeneClick;
    this._raf = null;
    this._hitR = 28;
    this._resize = this.resize.bind(this);
    this._pointer = this._onPointer.bind(this);
    this._move = this._onMove.bind(this);
    window.addEventListener('resize', this._resize);
    canvas.addEventListener('pointerdown', this._pointer);
    canvas.addEventListener('pointermove', this._move);
  }

  ChamberCanvas.prototype.resize = function () {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.w = w;
    this.h = h;
    this.cx = w * 0.5;
    this.cy = h * 0.46;
    this._layoutHyphae();
  };

  ChamberCanvas.prototype.setGenes = function (geneList) {
    this.genes = geneList || [];
    this._layoutHyphae();
  };

  ChamberCanvas.prototype.setHighlight = function (id) {
    this.highlightId = id;
  };

  ChamberCanvas.prototype.pulseGene = function (id, on) {
    if (on) this.pulseIds.add(id);
    else this.pulseIds.delete(id);
  };

  ChamberCanvas.prototype._layoutHyphae = function () {
    if (!this.w) return;
    const n = this.genes.length || 1;
    const R = Math.min(this.w, this.h) * 0.34;
    this.hyphae = this.genes.map((g, i) => {
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2 + 0.15;
      const tipR = R * (0.85 + (i % 3) * 0.08);
      const tip = {
        x: this.cx + Math.cos(angle) * tipR,
        y: this.cy + Math.sin(angle) * tipR,
      };
      // Control point offset for curved (never straight) hypha
      const mid = 0.45 + (i % 2) * 0.12;
      const sweep = ((i % 2) ? 1 : -1) * (0.55 + (i % 3) * 0.12);
      const ctrl = {
        x: this.cx + Math.cos(angle + sweep) * tipR * mid,
        y: this.cy + Math.sin(angle + sweep) * tipR * mid,
      };
      const branches = [];
      const bCount = 1 + (i % 2);
      for (let b = 0; b < bCount; b++) {
        const bt = 0.55 + b * 0.18;
        const bp = bez({ x: this.cx, y: this.cy }, ctrl, tip, bt);
        const ba = angle + ((b % 2) ? 0.7 : -0.7);
        const bl = tipR * (0.22 + b * 0.08);
        const btip = { x: bp.x + Math.cos(ba) * bl, y: bp.y + Math.sin(ba) * bl };
        const bctrl = {
          x: bp.x + Math.cos(ba + 0.4) * bl * 0.5,
          y: bp.y + Math.sin(ba + 0.4) * bl * 0.5,
        };
        branches.push({ from: bp, ctrl: bctrl, tip: btip });
      }
      return { gene: g, tip, ctrl, angle, branches };
    });
  };

  ChamberCanvas.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.resize();
    const loop = (now) => {
      if (!this.running) return;
      this._draw(now);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  };

  ChamberCanvas.prototype.stop = function () {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  };

  ChamberCanvas.prototype._draw = function (now) {
    const ctx = this.ctx;
    const t = (now - this.t0) / 1000;
    ctx.clearRect(0, 0, this.w, this.h);

    // Soft ambient bloom
    const g = ctx.createRadialGradient(this.cx, this.cy, 20, this.cx, this.cy, Math.min(this.w, this.h) * 0.55);
    g.addColorStop(0, 'rgba(61,158,143,0.09)');
    g.addColorStop(0.5, 'rgba(61,158,143,0.03)');
    g.addColorStop(1, 'rgba(10,12,11,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    // Core — yeast cell metaphor
    this._drawCore(ctx, t);

    // Hyphae
    for (const h of this.hyphae) {
      const active = this.highlightId === h.gene.id || this.pulseIds.has(h.gene.id);
      this._drawHypha(ctx, h, t, active);
    }

    // Gene nodes on top
    for (const h of this.hyphae) {
      const active = this.highlightId === h.gene.id || this.pulseIds.has(h.gene.id);
      this._drawNode(ctx, h, t, active);
    }
  };

  ChamberCanvas.prototype._drawCore = function (ctx, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.7);
    const r = Math.min(this.w, this.h) * 0.07;
    // Outer membrane
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r * (1.15 + pulse * 0.04), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(61,158,143,${0.25 + pulse * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Soft fill
    const cg = ctx.createRadialGradient(this.cx, this.cy, 2, this.cx, this.cy, r);
    cg.addColorStop(0, `rgba(61,158,143,${0.35 + pulse * 0.1})`);
    cg.addColorStop(0.7, 'rgba(61,158,143,0.12)');
    cg.addColorStop(1, 'rgba(61,158,143,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Nucleus hint
    ctx.beginPath();
    ctx.arc(this.cx - r * 0.15, this.cy - r * 0.1, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(212,220,226,${0.08 + pulse * 0.04})`;
    ctx.fill();
    // Label
    ctx.font = '500 11px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = 'rgba(61,158,143,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText('S. cerevisiae', this.cx, this.cy + r + 18);
  };

  ChamberCanvas.prototype._drawHypha = function (ctx, h, t, active) {
    const trail = 0.5 + 0.5 * Math.sin(t * 0.55 + h.angle);
    const alpha = active ? 0.75 : 0.28 + trail * 0.12;
    const width = active ? 2.4 : 1.35;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Glow trail
    if (active) {
      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      ctx.quadraticCurveTo(h.ctrl.x, h.ctrl.y, h.tip.x, h.tip.y);
      ctx.strokeStyle = `rgba(61,158,143,${0.2 + trail * 0.15})`;
      ctx.lineWidth = 8;
      ctx.stroke();
    }

    // Main curved strand
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy);
    ctx.quadraticCurveTo(h.ctrl.x, h.ctrl.y, h.tip.x, h.tip.y);
    ctx.strokeStyle = active
      ? `rgba(61,158,143,${alpha})`
      : `rgba(61,158,143,${alpha})`;
    ctx.lineWidth = width;
    ctx.stroke();

    // Soft traveling pulse along strand
    const pt = (t * 0.18 + h.angle * 0.1) % 1;
    const p = bez({ x: this.cx, y: this.cy }, h.ctrl, h.tip, easeInOut(pt));
    ctx.beginPath();
    ctx.arc(p.x, p.y, active ? 3.5 : 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(61,158,143,${active ? 0.7 : 0.25})`;
    ctx.fill();

    // Side branches
    for (const b of h.branches) {
      ctx.beginPath();
      ctx.moveTo(b.from.x, b.from.y);
      ctx.quadraticCurveTo(b.ctrl.x, b.ctrl.y, b.tip.x, b.tip.y);
      ctx.strokeStyle = `rgba(61,158,143,${active ? 0.35 : 0.12})`;
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
    ctx.restore();
  };

  ChamberCanvas.prototype._drawNode = function (ctx, h, t, active) {
    const pulse = this.pulseIds.has(h.gene.id)
      ? 0.5 + 0.5 * Math.sin(t * 2.2)
      : 0.5 + 0.5 * Math.sin(t * 0.9 + h.angle);
    const r = active ? 9 + pulse * 2 : 6 + pulse * 1.2;
    const guided = h.gene.guided;

    // Glow
    ctx.beginPath();
    ctx.arc(h.tip.x, h.tip.y, r * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = guided
      ? `rgba(196,120,74,${0.12 + pulse * 0.1})`
      : `rgba(61,158,143,${0.1 + pulse * 0.08})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(h.tip.x, h.tip.y, r, 0, Math.PI * 2);
    ctx.fillStyle = active || guided ? EMBER : TEAL;
    if (!guided && !active) ctx.fillStyle = `rgba(61,158,143,${0.75 + pulse * 0.2})`;
    if (guided && !active) ctx.fillStyle = `rgba(196,120,74,${0.7 + pulse * 0.25})`;
    if (active) ctx.fillStyle = TEAL;
    ctx.fill();

    // Ring
    ctx.beginPath();
    ctx.arc(h.tip.x, h.tip.y, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = active
      ? `rgba(61,158,143,${0.6 + pulse * 0.3})`
      : `rgba(61,158,143,0.2)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label
    ctx.font = `${active ? '500 ' : ''}12px "IBM Plex Mono", monospace`;
    ctx.fillStyle = active ? '#e8f5f2' : 'rgba(212,220,226,0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ly = h.tip.y + r + 8;
    ctx.fillText(h.gene.id, h.tip.x, ly);
    if (active || guided) {
      ctx.font = '10px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = 'rgba(138,154,163,0.85)';
      ctx.fillText(h.gene.name || '', h.tip.x, ly + 14);
    }
  };

  ChamberCanvas.prototype._hitTest = function (x, y) {
    let best = null;
    let bestD = this._hitR;
    for (const h of this.hyphae) {
      const dx = x - h.tip.x;
      const dy = y - h.tip.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) {
        bestD = d;
        best = h.gene;
      }
    }
    return best;
  };

  ChamberCanvas.prototype._onPointer = function (e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gene = this._hitTest(x, y);
    if (gene && this.onGeneClick) this.onGeneClick(gene);
  };

  ChamberCanvas.prototype._onMove = function (e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gene = this._hitTest(x, y);
    this.canvas.style.cursor = gene ? 'pointer' : 'grab';
  };

  ChamberCanvas.prototype.geneScreenPos = function (id) {
    const h = this.hyphae.find((x) => x.gene.id === id);
    if (!h) return null;
    return { x: h.tip.x, y: h.tip.y };
  };

  global.HyphaChamber = ChamberCanvas;
})(window);
