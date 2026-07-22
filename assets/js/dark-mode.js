(function () {
  'use strict';

  const STORAGE_KEY = 'cc_darkMode';
  const MOTION_STORAGE_KEY = 'cc_motionEnabled';

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

  const initialPreference = readPreference();
  applyTheme(initialPreference);
  applyMotion(readMotionPreference());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      applyTheme(readPreference());
      bindProfileToggle();
      applyMotion(readMotionPreference());
      bindMotionToggle();
    }, { once: true });
  } else {
    applyTheme(readPreference());
    bindProfileToggle();
    applyMotion(readMotionPreference());
    bindMotionToggle();
  }

  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) setTheme(event.newValue === 'true', false);
    if (event.key === MOTION_STORAGE_KEY) setMotion(event.newValue !== 'false', false);
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
})();
