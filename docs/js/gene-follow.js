/**
 * Gene follow — LOD drill: organism → gene/family → DNA→mRNA→protein
 * Camera zoom into data is driven via onLod; teaching stays Quiet Protomol.
 */
(function (global) {
  'use strict';

  function GeneFollow(panel, opts) {
    this.panel = panel;
    this.els = {
      id: panel.querySelector('#gene-id'),
      name: panel.querySelector('#gene-name'),
      role: panel.querySelector('#gene-role'),
      steps: panel.querySelector('#gene-steps'),
      takeaway: panel.querySelector('#gene-takeaway'),
      replay: panel.querySelector('#btn-replay-steps'),
      compare: panel.querySelector('#btn-compare-from-gene'),
      close: panel.querySelector('#btn-close-gene'),
      lod: panel.querySelector('#gene-lod'),
      family: panel.querySelector('#gene-family'),
      org: panel.querySelector('#gene-org-context'),
    };
    this.onClose = opts && opts.onClose;
    this.onCompare = opts && opts.onCompare;
    this.onLod = opts && opts.onLod; // (level, geneId) → camera zoom
    this.getOrganism = opts && opts.getOrganism;
    this._timers = [];
    this._gene = null;
    this._lod = 1; // open at family; dogma plays after

    this.els.close.addEventListener('click', () => this.hide());
    this.els.replay.addEventListener('click', () => {
      this._lod = 2;
      this._renderLodChrome();
      this._playSteps();
      if (this.onLod) this.onLod(2, this._gene && this._gene.id);
    });
    this.els.compare.addEventListener('click', () => {
      if (this.onCompare && this._gene) this.onCompare(this._gene);
    });
    if (this.els.lod) {
      this.els.lod.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-lod]');
        if (!btn) return;
        const level = parseInt(btn.getAttribute('data-lod'), 10);
        this.setLod(level);
      });
    }
  }

  GeneFollow.prototype.setLod = function (level) {
    this._lod = Math.max(0, Math.min(2, level));
    this._renderLodChrome();
    if (this.onLod) this.onLod(this._lod, this._gene && this._gene.id);
    if (this._lod === 2) this._playSteps();
    else {
      this._clearTimers();
      this._renderFamilyOrOrg();
    }
  };

  GeneFollow.prototype.show = function (gene) {
    this._gene = gene;
    this.panel.hidden = false;
    this.panel.classList.toggle('is-stub', !!gene.stub);
    this.els.id.textContent = gene.id + (gene.stub ? ' · stub' : '');
    this.els.name.textContent = gene.name;
    this.els.role.textContent = gene.role;

    this.els.takeaway.classList.remove('visible');
    this.els.takeaway.textContent = gene.phenotype
      ? 'This gene is a recipe for ' + (gene.name.toLowerCase().indexOf('invertase') >= 0
          ? 'invertase — the enzyme that lets yeast break table sugar into fuel.'
          : gene.name + ' — ' + gene.phenotype)
      : '';

    if (gene.id === 'SUC2' || gene.guided) {
      this.els.takeaway.textContent =
        'This gene is a recipe for invertase — the enzyme that lets yeast break table sugar into fuel.';
    } else if (gene.stub) {
      this.els.takeaway.textContent =
        'Mock / limited annotation — this linear-panel slot is a simplified placeholder. Open SUC2, ACT1, HO, or TEF1 for a full DNA → mRNA → protein story.';
    }

    this.els.compare.style.display =
      (gene.compare || gene.compare_default || gene.family || (gene.organisms && gene.organisms.length > 1))
        ? ''
        : 'none';

    // Enter at family LOD, then auto-descend into dogma story
    this._lod = 1;
    this._renderLodChrome();
    this._renderFamilyOrOrg();
    if (this.onLod) this.onLod(1, gene.id);

    this._clearTimers();
    this._timers.push(setTimeout(() => {
      if (!this._gene || this._gene.id !== gene.id) return;
      this._lod = 2;
      this._renderLodChrome();
      this._playSteps();
      if (this.onLod) this.onLod(2, gene.id);
    }, 1100));
  };

  GeneFollow.prototype._renderLodChrome = function () {
    if (!this.els.lod) return;
    const labels = ['Organism', 'Gene / family', 'DNA → protein'];
    this.els.lod.innerHTML = labels
      .map((lab, i) => {
        const on = i === this._lod ? ' on' : i < this._lod ? ' done' : '';
        return (
          '<button type="button" class="lod-chip flex-1 text-[0.58rem] tracking-wider uppercase px-1.5 py-1.5 border border-white/15 bg-transparent text-mist rounded-sm cursor-pointer' + on + '" data-lod="' + i + '">' +
          '<span class="lod-n font-mono mr-1 text-white/40">' + (i + 1) + '</span>' + escapeHtml(lab) +
          '</button>'
        );
      })
      .join('<span class="lod-sep text-white/25 px-0.5 self-center" aria-hidden="true">→</span>');
  };

  GeneFollow.prototype._renderFamilyOrOrg = function () {
    const gene = this._gene;
    if (!gene || !this.els.steps) return;
    this.els.takeaway.classList.remove('visible');
    const root = this.els.steps;
    root.innerHTML = '';

    if (this._lod === 0) {
      const org = this.getOrganism ? this.getOrganism() : null;
      const ov = (org && org.overview) || {};
      const el = document.createElement('div');
      el.className = 'step active lod-card';
      el.innerHTML =
        '<div class="step-stage font-mono text-[0.58rem] tracking-widest text-teal-bright mb-1">Organism</div>' +
        '<div class="step-label text-[0.88rem] text-white mb-1">' + escapeHtml(org ? org.common_name : "Baker's yeast") + '</div>' +
        '<p class="step-plain text-[0.78rem] leading-snug text-mist m-0 mb-1">' + escapeHtml((org && org.short_blurb) || '') + '</p>' +
        '<p class="step-plain text-[0.78rem] leading-snug text-mist m-0 mb-1">' + escapeHtml(ov.why || '') + '</p>' +
        '<p class="step-plain text-[0.78rem] leading-snug text-mist m-0 mb-1">' + escapeHtml(ov.habitat || '') + '</p>' +
        '<p class="step-plain text-[0.78rem] leading-snug text-mist m-0 mb-1">' + escapeHtml(ov.teach || '') + '</p>' +
        '<div class="step-seq font-mono text-[0.62rem] text-mist-dim mt-1.5">' + escapeHtml((org && org.clade) || '') + ' · ' +
        escapeHtml((ov.genome_note) || 'mock / public-annotation style') + '</div>';
      root.appendChild(el);
      if (this.els.family) this.els.family.hidden = true;
      if (this.els.org) {
        this.els.org.hidden = false;
        this.els.org.textContent = org ? (org.scientific_name + ' · ' + (org.form || '')) : '';
      }
      return;
    }

    // Family level
    const fd = gene.family_detail || {};
    const el = document.createElement('div');
    el.className = 'step active lod-card';
    el.innerHTML =
      '<div class="step-stage font-mono text-[0.58rem] tracking-widest text-teal-bright mb-1">Gene / family</div>' +
      '<div class="step-label text-[0.88rem] text-white mb-1">' + escapeHtml(fd.title || (gene.family || gene.id) + ' family') + '</div>' +
      '<p class="step-plain text-[0.78rem] leading-snug text-mist m-0 mb-1">' + escapeHtml(fd.plain_english || gene.role || '') + '</p>' +
      '<p class="step-plain text-[0.78rem] leading-snug text-mist m-0 mb-1">' + escapeHtml(fd.why_it_matters || gene.phenotype || '') + '</p>' +
      '<p class="step-plain text-[0.78rem] leading-snug text-mist m-0 mb-1">' + escapeHtml(fd.conservation || '') + '</p>' +
      '<div class="step-seq font-mono text-[0.62rem] text-mist-dim mt-1.5">' +
      escapeHtml((gene.organisms || []).length + ' organisms in catalog · ' + (gene.stub ? 'stub / mock' : 'teaching annotation')) +
      '</div>';
    root.appendChild(el);
    if (this.els.family) {
      this.els.family.hidden = false;
      this.els.family.textContent = (gene.family || gene.id).toUpperCase();
    }
    if (this.els.org) this.els.org.hidden = true;
  };

  GeneFollow.prototype._clearTimers = function () {
    this._timers.forEach(clearTimeout);
    this._timers = [];
  };

  GeneFollow.prototype._playSteps = function () {
    this._clearTimers();
    const gene = this._gene;
    if (!gene) return;
    const steps = gene.steps || [];
    const root = this.els.steps;
    root.innerHTML = '';
    this.els.takeaway.classList.remove('visible');
    if (this.els.family) {
      this.els.family.hidden = false;
      this.els.family.textContent = (gene.family || gene.id).toUpperCase();
    }

    steps.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'step';
      el.setAttribute('role', 'listitem');
      el.innerHTML =
        '<div class="step-stage font-mono text-[0.58rem] tracking-widest text-teal-bright mb-1">' + escapeHtml(s.stage) + '</div>' +
        '<div class="step-label text-[0.88rem] text-white mb-1">' + escapeHtml(s.label) + '</div>' +
        '<p class="step-plain text-[0.78rem] leading-snug text-mist m-0">' + escapeHtml(s.plain_english || '') + '</p>' +
        '<div class="step-seq font-mono text-[0.62rem] text-mist-dim mt-1.5">' + escapeHtml(s.seq_hint || '') + '</div>';
      root.appendChild(el);

      this._timers.push(setTimeout(() => {
        root.querySelectorAll('.step').forEach((n, j) => {
          n.classList.toggle('active', j === i);
          n.classList.toggle('done', j < i);
        });
        // Light camera nudge deeper as stages advance
        if (this.onLod) this.onLod(2, gene.id);
      }, 400 + i * 1600));
    });

    const doneAt = 400 + steps.length * 1600 + 400;
    this._timers.push(setTimeout(() => {
      root.querySelectorAll('.step').forEach((n) => {
        n.classList.remove('active');
        n.classList.add('done');
      });
      if (this.els.takeaway.textContent) this.els.takeaway.classList.add('visible');
    }, doneAt));
  };

  GeneFollow.prototype.hide = function () {
    this._clearTimers();
    this.panel.hidden = true;
    if (this.onLod) this.onLod(0, null);
    if (this.onClose) this.onClose();
  };

  GeneFollow.prototype.isOpen = function () {
    return !this.panel.hidden;
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Dual-strand compare canvas */
  function CompareView(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  CompareView.prototype.draw = function (gene, orgA, orgB) {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = c.clientWidth || 640;
    const cssH = 220;
    c.width = Math.floor(cssW * dpr);
    c.height = Math.floor(cssH * dpr);
    c.style.height = cssH + 'px';
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cssW;
    const h = cssH;
    ctx.clearRect(0, 0, w, h);

    const cmp = (gene && gene.compare) || {};
    const aMeta = cmp[orgA.slug] || { similarity: 0.9, label: orgA.scientific_name };
    const bMeta = cmp[orgB.slug] || { similarity: 0.82, label: orgB.scientific_name };
    const simA = aMeta.similarity != null ? aMeta.similarity : 0.9;
    const simB = bMeta.similarity != null ? bMeta.similarity : 0.82;
    const shared = Math.min(simA, simB);

    const y1 = h * 0.32;
    const y2 = h * 0.68;
    const left = 24;
    const right = w - 24;
    const mid = left + (right - left) * shared;

    // Hex whisper under compare
    ctx.strokeStyle = 'rgba(61,158,143,0.07)';
    ctx.lineWidth = 1;
    const R = 14;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 20; col++) {
        const x = left + col * R * 1.4 + (row % 2 ? R * 0.7 : 0);
        const y = 24 + row * R * 1.15;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (Math.PI / 3) * i + Math.PI / 6;
          const px = x + Math.cos(ang) * R * 0.45;
          const py = y + Math.sin(ang) * R * 0.45;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(61,158,143,0.08)';
    ctx.fillRect(left, 20, mid - left, h - 40);

    drawCurvedStrand(ctx, left, y1, mid, y1, right, y1 - 18, true, shared);
    drawCurvedStrand(ctx, left, y2, mid, y2, right, y2 + 22, false, shared);

    ctx.font = '11px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = 'rgba(212,220,226,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(orgA.common_name + ' — ' + (aMeta.label || gene.id), left, 18);
    ctx.fillText(orgB.common_name + ' — ' + (bMeta.label || gene.id), left, h - 8);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(94,196,180,0.95)';
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillText('shared core', (left + mid) / 2, h / 2 + 4);

    ctx.fillStyle = 'rgba(224,146,96,0.95)';
    ctx.fillText('divergent tips', (mid + right) / 2, h / 2 + 4);

    ctx.beginPath();
    ctx.moveTo(mid, 28);
    ctx.lineTo(mid, h - 28);
    ctx.strokeStyle = 'rgba(61,158,143,0.35)';
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  function drawCurvedStrand(ctx, x0, y0, xMid, yMid, x1, y1, up, shared) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const c1x = x0 + (xMid - x0) * 0.5;
    const c1y = y0 + (up ? -14 : 14);
    ctx.quadraticCurveTo(c1x, c1y, xMid, yMid);
    ctx.strokeStyle = 'rgba(61,158,143,0.85)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(c1x, c1y, xMid, yMid);
    ctx.strokeStyle = 'rgba(94,196,180,0.28)';
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(xMid, yMid);
    const c2x = xMid + (x1 - xMid) * 0.4;
    const c2y = y1 + (up ? -28 : 28);
    ctx.quadraticCurveTo(c2x, c2y, x1, y1);
    ctx.strokeStyle = 'rgba(196,120,74,0.9)';
    ctx.lineWidth = 2.8;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(xMid, yMid);
    ctx.quadraticCurveTo(c2x, c2y, x1, y1);
    ctx.strokeStyle = 'rgba(224,146,96,0.22)';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x1, y1, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#c4784a';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x0, y0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#5ec4b4';
    ctx.fill();
  }

  global.HyphaGeneFollow = GeneFollow;
  global.HyphaCompareView = CompareView;
})(window);
