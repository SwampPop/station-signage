// NWS active alerts for the station point (api.weather.gov — CORS-open,
// no key). Feeds the Priority layer and stamps a summary line into the
// weather slide. Alert classification:
//   takeover — event listed in BoardConfig.alerts.takeoverEvents, or
//              severity "Extreme"
//   urgent   — severity "Severe" (persistent banner)
//   info     — everything else (weather-slide line only)
// Cached alerts are re-filtered by their own end time at every render, so
// an expired warning can't survive a network outage.

window.Alerts = {
  start: function () {
    var self = this;
    var st = BoardConfig.station;
    if (st.latitude == null || st.longitude == null) {
      Health.set('nws', 'off');
      return Promise.resolve();
    }
    return SheetLoader.poll(BoardConfig.polls.alertsMs, function () {
      return self.refresh();
    });
  },

  async refresh() {
    var st = BoardConfig.station;
    var url = 'https://api.weather.gov/alerts/active?point=' +
      st.latitude.toFixed(4) + ',' + st.longitude.toFixed(4);
    var res = await Store.fetchJson('alerts', url, function (d) {
      return d && Array.isArray(d.features);
    });
    if (!res) { Health.set('nws', 'down'); return; }
    Health.set('nws', res.fromCache ? 'cache' : 'ok', res.fetchedAt);

    var now = Date.now();
    var alerts = res.data.features
      .map(function (f) { return f.properties || {}; })
      .map(function (p) {
        var endsAt = Date.parse(p.ends || p.expires || '') || null;
        return {
          event: p.event || 'Weather alert',
          severity: p.severity || 'Unknown',
          headline: p.headline || '',
          endsAt: endsAt
        };
      })
      .filter(function (a) { return !a.endsAt || a.endsAt > now; });

    this._feedPriority(alerts);
    this._stampWeatherSlide(alerts);
  },

  _classify: function (a) {
    if (a.severity === 'Extreme') return { level: 'takeover', rank: 0 };
    if (BoardConfig.alerts.takeoverEvents.indexOf(a.event) >= 0) {
      return { level: 'takeover', rank: 1 };
    }
    if (a.severity === 'Severe') return { level: 'urgent', rank: 2 };
    return null;
  },

  _feedPriority: function (alerts) {
    if (!window.Priority) return;
    var self = this;
    var items = [];
    alerts.forEach(function (a) {
      var cls = self._classify(a);
      if (!cls) return;
      items.push({
        level: cls.level,
        rank: cls.rank,
        title: a.event,
        body: a.headline,
        tag: 'NWS',
        expiresAt: a.endsAt
      });
    });
    Priority.setWxItems(items);
  },

  _stampWeatherSlide: function (alerts) {
    var line = document.getElementById('wx-alert-line');
    if (!line) return;
    if (!alerts.length) { line.textContent = ''; return; }
    var parts = alerts.slice(0, 3).map(function (a) {
      return a.event + (a.endsAt ? ' until ' + Fmt.timeOrDate(a.endsAt) : '');
    });
    line.textContent = '⚠ ' + parts.join(' · ');
  }
};
