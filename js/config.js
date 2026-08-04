// Central configuration for the station board. Everything tunable lives
// here: coordinates, content sources, poll cadences, alert behavior.
// Dates/times are interpreted in the display device's local clock, which
// must be set to station time (America/Chicago) — see docs/INSTALL.md.

window.BoardConfig = {
  station: {
    // Approximate (town-center) coordinates — drives weather + NWS alerts.
    latitude: 29.93,
    longitude: -90.37
  },

  sheet: {
    // "Station Board" sheet (Share -> Anyone with the link: Viewer).
    id: '11N4Cz-0CKiurUhRQA21yUQcE4gZQ1ouBsEqIE_-DMrE',
    tabs: { messages: 'messages', closures: 'closures' },
    // gviz CSV endpoint: no publish step, near-zero cache latency.
    // Fallback if Google ever changes gviz: File -> Share -> Publish each
    // tab to the web as CSV and return that URL here instead:
    //   https://docs.google.com/spreadsheets/d/e/<2PACX-id>/pub?gid=<gid>&single=true&output=csv
    urlForTab: function (tab) {
      return 'https://docs.google.com/spreadsheets/d/' + this.id +
             '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tab);
    }
  },

  closures: {
    autoUrl: 'data/closures-auto.json',
    wzdxUrl: 'https://wzdx.e-dot.com/la_dot_d_feed_wzdx_v4.1.geojson',
    // Response area: St. Charles, St. John the Baptist, Lafourche, and
    // Jefferson parishes. A rectangle can't trace parish lines, so this
    // box over-includes some neighboring events (notably western Orleans)
    // rather than risk missing Lafourche or Grand Isle.
    bbox: { latMin: 28.85, latMax: 30.20, lonMin: -91.05, lonMax: -89.90 },
    maxEntries: 7
  },

  polls: { // milliseconds; each poller adds +-10% jitter
    sheetMs: 5 * 60 * 1000,
    alertsMs: 5 * 60 * 1000,
    closuresAutoMs: 10 * 60 * 1000,
    wzdxMs: 15 * 60 * 1000,
    weatherMs: 15 * 60 * 1000,
    versionMs: 15 * 60 * 1000
  },

  messages: {
    defaultTtlDays: 14,       // blank `expires` -> posted + this many days
    defaultDwellMs: 12000,
    maxSlides: 8,
    takeoverMaxMs: 4 * 60 * 60 * 1000 // takeover rows without an explicit
                                      // expiry degrade to `high` after 4 h
  },

  alerts: {
    // NWS events that seize the whole screen. Severity "Extreme" always
    // takes over; "Severe" gets the persistent banner instead.
    takeoverEvents: [
      'Tornado Warning',
      'Flash Flood Emergency',
      'Extreme Wind Warning',
      'Hurricane Warning'
    ]
  },

  staleness: { // ms of data age before an amber STALE tag appears
    sheetMs: 30 * 60 * 1000,
    closuresAutoMs: 90 * 60 * 1000, // 3x the 30-min refresh cron
    weatherMs: 60 * 60 * 1000
  },

  reload: { hour: 4, minute: 10 } // daily probe-first page reload
};
