/* =================================================================
 * SCC wayfinder pin animation — JS shim
 * -----------------------------------------------------------------
 * Drop into Squarespace → Website → Utilities → Code Injection
 *  → FOOTER (so it runs after the existing wayfinder JS has wired
 *    up its pins and search).
 *
 * What it does:
 *   - On any click that hits a .pin (or anything inside one),
 *     remove .is-active from every other .pin and add it to the
 *     clicked one. The CSS file animates the rest.
 *   - Best-effort hooks the existing search so picking a search
 *     result also activates the matching pin. Two strategies:
 *       a) listen for clicks on search-result rows that carry
 *          data-space="X" matching a .pin[data-space="X"]
 *       b) watch the body for any .pin whose JS already toggles
 *          `pin--active` / `.active` / aria-current — copy those
 *          states into `.is-active` so existing site logic keeps
 *          driving the highlight.
 *   - Click anywhere that's NOT a pin or a search result to
 *     deactivate (acts like a "clear selection"). Comment out the
 *     last addEventListener block if you'd rather the active pin
 *     stay lit until the user picks another.
 * ================================================================= */
(function () {
  if (window.__sccPinAnim) return;  // single-init guard
  window.__sccPinAnim = true;

  function activate(pin) {
    document.querySelectorAll('.pin.is-active').forEach(function (p) {
      if (p !== pin) p.classList.remove('is-active');
    });
    if (pin) pin.classList.add('is-active');
  }

  // 1. Click a pin (or anything inside it) → activate it.
  document.addEventListener('click', function (e) {
    var pin = e.target.closest && e.target.closest('.pin');
    if (pin) {
      activate(pin);
      return;
    }
    // Click on a search result row that carries data-space.
    var hit = e.target.closest && e.target.closest('[data-space]');
    if (hit && !hit.classList.contains('pin')) {
      var space = hit.getAttribute('data-space');
      var match = document.querySelector('.pin[data-space="' + cssesc(space) + '"]');
      if (match) activate(match);
      return;
    }
    // Optional: click on empty space → clear. Comment out the
    // next two lines if you want the active pin to persist.
    if (!e.target.closest('.search, .mallnav, .pin, [data-space]')) {
      activate(null);
    }
  }, true);

  // 2. Mirror legacy active-class onto .is-active (best effort).
  //    If the existing site JS already adds .pin--active, .active,
  //    or aria-current="true" to indicate the selected pin, copy
  //    that into .is-active so this CSS still drives the animation.
  var legacyActiveSelectors = ['.pin--active', '.pin.active', '.pin[aria-current="true"]'];
  function syncLegacy() {
    legacyActiveSelectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (p) {
        if (!p.classList.contains('is-active')) activate(p);
      });
    });
  }
  // Run once now and then on every DOM mutation under .levels.
  syncLegacy();
  var levels = document.querySelector('.levels');
  if (levels && 'MutationObserver' in window) {
    new MutationObserver(syncLegacy)
      .observe(levels, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-current'] });
  }

  function cssesc(s) { return String(s).replace(/(["\\])/g, '\\$1'); }
})();
