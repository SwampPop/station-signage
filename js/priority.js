// Priority overlay layer: the persistent urgent banner and the full-screen
// takeover. Lives entirely outside #stage — the rotator never knows about
// it. Items arrive from Messages (sheet rows) and Alerts (NWS); a 30 s
// sweep drops expired items even when no fresh data arrives.
//
// Ranking for the takeover slot (lower wins): 0 = NWS severity Extreme,
// 1 = NWS takeover-listed event, 2 = sheet takeover message.

window.Priority = {
  _sheet: [],
  _wx: [],
  _bannerIdx: 0,

  start: function () {
    var self = this;
    setInterval(function () { self._render(); }, 30 * 1000);
    setInterval(function () { self._cycleBanner(); }, 8 * 1000);
  },

  setSheetItems: function (items) { this._sheet = items || []; this._render(); },
  setWxItems: function (items) { this._wx = items || []; this._render(); },

  _live: function () {
    var now = Date.now();
    return this._wx.concat(this._sheet).filter(function (it) {
      return !it.expiresAt || it.expiresAt > now;
    });
  },

  _render: function () {
    var items = this._live();
    this._renderTakeover(items.filter(function (i) { return i.level === 'takeover'; }));
    this._renderBanner(items.filter(function (i) { return i.level === 'urgent'; }));
  },

  _renderTakeover: function (takeovers) {
    var overlay = document.getElementById('takeover');
    if (!overlay) return;
    if (!takeovers.length) { overlay.hidden = true; return; }

    takeovers.sort(function (a, b) { return (a.rank || 9) - (b.rank || 9); });
    var top = takeovers[0];

    overlay.className = 'takeover-overlay ' + (
      top.tag === 'NWS'
        ? (top.rank === 0 ? 'sev-extreme' : 'sev-severe')
        : 'sev-notice');
    overlay.replaceChildren(
      SheetLoader.el('div', 'takeover-tag', top.tag),
      SheetLoader.el('div', 'takeover-title', top.title),
      SheetLoader.el('div', 'takeover-body', top.body || ''),
      SheetLoader.el('div', 'takeover-until',
        top.expiresAt ? 'Until ' + Fmt.timeOrDate(top.expiresAt) : '')
    );
    overlay.hidden = false;
  },

  _renderBanner: function (urgents) {
    var banner = document.getElementById('priority-banner');
    if (!banner) return;
    if (!urgents.length) { banner.hidden = true; return; }
    if (this._bannerIdx >= urgents.length) this._bannerIdx = 0;
    var it = urgents[this._bannerIdx];
    var text = '⚠ ' + it.title;
    if (it.body) text += ' — ' + it.body;
    banner.textContent = text.slice(0, 160) +
      (urgents.length > 1 ? '  (' + (this._bannerIdx + 1) + '/' + urgents.length + ')' : '');
    banner.hidden = false;
  },

  _cycleBanner: function () {
    var urgents = this._live().filter(function (i) { return i.level === 'urgent'; });
    if (urgents.length > 1) {
      this._bannerIdx = (this._bannerIdx + 1) % urgents.length;
      this._renderBanner(urgents);
    }
  }
};
