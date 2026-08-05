// Hospital status slide — crew-sourced from the `hospitals` sheet tab.
//
// Columns: active (yes/no) · hospital · status · note · updated
// (YYYY-MM-DD HH:MM, required). Rows older than
// BoardConfig.hospitals.maxAgeMs (8 h) vanish automatically — a stale
// offload status is worse than none, so every row carries its age.
//
// `status` gets a color chip only when it matches the whitelist below
// (className safety); any other text still displays, uncolored. The slide
// only exists while there are live rows — no tab, no slide, no noise.

window.Hospitals = {
  _statusClasses: { open: 1, busy: 1, slow: 1, divert: 1, closed: 1 },

  start: function () {
    var self = this;
    return SheetLoader.poll(BoardConfig.polls.sheetMs, function () {
      return self.refresh();
    });
  },

  async refresh() {
    var stage = document.getElementById('stage');
    if (!stage) return;
    var res = await SheetLoader.fetchTab('hospitals',
      ['active', 'hospital', 'status']);
    // Missing tab (gviz falls back to another tab, headers fail) and a
    // real outage both land here — stay quiet, keep whatever is shown.
    if (!res || res.unconfigured) { Health.set('hosp', 'off'); return; }
    Health.set('hosp', res.fromCache ? 'cache' : 'ok', res.fetchedAt);

    var now = Date.now();
    var maxAge = BoardConfig.hospitals.maxAgeMs;
    var items = [];
    for (var i = 0; i < res.rows.length; i++) {
      var r = res.rows[i];
      if ((r.active || '').toLowerCase() !== 'yes') continue;
      if (!r.hospital || !r.status) continue;
      var updated = Fmt.parseLocal(r.updated);
      if (!updated || now - updated.getTime() > maxAge) continue;
      items.push({
        hospital: r.hospital,
        status: r.status,
        statusClass: this._statusClasses[(r.status || '').toLowerCase()]
          ? (r.status || '').toLowerCase() : 'none',
        note: r.note || '',
        updatedAt: updated.getTime()
      });
    }

    if (!items.length) {
      SheetLoader.pruneSlides(stage, 'hospitals', []);
      return;
    }

    SheetLoader.upsertSlide(stage, 'hospitals',
      { dwellMs: 15000, beforeId: 'weather' },
      function (inner) {
        var el = SheetLoader.el;
        inner.appendChild(el('div', 'eyebrow', 'Hospital status · crew-reported'));
        inner.appendChild(el('h1', null, 'Hospitals'));
        var table = el('table', 'schedule hosp-table');
        var tbody = el('tbody');
        items.forEach(function (h) {
          var tr = el('tr');
          tr.appendChild(el('td', 'hosp-name', h.hospital));
          var tdStatus = el('td');
          tdStatus.appendChild(el('span', 'hosp-status hosp-' + h.statusClass, h.status));
          tr.appendChild(tdStatus);
          tr.appendChild(el('td', 'hosp-note', h.note));
          tr.appendChild(el('td', 'hosp-age', Fmt.ago(h.updatedAt) + ' ago'));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        inner.appendChild(table);
        inner.appendChild(el('div', 'footnote',
          'Crew-reported · rows expire after 8 h · update the `hospitals` tab'));
      });
  }
};
