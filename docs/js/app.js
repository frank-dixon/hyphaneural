/**
 * Hyphaneural Pages demo — chamber · genome panel · gene follow · compare · tour
 */
(function () {
  'use strict';

  const TOUR_KEY = 'hypha_tour_seen_v1';
  const orgs = (window.HYPHA_ORG && window.HYPHA_ORG.organisms) || [];
  const genes = window.HYPHA_GENES || {};
  const defaults = (window.HYPHA_ORG && window.HYPHA_ORG.compare_defaults) || {
    a: 'bakers-yeast',
    b: 'schizosaccharomyces',
    gene: 'ACT1',
  };
  const panelDefaults = (window.HYPHA_ORG && window.HYPHA_ORG.panel_defaults) || {
    selected: ['bakers-yeast', 'schizosaccharomyces'],
    reference: 'bakers-yeast',
    filter: 'all',
  };

  const yeast = orgs.find((o) => o.slug === 'bakers-yeast') || orgs[0];
  const appEl = document.getElementById('app');
  const canvas = document.getElementById('chamber-canvas');
  const locLabel = document.getElementById('loc-label');

  // Chamber uses a focused subset so the mycelial view stays readable
  const chamberIds = ['SUC2', 'ACT1', 'HO', 'TEF1'].filter((id) => genes[id]);
  const chamberGenes = chamberIds.map((id) => genes[id]).filter(Boolean);

  const chamber = new window.HyphaChamber(canvas, {
    onGeneClick: function (g) {
      if (tour.active) {
        if (tour.step === 1 && g.id === 'SUC2') {
          nextTour();
          return;
        }
        return;
      }
      openGene(g.id);
    },
  });
  chamber.setGenes(chamberGenes);
  chamber.start();

  const geneFollow = new window.HyphaGeneFollow(document.getElementById('gene-panel'), {
    onClose: function () {
      chamber.setHighlight(null);
    },
    onCompare: function (g) {
      geneFollow.hide();
      openCompare(g.id);
    },
  });

  const comparePanel = document.getElementById('compare-panel');
  const compareView = new window.HyphaCompareView(document.getElementById('compare-canvas'));
  const cmpA = document.getElementById('cmp-a');
  const cmpB = document.getElementById('cmp-b');
  const cmpGene = document.getElementById('cmp-gene');
  const genomePanelEl = document.getElementById('genome-panel');

  const genomePanel = new window.HyphaGenomePanel(genomePanelEl, {
    orgs: orgs,
    genes: genes,
    defaults: panelDefaults,
    onGeneClick: function (gid) {
      openGene(gid);
    },
  });

  // Populate compare selects
  orgs.forEach((o) => {
    const optA = document.createElement('option');
    optA.value = o.slug;
    optA.textContent = o.common_name;
    cmpA.appendChild(optA);
    const optB = document.createElement('option');
    optB.value = o.slug;
    optB.textContent = o.common_name;
    cmpB.appendChild(optB);
  });
  const familyIds = Object.keys(genes).filter((id) => {
    const g = genes[id];
    return g.organisms && g.organisms.length > 1 && !g.alias_of && !g.stub;
  });
  ['ACT1', 'TEF1'].forEach((id) => {
    if (genes[id] && !familyIds.includes(id)) familyIds.unshift(id);
  });
  // Also allow stub families with multi-org for compare
  Object.keys(genes).forEach((id) => {
    const g = genes[id];
    if (g.organisms && g.organisms.length > 1 && !g.alias_of && !familyIds.includes(id)) {
      familyIds.push(id);
    }
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

  function refreshCompare() {
    const a = orgs.find((o) => o.slug === cmpA.value);
    const b = orgs.find((o) => o.slug === cmpB.value);
    const g = genes[cmpGene.value];
    if (!a || !b || !g) return;
    compareView.draw(g, a, b);
    const insight = document.getElementById('compare-insight');
    if (g.id === 'ACT1') {
      insight.textContent =
        'Same job, different evolutionary handwriting — actin scaffolds both yeasts, but the sequence tips drifted apart.';
    } else if (g.id === 'TEF1' || g.id === 'EF1A') {
      insight.textContent =
        'Translation elongation is non-negotiable. The core strand stays teal; the tips record lineage.';
    } else {
      insight.textContent = 'Same job, different evolutionary handwriting.';
    }
  }

  [cmpA, cmpB, cmpGene].forEach((el) => el.addEventListener('change', refreshCompare));

  function openGene(id) {
    const g = genes[id];
    if (!g) return;
    closeCompare();
    if (appEl.classList.contains('mode-strand')) {
      chamber.setHighlight(id);
    }
    geneFollow.show(g);
  }

  function openCompare(preferGeneId) {
    geneFollow.hide();
    chamber.setHighlight(null);
    if (preferGeneId && familyIds.includes(preferGeneId)) {
      cmpGene.value = preferGeneId;
    } else if (preferGeneId === 'ACT1') {
      cmpGene.value = 'ACT1';
    }
    comparePanel.hidden = false;
    refreshCompare();
  }

  function closeCompare() {
    comparePanel.hidden = true;
  }

  // ——— View modes: Strand (chamber) | Genome panel ———
  const btnStrand = document.getElementById('btn-mode-strand');
  const btnPanel = document.getElementById('btn-mode-panel');

  function setMode(mode) {
    const panel = mode === 'panel';
    appEl.classList.toggle('mode-panel', panel);
    appEl.classList.toggle('mode-strand', !panel);
    btnStrand.classList.toggle('on', !panel);
    btnPanel.classList.toggle('on', panel);
    btnStrand.setAttribute('aria-pressed', panel ? 'false' : 'true');
    btnPanel.setAttribute('aria-pressed', panel ? 'true' : 'false');
    genomePanel.setVisible(panel);
    if (panel) {
      if (tour.active) finishTour();
      geneFollow.hide();
      closeCompare();
      chamber.setHighlight(null);
      if (locLabel) locLabel.textContent = 'Genome panel · multi-organism';
    } else {
      if (locLabel) locLabel.textContent = "Inside Baker's yeast";
    }
  }

  btnStrand.addEventListener('click', () => setMode('strand'));
  btnPanel.addEventListener('click', () => setMode('panel'));

  document.getElementById('btn-close-compare').addEventListener('click', closeCompare);
  document.getElementById('btn-compare').addEventListener('click', () => openCompare('ACT1'));
  document.getElementById('btn-calm').addEventListener('click', () => {
    appEl.classList.toggle('calm');
  });

  // ——— Guided tour (Chamber only) ———
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
    steps: [
      {
        title: 'You are inside baker\'s yeast',
        body: 'This chamber is Saccharomyces cerevisiae. The curved teal hyphae are genes radiating from one living cell — not a spreadsheet of twelve dots.',
        action: function () {
          geneFollow.hide();
          closeCompare();
          chamber.setHighlight(null);
          chamber.pulseGene('SUC2', false);
        },
      },
      {
        title: 'Follow SUC2',
        body: 'That ember node is SUC2 — invertase. Tap it (or press Next) to watch the gene become a message, then a machine.',
        action: function () {
          chamber.pulseGene('SUC2', true);
          chamber.setHighlight('SUC2');
          placeSpotlight('SUC2');
        },
      },
      {
        title: 'DNA → mRNA → protein',
        body: 'Watch each step glow. DNA is the recipe. mRNA is the working copy. Protein is the enzyme that does the work.',
        action: function () {
          clearSpotlight();
          chamber.pulseGene('SUC2', false);
          openGene('SUC2');
        },
      },
      {
        title: 'Leave with this',
        body: 'This gene is a recipe for invertase — the enzyme that lets yeast break table sugar into fuel. That\'s genetics you can see, not a table you memorize.',
        action: function () {
          if (!geneFollow.isOpen()) openGene('SUC2');
        },
        nextLabel: 'Done',
      },
    ],
  };

  function placeSpotlight(geneId) {
    clearSpotlight();
    const pos = chamber.geneScreenPos(geneId);
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
    if (tour.spotlight) {
      tour.spotlight.remove();
      tour.spotlight = null;
    }
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
    if (appEl.classList.contains('mode-panel')) setMode('strand');
    tour.active = true;
    tour.step = 0;
    tour.el.hidden = false;
    renderTourStep();
  }

  function finishTour() {
    tour.active = false;
    tour.el.hidden = true;
    clearSpotlight();
    chamber.pulseGene('SUC2', false);
    try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { /* ignore */ }
  }

  function nextTour() {
    tour.step += 1;
    if (tour.step >= tour.steps.length) finishTour();
    else renderTourStep();
  }

  tour.nextBtn.addEventListener('click', nextTour);
  tour.skipBtn.addEventListener('click', finishTour);
  document.getElementById('btn-tour').addEventListener('click', startTour);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (tour.active) {
        finishTour();
        return;
      }
      if (geneFollow.isOpen()) geneFollow.hide();
      if (!comparePanel.hidden) closeCompare();
      if (appEl.classList.contains('calm')) appEl.classList.remove('calm');
    }
  });

  let seen = false;
  try { seen = localStorage.getItem(TOUR_KEY) === '1'; } catch (e) { /* ignore */ }
  if (!seen) {
    setTimeout(startTour, 700);
  }

  window.HyphaApp = { openGene, openCompare, startTour, chamber, setMode, genomePanel };
})();
