(function () {
  'use strict';

  const STORAGE_KEY = 'cc_darkMode';
  const MOTION_STORAGE_KEY = 'cc_motionEnabled';
  const FONT_STORAGE_KEY = 'cc_fontSize';
  const FONT_SIZES = new Set(['small', 'medium', 'large']);
  let remoteSyncTimer = 0;
  let remoteAppearanceLoadedFor = '';

  function readPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (_) {
      return false;
    }
  }

  function applyTheme(enabled) {
    document.documentElement.classList.toggle('dark-mode', enabled);
    document.documentElement.dataset.theme = enabled ? 'dark' : 'light';
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
    window.dispatchEvent(new CustomEvent('cc:appearancechange', { detail: getAppearanceState() }));
    if (persist !== false) scheduleRemoteSync();
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

  function readMotionPreference() {
    try {
      const stored = localStorage.getItem(MOTION_STORAGE_KEY);
      return stored === null ? true : stored !== 'false';
    } catch (_) {
      return true;
    }
  }

  function syncMotionControl(enabled) {
    const toggle = document.getElementById('motionEnabledToggle');
    const label = document.getElementById('motionEnabledLabel');
    if (toggle) toggle.checked = enabled;
    if (label) label.textContent = enabled ? 'Bật' : 'Tắt';
  }

  function resetVideoToFirstFrame(video) {
    video.pause();
    video.removeAttribute('autoplay');
    const seekToStart = function () {
      try { video.currentTime = 0; } catch (_) { /* Metadata may not be ready yet. */ }
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seekToStart();
    else video.addEventListener('loadedmetadata', seekToStart, { once: true });
  }

  function syncMotionVideos(enabled, root) {
    const scope = root && root.querySelectorAll ? root : document;
    const videos = [];
    if (scope.matches && scope.matches('video')) videos.push(scope);
    videos.push(...scope.querySelectorAll('video'));
    videos.forEach(function (video) {
      if (video.hasAttribute('autoplay')) video.dataset.motionAutoplay = '';
      if (!enabled) {
        resetVideoToFirstFrame(video);
        return;
      }
      if (video.hasAttribute('data-motion-autoplay')) {
        video.setAttribute('autoplay', '');
        video.play().catch(function () { /* Browser autoplay rules can still block playback. */ });
      }
    });
  }

  function applyMotion(enabled) {
    document.documentElement.dataset.motion = enabled ? 'on' : 'off';
    syncMotionControl(enabled);
    syncMotionVideos(enabled, document);
  }

  function setMotion(enabled, persist) {
    const next = Boolean(enabled);
    applyMotion(next);
    if (persist !== false) {
      try {
        localStorage.setItem(MOTION_STORAGE_KEY, String(next));
      } catch (_) {
        /* Motion still updates for this page if storage is unavailable. */
      }
    }
    window.dispatchEvent(new CustomEvent('cc:motionchange', { detail: { enabled: next } }));
    window.dispatchEvent(new CustomEvent('cc:appearancechange', { detail: getAppearanceState() }));
    if (persist !== false) scheduleRemoteSync();
  }

  function bindMotionToggle() {
    const toggle = document.getElementById('motionEnabledToggle');
    if (!toggle || toggle.dataset.motionBound === 'true') return;
    toggle.dataset.motionBound = 'true';
    syncMotionControl(readMotionPreference());
    toggle.addEventListener('change', function () {
      setMotion(this.checked, true);
    });
  }

  function readFontSize() {
    try {
      const stored = localStorage.getItem(FONT_STORAGE_KEY) || 'medium';
      return FONT_SIZES.has(stored) ? stored : 'medium';
    } catch (_) {
      return 'medium';
    }
  }

  function applyFontSize(fontSize) {
    const next = FONT_SIZES.has(fontSize) ? fontSize : 'medium';
    document.documentElement.dataset.fontSize = next;
    return next;
  }

  function setFontSize(fontSize, persist) {
    const next = applyFontSize(fontSize);
    if (persist !== false) {
      try { localStorage.setItem(FONT_STORAGE_KEY, next); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('cc:appearancechange', { detail: getAppearanceState() }));
    if (persist !== false) scheduleRemoteSync();
    return next;
  }

  function getAppearanceState() {
    return {
      dark: readPreference(),
      motion: readMotionPreference(),
      fontSize: readFontSize()
    };
  }

  function scheduleRemoteSync() {
    window.clearTimeout(remoteSyncTimer);
    remoteSyncTimer = window.setTimeout(async function () {
      const firebase = window.CCFirebase;
      if (!firebase?.getCurrentUser?.() || !firebase?.saveUserData) return;
      try {
        await firebase.saveUserData('appearance', getAppearanceState());
      } catch (_) {
        /* Local preferences remain the cache/fallback when Firestore is unavailable. */
      }
    }, 450);
  }

  async function restoreRemoteAppearance(user) {
    if (!user?.uid || remoteAppearanceLoadedFor === user.uid) return;
    remoteAppearanceLoadedFor = user.uid;
    const firebase = window.CCFirebase;
    if (!firebase?.getUserData) return;
    try {
      const remote = await firebase.getUserData('appearance', null);
      if (!remote || typeof remote !== 'object') return;
      if (typeof remote.dark === 'boolean') setTheme(remote.dark, true);
      if (typeof remote.motion === 'boolean') setMotion(remote.motion, true);
      if (FONT_SIZES.has(remote.fontSize)) setFontSize(remote.fontSize, true);
    } catch (_) {
      /* The already-applied local preference is the offline fallback. */
    }
  }

  const initialPreference = readPreference();
  applyTheme(initialPreference);
  applyMotion(readMotionPreference());
  applyFontSize(readFontSize());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      applyTheme(readPreference());
      bindProfileToggle();
      applyMotion(readMotionPreference());
      bindMotionToggle();
      applyFontSize(readFontSize());
    }, { once: true });
  } else {
    applyTheme(readPreference());
    bindProfileToggle();
    applyMotion(readMotionPreference());
    bindMotionToggle();
    applyFontSize(readFontSize());
  }

  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) setTheme(event.newValue === 'true', false);
    if (event.key === MOTION_STORAGE_KEY) setMotion(event.newValue !== 'false', false);
    if (event.key === FONT_STORAGE_KEY) setFontSize(event.newValue || 'medium', false);
  });

  window.addEventListener('cc:auth-ready', function (event) {
    restoreRemoteAppearance(event.detail?.user);
  });

  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.matches('video') || node.querySelector('video')) {
          syncMotionVideos(readMotionPreference(), node);
        }
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.CCDarkMode = {
    get: readPreference,
    set: function (enabled) { setTheme(enabled, true); }
  };

  window.CCMotion = {
    get: readMotionPreference,
    set: function (enabled) { setMotion(enabled, true); },
    isEnabled: readMotionPreference
  };

  window.CCAppearance = {
    get: getAppearanceState,
    apply: function () {
      applyTheme(readPreference());
      applyMotion(readMotionPreference());
      applyFontSize(readFontSize());
      return getAppearanceState();
    },
    setDarkMode: function (enabled) { setTheme(enabled, true); return getAppearanceState(); },
    setFontSize: function (fontSize) { setFontSize(fontSize, true); return getAppearanceState(); }
  };
})();
