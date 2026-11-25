// Runs in <head> before the page paints so there is no light/dark flash.
(function () {
  var theme = null;
  try {
    var s = JSON.parse(localStorage.getItem('jf.settings.v1') || '{}');
    if (s && (s.theme === 'dark' || s.theme === 'light')) theme = s.theme;
  } catch (e) { /* storage blocked: fall back to system preference */ }
  if (!theme) {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
