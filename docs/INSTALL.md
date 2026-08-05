# Screen install guide

**The plan of record (decided 2026-08-04): TVs stay offline, Pi drives
everything.** The station's Insignia Fire TVs were found factory-fresh —
never on WiFi, no Amazon account. Keep them that way: complete their
one-time setup *skipping* WiFi and Amazon sign-in, and each TV becomes a
plain panel with HDMI inputs. No Amazon home screen, no ads, and no Fire
OS OTA updates to silently break kiosk behavior. The Raspberry Pi is the
only networked device and displays
`https://scpems-ops.github.io/station-signage/ops.html`.

Set the Pi's clock/timezone to station time (America/Chicago) — message
expiry and closure windows use device-local time.

---

## Shopping list (~$165, one order)

| Item | ~Price |
|---|---|
| Replacement remote for Insignia Fire TV (IR, e.g. NS-RCFNA-compatible — needed once for TV setup, then lives in a drawer; one covers both TVs) | $12 |
| Raspberry Pi 5 (4 GB) | $70 |
| Official 27 W USB-C PSU | $14 |
| SanDisk **Max Endurance** 64 GB microSD | $30 |
| Official Pi 5 case + Active Cooler | $15 |
| Micro-HDMI → HDMI cable (6 ft) | $9 |
| Heavy-duty Velcro (mount Pi behind TV) | $5 |
| Flat Ethernet cable (strongly preferred over WiFi) | $8 |

## One-time TV setup (per TV, with the replacement remote)

1. Power on — the TV sits at the language screen (factory state).
2. Walk the setup: choose language → **Skip WiFi setup** ("set up
   later" / skip when offered) → **skip Amazon sign-in**. The TV must
   never join a network; that is a feature, not a shortcut.
3. Settings → Display & Sounds → Power Controls → **Power On: Last
   Input** — the TV powers on straight to the Pi's HDMI input, never a
   Fire TV screen.
4. Turn off sleep timers / screensaver as far as the menus allow.
5. Note: after a hard power loss the TV stays **off** (no auto-power-on
   setting exists). The Pi's CEC unit below turns it back on; worst case
   a crew member presses the power button once.

## Raspberry Pi player build

### Pi setup (Raspberry Pi OS Bookworm, 64-bit desktop)

1. Flash with Raspberry Pi Imager; in OS customization set hostname,
   user (`kiosk`), locale/timezone `America/Chicago`, and network.
2. `sudo apt update && sudo apt full-upgrade -y && sudo apt install -y chromium-browser cec-utils`
3. **Offline-safe start page** — `/home/kiosk/boot.html`. A cold boot
   during an internet outage (power blip takes out the router too) must
   never leave a raw Chromium error page on the wall; this retries until
   the board is reachable, then navigates:

   ```html
   <!doctype html><meta charset="utf-8"><title>Starting board…</title>
   <body style="background:#0a0a0f;color:#888;font-family:system-ui;
     display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
   <div>Starting station board…</div>
   <script>
     var URL = 'https://scpems-ops.github.io/station-signage/ops.html';
     (function probe() {
       fetch(URL, { cache: 'no-store' })
         .then(function (r) { if (r.ok) location.href = URL; else throw 0; })
         .catch(function () { setTimeout(probe, 15000); });
     })();
   </script>
   ```

4. **Kiosk service** — `/etc/systemd/system/kiosk.service`:

   ```ini
   [Unit]
   Description=Signage kiosk browser
   After=graphical.target network-online.target
   Wants=network-online.target

   [Service]
   User=kiosk
   Environment=DISPLAY=:0
   ExecStart=/usr/bin/chromium-browser --kiosk --noerrdialogs \
     --disable-session-crashed-bubble --disable-infobars \
     --check-for-update-interval=604800 \
     file:///home/kiosk/boot.html
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=graphical.target
   ```

5. **CEC wake** — `/etc/systemd/system/tv-wake.service` (turns the TV on
   and grabs the input at every Pi boot, i.e. after any power cut):

   ```ini
   [Unit]
   Description=Wake TV via HDMI-CEC
   After=multi-user.target

   [Service]
   Type=oneshot
   ExecStart=/bin/sh -c 'echo "on 0" | cec-client -s -d 1; sleep 3; echo "as" | cec-client -s -d 1'

   [Install]
   WantedBy=multi-user.target
   ```

6. **Watchdog + nightly reboot**:
   - `/etc/systemd/system.conf`: set `RuntimeWatchdogSec=15` (hardware
     watchdog reboots a hung Pi).
   - `sudo crontab -e`: `30 3 * * * /sbin/reboot` (the page also reloads
     itself at 04:10 after the reboot).
7. Enable: `sudo systemctl enable kiosk.service tv-wake.service`
8. Disable desktop screen blanking: `raspi-config` → Display Options →
   Screen Blanking → No.

### Install-day smoke test

- [ ] Pull the Pi's power mid-rotation → TV turns back on by itself (CEC)
      and the board resumes without touching anything. If CEC wake fails
      on this panel, note it: recovery = one press of the TV power button.
- [ ] Kill Chromium (`sudo pkill chromium`) → systemd restarts it in <10 s.
- [ ] Unplug Ethernet 10 min → board keeps rotating with cached data +
      "cached"/STALE tags → replug → data freshens on next polls.

## Optional: remote health check ($0)

The station network isn't ours, so nothing listens inbound. Instead,
create a free check at [healthchecks.io](https://healthchecks.io) and ask
the operator to add its ping URL to a tiny `fetch()` interval in
`js/config.js`-gated code — you get an email when the board stops pinging.
(Deliberately not enabled by default; the board also shows per-feed
freshness in its status bar, which crews see at a glance.) Treat the ping
URL as semi-secret: this repo is public, and anyone holding the URL could
fake "alive" pings — keep it out of the committed config or accept that
the heartbeat is best-effort, not tamper-proof.

## Placement gates (before mounting anything)

- Sightlines: crew areas only — the board must not be readable from any
  public/lobby angle.
- Network: station IT (or whoever owns the router) blesses one device on
  Ethernet or WiFi. The board only makes outbound HTTPS requests.
