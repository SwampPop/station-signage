// Chief / shift-lead messages from the `messages` sheet tab.
//
// Columns: active (yes/no) · priority (normal|high|urgent|takeover) ·
// title · body · author · posted (YYYY-MM-DD, required) · expires
// (blank -> posted + BoardConfig.messages.defaultTtlDays) · dwell (s,
// clamped 5–120).
//
// Every surviving row becomes a rotation slide (priority-sorted, capped).
// urgent/takeover rows are also handed to Priority for the banner strip /
// full-screen overlay. A takeover row with a blank expiry degrades to
// `high` after takeoverMaxMs — tracked from first sighting, with an
// in-memory fallback when localStorage is unavailable, and stamps are
// cleared when a row leaves the sheet so a re-posted takeover works.
// A 60 s sweep expires slides even when the network and cache are gone.

window.Messages = {
  _weight: { takeover: 0, urgent: 1, high: 2, normal: 3 },
  _seenMem: {},
  _items: null,
  _lastRes: null,

  start: function () {
    var self = this;
    setInterval(function () { self._sweep(); }, 60 * 1000);
    return SheetLoader.poll(BoardConfig.polls.sheetMs, function () {
      return self.refresh();
    });
  },

  async refresh() {
    var res = await SheetLoader.fetchTab('messages',
      ['active', 'title', 'posted']);
    if (res && res.unconfigured) { Health.set('sheet', 'off'); return; }
    if (!res) { Health.set('sheet', 'down'); return; } // sweep keeps expiry honest
    Health.set('sheet', res.fromCache ? 'cache' : 'ok', res.fetchedAt);
    this._lastRes = res;
    this._items = this._prepare(res.rows);
    this._publish();
  },

  // Drop slides whose expiry passed since the last successful fetch —
  // works even with no network AND no cache (res unavailable).
  _sweep: function () {
    if (!this._items) return;
    var now = Date.now();
    var live = this._items.filter(function (m) { return m.expiresAt > now; });
    if (live.length !== this._items.length) {
      this._items = live;
      this._publish();
    }
  },

  _publish: function () {
    var items = this._items || [];
    this._renderSlides(items, this._lastRes || { fromCache: true, fetchedAt: null });
    if (window.Priority) {
      Priority.setSheetItems(items
        .filter(function (m) { return m.priority === 'urgent' || m.priority === 'takeover'; })
        .map(function (m) {
          return {
            level: m.priority,
            rank: 2, // NWS alerts outrank sheet takeovers
            title: m.title,
            body: m.firstLine,
            tag: m.author ? 'From ' + m.author : 'Station message',
            expiresAt: m.expiresAt
          };
        }));
    }
  },

  // ── takeover first-seen stamps ─────────────────────────────────────

  _seenGet: function (id) {
    var hit = Store.get('seen:' + id);
    if (hit) return Number(hit.payload) || null;
    return this._seenMem[id] || null;
  },

  _seenSet: function (id, ts) {
    Store.put('seen:' + id, ts);
    this._seenMem[id] = ts;
  },

  // Clear stamps for rows no longer marked takeover in the sheet, so a
  // deleted-and-reposted takeover starts a fresh 4 h window. ('sb:seen:'
  // prefix length is 8.)
  _seenPrune: function (liveIds) {
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf('sb:seen:') === 0 && liveIds.indexOf(k.slice(8)) < 0) {
          localStorage.removeItem(k);
        }
      }
    } catch (e) { /* localStorage unavailable — memory map below still pruned */ }
    for (var id in this._seenMem) {
      if (liveIds.indexOf(id) < 0) delete this._seenMem[id];
    }
  },

  // ── row preparation ────────────────────────────────────────────────

  _prepare: function (rows) {
    var cfg = BoardConfig.messages;
    var now = Date.now();
    var out = [];
    var takeoverIds = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if ((r.active || '').toLowerCase() !== 'yes') continue;
      if (!r.title) continue;
      var posted = Fmt.parseLocal(r.posted);
      if (!posted) continue; // posted is required and must parse

      var priority = (r.priority || 'normal').toLowerCase();
      if (!(priority in this._weight)) priority = 'normal';

      var id = 'msg-' + SheetLoader.hash(
        r.title + '|' + r.posted + '|' + (r.author || ''));

      var expires = Fmt.parseLocal(r.expires, true);
      var expiresAt = expires
        ? expires.getTime()
        : posted.getTime() + cfg.defaultTtlDays * 86400000;

      if (priority === 'takeover') {
        takeoverIds.push(id);
        if (!expires) {
          // No explicit expiry: cap the takeover at 4 h from first sighting.
          var seenTs = this._seenGet(id);
          if (!seenTs) { seenTs = now; this._seenSet(id, now); }
          var takeoverUntil = seenTs + cfg.takeoverMaxMs;
          if (now >= takeoverUntil) priority = 'high';
          else expiresAt = Math.min(expiresAt, takeoverUntil);
        }
      }

      if (now >= expiresAt) continue;

      var dwellSec = Number(r.dwell);
      if (!dwellSec || isNaN(dwellSec)) dwellSec = cfg.defaultDwellMs / 1000;

      out.push({
        id: id,
        priority: priority,
        title: r.title,
        body: r.body || '',
        firstLine: (r.body || '').split(/\n/)[0].slice(0, 140),
        author: r.author || '',
        posted: posted,
        expiresAt: expiresAt,
        dwellMs: Math.min(120, Math.max(5, dwellSec)) * 1000
      });
    }
    this._seenPrune(takeoverIds);
    var weight = this._weight;
    out.sort(function (a, b) {
      return (weight[a.priority] - weight[b.priority]) ||
             (b.posted.getTime() - a.posted.getTime());
    });
    return out.slice(0, cfg.maxSlides);
  },

  // ── rendering ──────────────────────────────────────────────────────

  _renderSlides: function (items, res) {
    var stage = document.getElementById('stage');
    if (!stage) return;
    var liveIds = [];
    for (var i = 0; i < items.length; i++) {
      var m = items[i];
      liveIds.push(m.id);
      this._buildSlide(stage, m, res);
    }
    SheetLoader.pruneSlides(stage, 'msg-', liveIds);
  },

  _buildSlide: function (stage, m, res) {
    SheetLoader.upsertSlide(stage, m.id,
      { dwellMs: m.dwellMs, beforeId: 'roads' },
      function (inner, slide) {
        slide.classList.toggle('msg-high', m.priority !== 'normal');
        inner.appendChild(SheetLoader.el('div', 'eyebrow',
          m.author ? 'Message · ' + m.author : 'Message'));
        inner.appendChild(SheetLoader.el('h1', null, m.title));

        var lines = m.body.split(/\n+/).filter(function (l) { return l.trim(); });
        if (lines.length > 1) {
          var ul = SheetLoader.el('ul', 'bullets');
          lines.forEach(function (l) {
            ul.appendChild(SheetLoader.el('li', null, l.trim()));
          });
          inner.appendChild(ul);
        } else if (lines.length === 1) {
          inner.appendChild(SheetLoader.el('p', 'msg-body', lines[0]));
        }

        var footerText = 'Posted ' + m.posted.toLocaleDateString(
          [], { month: 'short', day: 'numeric' });
        if (res.fromCache) footerText += ' · showing cached copy';
        var footer = SheetLoader.el('div', 'msg-footer', footerText);
        if (res.fetchedAt &&
            Date.now() - res.fetchedAt > BoardConfig.staleness.sheetMs) {
          footer.appendChild(SheetLoader.el('span', 'stale-tag', 'STALE'));
        }
        inner.appendChild(footer);
      });
  }
};
