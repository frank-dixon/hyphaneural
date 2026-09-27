/**
 * Genome panel — linear multi-organism master data visualizer.
 * Quiet Protomol: dense tracks, teal shared / ember unique / gap missing.
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function familyOf(genes, gid) {
    const g = genes[gid];
    if (!g) return gid;
    return g.family || gid;
  }

  function GenomePanel(root, opts) {
    this.root = root;
    this.orgs = (opts && opts.orgs) || [];
    this.genes = (opts && opts.genes) || {};
    this.defaults = (opts && opts.defaults) || {
      selected: ['bakers-yeast', 'schizosaccharomyces'],
      reference: 'bakers-yeast',
      filter: 'all',
    };
    this.onGeneClick = opts && opts.onGeneClick;
    this.selected = new Set(this.defaults.selected || []);
    this.filter = this.defaults.filter || 'all';
    this.search = '';
    this.chrFilter = null;
    this.reference = this.defaults.reference || 'bakers-yeast';
    this._bind();
    this.render();
  }

  GenomePanel.prototype._bind = function () {
    const root = this.root;
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-org-check]')) {
        if (t.checked) this.selected.add(t.value);
        else this.selected.delete(t.value);
        if (this.selected.size === 0) {
          // keep at least reference
          this.selected.add(this.reference);
          t.checked = t.value === this.reference;
        }
        this.renderTracks();
        this.renderStats();
      }
      if (t.matches('[data-filter]')) {
        this.filter = t.value;
        this.renderTracks();
        this.renderStats();
      }
    });
    root.addEventListener('input', (e) => {
      if (e.target.matches('[data-gene-search]')) {
        this.search = (e.target.value || '').trim().toUpperCase();
        this.renderTracks();
      }
    });
    root.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-chr-chip]');
      if (chip) {
        const chr = chip.getAttribute('data-chr-chip');
        this.chrFilter = this.chrFilter === chr ? null : chr;
        this.renderTracks();
        this.renderChrome();
        return;
      }
      const block = e.target.closest('[data-gene-block]');
      if (block) {
        const gid = block.getAttribute('data-gene-block');
        const org = block.getAttribute('data-org');
        if (gid && this.onGeneClick) this.onGeneClick(gid, org);
        return;
      }
      const addBtn = e.target.closest('[data-add-org]');
      if (addBtn) {
        const slug = addBtn.getAttribute('data-add-org');
        if (slug) {
          this.selected.add(slug);
          this.render();
        }
      }
    });
  };

  GenomePanel.prototype.setVisible = function (on) {
    this.root.hidden = !on;
    if (on) this.render();
  };

  GenomePanel.prototype.isVisible = function () {
    return !this.root.hidden;
  };

  GenomePanel.prototype.render = function () {
    this.renderChrome();
    this.renderTracks();
    this.renderStats();
  };

  GenomePanel.prototype._selectedOrgs = function () {
    return this.orgs.filter((o) => this.selected.has(o.slug));
  };

  GenomePanel.prototype._linear = function (org) {
    if (org.linear && org.linear.length) return org.linear.slice();
    return (org.genes || []).map((id, i) => ({
      id: id,
      chr: '—',
      pos: (i + 1) / ((org.genes || []).length + 1),
      category: 'gene',
      family: familyOf(this.genes, id),
    }));
  };

  /** Ordered family axis from reference genome, then extras from other selected. */
  GenomePanel.prototype._familyAxis = function (selected) {
    const ref = selected.find((o) => o.slug === this.reference) || selected[0];
    const axis = [];
    const seen = new Set();
    const push = (fam, exemplar) => {
      if (seen.has(fam)) return;
      seen.add(fam);
      axis.push({ family: fam, exemplar: exemplar });
    };
    if (ref) {
      this._linear(ref).forEach((s) => push(s.family || familyOf(this.genes, s.id), s.id));
    }
    selected.forEach((o) => {
      this._linear(o).forEach((s) => push(s.family || familyOf(this.genes, s.id), s.id));
    });
    return axis;
  };

  GenomePanel.prototype._presence = function (selected) {
    // family -> set of org slugs that have it
    const map = {};
    selected.forEach((o) => {
      this._linear(o).forEach((s) => {
        const fam = s.family || familyOf(this.genes, s.id);
        if (!map[fam]) map[fam] = new Set();
        map[fam].add(o.slug);
      });
    });
    return map;
  };

  GenomePanel.prototype.renderChrome = function () {
    const picker = this.root.querySelector('[data-org-picker]');
    const filters = this.root.querySelector('[data-filter-bar]');
    const search = this.root.querySelector('[data-gene-search]');
    const chips = this.root.querySelector('[data-chr-chips]');
    if (!picker) return;

    picker.innerHTML = this.orgs
      .map((o) => {
        const on = this.selected.has(o.slug);
        return (
          '<label class="gp-check' + (on ? ' on' : '') + '">' +
          '<input type="checkbox" data-org-check value="' + escapeHtml(o.slug) + '"' +
          (on ? ' checked' : '') + '>' +
          '<span class="gp-check-name">' + escapeHtml(o.common_name) + '</span>' +
          '<span class="gp-check-sci">' + escapeHtml(o.scientific_name) + '</span>' +
          '</label>'
        );
      })
      .join('');

    if (filters) {
      const opts = [
        ['all', 'All'],
        ['shared', 'Shared only'],
        ['unique', 'Unique only'],
      ];
      filters.innerHTML = opts
        .map(
          ([v, label]) =>
            '<label class="gp-filter' + (this.filter === v ? ' on' : '') + '">' +
            '<input type="radio" name="gp-filter" data-filter value="' + v + '"' +
            (this.filter === v ? ' checked' : '') + '>' +
            label +
            '</label>'
        )
        .join('');
    }

    if (search && document.activeElement !== search) {
      search.value = this.search;
    }

    // Chromosome chips from first selected (reference preferred)
    if (chips) {
      const selected = this._selectedOrgs();
      const focus = selected.find((o) => o.slug === this.reference) || selected[0];
      if (!focus) {
        chips.innerHTML = '';
      } else {
        const chrs = [];
        const seen = new Set();
        this._linear(focus).forEach((s) => {
          if (!seen.has(s.chr)) {
            seen.add(s.chr);
            chrs.push(s.chr);
          }
        });
        chips.innerHTML =
          '<span class="gp-chip-label">Bins</span>' +
          chrs
            .map((c) => {
              const on = this.chrFilter === c;
              return (
                '<button type="button" class="gp-chip' + (on ? ' on' : '') + '" data-chr-chip="' +
                escapeHtml(c) + '">Chr ' + escapeHtml(c) + '</button>'
              );
            })
            .join('');
      }
    }
  };

  GenomePanel.prototype._matchSearch = function (gid) {
    if (!this.search) return true;
    const g = this.genes[gid] || {};
    const hay = (gid + ' ' + (g.name || '') + ' ' + (g.family || '')).toUpperCase();
    return hay.indexOf(this.search) >= 0;
  };

  GenomePanel.prototype.renderTracks = function () {
    const host = this.root.querySelector('[data-tracks]');
    if (!host) return;
    const selected = this._selectedOrgs();
    if (!selected.length) {
      host.innerHTML =
        '<div class="gp-empty">Select organisms to load linear genome tracks.<br>' +
        '<span class="gp-empty-hint">Switch to Strand for the guided story.</span></div>';
      return;
    }

    const presence = this._presence(selected);
    const multi = selected.length >= 2;
    const axis = this._familyAxis(selected);

    // Legend
    let html =
      '<div class="gp-legend" aria-hidden="true">' +
      '<span class="gp-leg shared"><i></i>Shared ortholog / family</span>' +
      '<span class="gp-leg unique"><i></i>Organism-unique</span>' +
      '<span class="gp-leg gap"><i></i>Missing counterpart</span>' +
      '</div>';

    html += '<div class="gp-tracks" role="list">';

    selected.forEach((org) => {
      const slots = this._linear(org);
      const byFam = {};
      slots.forEach((s) => {
        byFam[s.family || familyOf(this.genes, s.id)] = s;
      });

      // Group by chromosome for ruler labels
      html +=
        '<div class="gp-row" role="listitem" data-org-row="' + escapeHtml(org.slug) + '">' +
        '<div class="gp-row-meta">' +
        '<div class="gp-row-name">' + escapeHtml(org.common_name) + '</div>' +
        '<div class="gp-row-sci">' + escapeHtml(org.scientific_name) + '</div>' +
        '<div class="gp-row-count">' + slots.length + ' genes</div>' +
        '</div>' +
        '<div class="gp-track-scroll">' +
        '<div class="gp-track">';

      if (multi) {
        // Aligned by family axis
        let lastChr = null;
        axis.forEach((ax) => {
          const fam = ax.family;
          const slot = byFam[fam];
          const nOrgs = presence[fam] ? presence[fam].size : 0;
          const isShared = nOrgs >= 2;
          const isUnique = nOrgs === 1;

          if (this.filter === 'shared' && !isShared) return;
          if (this.filter === 'unique' && !(slot && isUnique)) return;

          if (slot) {
            if (this.chrFilter && slot.chr !== this.chrFilter) return;
            if (!this._matchSearch(slot.id)) return;
            if (slot.chr !== lastChr) {
              html += '<span class="gp-chr-tick" title="Chr ' + escapeHtml(slot.chr) + '">' +
                escapeHtml(slot.chr) + '</span>';
              lastChr = slot.chr;
            }
            const kind = isShared ? 'shared' : 'unique';
            const g = this.genes[slot.id] || {};
            const stub = g.stub ? ' stub' : '';
            html +=
              '<button type="button" class="gp-block ' + kind + stub + '" data-gene-block="' +
              escapeHtml(slot.id) + '" data-org="' + escapeHtml(org.slug) + '" title="' +
              escapeHtml(slot.id + ' — ' + (g.name || slot.id)) + '">' +
              '<span class="gp-block-id">' + escapeHtml(slot.id) + '</span>' +
              '</button>';
          } else {
            // gap — only when filter allows and search empty / matches exemplar
            if (this.filter === 'unique') return;
            if (this.filter === 'shared' && nOrgs < 2) return;
            if (this.search && !this._matchSearch(ax.exemplar)) return;
            if (this.chrFilter) return; // gaps have no chr on this org
            html +=
              '<span class="gp-block gap" title="No ' + escapeHtml(fam) + ' counterpart" aria-label="gap">' +
              '<span class="gp-block-id">·</span></span>';
          }
        });
      } else {
        // Single organism — native chromosome order
        let lastChr = null;
        slots.forEach((slot) => {
          const fam = slot.family || familyOf(this.genes, slot.id);
          const nOrgs = 1; // single view — color by whether family exists in other orgs in full catalog
          const inOthers = this.orgs.some(
            (o) =>
              o.slug !== org.slug &&
              this._linear(o).some((s) => (s.family || familyOf(this.genes, s.id)) === fam)
          );
          const isShared = inOthers;
          if (this.filter === 'shared' && !isShared) return;
          if (this.filter === 'unique' && isShared) return;
          if (this.chrFilter && slot.chr !== this.chrFilter) return;
          if (!this._matchSearch(slot.id)) return;
          if (slot.chr !== lastChr) {
            html += '<span class="gp-chr-tick" title="Chr ' + escapeHtml(slot.chr) + '">' +
              escapeHtml(slot.chr) + '</span>';
            lastChr = slot.chr;
          }
          const g = this.genes[slot.id] || {};
          const kind = isShared ? 'shared' : 'unique';
          const stub = g.stub ? ' stub' : '';
          html +=
            '<button type="button" class="gp-block ' + kind + stub + '" data-gene-block="' +
            escapeHtml(slot.id) + '" data-org="' + escapeHtml(org.slug) + '" title="' +
            escapeHtml(slot.id + ' — ' + (g.name || slot.id)) + '">' +
            '<span class="gp-block-id">' + escapeHtml(slot.id) + '</span>' +
            '</button>';
        });
      }

      html += '</div></div></div>';
    });

    html += '</div>';

    if (!this.selected.size) {
      html +=
        '<div class="gp-empty">Select organisms above.<br>' +
        '<span class="gp-empty-hint">Switch to Strand for the guided story.</span></div>';
    }

    host.innerHTML = html;
  };

  GenomePanel.prototype.renderStats = function () {
    const el = this.root.querySelector('[data-stats]');
    if (!el) return;
    const selected = this._selectedOrgs();
    const ref = this.orgs.find((o) => o.slug === this.reference) || selected[0];
    const refFams = new Set(
      ref ? this._linear(ref).map((s) => s.family || familyOf(this.genes, s.id)) : []
    );

    let total = 0;
    let sharedWithRef = 0;
    let uniqueCount = 0;
    const presence = this._presence(selected);

    selected.forEach((org) => {
      this._linear(org).forEach((s) => {
        total += 1;
        const fam = s.family || familyOf(this.genes, s.id);
        if (org.slug !== this.reference && refFams.has(fam)) sharedWithRef += 1;
        if (presence[fam] && presence[fam].size === 1) uniqueCount += 1;
      });
    });

    // % shared: for non-ref genes that match ref, or when comparing 2+ use shared families / axis
    let pct = 0;
    if (selected.length >= 2 && ref) {
      const axis = this._familyAxis(selected);
      const sharedFams = axis.filter((a) => presence[a.family] && presence[a.family].size >= 2).length;
      pct = axis.length ? Math.round((100 * sharedFams) / axis.length) : 0;
    } else if (ref) {
      const slots = this._linear(ref);
      const shared = slots.filter((s) => {
        const fam = s.family || familyOf(this.genes, s.id);
        return this.orgs.some(
          (o) =>
            o.slug !== ref.slug &&
            this._linear(o).some((x) => (x.family || familyOf(this.genes, x.id)) === fam)
        );
      }).length;
      pct = slots.length ? Math.round((100 * shared) / slots.length) : 0;
    }

    el.innerHTML =
      '<div class="gp-stat"><span class="gp-stat-n">' + total + '</span><span class="gp-stat-l">gene slots</span></div>' +
      '<div class="gp-stat"><span class="gp-stat-n">' + selected.length + '</span><span class="gp-stat-l">organisms</span></div>' +
      '<div class="gp-stat"><span class="gp-stat-n">' + pct + '%</span><span class="gp-stat-l">shared w/ ' +
      escapeHtml(ref ? ref.common_name : 'ref') + '</span></div>' +
      '<div class="gp-stat"><span class="gp-stat-n">' + uniqueCount + '</span><span class="gp-stat-l">unique in view</span></div>';
  };

  global.HyphaGenomePanel = GenomePanel;
})(window);
