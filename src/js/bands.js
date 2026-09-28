/**
 * Hyphaneural — heads-up gene-band analyzer (gel / track / spectrum)
 * ------------------------------------------------------------------
 * WHAT: Always-available HUD that paints genes as visual bands, not a list.
 *       Position = Ensembl chromosome order; height = UniProt protein length;
 *       color = shared (Ensembl ortholog hit) vs yeast-unique in the check set.
 * WHY:  Glanceable fungal compare so a reader can infer shared cores vs unique tips.
 * DATA: docs/data/bands.json from build-time UniProt + Ensembl Fungi fetch.
 * LOAD: Minified → docs/js/bands.js. Edit src/js/bands.js.
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function citeLink(c) {
    if (!c || !c.url) {
      return '<span class="text-mist-dim">' + escapeHtml((c && c.source) || 'source') +
        (c && c.id ? ' · ' + escapeHtml(c.id) : '') + '</span>';
    }
    return (
      '<a class="text-teal-bright/90 underline decoration-white/20 hover:decoration-teal-bright" ' +
      'href="' + escapeHtml(c.url) + '" target="_blank" rel="noopener">' +
      escapeHtml(c.source) + ' · ' + escapeHtml(c.id) + '</a>'
    );
  }

  /**
   * Heads-up analyzer: gel-style spectrum + ortholog compare lanes.
   * @param {HTMLElement} root
   * @param {{ onGeneClick?: function, onCompareInsight?: function }} opts
   */
  function BandAnalyzer(root, opts) {
    this.root = root;
    this.onGeneClick = opts && opts.onGeneClick;
    this.data = null;
    this.selectedId = null;
    this.filter = 'all'; // all | shared | unique
    this.compareOn = true;
    this._bound = false;
  }

  BandAnalyzer.prototype.load = function (payload) {
    this.data = payload;
    if (!this._bound) {
      this._bind();
      this._bound = true;
    }
    this.render();
  };

  BandAnalyzer.prototype.setVisible = function (on) {
    this.root.hidden = !on;
    this.root.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (on) this.render();
  };

  BandAnalyzer.prototype.isVisible = function () {
    return !this.root.hidden;
  };

  BandAnalyzer.prototype.highlight = function (geneId) {
    this.selectedId = geneId || null;
    this.root.querySelectorAll('[data-band]').forEach((el) => {
      el.classList.toggle('ring-1', el.getAttribute('data-band') === this.selectedId);
      el.classList.toggle('ring-white/70', el.getAttribute('data-band') === this.selectedId);
      el.classList.toggle('z-10', el.getAttribute('data-band') === this.selectedId);
    });
    if (this.selectedId) this._renderDetail(this.selectedId);
  };

  BandAnalyzer.prototype._bind = function () {
    const root = this.root;
    root.addEventListener('click', (e) => {
      const band = e.target.closest('[data-band]');
      if (band) {
        const id = band.getAttribute('data-band');
        this.selectedId = id;
        this.highlight(id);
        this._renderDetail(id);
        if (this.onGeneClick) this.onGeneClick(id);
        return;
      }
      const filt = e.target.closest('[data-band-filter]');
      if (filt) {
        this.filter = filt.getAttribute('data-band-filter');
        this.render();
        return;
      }
      const tog = e.target.closest('[data-band-compare-toggle]');
      if (tog) {
        this.compareOn = !this.compareOn;
        this.render();
        return;
      }
      const close = e.target.closest('[data-band-close]');
      if (close && this.onClose) this.onClose();
    });
  };

  BandAnalyzer.prototype._bandsFiltered = function () {
    const bands = (this.data && this.data.bands) || [];
    if (this.filter === 'shared') {
      return bands.filter((b) => (b.ortholog_count || 0) >= 1);
    }
    if (this.filter === 'unique') {
      return bands.filter((b) => (b.ortholog_count || 0) === 0);
    }
    return bands.slice();
  };

  BandAnalyzer.prototype._maxLen = function (bands) {
    let m = 1;
    bands.forEach((b) => {
      const n = b.protein_length_aa || 0;
      if (n > m) m = n;
    });
    return m;
  };

  BandAnalyzer.prototype.render = function () {
    if (!this.data) {
      this.root.innerHTML =
        '<div class="p-3 text-[0.82rem] text-mist leading-snug">' +
        'The band analyzer is still loading curated UniProt and Ensembl Fungi records. ' +
        'If this message stays, the bands.json seed may be missing from data/.</div>';
      return;
    }

    const bands = this._bandsFiltered();
    const all = this.data.bands || [];
    const maxLen = this._maxLen(all);
    const sharedN = all.filter((b) => (b.ortholog_count || 0) >= 1).length;
    const uniqueN = all.filter((b) => (b.ortholog_count || 0) === 0).length;
    const org = this.data.organism || {};
    const fetched = this.data.fetched_at || '';

    let html = '';
    html +=
      '<div class="flex items-start justify-between gap-3 mb-2">' +
      '<div>' +
      '<div class="text-[0.58rem] tracking-widest uppercase text-white/45 mb-1">Heads-up analyzer</div>' +
      '<h2 class="m-0 font-display font-normal text-[1.15rem] text-white leading-tight">Gene bands for ' +
      escapeHtml(org.scientific_name || "baker's yeast") +
      '</h2>' +
      '<p class="m-0 mt-1.5 text-[0.78rem] leading-snug text-mist max-w-[52ch]">' +
      'Each vertical band is one real gene. Left-to-right follows chromosome order from Ensembl Fungi. ' +
      'Band height scales with UniProt protein length. Teal means Ensembl Compara found an ortholog in at least one fungus we checked; cooler white-blue means no ortholog hit in that set.</p>' +
      '</div>' +
      '<button type="button" data-band-close class="shrink-0 text-[0.72rem] tracking-wider border border-white/15 bg-transparent text-mist px-2.5 py-1 rounded-sm cursor-pointer hover:border-white/40 hover:text-white" aria-label="Close analyzer">Close</button>' +
      '</div>';

    html +=
      '<div class="flex flex-wrap gap-2 items-center mb-2">' +
      this._filterBtn('all', 'All bands') +
      this._filterBtn('shared', 'Shared orthologs') +
      this._filterBtn('unique', 'Yeast-unique in check set') +
      '<button type="button" data-band-compare-toggle class="text-[0.65rem] tracking-wide border px-2 py-1 rounded-sm cursor-pointer ' +
      (this.compareOn
        ? 'border-white/40 text-white bg-white/10'
        : 'border-white/15 text-mist bg-transparent') +
      '">' +
      (this.compareOn ? 'Compare lanes on' : 'Compare lanes off') +
      '</button>' +
      '</div>';

    html +=
      '<p class="m-0 mb-2 font-mono text-[0.62rem] tracking-wide text-white/45">' +
      escapeHtml(String(all.length)) +
      ' API-backed bands · ' +
      sharedN +
      ' with ortholog hits · ' +
      uniqueN +
      ' without in the check set · fetched ' +
      escapeHtml(fetched) +
      '</p>';

    // Spectrum track
    html +=
      '<div class="relative mb-1">' +
      '<div class="flex items-end gap-px h-[88px] px-1 py-1 bg-black/35 border border-white/10 rounded-sm overflow-x-auto" role="list" aria-label="Gene band spectrum">' +
      bands
        .map((b) => {
          const h = Math.max(
            10,
            Math.round(((b.protein_length_aa || 0) / maxLen) * 76)
          );
          const shared = (b.ortholog_count || 0) >= 1;
          const sel = b.gene_id === this.selectedId;
          const color = shared
            ? 'bg-teal/75 hover:bg-teal-bright/90 shadow-[0_0_10px_rgba(61,158,143,0.25)]'
            : 'bg-white/35 hover:bg-white/55 shadow-[0_0_8px_rgba(122,158,196,0.2)]';
          const title =
            b.gene_id +
            ' · ' +
            (b.protein_name || 'protein') +
            ' · ' +
            (b.protein_length_aa != null ? b.protein_length_aa + ' aa' : 'length unknown') +
            ' · UniProt ' +
            (b.uniprot_accession || '—');
          return (
            '<button type="button" role="listitem" data-band="' +
            escapeHtml(b.gene_id) +
            '" title="' +
            escapeHtml(title) +
            '" class="band-pill relative flex-1 min-w-[10px] max-w-[28px] ' +
            color +
            ' rounded-sm cursor-pointer transition-all border-0 p-0 ' +
            (sel ? 'ring-1 ring-white/70 z-10' : '') +
            '" style="height:' +
            h +
            'px" aria-label="' +
            escapeHtml(title) +
            '">' +
            '<span class="sr-only">' +
            escapeHtml(b.gene_id) +
            '</span></button>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="flex justify-between mt-1 px-1 font-mono text-[0.5rem] tracking-wider text-white/35">' +
      '<span>Chr order →</span><span>Height = protein length (aa)</span></div>' +
      '</div>';

    // Chromosome tick row
    html += this._chrRuler(bands);

    // Compare lanes — glanceable shared vs unique across fungi
    if (this.compareOn) {
      html += this._renderCompareLanes(all);
    }

    // Insight sentence (inference prompt)
    html +=
      '<p class="m-0 mt-3 text-[0.82rem] leading-snug text-ink border-l-2 border-teal/60 pl-3" id="band-insight">' +
      escapeHtml(this._insightSentence(all)) +
      '</p>';

    // Detail + citations
    html += '<div class="mt-3" data-band-detail></div>';

    // Source strip
    html +=
      '<div class="mt-3 pt-2 border-t border-white/10">' +
      '<p class="m-0 text-[0.68rem] leading-snug text-mist-dim">Data citations for this analyzer: ' +
      ((this.data.apis || [])
        .map(function (a) {
          return (
            '<a class="text-teal-bright/80 underline decoration-white/15 hover:decoration-teal-bright" href="' +
            escapeHtml(a.url) +
            '" target="_blank" rel="noopener">' +
            escapeHtml(a.name) +
            '</a>'
          );
        })
        .join(' · ') || 'see bands.json') +
      '. Organism taxon ' +
      citeLink((org.citations || [])[0]) +
      '. Gaps mean the API returned no hit — nothing was invented.</p></div>';

    this.root.innerHTML = html;

    if (this.selectedId) this._renderDetail(this.selectedId);
    else if (bands[0]) {
      // soft-select first shared band for a ready inference path
      const prefer =
        bands.find((b) => b.gene_id === 'ACT1') ||
        bands.find((b) => (b.ortholog_count || 0) >= 1) ||
        bands[0];
      this._renderDetail(prefer.gene_id);
    }
  };

  BandAnalyzer.prototype._filterBtn = function (key, label) {
    const on = this.filter === key;
    return (
      '<button type="button" data-band-filter="' +
      key +
      '" class="text-[0.65rem] tracking-wide border px-2 py-1 rounded-sm cursor-pointer ' +
      (on ? 'border-white/40 text-white bg-white/10' : 'border-white/15 text-mist bg-transparent hover:border-white/30') +
      '">' +
      escapeHtml(label) +
      '</button>'
    );
  };

  BandAnalyzer.prototype._chrRuler = function (bands) {
    const seen = [];
    const set = new Set();
    bands.forEach((b) => {
      const c = b.chromosome || '?';
      if (!set.has(c)) {
        set.add(c);
        seen.push(c);
      }
    });
    if (!seen.length) return '';
    return (
      '<div class="flex flex-wrap gap-1 mb-2" aria-hidden="true">' +
      '<span class="text-[0.55rem] tracking-widest uppercase text-white/35 mr-1 self-center">Chromosomes</span>' +
      seen
        .map(function (c) {
          return (
            '<span class="font-mono text-[0.55rem] px-1.5 py-0.5 border border-white/10 text-white/50 rounded-sm">Chr ' +
            escapeHtml(c) +
            '</span>'
          );
        })
        .join('') +
      '</div>'
    );
  };

  BandAnalyzer.prototype._renderCompareLanes = function (all) {
    const targets = this.data.ortholog_targets || [];
    if (!targets.length) return '';

    let html =
      '<div class="mt-2 mb-1">' +
      '<h3 class="m-0 mb-1 text-[0.72rem] tracking-wide text-white/70 font-normal">Cross-fungus ortholog lanes</h3>' +
      '<p class="m-0 mb-2 text-[0.72rem] leading-snug text-mist">Each row is one fungus we checked in Ensembl Compara. A teal tick means a real ortholog id came back; an empty notch means no ortholog was returned for that gene.</p>' +
      '<div class="flex flex-col gap-1.5">';

    // Reference lane — yeast (all present)
    html += this._laneRow(
      "Baker's yeast (reference)",
      all.map(function (b) {
        return { gene_id: b.gene_id, hit: true, tip: b.ensembl_id || b.gene_id };
      })
    );

    targets.forEach((t) => {
      const cells = all.map((b) => {
        const o = (b.sources && b.sources.orthologs && b.sources.orthologs[t.key]) || null;
        return {
          gene_id: b.gene_id,
          hit: !!o,
          tip: o ? o.id + ' · ' + (o.type || 'ortholog') : 'No Ensembl ortholog returned',
        };
      });
      html += this._laneRow(t.common + ' · ' + t.label, cells);
    });

    html += '</div></div>';
    return html;
  };

  BandAnalyzer.prototype._laneRow = function (label, cells) {
    return (
      '<div class="flex items-center gap-2">' +
      '<div class="w-[9.5rem] shrink-0 text-[0.62rem] leading-snug text-mist truncate" title="' +
      escapeHtml(label) +
      '">' +
      escapeHtml(label) +
      '</div>' +
      '<div class="flex flex-1 gap-px h-3.5 bg-black/30 border border-white/[0.07] rounded-sm overflow-hidden">' +
      cells
        .map((c) => {
          const cls = c.hit
            ? 'bg-teal/70 hover:bg-teal-bright/90'
            : 'bg-white/[0.04]';
          return (
            '<button type="button" data-band="' +
            escapeHtml(c.gene_id) +
            '" title="' +
            escapeHtml(c.gene_id + ' — ' + c.tip) +
            '" class="flex-1 min-w-[6px] border-0 p-0 cursor-pointer ' +
            cls +
            '"></button>'
          );
        })
        .join('') +
      '</div></div>'
    );
  };

  BandAnalyzer.prototype._insightSentence = function (all) {
    const shared = all.filter((b) => (b.ortholog_count || 0) >= 1);
    const unique = all.filter((b) => (b.ortholog_count || 0) === 0);
    const act = all.find((b) => b.gene_id === 'ACT1');
    const pale =
      unique.find((b) => b.gene_id === 'HO') ||
      unique.find((b) => b.gene_id === 'FLO11') ||
      unique.find((b) => b.gene_id === 'STE2') ||
      unique[0];
    const parts = [];
    parts.push(
      'At a glance you can see ' +
        shared.length +
        ' shared-core bands (teal) and ' +
        unique.length +
        ' yeast-leaning bands (pale) among the ' +
        all.length +
        ' API-backed genes.'
    );
    if (act) {
      parts.push(
        'ACT1 (actin, UniProt ' +
          act.uniprot_accession +
          ') is a tall teal band because this conserved cytoskeletal protein has Ensembl orthologs in most fungi we checked.'
      );
    }
    if (pale) {
      parts.push(
        pale.gene_id +
          ' (' +
          (pale.protein_name || 'protein') +
          ', UniProt ' +
          pale.uniprot_accession +
          ') stays pale: Compara returned no ortholog in the fission yeast / Candida / Neurospora / Aspergillus check set, so it reads as a yeast-leaning specialty against the shared actin core.'
      );
    }
    parts.push(
      'Open Compare lanes, tap one teal band and one pale band, then follow the citation links to verify the pattern yourself in about a minute.'
    );
    return parts.join(' ');
  };

  BandAnalyzer.prototype._renderDetail = function (geneId) {
    const host = this.root.querySelector('[data-band-detail]');
    if (!host || !this.data) return;
    const b = (this.data.bands || []).find((x) => x.gene_id === geneId);
    if (!b) {
      host.innerHTML =
        '<p class="m-0 text-[0.78rem] text-mist">No API-backed band is selected yet. Tap a band in the spectrum above.</p>';
      return;
    }

    const orthos = (b.sources && b.sources.orthologs) || {};
    const orthoLines = Object.keys(orthos)
      .map((k) => {
        const o = orthos[k];
        if (!o) {
          const t = (this.data.ortholog_targets || []).find((x) => x.key === k);
          return (
            '<li class="text-[0.72rem] text-mist-dim leading-snug">' +
            escapeHtml((t && t.common) || k) +
            ': no Ensembl ortholog returned (honest gap).</li>'
          );
        }
        return (
          '<li class="text-[0.72rem] text-mist leading-snug">' +
          escapeHtml(o.common || o.label || k) +
          ': <span class="font-mono text-teal-bright/90">' +
          escapeHtml(o.id) +
          '</span> (' +
          escapeHtml(o.type || 'ortholog') +
          ')' +
          (o.urls && o.urls.ensembl_rest
            ? ' · <a class="underline decoration-white/20 text-teal-bright/80" href="' +
              escapeHtml(o.urls.ensembl_rest) +
              '" target="_blank" rel="noopener">Ensembl REST</a>'
            : '') +
          '</li>'
        );
      })
      .join('');

    const cites = (b.citations || [])
      .map(function (c) {
        return (
          '<li class="text-[0.72rem] leading-snug text-mist">' +
          citeLink(c) +
          (c.field ? ' — ' + escapeHtml(c.field) : '') +
          '</li>'
        );
      })
      .join('');

    host.innerHTML =
      '<div class="p-3 bg-void-elev/50 border border-white/10 rounded-sm animate-panel-in">' +
      '<div class="font-mono text-[0.65rem] tracking-widest text-teal-bright mb-1">' +
      escapeHtml(b.gene_id) +
      (b.locus_tag ? ' · ' + escapeHtml(b.locus_tag) : '') +
      '</div>' +
      '<h3 class="m-0 font-display font-normal text-[1.05rem] text-white">' +
      escapeHtml(b.protein_name || b.gene_id) +
      '</h3>' +
      '<p class="m-0 mt-1.5 text-[0.78rem] leading-snug text-mist">' +
      'This band sits on chromosome ' +
      escapeHtml(String(b.chromosome || '—')) +
      ' from genomic coordinate ' +
      escapeHtml(String(b.genomic_start || '—')) +
      ' to ' +
      escapeHtml(String(b.genomic_end || '—')) +
      (b.genomic_length_bp != null ? ' (' + b.genomic_length_bp + ' bp of locus span)' : '') +
      '. The protein product is ' +
      (b.protein_length_aa != null
        ? b.protein_length_aa + ' amino acids long'
        : 'of unknown length (UniProt did not return length)') +
      '. Ensembl Compara reported orthologs in ' +
      escapeHtml(String(b.ortholog_count || 0)) +
      ' of ' +
      escapeHtml(String(b.ortholog_targets_checked || 0)) +
      ' fungi we checked.</p>' +
      '<ul class="mt-2 mb-2 pl-4 list-disc space-y-1">' +
      orthoLines +
      '</ul>' +
      '<div class="text-[0.58rem] tracking-widest uppercase text-white/40 mb-1">Citations</div>' +
      '<ul class="m-0 pl-4 list-disc space-y-1">' +
      cites +
      '</ul>' +
      '<p class="m-0 mt-2 text-[0.72rem] text-mist-dim leading-snug">Open the gene-follow panel from this tap to walk DNA → mRNA → protein in plain language. Band metrics stay tied to the accessions above.</p>' +
      '</div>';
  };

  global.HyphaBandAnalyzer = BandAnalyzer;
})(window);
