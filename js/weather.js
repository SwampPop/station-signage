// Open-Meteo weather (no API key, CORS-open). Renders current conditions
// plus the next six hours into #weather-body; refreshes every 15 minutes
// with a last-good cache so a network drop shows aged data, not a blank.

window.Weather = {
  // WMO weather interpretation codes -> display text.
  _codes: {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Freezing fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
    85: 'Snow showers', 86: 'Snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ hail'
  },

  start: function () {
    var self = this;
    var st = BoardConfig.station;
    var body = document.getElementById('weather-body');
    if (st.latitude == null || st.longitude == null) {
      if (body) body.textContent =
        'Weather not configured — set station coordinates in js/config.js.';
      Health.set('wx', 'off');
      return Promise.resolve();
    }
    return SheetLoader.poll(BoardConfig.polls.weatherMs, function () {
      return self.refresh();
    });
  },

  async refresh() {
    var st = BoardConfig.station;
    var url = 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + st.latitude + '&longitude=' + st.longitude +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,' +
      'weather_code,wind_speed_10m,wind_direction_10m' +
      '&hourly=temperature_2m,precipitation_probability,weather_code' +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph' +
      '&timezone=auto&forecast_days=2';
    var res = await Store.fetchJson('weather', url, function (d) {
      return d && d.current && typeof d.current.temperature_2m === 'number';
    });
    var body = document.getElementById('weather-body');
    if (!body) return;
    if (!res) {
      Health.set('wx', 'down');
      body.textContent = 'Weather unavailable.';
      return;
    }
    Health.set('wx', res.fromCache ? 'cache' : 'ok', res.fetchedAt);
    this._render(body, res);
  },

  _windDir: function (deg) {
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  },

  _render: function (body, res) {
    var d = res.data;
    var cur = d.current;
    var el = SheetLoader.el;

    var current = el('div', 'wx-current');
    current.appendChild(el('div', 'wx-temp', Math.round(cur.temperature_2m) + '°'));
    var right = el('div', null);
    right.appendChild(el('div', 'wx-cond',
      this._codes[cur.weather_code] || 'Conditions unavailable'));
    right.appendChild(el('div', 'wx-meta',
      'Feels like ' + Math.round(cur.apparent_temperature) + '° · ' +
      'Wind ' + this._windDir(cur.wind_direction_10m) + ' ' +
      Math.round(cur.wind_speed_10m) + ' mph · ' +
      'Humidity ' + Math.round(cur.relative_humidity_2m) + '%'));
    current.appendChild(right);

    var hours = el('div', 'wx-hours');
    var times = (d.hourly && d.hourly.time) || [];
    // timezone=auto -> hourly.time entries are local ISO strings. If the
    // whole forecast window is in the past (a cached payload older than
    // two days), show no hourly strip rather than stale hours as upcoming.
    var nowIso = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000))
      .toISOString().slice(0, 13);
    var startIdx = -1;
    for (var i = 0; i < times.length; i++) {
      if (times[i].slice(0, 13) >= nowIso) { startIdx = i; break; }
    }
    if (startIdx >= 0) {
      for (var h = startIdx; h < Math.min(startIdx + 6, times.length); h++) {
        var hourEl = el('div', 'wx-hour');
        var label = new Date(times[h]).toLocaleTimeString([], { hour: 'numeric' });
        hourEl.appendChild(el('div', 'h', label));
        hourEl.appendChild(el('div', 't',
          Math.round(d.hourly.temperature_2m[h]) + '°'));
        hourEl.appendChild(el('div', 'p',
          (d.hourly.precipitation_probability[h] || 0) + '%'));
        hours.appendChild(hourEl);
      }
    }

    var foot = el('div', 'footnote updated-footnote',
      'Updated ' + Fmt.ago(res.fetchedAt) + ' ago' +
      (res.fromCache ? ' (cached)' : ''));
    if (Date.now() - res.fetchedAt > BoardConfig.staleness.weatherMs) {
      foot.appendChild(el('span', 'stale-tag', 'STALE'));
    }

    var parts = [current];
    if (startIdx >= 0) parts.push(hours);
    parts.push(foot);
    body.replaceChildren.apply(body, parts);
  }
};
