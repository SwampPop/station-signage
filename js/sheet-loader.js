// Google Sheet CSV loader + shared slide DOM helpers.
//
// Content tabs live in one Google Sheet (see BoardConfig.sheet), fetched
// via the gviz CSV endpoint and parsed with a minimal RFC 4180 parser.
// A header sanity check runs BEFORE the response can overwrite the cached
// last-good copy, so a revoked share (Google returns an HTML login page
// with HTTP 200) degrades to cached content instead of a blank board.
//
// All cell values are rendered via textContent — never innerHTML — so a
// sheet editor cannot inject markup into the board.

window.SheetLoader = {
  // RFC 4180: quoted fields, "" escapes, embedded commas/newlines, CRLF.
  parseCsv: function (text) {
    var rows = [], row = [], field = '', inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  },

  // First row -> lowercased trimmed keys; blank rows dropped.
  rowsToObjects: function (rows) {
    if (!rows || rows.length < 2) return [];
    var headers = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var cells = rows[r];
      var obj = {}, hasValue = false;
      for (var c = 0; c < headers.length; c++) {
        var v = (cells[c] || '').trim();
        if (headers[c]) obj[headers[c]] = v;
        if (v) hasValue = true;
      }
      if (hasValue) out.push(obj);
    }
    return out;
  },

  // Resolves to {rows, fromCache, fetchedAt}, {unconfigured: true}, or
  // null (no fresh data and no cache).
  async fetchTab(tabKey, requiredCols) {
    var cfg = window.BoardConfig.sheet;
    if (!cfg.id) return { unconfigured: true };
    var self = this;
    var url = cfg.urlForTab(cfg.tabs[tabKey] || tabKey);
    var validate = function (text) {
      if (/^\s*</.test(text)) return false; // HTML login/error page
      var first = self.parseCsv(text)[0] || [];
      var heads = first.map(function (h) { return h.trim().toLowerCase(); });
      return (requiredCols || []).every(function (col) {
        return heads.indexOf(col) >= 0;
      });
    };
    var res = await Store.fetchText('tab:' + tabKey, url, validate);
    if (!res) return null;
    return {
      rows: this.rowsToObjects(this.parseCsv(res.data)),
      fromCache: res.fromCache,
      fetchedAt: res.fetchedAt
    };
  },

  // Small safe-DOM helper: el('div', 'cls', 'text content')
  el: function (tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  },

  // Create-or-reuse a slide and (re)populate its inner container.
  // opts: {dwellMs, beforeId} — beforeId positions the slide before an
  // existing slide each call, which doubles as ordering enforcement.
  upsertSlide: function (stageEl, id, opts, buildFn) {
    var slide = stageEl.querySelector('.slide[data-slide-id="' + id + '"]');
    var inner;
    if (!slide) {
      slide = this.el('section', 'slide');
      slide.setAttribute('data-slide-id', id);
      inner = this.el('div', 'slide-inner');
      slide.appendChild(inner);
    } else {
      inner = slide.querySelector('.slide-inner');
    }
    slide.setAttribute('data-dwell', String(opts.dwellMs || 12000));
    var anchor = opts.beforeId
      ? stageEl.querySelector('.slide[data-slide-id="' + opts.beforeId + '"]')
      : null;
    if (anchor) stageEl.insertBefore(slide, anchor);
    else if (!slide.parentNode) stageEl.appendChild(slide);
    inner.replaceChildren();
    buildFn(inner, slide);
    return slide;
  },

  // Remove slides whose id starts with prefix and is not in liveIds.
  pruneSlides: function (stageEl, prefix, liveIds) {
    var all = stageEl.querySelectorAll('.slide[data-slide-id^="' + prefix + '"]');
    for (var i = 0; i < all.length; i++) {
      var id = all[i].getAttribute('data-slide-id');
      if (liveIds.indexOf(id) < 0) all[i].remove();
    }
  },

  // Stable id fragment from row content (djb2, base36).
  hash: function (str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  },

  // Poll helper: run fn now and roughly every intervalMs (+-10% jitter).
  // Returns the first run's promise so boot can wait on it.
  poll: function (intervalMs, fn) {
    var schedule = function () {
      var jitter = intervalMs * (0.9 + Math.random() * 0.2);
      setTimeout(function () {
        Promise.resolve(fn()).catch(function () {}).then(schedule);
      }, jitter);
    };
    var first = Promise.resolve(fn()).catch(function () {});
    first.then(schedule);
    return first;
  }
};
