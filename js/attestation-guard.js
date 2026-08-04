// Attestation guard for clinical slides.
//
// Every .clinical-slide must declare:
//   data-attested-by="<initials>"
//   data-attested-date="YYYY-MM-DD"
//   data-protocol-ref="<protocol / source reference>"
//
// Slides missing any of these, or with an attestation date older than
// MAX_AGE_DAYS, are hidden from rotation (.hidden-by-guard). A visible
// attestation footer is stamped on every surviving slide so crews can see
// who signed off on the content.

window.AttestationGuard = (function () {
  const MAX_AGE_DAYS = 90;

  function parseDate(s) {
    if (!s) return null;
    // Expect YYYY-MM-DD; construct as UTC to avoid TZ drift.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }

  function daysBetween(a, b) {
    return Math.floor((a - b) / (1000 * 60 * 60 * 24));
  }

  function enforce(stageEl) {
    const slides = Array.from(stageEl.querySelectorAll('.clinical-slide'));
    const now = new Date();
    let kept = 0;
    const issues = [];

    slides.forEach(slide => {
      const by = slide.getAttribute('data-attested-by');
      const dateStr = slide.getAttribute('data-attested-date');
      const ref = slide.getAttribute('data-protocol-ref');
      const date = parseDate(dateStr);
      const id = slide.getAttribute('data-slide-id') || '(unnamed)';

      let reason = null;
      if (!by || !dateStr || !ref) reason = 'missing attestation fields';
      else if (!date) reason = `bad attested date: ${dateStr}`;
      else if (daysBetween(now, date) > MAX_AGE_DAYS) reason = `stale (> ${MAX_AGE_DAYS} days)`;

      if (reason) {
        slide.classList.add('hidden-by-guard');
        issues.push({ id, reason });
        return;
      }

      // Stamp a visible footer so crews know who signed off.
      const inner = slide.querySelector('.slide-inner');
      if (inner) {
        inner.setAttribute(
          'data-attestation-footer',
          `Attested: ${by} · ${dateStr} · ${ref}`
        );
      }
      kept++;
    });

    if (issues.length) {
      console.warn('[attestation-guard] hidden slides:', issues);
    }

    return { total: slides.length, kept, hidden: slides.length - kept, issues };
  }

  return { enforce, MAX_AGE_DAYS };
})();
