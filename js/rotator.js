// Slide rotator. Finds .slide elements under a container, cycles visibility
// with a fade, respects per-slide data-dwell (ms). Skips slides hidden by
// the attestation guard. Keyboard: n = next, p = pause/resume, Esc = stop.

class Rotator {
  constructor(stageEl, options = {}) {
    this.stage = stageEl;
    this.statusEl = options.statusEl || null;
    this.defaultDwell = options.defaultDwell || 12000;
    this.current = null; // element, not index: slides are inserted/removed live
    this.paused = false;
    this.stopped = false;
    this.timer = null;

    this._keyHandler = this._onKey.bind(this);
    document.addEventListener('keydown', this._keyHandler);

    // Content refreshes can remove the slide currently on screen. Without
    // this, the stage would show bare background until the removed slide's
    // dwell timer fired. Advance immediately instead.
    this._observer = new MutationObserver(() => {
      if (this.current && !this.current.isConnected && !this.stopped && !this.paused) {
        clearTimeout(this.timer);
        this._advance();
      }
    });
    this._observer.observe(stageEl, { childList: true });
  }

  slides() {
    return Array.from(this.stage.querySelectorAll('.slide:not(.hidden-by-guard)'));
  }

  start() {
    if (this.slides().length === 0) {
      if (this.statusEl) this.statusEl.textContent = 'no slides';
      return;
    }
    this._advance();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.slides().forEach(s => s.classList.remove('visible'));
    if (this.statusEl) this.statusEl.textContent = 'stopped';
    document.removeEventListener('keydown', this._keyHandler);
    this._observer.disconnect();
  }

  pauseResume() {
    if (this.paused) {
      this.paused = false;
      this._advance();
    } else {
      this.paused = true;
      if (this.timer) clearTimeout(this.timer);
      if (this.statusEl) this.statusEl.textContent = 'paused';
    }
  }

  _advance() {
    if (this.stopped || this.paused) return;
    const slides = this.slides();
    if (slides.length === 0) return;

    // indexOf is -1 when the current slide was removed by a content
    // refresh — that resolves to slides[0], never a skip or double-show.
    const idx = (slides.indexOf(this.current) + 1) % slides.length;
    const next = slides[idx];

    slides.forEach(s => s.classList.remove('visible'));
    next.classList.add('visible');
    this.current = next;

    const dwell = parseInt(next.getAttribute('data-dwell'), 10) || this.defaultDwell;
    const id = next.getAttribute('data-slide-id') || String(idx);
    if (this.statusEl) {
      this.statusEl.textContent = `${id} · ${idx + 1}/${slides.length}`;
    }

    this.timer = setTimeout(() => this._advance(), dwell);
  }

  _onKey(e) {
    if (e.key === 'n') { clearTimeout(this.timer); this._advance(); }
    else if (e.key === 'p') { this.pauseResume(); }
    else if (e.key === 'Escape') { this.stop(); }
  }
}

window.Rotator = Rotator;
