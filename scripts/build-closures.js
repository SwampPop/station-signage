#!/usr/bin/env node
// Fetch 511LA events, filter to the response area, and write
// data/closures-auto.json in the board's contract shape.
//
// Runs in GitHub Actions (closures.yml, LA511_KEY in repo secrets) or
// locally: LA511_KEY=... node scripts/build-closures.js
//
// Response area: St. Charles, St. John the Baptist, Lafourche, and
// Jefferson parishes. Events are matched by parish attribute when the API
// provides one, otherwise by bounding box (same box as js/config.js).

const fs = require('fs');
const path = require('path');

const KEY = process.env.LA511_KEY;
const OUT = path.join(__dirname, '..', 'data', 'closures-auto.json');
const BBOX = { latMin: 28.85, latMax: 30.20, lonMin: -91.05, lonMax: -89.90 };
const PARISHES = ['st. charles', 'st charles', 'st. john', 'st john',
  'lafourche', 'jefferson'];
// roadwork is only worth showing when it's a full closure — the WZDx feed
// already covers active work zones on the board.
const TYPES = new Set(['closures', 'accidentsAndIncidents', 'roadwork',
  'weatherConditions']);

function toIso(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v * 1000).toISOString();
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function inArea(e) {
  const parishField = String(e.Parish || e.Parishes || e.County || '').toLowerCase();
  if (parishField) return PARISHES.some(p => parishField.includes(p));
  const lat = Number(e.Latitude), lon = Number(e.Longitude);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
  return lat >= BBOX.latMin && lat <= BBOX.latMax &&
         lon >= BBOX.lonMin && lon <= BBOX.lonMax;
}

async function main() {
  if (!KEY) {
    console.log('LA511_KEY not set — leaving data/closures-auto.json untouched.');
    return;
  }
  const res = await fetch(
    `https://511la.org/api/v2/get/event?key=${encodeURIComponent(KEY)}&format=json`);
  if (!res.ok) throw new Error(`511LA HTTP ${res.status}`);
  const events = await res.json();
  if (!Array.isArray(events)) throw new Error('unexpected 511LA payload shape');

  const closures = events
    .filter(e => TYPES.has(e.EventType))
    .filter(e => e.EventType !== 'roadwork' || e.IsFullClosure)
    .filter(inArea)
    .map(e => ({
      id: String(e.ID ?? e.Id ?? `${e.RoadwayName}|${e.StartDate}`),
      roadway: e.RoadwayName || '',
      location: e.Location || '',
      parishes: [],
      type: e.EventType === 'accidentsAndIncidents' ? 'incident'
        : e.IsFullClosure ? 'closure' : 'lane',
      description: String(e.Description || '').slice(0, 200),
      starts: toIso(e.StartDate),
      ends: toIso(e.PlannedEndDate),
      severity: e.IsFullClosure ? 'closed' : 'caution'
    }));

  const out = {
    generated: new Date().toISOString(),
    source: '511la',
    closures
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${closures.length} closures to ${OUT}`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
