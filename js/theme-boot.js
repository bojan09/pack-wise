// Runs before first paint to avoid a light/dark flash. Classic script (CSP forbids inline).
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('packwise.prefs.v1') || '{}');
    if (p.theme === 'light' || p.theme === 'dark') document.documentElement.setAttribute('data-theme', p.theme);
    if (/^[a-z]{3,12}$/.test(p.bgLight || '')) document.documentElement.setAttribute('data-bgl', p.bgLight);
    if (/^[a-z]{3,12}$/.test(p.bgDark || '')) document.documentElement.setAttribute('data-bgd', p.bgDark);
  } catch (e) { /* storage blocked: fall back to system theme */ }
})();
