/**
 * Hyphaneural chamber canvas — living mycelial BACKGROUND field.
 * Big motion lives in the void: hyphae that reach/grow, network drift,
 * slow camera breath. Quiet Protomol / Expanse — not arcade.
 */
(function (global) {
  'use strict';

  const TEAL = '#3d9e8f';
  const TEAL_DEEP = '#1a5c54';
  const TEAL_BRIGHT = '#5ec4b4';
  const TEAL_MIST = '#2a7a70';
  const EMBER = '#c4784a';
  const EMBER_SOFT = '#a05a32';
  const EMBER_GLOW = '#e09260';
  const VOID_HEX = 'rgba(61,158,143,0.045)';

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) {
    const u = 1 - t;
    return 1 - u * u * u;
  }
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /** Quadratic bezier point */
  function bez(p0, p1, p2, t) {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    };
  }

  function reducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  function ChamberCanvas(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.genes = [];
    this.hyphae = [];
    this.bgHyphae = [];
    this.highlightId = null;
    this.pulseIds = new Set();
    this.t0 = performance.now();
    this.growT0 = performance.now();
    this.running = false;
    this.onGeneClick = opts && opts.onGeneClick;
    this._raf = null;
    this._hitR = 28;
    this._calm = reducedMotion();
    // Camera / field transform (world space → screen)
    this.cam = { x: 0, y: 0, scale: 0.55, tx: 0, ty: 0, ts: 0.55 };
    this.lodLevel = 0; // 0 organism · 1 family · 2 dogma
    this._hexPhase = 0;
    this._vx = 0;
    this._vy = 0;
    this._dragging = false;
    this._lastPtr = null;
    this._resize = this.resize.bind(this);
    this._pointer = this._onPointer.bind(this);
    this._ptrUp = this._onPtrUp.bind(this);
    this._move = this._onMove.bind(this);
    this._wheel = this._onWheel.bind(this);
    window.addEventListener('resize', this._resize);
    canvas.addEventListener('pointerdown', this._pointer);
    canvas.addEventListener('pointermove', this._move);
    canvas.addEventListener('pointerup', this._ptrUp);
    canvas.addEventListener('pointercancel', this._ptrUp);
    canvas.addEventListener('wheel', this._wheel, { passive: false });
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
    this._layoutAll();
  };

  ChamberCanvas.prototype.setGenes = function (geneList) {
    this.genes = geneList || [];
    this.growT0 = performance.now();
    this._layoutAll();
  };

  ChamberCanvas.prototype.setHighlight = function (id) {
    this.highlightId = id;
    if (id) this._focusGene(id);
  };

  /**
   * Immersive LOD camera — zoom into the strand/data, not a panel swap.
   * 0 organism overview · 1 gene/family · 2 DNA→mRNA→protein
   */
  ChamberCanvas.prototype.setLod = function (level, geneId) {
    this.lodLevel = Math.max(0, Math.min(2, level | 0));
    const zooms = this._calm ? [1, 1.08, 1.15] : [0.72, 1.38, 2.05];
    this.cam.ts = zooms[this.lodLevel];
    if (geneId) this._focusGene(geneId);
    else if (this.lodLevel === 0) {
      this.cam.tx = 0;
      this.cam.ty = 0;
    }
  };

  ChamberCanvas.prototype.pulseGene = function (id, on) {
    if (on) this.pulseIds.add(id);
    else this.pulseIds.delete(id);
  };

  /** Restart big grow-out of the mycelial field (chamber load / gene appear).
   *  opts.entrance — camera pull-in from far (landing inside yeast). */
  ChamberCanvas.prototype.replayGrowth = function (opts) {
    opts = opts || {};
    this.growT0 = performance.now();
    this.bgHyphae.forEach((h, i) => {
      h.born = this.growT0 + i * (this._calm ? 40 : 90);
      h.growDur = this._calm ? 600 : (1800 + (i % 5) * 280);
      h.reachPhase = Math.random() * Math.PI * 2;
    });
    this.hyphae.forEach((h, i) => {
      h.born = this.growT0 + 200 + i * (this._calm ? 60 : 140);
      h.growDur = this._calm ? 700 : (2000 + (i % 3) * 400);
    });
    // Entrance pull-in — landing inside the chamber
    if (opts.entrance && !this._calm) {
      this.cam.ts = 0.42;
      this.cam.tx = 0;
      this.cam.ty = 0;
    }
  };

  ChamberCanvas.prototype._focusGene = function (id) {
    const h = this.hyphae.find((x) => x.gene.id === id);
    if (!h || this._calm) return;
    // Substantial camera travel toward the gene tip (not a 2% nudge)
    this.cam.tx = -(h.tip.x - this.cx) * 0.55;
    this.cam.ty = -(h.tip.y - this.cy) * 0.55;
    this.cam.ts = 1.35;
  };

  ChamberCanvas.prototype._layoutAll = function () {
    if (!this.w) return;
    this._layoutBgHyphae();
    this._layoutGeneHyphae();
  };

  /**
   * Dense BACKGROUND mycelial weave — long curved strands that cross the void.
   * These are the BIG motion: grow-on, re-reach, sway at large amplitude.
   */
  ChamberCanvas.prototype._layoutBgHyphae = function () {
    const field = Math.max(this.w, this.h);
    const count = this._calm ? 10 : 22;
    const now = this.growT0 || performance.now();
    const seed = this.bgHyphae.length ? this.bgHyphae : null;
    this.bgHyphae = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.35 + (i % 3) * 0.11;
      // Reach far — well past the gene ring, toward / past the canvas edge
      const tipR = field * (0.42 + (i % 5) * 0.07 + (i % 2) * 0.04);
      const tip = {
        x: this.cx + Math.cos(angle) * tipR,
        y: this.cy + Math.sin(angle) * tipR * 0.92,
      };
      const mid = 0.38 + (i % 4) * 0.08;
      const sweep = ((i % 2) ? 1 : -1) * (0.7 + (i % 5) * 0.18);
      const ctrl = {
        x: this.cx + Math.cos(angle + sweep) * tipR * mid,
        y: this.cy + Math.sin(angle + sweep) * tipR * mid,
      };
      // Secondary long branches that also reach
      const branches = [];
      const bCount = 2 + (i % 3);
      for (let b = 0; b < bCount; b++) {
        const bt = 0.4 + b * 0.18;
        const bp = bez({ x: this.cx, y: this.cy }, ctrl, tip, bt);
        const ba = angle + ((b % 2) ? 0.95 : -0.95) + (i % 2) * 0.2;
        const bl = tipR * (0.28 + b * 0.12);
        const btip = { x: bp.x + Math.cos(ba) * bl, y: bp.y + Math.sin(ba) * bl };
        const bctrl = {
          x: bp.x + Math.cos(ba + 0.55) * bl * 0.55,
          y: bp.y + Math.sin(ba + 0.55) * bl * 0.55,
        };
        branches.push({
          from: bp,
          ctrl: bctrl,
          tip: btip,
          delay: 0.25 + b * 0.12,
        });
      }

      // Cross-field wanderers (not from core) — sweep across the void
      const wander = i % 4 === 0;
      let from = { x: this.cx, y: this.cy };
      if (wander) {
        const a0 = angle + Math.PI * 0.85;
        const r0 = field * 0.48;
        from = {
          x: this.cx + Math.cos(a0) * r0,
          y: this.cy + Math.sin(a0) * r0,
        };
        ctrl.x = this.cx + Math.cos(angle + sweep * 0.5) * tipR * 0.2;
        ctrl.y = this.cy + Math.sin(angle + sweep * 0.5) * tipR * 0.2;
      }

      this.bgHyphae.push({
        from,
        tip,
        ctrl,
        angle,
        tipR,
        branches,
        born: now + i * (this._calm ? 40 : 90),
        growDur: this._calm ? 600 : (1600 + (i % 5) * 320),
        reachPhase: (seed && seed[i]) ? seed[i].reachPhase : Math.random() * Math.PI * 2,
        swayAmp: this._calm ? 4 : (18 + (i % 4) * 10),
        layer: i % 3, // depth for opacity/width
        wander,
      });
    }
  };

  ChamberCanvas.prototype._layoutGeneHyphae = function () {
    const n = this.genes.length || 1;
    const R = Math.min(this.w, this.h) * 0.34;
    const now = this.growT0 || performance.now();
    this.hyphae = this.genes.map((g, i) => {
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2 + 0.15;
      const tipR = R * (0.85 + (i % 3) * 0.08);
      const tip = {
        x: this.cx + Math.cos(angle) * tipR,
        y: this.cy + Math.sin(angle) * tipR,
      };
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
      return {
        gene: g,
        tip,
        ctrl,
        angle,
        tipR,
        branches,
        born: now + 180 + i * (this._calm ? 60 : 140),
        growDur: this._calm ? 700 : (2000 + (i % 3) * 400),
        swayAmp: this._calm ? 3 : 14,
        reachPhase: i * 1.7,
      };
    });
  };

  ChamberCanvas.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.growT0 = performance.now();
    this.t0 = this.growT0;
    this.resize();
    this.replayGrowth({ entrance: true });
    const loop = (now) => {
      if (!this.running) return;
      this._tickCamera(now);
      this._draw(now);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  };

  ChamberCanvas.prototype.stop = function () {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  };

  ChamberCanvas.prototype._tickCamera = function (now) {
    const t = (now - this.t0) / 1000;
    const calm = this._calm;

    // Slow camera-like breath of the whole weave (large, unmistakable)
    if (!calm) {
      const breath = Math.sin(t * 0.22);
      const breath2 = Math.sin(t * 0.13 + 1.1);
      const breathScale = 1 + breath * 0.085;
      const driftX = Math.sin(t * 0.11) * Math.min(this.w, this.h) * 0.045;
      const driftY = Math.cos(t * 0.09 + 0.4) * Math.min(this.w, this.h) * 0.035;
      // Blend user target with ambient breath
      const baseS = this.cam.ts * breathScale;
      const baseX = this.cam.tx + driftX + breath2 * 8;
      const baseY = this.cam.ty + driftY;
      // Soft spring toward target + inertia from drag/wheel
      this.cam.scale = lerp(this.cam.scale, baseS, 0.045);
      this.cam.x = lerp(this.cam.x, baseX, 0.05) + this._vx;
      this.cam.y = lerp(this.cam.y, baseY, 0.05) + this._vy;
      this._vx *= 0.92;
      this._vy *= 0.92;
      if (Math.abs(this._vx) < 0.02) this._vx = 0;
      if (Math.abs(this._vy) < 0.02) this._vy = 0;
    } else {
      this.cam.scale = lerp(this.cam.scale, 1, 0.08);
      this.cam.x = lerp(this.cam.x, 0, 0.08);
      this.cam.y = lerp(this.cam.y, 0, 0.08);
    }
  };

  /** Growth progress 0→1 for a hypha born at `born` lasting `growDur` ms. */
  ChamberCanvas.prototype._grow = function (now, born, growDur) {
    const raw = (now - born) / growDur;
    if (raw <= 0) return 0;
    if (raw >= 1) return 1;
    return easeOutCubic(raw);
  };

  /** Occasional slow re-reach: tip length oscillates after full grow. */
  ChamberCanvas.prototype._reachLen = function (h, t, grow) {
    if (grow < 1) return grow;
    // After grown: large-amplitude slow sway / re-reach (not tiny glow)
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.35 + h.reachPhase);
    // Re-reach every ~8–12s: briefly retract then extend again
    const cycle = (t * 0.08 + h.reachPhase * 0.15) % 1;
    let reReach = 1;
    if (!this._calm && cycle > 0.82) {
      const rt = (cycle - 0.82) / 0.18;
      reReach = rt < 0.35
        ? lerp(1, 0.62, easeInOut(rt / 0.35))
        : lerp(0.62, 1, easeOutCubic((rt - 0.35) / 0.65));
    }
    return grow * reReach * (0.92 + pulse * 0.08);
  };

  ChamberCanvas.prototype._swayTip = function (from, tip, ctrl, angle, t, amp, phase) {
    const sx = Math.cos(angle + Math.PI / 2) * Math.sin(t * 0.4 + phase) * amp;
    const sy = Math.sin(angle + Math.PI / 2) * Math.cos(t * 0.33 + phase) * amp;
    const cx = Math.cos(angle + 0.9) * Math.sin(t * 0.28 + phase + 1) * amp * 0.7;
    const cy = Math.sin(angle + 0.9) * Math.cos(t * 0.25 + phase + 1) * amp * 0.7;
    return {
      tip: { x: tip.x + sx, y: tip.y + sy },
      ctrl: { x: ctrl.x + cx, y: ctrl.y + cy },
      from: from,
    };
  };

  ChamberCanvas.prototype._draw = function (now) {
    const ctx = this.ctx;
    const t = (now - this.t0) / 1000;
    ctx.clearRect(0, 0, this.w, this.h);

    // Slow pulsed purple→blue→green ombre (NO ember/orange in BG)
    this._drawOmbreWash(ctx, t);
    // Faint white hex lattice
    this._drawHexLattice(ctx, t);

    ctx.save();
    // Camera transform: scale around chamber center + pan
    ctx.translate(this.cx + this.cam.x, this.cy + this.cam.y);
    ctx.scale(this.cam.scale, this.cam.scale);
    ctx.translate(-this.cx, -this.cy);

    // ——— BACKGROUND mycelial field (BIG motion) ———
    for (const h of this.bgHyphae) {
      this._drawBgHypha(ctx, h, t, now);
    }

    // Core — yeast cell metaphor
    this._drawCore(ctx, t);

    // Gene hyphae (also grow/reach — readable, still part of the field)
    for (const h of this.hyphae) {
      const active = this.highlightId === h.gene.id || this.pulseIds.has(h.gene.id);
      this._drawGeneHypha(ctx, h, t, now, active);
    }

    // Gene nodes on top
    for (const h of this.hyphae) {
      const active = this.highlightId === h.gene.id || this.pulseIds.has(h.gene.id);
      const grow = this._grow(now, h.born, h.growDur);
      if (grow < 0.15) continue;
      this._drawNode(ctx, h, t, now, active, grow);
    }

    ctx.restore();
  };

  /**
   * Super-slow pulsed color-gradient ombre — purples, blues, greens only.
   * This soft wash IS primary BG motion alongside growing hyphae.
   */
  ChamberCanvas.prototype._drawOmbreWash = function (ctx, t) {
    // Period ~40–60s for a full hue wander; amplitude gentle
    const phase = t * 0.028; // very low speed
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.11);
    const pulse2 = 0.5 + 0.5 * Math.sin(t * 0.07 + 1.7);
    // Corner anchors wander slowly through purple / blue / green
    const c1 = {
      r: Math.round(40 + 50 * (0.5 + 0.5 * Math.sin(phase))),
      g: Math.round(20 + 40 * (0.5 + 0.5 * Math.sin(phase + 2.1))),
      b: Math.round(70 + 80 * (0.5 + 0.5 * Math.cos(phase * 0.9))),
    }; // purple-blue
    const c2 = {
      r: Math.round(15 + 30 * (0.5 + 0.5 * Math.cos(phase + 1.2))),
      g: Math.round(50 + 70 * (0.5 + 0.5 * Math.sin(phase + 0.6))),
      b: Math.round(90 + 70 * (0.5 + 0.5 * Math.sin(phase + 2.8))),
    }; // blue
    const c3 = {
      r: Math.round(10 + 25 * (0.5 + 0.5 * Math.sin(phase + 3.0))),
      g: Math.round(80 + 70 * (0.5 + 0.5 * Math.cos(phase + 1.4))),
      b: Math.round(60 + 50 * (0.5 + 0.5 * Math.sin(phase + 0.3))),
    }; // green-teal
    const aBase = 0.10 + pulse * 0.06;
    const aSoft = 0.05 + pulse2 * 0.04;

    // Full-field linear ombre
    const ang = phase * 0.35;
    const x0 = this.w * (0.5 + 0.45 * Math.cos(ang));
    const y0 = this.h * (0.5 + 0.45 * Math.sin(ang));
    const x1 = this.w * (0.5 - 0.45 * Math.cos(ang));
    const y1 = this.h * (0.5 - 0.45 * Math.sin(ang));
    const lg = ctx.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, `rgba(${c1.r},${c1.g},${c1.b},${aBase})`);
    lg.addColorStop(0.45, `rgba(${c2.r},${c2.g},${c2.b},${aSoft + 0.04})`);
    lg.addColorStop(1, `rgba(${c3.r},${c3.g},${c3.b},${aBase * 0.9})`);
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, this.w, this.h);

    // Soft radial pulse over core — green/blue only
    const cx = this.cx + this.cam.x * 0.12;
    const cy = this.cy + this.cam.y * 0.12;
    const bloomR = Math.min(this.w, this.h) * (0.5 + pulse * 0.08);
    const rg = ctx.createRadialGradient(cx, cy, 10, cx, cy, bloomR);
    rg.addColorStop(0, `rgba(${c3.r},${c3.g},${c3.b},${0.12 + pulse * 0.08})`);
    rg.addColorStop(0.4, `rgba(${c2.r},${c2.g},${c2.b},${0.06 + pulse2 * 0.04})`);
    rg.addColorStop(1, 'rgba(10,12,11,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, this.w, this.h);
  };

  ChamberCanvas.prototype._drawHexLattice = function (ctx, t) {
    const R = this._calm ? 36 : 28;
    const h = R * Math.sqrt(3);
    const breath = 1 + Math.sin(t * 0.15) * 0.02;
    const ox = this.cam.x * 0.12;
    const oy = this.cam.y * 0.12;
    ctx.save();
    ctx.translate(this.w * 0.5 + ox, this.h * 0.5 + oy);
    ctx.scale(breath, breath);
    ctx.translate(-this.w * 0.5, -this.h * 0.5);
    const cols = Math.ceil(this.w / (R * 1.5)) + 3;
    const rows = Math.ceil(this.h / h) + 3;
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const x = col * R * 1.5 + (row % 2 ? R * 0.75 : 0);
        const y = row * h;
        // Depth cue: denser/brighter near chamber center
        const dx = x - this.cx;
        const dy = y - this.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const near = Math.max(0, 1 - dist / (Math.min(this.w, this.h) * 0.7));
        const a = 0.025 + near * 0.06 + (this.lodLevel >= 1 ? 0.02 : 0);
        if (a < 0.03) continue;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (Math.PI / 3) * i + Math.PI / 6;
          const px = x + Math.cos(ang) * R * 0.92;
          const py = y + Math.sin(ang) * R * 0.92;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        // Alternate subtle teal / deep teal / whisper ember at LOD≥1
        if ((row + col) % 5 === 0) {
          // sparse white fine lines
          ctx.strokeStyle = `rgba(255,255,255,${a * 0.55})`;
        } else if ((row + col) % 3 === 0) {
          ctx.strokeStyle = `rgba(120,180,220,${a * 0.85})`; // blue
        } else {
          ctx.strokeStyle = `rgba(70,140,120,${a})`; // green
        }
        ctx.lineWidth = 0.7 + near * 0.6;
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  ChamberCanvas.prototype._drawBgHypha = function (ctx, h, t, now) {
    const grow = this._grow(now, h.born, h.growDur);
    if (grow <= 0.001) return;

    const len = this._reachLen(h, t, grow);
    const swayed = this._swayTip(h.from, h.tip, h.ctrl, h.angle, t, h.swayAmp, h.reachPhase);
    const tipDraw = bez(swayed.from, swayed.ctrl, swayed.tip, len);
    // Partial curve: sample along bezier up to `len`
    const layers = [
      { w: h.layer === 0 ? 1.1 : h.layer === 1 ? 1.6 : 2.2, a: h.layer === 0 ? 0.1 : h.layer === 1 ? 0.16 : 0.22 },
    ];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Soft glow under long strands
    ctx.beginPath();
    this._strokePartial(ctx, swayed.from, swayed.ctrl, swayed.tip, len);
    ctx.strokeStyle = h.layer >= 2
      ? `rgba(130,170,220,${0.07 + grow * 0.1})`
      : h.layer === 0
        ? `rgba(90,70,140,${0.05 + grow * 0.07})`
        : `rgba(61,158,143,${0.05 + grow * 0.08})`;
    ctx.lineWidth = 10 + h.layer * 3;
    ctx.stroke();

    // Main long strand
    ctx.beginPath();
    this._strokePartial(ctx, swayed.from, swayed.ctrl, swayed.tip, len);
    const alpha = (0.18 + h.layer * 0.08) * (0.55 + grow * 0.45);
    ctx.strokeStyle = h.layer === 2
      ? `rgba(140,190,230,${alpha})`
      : h.layer === 0
        ? `rgba(100,80,160,${alpha * 0.95})`
        : `rgba(61,158,143,${alpha})`;
    ctx.lineWidth = layers[0].w;
    ctx.stroke();

    // Traveling sap pulse — large enough to read across the field
    if (grow > 0.4 && !this._calm) {
      const pt = (t * 0.12 + h.reachPhase * 0.08) % 1;
      if (pt < len) {
        const p = bez(swayed.from, swayed.ctrl, swayed.tip, easeInOut(pt));
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5 + h.layer * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.15 + h.layer * 0.1})`;
        ctx.fill();
      }
    }

    // Side branches grow after main stem
    for (const b of h.branches) {
      const bg = clamp((grow - b.delay) / (1 - b.delay + 0.001), 0, 1);
      if (bg <= 0) continue;
      const bLen = easeOutCubic(bg) * this._reachLen(h, t + 0.5, 1);
      const bSway = {
        x: b.tip.x + Math.sin(t * 0.38 + h.reachPhase + b.delay) * h.swayAmp * 0.55,
        y: b.tip.y + Math.cos(t * 0.31 + h.reachPhase) * h.swayAmp * 0.55,
      };
      const bCtrl = {
        x: b.ctrl.x + Math.sin(t * 0.25 + 1) * h.swayAmp * 0.3,
        y: b.ctrl.y + Math.cos(t * 0.22) * h.swayAmp * 0.3,
      };
      ctx.beginPath();
      this._strokePartial(ctx, b.from, bCtrl, bSway, bLen);
      ctx.strokeStyle = `rgba(61,158,143,${0.08 + bg * 0.12})`;
      ctx.lineWidth = 0.85;
      ctx.stroke();
    }

    // Growing tip glow (visible extension cue)
    if (grow < 1 || len < 0.98) {
      ctx.beginPath();
      ctx.arc(tipDraw.x, tipDraw.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = (h.layer === 2 && grow < 0.85)
        ? `rgba(255,255,255,${0.28 + (1 - grow) * 0.35})`
        : `rgba(140,210,190,${0.22 + (1 - grow) * 0.3})`;
      ctx.fill();
    }

    ctx.restore();
  };

  /** Draw quadratic curve only up to parameter `len` (0–1) via subdivision. */
  ChamberCanvas.prototype._strokePartial = function (ctx, p0, p1, p2, len) {
    const steps = Math.max(4, Math.ceil(28 * len));
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i <= steps; i++) {
      const u = (i / steps) * len;
      const p = bez(p0, p1, p2, u);
      ctx.lineTo(p.x, p.y);
    }
  };

  ChamberCanvas.prototype._drawCore = function (ctx, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.7);
    const r = Math.min(this.w, this.h) * 0.07;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r * (1.15 + pulse * 0.06), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(61,158,143,${0.25 + pulse * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const cg = ctx.createRadialGradient(this.cx, this.cy, 2, this.cx, this.cy, r);
    cg.addColorStop(0, `rgba(61,158,143,${0.35 + pulse * 0.1})`);
    cg.addColorStop(0.7, 'rgba(61,158,143,0.12)');
    cg.addColorStop(1, 'rgba(61,158,143,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.cx - r * 0.15, this.cy - r * 0.1, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(212,220,226,${0.08 + pulse * 0.04})`;
    ctx.fill();
    ctx.font = '500 11px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'center';
    ctx.fillText('S. cerevisiae', this.cx, this.cy + r + 18);
  };

  ChamberCanvas.prototype._drawGeneHypha = function (ctx, h, t, now, active) {
    const grow = this._grow(now, h.born, h.growDur);
    if (grow <= 0.001) return;
    const len = this._reachLen(h, t, grow);
    const from = { x: this.cx, y: this.cy };
    const swayed = this._swayTip(from, h.tip, h.ctrl, h.angle, t, h.swayAmp, h.reachPhase);
    const trail = 0.5 + 0.5 * Math.sin(t * 0.55 + h.angle);
    const alpha = active ? 0.8 : 0.32 + trail * 0.14;
    const width = active ? 2.6 : 1.45;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (active) {
      ctx.beginPath();
      this._strokePartial(ctx, swayed.from, swayed.ctrl, swayed.tip, len);
      ctx.strokeStyle = `rgba(61,158,143,${0.22 + trail * 0.15})`;
      ctx.lineWidth = 9;
      ctx.stroke();
    }

    ctx.beginPath();
    this._strokePartial(ctx, swayed.from, swayed.ctrl, swayed.tip, len);
    ctx.strokeStyle = `rgba(61,158,143,${alpha})`;
    ctx.lineWidth = width;
    ctx.stroke();

    if (grow > 0.35) {
      const pt = Math.min(len, (t * 0.18 + h.angle * 0.1) % 1);
      const p = bez(swayed.from, swayed.ctrl, swayed.tip, easeInOut(pt));
      ctx.beginPath();
      ctx.arc(p.x, p.y, active ? 3.5 : 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(61,158,143,${active ? 0.7 : 0.28})`;
      ctx.fill();
    }

    for (const b of h.branches) {
      const bg = clamp((grow - 0.35) / 0.65, 0, 1);
      if (bg <= 0) continue;
      ctx.beginPath();
      this._strokePartial(ctx, b.from, b.ctrl, b.tip, easeOutCubic(bg));
      ctx.strokeStyle = `rgba(61,158,143,${active ? 0.35 : 0.12})`;
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
    ctx.restore();
  };

  ChamberCanvas.prototype._drawNode = function (ctx, h, t, now, active, grow) {
    const swayed = this._swayTip(
      { x: this.cx, y: this.cy },
      h.tip,
      h.ctrl,
      h.angle,
      t,
      h.swayAmp,
      h.reachPhase
    );
    const len = this._reachLen(h, t, grow);
    const pos = bez(swayed.from, swayed.ctrl, swayed.tip, len);
    const pulse = this.pulseIds.has(h.gene.id)
      ? 0.5 + 0.5 * Math.sin(t * 2.2)
      : 0.5 + 0.5 * Math.sin(t * 0.9 + h.angle);
    const r = (active ? 9 + pulse * 2 : 6 + pulse * 1.2) * clamp(grow * 1.2, 0, 1);
    const guided = h.gene.guided;
    const fade = clamp(grow * 1.4, 0, 1);

    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = guided
      ? `rgba(196,120,74,${0.12 + pulse * 0.1})`
      : `rgba(61,158,143,${0.1 + pulse * 0.08})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    if (active) ctx.fillStyle = TEAL;
    else if (guided) ctx.fillStyle = `rgba(196,120,74,${0.7 + pulse * 0.25})`;
    else ctx.fillStyle = `rgba(61,158,143,${0.75 + pulse * 0.2})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = active
      ? `rgba(61,158,143,${0.6 + pulse * 0.3})`
      : `rgba(61,158,143,0.2)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `${active ? '500 ' : ''}12px "IBM Plex Mono", monospace`;
    ctx.fillStyle = active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ly = pos.y + r + 8;
    ctx.fillText(h.gene.id, pos.x, ly);
    if (active || guided) {
      ctx.font = '10px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = 'rgba(138,154,163,0.85)';
      ctx.fillText(h.gene.name || '', pos.x, ly + 14);
    }
    ctx.globalAlpha = 1;
  };

  ChamberCanvas.prototype._worldFromScreen = function (sx, sy) {
    // Inverse of: translate(cx+cam.x, cy+cam.y); scale; translate(-cx,-cy)
    const x = (sx - this.cx - this.cam.x) / this.cam.scale + this.cx;
    const y = (sy - this.cy - this.cam.y) / this.cam.scale + this.cy;
    return { x, y };
  };

  ChamberCanvas.prototype._hitTest = function (sx, sy) {
    const p = this._worldFromScreen(sx, sy);
    let best = null;
    let bestD = this._hitR / this.cam.scale;
    for (const h of this.hyphae) {
      const dx = p.x - h.tip.x;
      const dy = p.y - h.tip.y;
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
    if (gene && this.onGeneClick) {
      this.onGeneClick(gene);
      return;
    }
    this._dragging = true;
    this._lastPtr = { x: e.clientX, y: e.clientY };
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  };

  ChamberCanvas.prototype._onPtrUp = function () {
    this._dragging = false;
    this._lastPtr = null;
  };

  ChamberCanvas.prototype._onMove = function (e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (this._dragging && this._lastPtr) {
      const dx = e.clientX - this._lastPtr.x;
      const dy = e.clientY - this._lastPtr.y;
      this.cam.tx += dx;
      this.cam.ty += dy;
      this.cam.x += dx;
      this.cam.y += dy;
      this._vx = dx * 0.35;
      this._vy = dy * 0.35;
      this._lastPtr = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    const gene = this._hitTest(x, y);
    this.canvas.style.cursor = gene ? 'pointer' : 'grab';
  };

  ChamberCanvas.prototype._onWheel = function (e) {
    e.preventDefault();
    if (this._calm) return;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    this.cam.ts = clamp(this.cam.ts * factor, 0.4, 2.8);
    // Wheel zoom also nudges LOD hint toward data
    if (this.cam.ts < 0.95) this.lodLevel = 0;
    else if (this.cam.ts < 1.7) this.lodLevel = 1;
    else this.lodLevel = 2;
  };

  ChamberCanvas.prototype.geneScreenPos = function (id) {
    const h = this.hyphae.find((x) => x.gene.id === id);
    if (!h) return null;
    // Map world tip through current camera to screen
    const x = (h.tip.x - this.cx) * this.cam.scale + this.cx + this.cam.x;
    const y = (h.tip.y - this.cy) * this.cam.scale + this.cy + this.cam.y;
    return { x, y };
  };

  global.HyphaChamber = ChamberCanvas;
})(window);
