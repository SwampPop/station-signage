# Screen install guide

Two paths: a **Fire TV stopgap** you can do today with no hardware, and
the **Raspberry Pi player**, which is the durable 24/7 setup. Both display
`https://scpems-ops.github.io/station-signage/ops.html`.

Whichever path: set the display device's clock/timezone to station time
(America/Chicago) — message expiry and closure windows use device-local
time.

---

## Path A — Fire TV stopgap (today, ~$9)

Works on the station's Insignia Fire TVs directly. Honest limits: Fire OS
has no reliable app auto-launch, so **after a power blink or a Fire OS
update, someone may need to reopen the app from the row of installed
apps** (one click with the remote). Amazon's OTA updates occasionally
revert sleep settings. Treat this as temporary; keep the Pi plan funded.

1. **Enable sideloading**: Settings → My Fire TV → About → click the
   device name 7 times (unlocks Developer Options) → Developer Options →
   turn on *Apps from Unknown Sources* (and *ADB Debugging* if you want
   remote admin later).
2. **Install Downloader** from the Amazon Appstore, then use it to
   install **Fully Kiosk Browser** (fully-kiosk.com — get the Fire TV APK
   URL from their site).
3. **License**: buy a Fully Kiosk PLUS license (€7.90 one-time, per
   device) — needed for crash auto-restart and screensaver control.
4. **Configure Fully Kiosk**:
   - Start URL: `https://scpems-ops.github.io/station-signage/ops.html`
   - Keep Screen On: enabled · Launch on Boot: enabled (works after a
     normal standby wake; not after a hard power cut)
   - Auto Reload on Error: enabled
5. **TV settings**: Settings → Display & Sounds → Power Controls →
   turn off sleep timers / screensaver as far as the menu allows.
6. **Crew note**: if the screen ever shows the Amazon home screen, open
   Fully Kiosk from Your Apps — the board resumes automatically.

## Path B — Raspberry Pi player (durable, ~$150)

### Shopping list

| Item | ~Price |
|---|---|
| Raspberry Pi 5 (4 GB) | $70 |
| Official 27 W USB-C PSU | $14 |
| SanDisk **Max Endurance** 64 GB microSD | $30 |
| Official Pi 5 case + Active Cooler | $15 |
| Micro-HDMI → HDMI cable (6 ft) | $9 |
| Heavy-duty Velcro (mount Pi behind TV) | $5 |
| Flat Ethernet cable (strongly preferred over WiFi) | $8 |

### TV settings (Insignia Fire TV)

- Settings → Display & Sounds → Power Controls → **Power On: Last Input**
  — the TV powers on straight to the Pi's HDMI input, never the Amazon
  home screen.
- Note: after a hard power loss the TV stays **off** (no auto-power-on
  setting exists). The Pi's CEC unit below turns it back on; worst case a
  crew member presses the power button once.

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
