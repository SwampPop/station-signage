# Station Signage

An always-on information board for an EMS station, shown on a wall-mounted
TV. Crews see chief/shift-lead messages, road closures for the response
area, live weather with NWS alert takeovers, and safety reminders. Pure
static site (vanilla HTML/CSS/JS, no build step) hosted on GitHub Pages.

The board updates itself: content polls every few minutes, code changes
deploy on push and are picked up within ~15 minutes, and the page reloads
once a day as a backstop. Nothing on the TV ever needs touching.

## Editing content (the part most people need)

All human-authored content lives in **one Google Sheet** ("Station Board").
Edit it from the Google Sheets app on your phone; the board picks up
changes within about 5 minutes. No GitHub, no code.

### `messages` tab — chief / shift-lead messages

| column | values | notes |
|---|---|---|
| `active` | `yes` / `no` | anything but `yes` keeps the row off the board |
| `priority` | `normal` `high` `urgent` `takeover` | see below |
| `title` | text | slide headline — **required**, row is ignored without it |
| `body` | text | newlines become bullet points |
| `author` | e.g. `Chief B.` | shown as the byline |
| `posted` | `2026-08-04` | **required** — row is ignored without it |
| `expires` | `2026-08-18` or blank | blank = posted + 14 days; expired rows vanish |
| `dwell` | seconds, optional | how long the slide stays up (default 12, clamped 5–120) |

The newest 8 surviving messages rotate (priority first); older ones wait
their turn. Note `active: no` only hides a row from the TV — the sheet
itself is readable by anyone who has its link, so never put anything
sensitive in any row, active or not.

Priority levels:
- **normal** — a slide in the rotation.
- **high** — sorted to the front of the rotation, highlighted border.
- **urgent** — also pinned as a banner across the top of every slide.
- **takeover** — fills the whole screen until it expires. Use for real
  emergencies only. If `expires` is blank, a takeover drops back to
  `high` after 4 hours so a forgotten row can't own the screen.

### `closures` tab — manual road closures (parades, second lines, flooding)

| column | values |
|---|---|
| `active` | `yes` / `no` |
| `severity` | `closed` / `caution` / `info` |
| `location` | `Magazine St @ Napoleon` |
| `detail` | `Second line 1–5 pm, route north on Magazine` |
| `starts` | `2026-08-10` or `2026-08-10 13:00` (optional) |
| `ends` | same format (optional) — row auto-hides after this |
| `source` | free text, e.g. `krewe schedule`, `crew report` |

Automated closures (511LA incidents/closures, DOTD work zones) merge into
the same slide with source badges — you don't manage those.

### `hospitals` tab — crew-reported hospital status (optional)

Create this tab and the slide appears; delete all rows and it disappears.

| column | values |
|---|---|
| `active` | `yes` / `no` |
| `hospital` | `Ochsner Kenner` |
| `status` | `open` / `busy` / `slow` / `divert` / `closed` get color chips; any other text shows plain |
| `note` | `offload ~45 min` (optional) |
| `updated` | `2026-08-04 18:30` — **required**; rows vanish 8 h after this time |

The 8-hour auto-expiry is deliberate: a stale offload status is worse
than none. Bump `updated` when you re-confirm a status. These are crew
reports, not hospital data — treat them as situational awareness, not
gospel.

### Content guardrails

- **No PHI, ever.** No patient names, run numbers, or CAD details.
- The board URL is publicly reachable. Rule of thumb: post nothing you
  wouldn't tape to the station's front door.
- Stale content is hidden automatically (expiry dates, attestation TTL).

## Operator setup (one-time)

1. Create the Google Sheet with tabs `messages` and `closures` using the
   column headers above (row 1, lowercase). Share → **Anyone with the
   link: Viewer**. Copy the sheet ID from its URL.
2. In `js/config.js`: set `sheet.id`, and `station.latitude`/`longitude`
   (approximate is fine — drives weather + NWS alerts).
3. For automated 511LA closures: register at
   [511la.org](https://www.511la.org/developers/resources), request a free
   developer API key, and add it as the `LA511_KEY` repo secret. The
   `closures.yml` workflow does nothing until the key exists. The DOTD
   work-zone feed needs no key and works immediately. (GitHub pauses cron
   schedules after 60 days without repo activity — if 511 closures ever
   stop refreshing, re-enable the workflow from the Actions tab.)
4. Screen/kiosk install: see [`docs/INSTALL.md`](docs/INSTALL.md).

## Preview locally

```sh
python3 -m http.server 8765
```

Then open `http://localhost:8765/ops.html`. Keyboard: `n` next slide,
`p` pause, `Esc` stop. (`version.json` is a placeholder locally, so the
auto-reload loop stays quiet during development.)

## Deploying

Push to `main`. `.github/workflows/pages.yml` publishes the site and
stamps `version.json` with the last non-data commit sha; boards reload
within ~15 minutes of a deploy. Data-only commits (closure refreshes)
don't trigger board reloads.

Kiosk URL: `https://swamppop.github.io/station-signage/ops.html`

## Architecture

```
station-signage/
├── ops.html                   ← the board (Screen A)
├── clinical.html              ← Screen B (parked — published with the
│                                site but not installed on any TV)
├── css/                       ← base layout + per-screen themes
├── js/
│   ├── config.js              ← ALL knobs: coords, sheet ID, cadences
│   ├── store.js               ← fetch + last-good cache, health bar, dates
│   ├── sheet-loader.js        ← Sheet CSV fetch/parse + slide DOM helpers
│   ├── messages.js            ← chief messages (sheet tab)
│   ├── closures.js            ← roads slide: manual + 511 + DOTD merge
│   ├── hospitals.js           ← crew-reported hospital status (sheet tab)
│   ├── alerts.js              ← NWS active alerts → priority layer
│   ├── weather.js             ← Open-Meteo current + 6-hour outlook
│   ├── radar.js               ← NWS KHDC radar loop slide
│   ├── priority.js            ← urgent banner + full-screen takeover
│   ├── refresh.js             ← version poll + daily reload backstop
│   ├── rotator.js             ← slide cycling
│   └── attestation-guard.js   ← clinical-screen safety net (parked)
├── data/closures-auto.json    ← written by closures.yml (511LA)
├── scripts/build-closures.js  ← 511LA fetch/filter (Actions + local)
└── .github/workflows/         ← pages.yml (deploy) + closures.yml (cron)
```

Resilience model: every feed renders fresh data when it can, falls back to
its last-good cached copy when it can't (with visible "Updated Xm ago" /
`STALE` tags), and the static welcome/safety slides guarantee the board
never blanks. Feed health shows in the bottom status bar.

## Adding a new content type

1. Add a tab to the Sheet (include an `active` column).
2. Copy the shape of `js/messages.js`: fetch via
   `SheetLoader.fetchTab('yourtab', [...required cols])`, render via
   `SheetLoader.upsertSlide(...)`, prune via `SheetLoader.pruneSlides(...)`.
3. Register the tab name in `js/config.js`, add one `<script>` tag and one
   `YourType.start()` line in `ops.html`.

No rotator, cache, or priority changes needed. Training calendars,
shout-outs, and aggregate metrics all fit this pattern.
