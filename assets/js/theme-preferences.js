(function () {
  'use strict';

  const THEME_KEY = 'cc_darkMode';
  const FONT_KEY = 'cc_fontSize';
  const FONT_SIZES = new Set(['small', 'medium', 'large']);

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function currentState() {
    const dark = readStorage(THEME_KEY, 'false') === 'true';
    const storedFont = readStorage(FONT_KEY, 'medium');
    return { dark, fontSize: FONT_SIZES.has(storedFont) ? storedFont : 'medium' };
  }

  function apply(state, persist) {
    const dark = Boolean(state.dark);
    const fontSize = FONT_SIZES.has(state.fontSize) ? state.fontSize : 'medium';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.fontSize = fontSize;
    document.body?.classList.toggle('dark-mode', dark);
    if (persist) {
      writeStorage(THEME_KEY, String(dark));
      writeStorage(FONT_KEY, fontSize);
    }
    window.dispatchEvent(new CustomEvent('cc:appearancechange', { detail:{ dark, fontSize } }));
    return { dark, fontSize };
  }

  const api = {
    get: currentState,
    apply: () => apply(currentState(), false),
    setDarkMode(dark) {
      const state = currentState();
      state.dark = Boolean(dark);
      return apply(state, true);
    },
    setFontSize(fontSize) {
      const state = currentState();
      state.fontSize = FONT_SIZES.has(fontSize) ? fontSize : 'medium';
      return apply(state, true);
    }
  };

  window.CCAppearance = api;
  apply(currentState(), false);

  window.addEventListener('DOMContentLoaded', () => api.apply(), { once:true });
  window.addEventListener('storage', event => {
    if (event.key === THEME_KEY || event.key === FONT_KEY) api.apply();
  });
})();
