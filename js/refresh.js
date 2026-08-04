// Code self-update loop. Two mechanisms:
//   1. Version poll — pages.yml stamps version.json with the sha of the
//      last non-data commit; when it changes, reload. Data-only commits
//      (closure refreshes) keep the same sha, so they never reload the
//      board — content polls pick those up.
//   2. Daily reload backstop at BoardConfig.reload (04:10) — clears slow
//      browser leaks on the kiosk. Probe-fetches first and only reloads on
//      success, so an outage never turns the board into an error page.

window.Refresh = {
  _sha: null,

  start: function () {
    var self = this;
    setInterval(function () { self._checkVersion(); }, BoardConfig.polls.versionMs);
    setInterval(function () { self._checkDaily(); }, 60 * 1000);
    this._checkVersion();
  },

  async _checkVersion() {
    try {
      var res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      var v = await res.json();
      if (!v || !v.sha) return; // local preview placeholder
      if (this._sha === null) { this._sha = v.sha; return; }
      if (v.sha !== this._sha) location.reload();
    } catch (e) { /* offline — fine */ }
  },

  _checkDaily: function () {
    var cfg = BoardConfig.reload;
    var now = new Date();
    if (now.getHours() !== cfg.hour || now.getMinutes() !== cfg.minute) return;
    var today = now.toDateString();
    try {
      if (localStorage.getItem('sb:reloaded') === today) return;
      localStorage.setItem('sb:reloaded', today);
    } catch (e) { /* private mode — reload anyway */ }
    this._probeReload(3);
  },

  async _probeReload(retries) {
    try {
      var res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      location.reload();
    } catch (e) {
      var self = this;
      if (retries > 0) {
        setTimeout(function () { self._probeReload(retries - 1); }, 30 * 60 * 1000);
      }
    }
  }
};
