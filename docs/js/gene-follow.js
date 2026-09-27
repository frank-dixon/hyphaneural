/**
 * Gene follow — stepped DNA → mRNA → protein story with Meditative Expanse pacing.
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
    };
    this.onClose = opts && opts.onClose;
    this.onCompare = opts && opts.onCompare;
    this._timers = [];
    this._gene = null;

    this.els.close.addEventListener('click', () => this.hide());
    this.els.replay.addEventListener('click', () => this._playSteps());
    this.els.compare.addEventListener('click', () => {
      if (this.onCompare && this._gene) this.onCompare(this._gene);
    });
  }

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

    // Special takeaway for SUC2 / guided
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

    this._playSteps();
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

    steps.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'step';
      el.setAttribute('role', 'listitem');
      el.innerHTML =
        '<div class="step-stage">' + escapeHtml(s.stage) + '</div>' +
        '<div class="step-label">' + escapeHtml(s.label) + '</div>' +
        '<p class="step-plain">' + escapeHtml(s.plain_english || '') + '</p>' +
        '<div class="step-seq">' + escapeHtml(s.seq_hint || '') + '</div>';
      root.appendChild(el);

      // Staggered reveal — meditative (~1.6s per step)
      this._timers.push(setTimeout(() => {
        root.querySelectorAll('.step').forEach((n, j) => {
          n.classList.toggle('active', j === i);
          n.classList.toggle('done', j < i);
        });
      }, 400 + i * 1600));
    });

    // Final takeaway after last step settles
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
    // Shared core length from average similarity
    const shared = Math.min(simA, simB);

    const y1 = h * 0.32;
    const y2 = h * 0.68;
    const left = 24;
    const right = w - 24;
    const mid = left + (right - left) * shared;

    // Background grid whisper
    ctx.strokeStyle = 'rgba(61,158,143,0.06)';
    ctx.lineWidth = 1;
    for (let x = left; x < right; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 16);
      ctx.lineTo(x, h - 16);
      ctx.stroke();
    }

    // Shared core band
    ctx.fillStyle = 'rgba(61,158,143,0.08)';
    ctx.fillRect(left, 20, mid - left, h - 40);

    drawCurvedStrand(ctx, left, y1, mid, y1, right, y1 - 18, true, shared);
    drawCurvedStrand(ctx, left, y2, mid, y2, right, y2 + 22, false, shared);

    // Labels
    ctx.font = '11px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = 'rgba(212,220,226,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(orgA.common_name + ' — ' + (aMeta.label || gene.id), left, 18);
    ctx.fillText(orgB.common_name + ' — ' + (bMeta.label || gene.id), left, h - 8);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(61,158,143,0.9)';
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillText('shared core', (left + mid) / 2, h / 2 + 4);

    ctx.fillStyle = 'rgba(196,120,74,0.9)';
    ctx.fillText('divergent tips', (mid + right) / 2, h / 2 + 4);

    // Divider at shared/divergent boundary
    ctx.beginPath();
    ctx.moveTo(mid, 28);
    ctx.lineTo(mid, h - 28);
    ctx.strokeStyle = 'rgba(61,158,143,0.35)';
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  function drawCurvedStrand(ctx, x0, y0, xMid, yMid, x1, y1, up, shared) {
    // Shared portion — teal glow
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const c1x = x0 + (xMid - x0) * 0.5;
    const c1y = y0 + (up ? -14 : 14);
    ctx.quadraticCurveTo(c1x, c1y, xMid, yMid);
    ctx.strokeStyle = 'rgba(61,158,143,0.85)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Soft glow under shared
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(c1x, c1y, xMid, yMid);
    ctx.strokeStyle = 'rgba(61,158,143,0.25)';
    ctx.lineWidth = 10;
    ctx.stroke();

    // Divergent tip — ember, more curved
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
    ctx.strokeStyle = 'rgba(196,120,74,0.2)';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Tip node
    ctx.beginPath();
    ctx.arc(x1, y1, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#c4784a';
    ctx.fill();

    // Start node
    ctx.beginPath();
    ctx.arc(x0, y0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#3d9e8f';
    ctx.fill();
  }

  global.HyphaGeneFollow = GeneFollow;
  global.HyphaCompareView = CompareView;
})(window);
