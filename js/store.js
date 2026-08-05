// Shared plumbing for every data module.
//
// Store  — network-first fetch with a localStorage last-good cache. Fresh
//          responses are validated BEFORE they overwrite the cache, so a
//          Google login page or truncated JSON can never clobber good data.
// Health — tiny per-feed status registry rendered into the status bar.
// Fmt    — date parsing/formatting helpers. Sheet dates are interpreted in
//          the display device's local clock (station time).

window.Store = {
  _key: function (k) { return 'sb:' + k; },

  put: function (key, payload) {
    try {
      localStorage.setItem(this._key(key),
        JSON.stringify({ fetchedAt: Date.now(), payload: payload }));
    } catch (e) { /* quota or private mode — cache is best-effort */ }
  },

  get: function (key) {
    try {
      var raw = localStorage.getItem(this._key(key));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  async _fresh(url) {
    var bust = url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
    var res = await fetch(bust, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  },

  // Both fetchers resolve to {data, fromCache, fetchedAt} or null.
  async fetchText(key, url, validate) {
    try {
      var text = await this._fresh(url);
      if (validate && !validate(text)) throw new Error('validation failed');
      this.put(key, text);
      return { data: text, fromCache: false, fetchedAt: Date.now() };
    } catch (e) {
      var hit = this.get(key);
      return hit ? { data: hit.payload, fromCache: true, fetchedAt: hit.fetchedAt } : null;
    }
  },

  async fetchJson(key, url, validate) {
    try {
      var text = await this._fresh(url);
      var data = JSON.parse(text);
      if (validate && !validate(data)) throw new Error('validation failed');
      this.put(key, text);
      return { data: data, fromCache: false, fetchedAt: Date.now() };
    } catch (e) {
      var hit = this.get(key);
      if (!hit) return null;
      try {
        return { data: JSON.parse(hit.payload), fromCache: true, fetchedAt: hit.fetchedAt };
      } catch (e2) { return null; }
    }
  }
};

window.Health = {
  _states: {},
  _order: ['sheet', '511', 'dotd', 'nws', 'wx', 'radar', 'hosp'],

  // state: 'ok' | 'cache' (serving last-good) | 'down' (nothing to show) |
  //        'off' (feature unconfigured — omitted from the bar)
  set: function (key, state, fetchedAt) {
    this._states[key] = { state: state, fetchedAt: fetchedAt || null };
    this._render();
  },

  _render: function () {
    var el = document.getElementById('status-feeds');
    if (!el) return;
    var parts = [];
    for (var i = 0; i < this._order.length; i++) {
      var key = this._order[i];
      var s = this._states[key];
      if (!s || s.state === 'off') continue;
      if (s.state === 'ok') parts.push(key + ' ✓');
      else if (s.state === 'cache') parts.push(key + ' cache ' + Fmt.ago(s.fetchedAt));
      else parts.push(key + ' ✗');
    }
    el.textContent = parts.join(' · ');
  }
};

window.Fmt = {
  // "YYYY-MM-DD" or "YYYY-MM-DD HH:MM" -> Date in device-local time.
  // endOfDay: date-only strings resolve to 23:59:59 (for expiry columns).
  parseLocal: function (str, endOfDay) {
    if (!str) return null;
    var m = String(str).trim().match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
    if (!m) return null;
    var hasTime = m[4] !== undefined;
    var d = new Date(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      hasTime ? Number(m[4]) : (endOfDay ? 23 : 0),
      hasTime ? Number(m[5]) : (endOfDay ? 59 : 0),
      (!hasTime && endOfDay) ? 59 : 0);
    // Reject rolled-over inputs like 2026-02-31 (which Date turns into
    // Mar 3) instead of silently accepting a different day.
    if (isNaN(d.getTime()) ||
        d.getFullYear() !== Number(m[1]) ||
        d.getMonth() !== Number(m[2]) - 1 ||
        d.getDate() !== Number(m[3]) ||
        (hasTime && d.getHours() !== Number(m[4]))) return null;
    return d;
  },

  ago: function (ts) {
    if (!ts) return '?';
    var mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return mins + 'm';
    if (mins < 48 * 60) return Math.round(mins / 60) + 'h';
    return Math.round(mins / 1440) + 'd';
  },

  time: function (ts) {
    if (!ts) return '?';
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  },

  // Bare times mislead once the moment is on another day ("until 3:00 PM"
  // meaning next Tuesday) — include the date when it isn't today.
  timeOrDate: function (ts) {
    if (!ts) return '?';
    var d = new Date(ts);
    if (d.toDateString() === new Date().toDateString()) return this.time(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + this.time(ts);
  }
};
