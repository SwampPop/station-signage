// Regional radar slide — the NWS RIDGE loop GIF for the radar site in
// BoardConfig.radar. Refreshes by preloading the new image off-screen and
// swapping only on success, so a network drop leaves the last good loop
// on screen (with an aging footnote) instead of a broken image icon.

window.Radar = {
  _lastOk: null,

  start: function () {
    var self = this;
    setInterval(function () { self._stamp(); }, 60 * 1000);
    return SheetLoader.poll(BoardConfig.radar.refreshMs, function () {
      return self.refresh();
    });
  },

  refresh: function () {
    var self = this;
    return new Promise(function (resolve) {
      var url = BoardConfig.radar.url + '?t=' + Date.now();
      var probe = new Image();
      probe.onload = function () {
        var el = document.getElementById('radar-img');
        if (el) el.src = url;
        self._lastOk = Date.now();
        Health.set('radar', 'ok', self._lastOk);
        self._stamp();
        resolve();
      };
      probe.onerror = function () {
        Health.set('radar', self._lastOk ? 'cache' : 'down', self._lastOk);
        self._stamp();
        resolve();
      };
      probe.src = url;
    });
  },

  _stamp: function () {
    var footer = document.getElementById('radar-footer');
    if (!footer) return;
    if (!this._lastOk) {
      footer.textContent = 'Radar loading…';
      return;
    }
    footer.replaceChildren();
    footer.appendChild(document.createTextNode(
      'NWS KHDC (Hammond) · updated ' + Fmt.ago(this._lastOk) + ' ago'));
    if (Date.now() - this._lastOk > BoardConfig.radar.staleMs) {
      footer.appendChild(SheetLoader.el('span', 'stale-tag', 'STALE'));
    }
  }
};
