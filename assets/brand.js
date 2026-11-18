// Shared brand pieces: logo, condition skies, theme.
window.MW = (function () {
  const logo = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M3 13.5a9 9 0 0 1 18 0"/><path d="M8 13.5a4 4 0 0 1 8 0"/><path d="M2.5 18h19"/><path d="M7.5 22h9"/></svg>';
  const sky = { FAIR: '/assets/sky/fair.webp', CLOUDY: '/assets/sky/fair.webp', STORM: '/assets/sky/storm.webp', SEVERE: '/assets/sky/severe.webp', CALIBRATING: '/assets/sky/hero.webp' };
  const label = { FAIR: 'Clear', CLOUDY: 'Cloudy', STORM: 'Storm', SEVERE: 'Severe', CALIBRATING: 'Calibrating' };
  function store(key, val) { try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; } }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function setTheme(t, after) {
    document.documentElement.setAttribute('data-theme', t);
    store('mw-theme', t);
    document.querySelectorAll('[data-theme-btn]').forEach(b => b.classList.toggle('active', b.dataset.themeBtn === t));
    if (after) after();
  }
  function initTheme(after) {
    setTheme(store('mw-theme') === 'dark' ? 'dark' : 'light');
    document.querySelectorAll('[data-theme-btn]').forEach(b => b.onclick = () => setTheme(b.dataset.themeBtn, after));
  }
  function fmtDate(iso) { const [y, m, d] = iso.split('-').map(Number); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1] + ' ' + d; }
  return { logo, sky, label, css, initTheme, fmtDate };
})();
