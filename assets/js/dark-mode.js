(function () {
  'use strict';

  const STORAGE_KEY = 'cc_darkMode';

  function readPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (_) {
      return false;
    }
  }

  function applyTheme(enabled) {
    document.documentElement.classList.toggle('dark-mode', enabled);
    if (document.body) document.body.classList.toggle('dark-mode', enabled);
  }

  function syncControls(enabled) {
    const toggle = document.getElementById('darkModeToggle');
    const label = document.getElementById('darkModeLabel');
    if (toggle) toggle.checked = enabled;
    if (label) label.textContent = enabled ? 'Bật' : 'Tắt';
  }

  function setTheme(enabled, persist) {
    const next = Boolean(enabled);
    applyTheme(next);
    syncControls(next);
    if (persist !== false) {
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch (_) {
        /* The theme still works for this page if storage is unavailable. */
      }
    }
    window.dispatchEvent(new CustomEvent('cc:darkmode', { detail: { enabled: next } }));
  }

  function bindProfileToggle() {
    const toggle = document.getElementById('darkModeToggle');
    if (!toggle || toggle.dataset.darkModeBound === 'true') return;

    toggle.dataset.darkModeBound = 'true';
    syncControls(readPreference());
    toggle.addEventListener('change', function () {
      setTheme(this.checked, true);
      if (typeof window.showToast === 'function') {
        window.showToast(this.checked ? '🌙 Chế độ tối đã bật' : '☀️ Chế độ sáng đã bật');
      }
    });
  }

  const initialPreference = readPreference();
  applyTheme(initialPreference);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      applyTheme(readPreference());
      bindProfileToggle();
    }, { once: true });
  } else {
    applyTheme(readPreference());
    bindProfileToggle();
  }

  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) setTheme(event.newValue === 'true', false);
  });

  window.CCDarkMode = {
    get: readPreference,
    set: function (enabled) { setTheme(enabled, true); }
  };
})();
