/**
 * Hyphaneural Pages — Slow Ombre shell · horizontal mode dial · four spaces
 */
(function () {
  'use strict';

  const MODES = ['hex', 'strand', 'atlas', 'void'];
  const MODE_LABELS = {
    hex: 'Hex Reach',
    strand: 'Strand Zoom',
    atlas: 'Fungal Atlas',
    void: 'Void Breath',
  };
  const TOUR_KEY = 'hypha_tour_seen_v2';

  const appEl = document.getElementById('app');
  const track = document.getElementById('spaces-track');
  const viewport = document.getElementById('spaces-viewport');
  const dial = document.getElementById('mode-dial');
  const shellBg = document.getElementById('shell-bg');
  const locLabel = document.getElementById('loc-label');

  let orgs = [];
  let genes = {};
  let defaults = { a: 'bakers-yeast', b: 'schizosaccharomyces', gene: 'ACT1' };
  let panelDefaults = { selected: ['bakers-yeast', 'schizosaccharomyces'], reference: 'bakers-yeast', filter: 'all' };
  let yeast = null;
  let modeIndex = 1; // land on Strand Zoom
  let dialPos = 1; // continuous 0..3 for parallax
  let draggingDial = false;
  let dragStartX = 0;
  let dragStartPos = 0;
  let spaces = {};
  let geneFollow = null;
  let genomePanel = null;
  let compareView = null;
  let familyIds = [];

  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  // ——— Load seed ———
  function boot() {
    const loadJson = (url) => fetch(url).then((r) => {
      if (!r.ok) throw new Error(url);
      return r.json();
    });
    Promise.all([
      loadJson('data/organisms.json?v=tw1'),
      loadJson('data/genes.json?v=tw1'),
    ]).then(([orgData, geneData]) => {
      orgs = orgData.organisms || [];
      genes = geneData;
      if (orgData.compare_defaults) defaults = orgData.compare_defaults;
      if (orgData.panel_defaults) panelDefaults = orgData.panel_defaults;
      yeast = orgs.find((o) => o.slug === 'bakers-yeast') || orgs[0];
      init();
    }).catch((err) => {
      console.error('Hyphaneural seed load failed', err);
      document.getElementById('loc-label').textContent = 'Seed load failed — check data/';
    });
  }

  function init() {
    const chamberIds = ['SUC2', 'ACT1', 'HO', 'TEF1'].filter((id) => genes[id]);
    const chamberGenes = chamberIds.map((id) => genes[id]);

    spaces.hex = new window.HyphaSpace(document.getElementById('canvas-hex'), 'hex', {
      onGeneClick: (g) => { if (!tour.active) openGene(g.id); },
    });
    spaces.strand = new window.HyphaSpace(document.getElementById('canvas-strand'), 'strand', {
      onGeneClick: (g) => {
        if (tour.active) {
          if (tour.step === 1 && g.id === 'SUC2') { nextTour(); return; }
          return;
        }
        openGene(g.id);
      },
      onZoom: (z) => {
        document.querySelectorAll('#zoom-rail button').forEach((b) => {
          b.classList.toggle('on', parseInt(b.getAttribute('data-zoom'), 10) === z);
        });
        const hints = [
          'Wide field — mycelial expanse. Scroll or use the rail to zoom.',
          'Mid zoom — hexagonal data lattice. Genes become structure.',
          'Deep zoom — strand resolution. DNA→mRNA→protein teaching.',
        ];
        const h = document.getElementById('strand-hint');
        if (h) h.textContent = hints[z] || hints[0];
      },
    });
    spaces.atlas = new window.HyphaSpace(document.getElementById('canvas-atlas'), 'atlas', {
      onOrgClick: (o) => showAtlasCard(o),
    });
    spaces.void = new window.HyphaSpace(document.getElementById('canvas-void'), 'void', {});

    spaces.hex.setGenes(chamberGenes);
    spaces.strand.setGenes(chamberGenes);
    spaces.atlas.setOrgs(orgs);

    Object.keys(spaces).forEach((k) => {
      spaces[k].start();
      spaces[k].setActive(k === MODES[modeIndex]);
    });

    document.getElementById('hex-nodes').textContent = String(chamberGenes.length);
    document.getElementById('hex-reach').textContent = chamberGenes.length + ' loci';
    document.getElementById('atlas-hint').textContent =
      'Drag to explore · tap a fungus · fungi only · ' + orgs.length + ' organisms';

    geneFollow = new window.HyphaGeneFollow(document.getElementById('gene-panel'), {
      onClose: function () {
        spaces.strand.setHighlight(null);
        spaces.hex.setHighlight(null);
        if (spaces.strand.setLod) spaces.strand.setLod(0, null);
        showOrgOverview();
      },
      onCompare: function (g) {
        geneFollow.hide();
        openCompare(g.id);
      },
      onLod: function (level, geneId) {
        if (spaces.strand.setLod) spaces.strand.setLod(level, geneId || null);
        if (level === 0) showOrgOverview();
        else hideOrgOverviewSoft();
      },
      getOrganism: function () { return yeast; },
    });

    genomePanel = new window.HyphaGenomePanel(document.getElementById('genome-panel'), {
      orgs: orgs,
      genes: genes,
      defaults: panelDefaults,
      onGeneClick: function (gid) { openGene(gid); },
    });

    compareView = new window.HyphaCompareView(document.getElementById('compare-canvas'));
    setupCompare();
    setupDial();
    setupChrome();
    setupTour();
    showOrgOverview();
    goToMode(modeIndex, false);

    let seen = false;
    try { seen = localStorage.getItem(TOUR_KEY) === '1'; } catch (e) { /* */ }
    if (!seen) setTimeout(startTour, 800);

    window.HyphaApp = { goToMode, openGene, openCompare, startTour, spaces, orgs };
  }

  // ——— Horizontal dial ———
  function setupDial() {
    dial.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = btn.getAttribute('data-mode');
        const i = MODES.indexOf(m);
        if (i >= 0) goToMode(i, true);
      });
    });

    // pointer drag: horizontal-dominant → mode dial; vertical → canvas explore
    let ptrId = null;
    let axisLocked = null; // 'x' | 'y' | null
    let origin = null;
    window.__hyphaDialGesture = false;
    viewport.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, a, select, input, .panel, .atlas-card, .genome-panel, .mode-dial')) return;
      ptrId = e.pointerId;
      draggingDial = true;
      axisLocked = null;
      window.__hyphaDialGesture = false;
      dragStartX = e.clientX;
      dragStartPos = dialPos;
      origin = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!draggingDial || e.pointerId !== ptrId) return;
      const dx = e.clientX - dragStartX;
      const odx = e.clientX - origin.x;
      const ody = e.clientY - origin.y;
      if (!axisLocked && Math.abs(odx) + Math.abs(ody) > 10) {
        axisLocked = Math.abs(odx) > Math.abs(ody) * 1.15 ? 'x' : 'y';
        if (axisLocked === 'x') {
          window.__hyphaDialGesture = true;
          track.classList.add('dragging');
          viewport.classList.add('is-dragging');
        }
      }
      if (axisLocked !== 'x') return;
      e.preventDefault();
      const w = viewport.clientWidth || 1;
      dialPos = clamp(dragStartPos - dx / w, 0, MODES.length - 1);
      applyTrack(dialPos, true);
      updateParallax(dialPos);
    }, { passive: false });
    function endDial(e) {
      if (!draggingDial) return;
      if (e && ptrId != null && e.pointerId !== ptrId) return;
      const wasX = axisLocked === 'x';
      draggingDial = false;
      track.classList.remove('dragging');
      viewport.classList.remove('is-dragging');
      window.__hyphaDialGesture = false;
      if (wasX) goToMode(Math.round(dialPos), true);
      else applyTrack(modeIndex, false);
      ptrId = null;
      axisLocked = null;
      origin = null;
    }
    window.addEventListener('pointerup', endDial);
    window.addEventListener('pointercancel', endDial);

    // horizontal wheel / trackpad
    viewport.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 4) {
        e.preventDefault();
        dialPos = clamp(dialPos + e.deltaX / (viewport.clientWidth || 1), 0, MODES.length - 1);
        applyTrack(dialPos, true);
        updateParallax(dialPos);
        clearTimeout(viewport._wheelSnap);
        viewport._wheelSnap = setTimeout(() => goToMode(Math.round(dialPos), true), 120);
      }
    }, { passive: false });

    // keyboard
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, select, textarea')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToMode(modeIndex - 1, true); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goToMode(modeIndex + 1, true); }
      if (e.key === 'Escape') {
        if (tour.active) { finishTour(); return; }
        if (geneFollow && geneFollow.isOpen()) geneFollow.hide();
        closeCompare();
        closeGenome();
        closeAtlasCard();
        appEl.classList.remove('calm');
      }
    });
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function applyTrack(pos, immediateDrag) {
    // track width = 4 * 100% of viewport; each space is 25% of track = 100% viewport
    // translate by -pos * (100% / 4) of track = -pos * 25% of track width... 
    // Actually spaces-track is width 400% of viewport, each space 25% of track = 100% viewport.
    // translateX(-pos * 25%) of track ≡ -pos * 100% of viewport. Use % of track:
    const pct = (pos / MODES.length) * 100;
    track.style.transform = 'translate3d(-' + pct + '%, 0, 0)';
  }

  function updateParallax(pos) {
    // SNES multiplane: layers shift at different rates with dial position
    const centered = pos - (MODES.length - 1) / 2;
    shellBg.querySelectorAll('.para').forEach((el) => {
      const rate = parseFloat(el.getAttribute('data-para') || '0.3');
      const x = -centered * rate * 48;
      const y = Math.sin(pos * 0.7) * rate * 6;
      el.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
    });
    // subtle ombre shift
    const ombre = document.getElementById('ombre-pulse');
    if (ombre) {
      ombre.style.transform = 'translate3d(' + (-centered * 12) + 'px, 0, 0) scale(1.02)';
    }
  }

  function goToMode(index, animate) {
    modeIndex = clamp(index, 0, MODES.length - 1);
    dialPos = modeIndex;
    if (!animate) track.classList.add('dragging');
    applyTrack(modeIndex, false);
    updateParallax(modeIndex);
    if (!animate) {
      requestAnimationFrame(() => track.classList.remove('dragging'));
    }
    const mode = MODES[modeIndex];
    appEl.setAttribute('data-mode', mode);
    dial.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b.getAttribute('data-mode') === mode);
    });
    Object.keys(spaces).forEach((k) => {
      spaces[k].setActive(k === mode);
    });
    if (mode === 'strand') {
      locLabel.textContent = "Strand Zoom · " + (yeast ? yeast.common_name : "Baker's yeast");
      showOrgOverview();
    } else if (mode === 'hex') {
      locLabel.textContent = 'Hex Reach · observe · connect';
    } else if (mode === 'atlas') {
      locLabel.textContent = 'Fungal Atlas · ' + orgs.length + ' fungi';
    } else {
      locLabel.textContent = 'Void Breath · living field';
    }
    // light explore parallax nudge
    if (!reducedMotion()) {
      shellBg.style.transition = 'none';
    }
  }

  // ——— Content actions ———
  function showOrgOverview() {
    const cap = document.getElementById('chamber-caption');
    const ov = document.getElementById('cap-overview');
    const clade = document.getElementById('cap-clade');
    if (cap) cap.classList.remove('dim');
    if (ov && yeast) {
      const o = yeast.overview || {};
      ov.textContent = (yeast.short_blurb || '') + (o.teach ? ' — ' + o.teach : '');
    }
    if (clade && yeast) {
      clade.textContent = (yeast.clade || '') + (yeast.form ? ' · ' + yeast.form : '');
    }
  }
  function hideOrgOverviewSoft() {
    const cap = document.getElementById('chamber-caption');
    if (cap) cap.classList.add('dim');
  }

  function openGene(id) {
    const g = genes[id];
    if (!g) return;
    closeCompare();
    // prefer Strand Zoom for gene teaching
    if (MODES[modeIndex] !== 'strand' && MODES[modeIndex] !== 'hex') {
      goToMode(MODES.indexOf('strand'), true);
    }
    if (spaces.strand) spaces.strand.setHighlight(id);
    if (spaces.hex) spaces.hex.setHighlight(id);
    geneFollow.show(g);
  }

  function setupCompare() {
    const cmpA = document.getElementById('cmp-a');
    const cmpB = document.getElementById('cmp-b');
    const cmpGene = document.getElementById('cmp-gene');
    orgs.forEach((o) => {
      [cmpA, cmpB].forEach((sel) => {
        const opt = document.createElement('option');
        opt.value = o.slug;
        opt.textContent = o.common_name;
        sel.appendChild(opt);
      });
    });
    familyIds = Object.keys(genes).filter((id) => {
      const g = genes[id];
      return g.organisms && g.organisms.length > 1 && !g.alias_of;
    });
    ['ACT1', 'TEF1', 'SUC2'].forEach((id) => {
      if (genes[id] && !familyIds.includes(id)) familyIds.unshift(id);
    });
    familyIds.forEach((id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id + ' — ' + (genes[id].name || id);
      cmpGene.appendChild(opt);
    });
    cmpA.value = defaults.a;
    cmpB.value = defaults.b;
    cmpGene.value = defaults.gene;
    function refresh() {
      const a = orgs.find((o) => o.slug === cmpA.value);
      const b = orgs.find((o) => o.slug === cmpB.value);
      const g = genes[cmpGene.value];
      if (!a || !b || !g) return;
      compareView.draw(g, a, b);
      const insight = document.getElementById('compare-insight');
      insight.textContent = 'Same job, different evolutionary handwriting.';
    }
    [cmpA, cmpB, cmpGene].forEach((el) => el.addEventListener('change', refresh));
    window._hyphaRefreshCompare = refresh;
  }

  function openCompare(preferGeneId) {
    if (geneFollow && geneFollow.isOpen()) geneFollow.hide();
    if (preferGeneId && familyIds.includes(preferGeneId)) {
      document.getElementById('cmp-gene').value = preferGeneId;
    }
    document.getElementById('compare-panel').hidden = false;
    if (window._hyphaRefreshCompare) window._hyphaRefreshCompare();
  }
  function closeCompare() {
    document.getElementById('compare-panel').hidden = true;
  }

  function openGenome() {
    document.getElementById('genome-panel').hidden = false;
    if (genomePanel && genomePanel.setVisible) genomePanel.setVisible(true);
    // Hex Reach is the natural home for genome compare
    if (MODES[modeIndex] !== 'hex') goToMode(0, true);
  }
  function closeGenome() {
    document.getElementById('genome-panel').hidden = true;
    if (genomePanel && genomePanel.setVisible) genomePanel.setVisible(false);
  }

  function showAtlasCard(o) {
    const card = document.getElementById('atlas-card');
    card.hidden = false;
    document.getElementById('atlas-name').textContent = o.common_name;
    document.getElementById('atlas-sci').textContent = o.scientific_name;
    document.getElementById('atlas-clade').textContent = (o.clade || '') + (o.form ? ' · ' + o.form : '');
    document.getElementById('atlas-blurb').textContent = o.short_blurb || '';
    document.getElementById('atlas-form').textContent = o.form || 'fungus';
    card._org = o;
  }
  function closeAtlasCard() {
    document.getElementById('atlas-card').hidden = true;
  }

  function setupChrome() {
    document.getElementById('btn-compare').addEventListener('click', () => openCompare('ACT1'));
    document.getElementById('btn-genome').addEventListener('click', openGenome);
    document.getElementById('btn-close-genome').addEventListener('click', closeGenome);
    document.getElementById('btn-close-compare').addEventListener('click', closeCompare);
    document.getElementById('btn-calm').addEventListener('click', () => appEl.classList.toggle('calm'));
    document.getElementById('btn-close-atlas').addEventListener('click', closeAtlasCard);
    document.getElementById('btn-atlas-enter').addEventListener('click', () => {
      closeAtlasCard();
      goToMode(MODES.indexOf('strand'), true);
      if (spaces.strand) spaces.strand.replayGrowth();
    });
    document.querySelectorAll('#zoom-rail button').forEach((b) => {
      b.addEventListener('click', () => {
        const z = parseInt(b.getAttribute('data-zoom'), 10);
        if (spaces.strand) spaces.strand.setZoomLevel(z);
      });
    });
  }

  // ——— Tour → Strand Zoom · SUC2 ———
  const tour = {
    active: false,
    step: 0,
    el: document.getElementById('tour'),
    title: document.getElementById('tour-title'),
    body: document.getElementById('tour-body'),
    dots: document.getElementById('tour-dots'),
    nextBtn: document.getElementById('btn-tour-next'),
    skipBtn: document.getElementById('btn-tour-skip'),
    spotlight: null,
    steps: [],
  };

  function setupTour() {
    tour.steps = [
      {
        title: 'Four spaces, one shell',
        body: 'Swipe sideways like a giant dial: Hex Reach, Strand Zoom, Fungal Atlas, Void Breath. The Slow Ombre background pulses underneath with parallax depth.',
        action: function () {
          goToMode(MODES.indexOf('strand'), true);
          if (geneFollow) geneFollow.hide();
          closeCompare();
          closeGenome();
          spaces.strand.setHighlight(null);
        },
      },
      {
        title: 'You are inside baker\'s yeast',
        body: 'Strand Zoom lands you in Saccharomyces cerevisiae. Follow the ember node — SUC2 invertase — to watch a gene become a machine.',
        action: function () {
          spaces.strand.pulseGene('SUC2', true);
          spaces.strand.setHighlight('SUC2');
          placeSpotlight('SUC2');
        },
      },
      {
        title: 'DNA → mRNA → protein',
        body: 'Watch each step glow. DNA is the recipe. mRNA is the working copy. Protein is the enzyme that does the work.',
        action: function () {
          clearSpotlight();
          spaces.strand.pulseGene('SUC2', false);
          openGene('SUC2');
        },
      },
      {
        title: 'Leave with this',
        body: 'This gene is a recipe for invertase — the enzyme that lets yeast break table sugar into fuel. Swipe into Atlas for more fungi, Hex for lattice compare, Void to breathe.',
        action: function () {
          if (geneFollow && !geneFollow.isOpen()) openGene('SUC2');
        },
        nextLabel: 'Done',
      },
    ];
    tour.nextBtn.addEventListener('click', nextTour);
    tour.skipBtn.addEventListener('click', finishTour);
    document.getElementById('btn-tour').addEventListener('click', startTour);
  }

  function placeSpotlight(geneId) {
    clearSpotlight();
    const pos = spaces.strand.geneScreenPos(geneId);
    if (!pos) return;
    const el = document.createElement('div');
    el.className = 'tour-spotlight';
    el.style.width = '56px';
    el.style.height = '56px';
    el.style.left = pos.x - 28 + 'px';
    el.style.top = pos.y - 28 + 'px';
    appEl.appendChild(el);
    tour.spotlight = el;
  }
  function clearSpotlight() {
    if (tour.spotlight) { tour.spotlight.remove(); tour.spotlight = null; }
  }
  function renderTourStep() {
    const s = tour.steps[tour.step];
    if (!s) return finishTour();
    tour.title.textContent = s.title;
    tour.body.textContent = s.body;
    tour.nextBtn.textContent = s.nextLabel || (tour.step === tour.steps.length - 1 ? 'Done' : 'Next');
    tour.dots.innerHTML = '';
    tour.steps.forEach((_, i) => {
      const d = document.createElement('span');
      if (i <= tour.step) d.className = 'on';
      tour.dots.appendChild(d);
    });
    if (s.action) s.action();
  }
  function startTour() {
    goToMode(MODES.indexOf('strand'), true);
    tour.active = true;
    tour.step = 0;
    tour.el.hidden = false;
    renderTourStep();
  }
  function finishTour() {
    tour.active = false;
    tour.el.hidden = true;
    clearSpotlight();
    if (spaces.strand) spaces.strand.pulseGene('SUC2', false);
    try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { /* */ }
  }
  function nextTour() {
    tour.step += 1;
    if (tour.step >= tour.steps.length) finishTour();
    else renderTourStep();
  }

  // light continuous parallax while exploring (gentle)
  let exploreT = 0;
  function exploreLoop() {
    exploreT += 0.004;
    if (!draggingDial && !reducedMotion()) {
      const base = modeIndex;
      const wobble = Math.sin(exploreT) * 0.02;
      updateParallax(base + wobble);
    }
    requestAnimationFrame(exploreLoop);
  }
  requestAnimationFrame(exploreLoop);

  boot();
})();
