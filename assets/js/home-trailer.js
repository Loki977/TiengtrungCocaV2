(() => {
  'use strict';

  const SESSION_KEY = 'camCocaTrailerPlayed';
  const FADE_MS = 260;
  const LOAD_TIMEOUT_MS = 6000;
  const overlay = document.getElementById('homeTrailer');
  const video = document.getElementById('homeTrailerVideo');
  const skipButton = document.getElementById('homeTrailerSkip');
  const soundButton = document.getElementById('homeTrailerSound');
  const replayButton = document.getElementById('replayTrailer');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionEnabled = () => !window.CCMotion || window.CCMotion.isEnabled();
  let playbackTimer;
  let closeTimer;
  let loadTimer;
  let openRequest = 0;

  if (!overlay || !video || !skipButton) return;

  const syncSoundButton = () => {
    if (!soundButton) return;
    soundButton.textContent = video.muted ? '🔊 Bật âm thanh' : '🔇 Tắt âm thanh';
    soundButton.setAttribute('aria-label', video.muted ? 'Bật âm thanh trailer' : 'Tắt âm thanh trailer');
  };

  const hasPlayedThisSession = () => {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; }
    catch (_) { return false; }
  };

  const markPlayed = () => {
    try { sessionStorage.setItem(SESSION_KEY, '1'); }
    catch (_) { /* The trailer still works when storage is unavailable. */ }
  };

  const closeTrailer = (immediate = false) => {
    openRequest += 1;
    clearTimeout(playbackTimer);
    clearTimeout(closeTimer);
    clearTimeout(loadTimer);
    video.pause();
    overlay.classList.add('is-closing');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('trailer-open');

    closeTimer = window.setTimeout(() => {
      overlay.classList.remove('is-visible', 'is-closing');
      video.removeAttribute('src');
      video.load();
    }, immediate ? 0 : FADE_MS);
  };

  const openTrailer = ({ replay = false } = {}) => {
    if (!motionEnabled() || (!replay && (hasPlayedThisSession() || reducedMotion.matches))) return;

    const request = ++openRequest;
    clearTimeout(closeTimer);
    clearTimeout(loadTimer);
    overlay.classList.remove('is-closing');
    video.muted = false;
    syncSoundButton();
    video.src = video.dataset.src;
    video.currentTime = 0;
    video.load();

    const revealTrailer = () => {
      if (request !== openRequest || !motionEnabled() || overlay.classList.contains('is-closing')) {
        video.pause();
        return;
      }
      clearTimeout(loadTimer);
      markPlayed();
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('trailer-open');
    };

    const startPlayback = () => {
      video.play().then(revealTrailer).catch(() => {
        if (!video.muted) {
          video.muted = true;
          syncSoundButton();
          return video.play().then(revealTrailer).catch(() => closeTrailer(true));
        }
        closeTrailer(true);
      });
    };

    loadTimer = window.setTimeout(() => {
      if (request !== openRequest || overlay.classList.contains('is-visible')) return;
      openRequest += 1;
      video.pause();
      video.removeAttribute('src');
      video.load();
    }, LOAD_TIMEOUT_MS);

    startPlayback();
  };

  video.addEventListener('playing', () => {
    clearTimeout(playbackTimer);
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    playbackTimer = window.setTimeout(
      () => closeTrailer(),
      Math.ceil((video.duration - video.currentTime) * 1000) + 2000
    );
  });
  video.addEventListener('waiting', () => clearTimeout(playbackTimer));
  video.addEventListener('stalled', () => clearTimeout(playbackTimer));
  video.addEventListener('pause', () => clearTimeout(playbackTimer));
  video.addEventListener('ended', () => closeTrailer());
  video.addEventListener('error', () => closeTrailer());
  skipButton.addEventListener('click', () => closeTrailer());
  soundButton?.addEventListener('click', () => {
    video.muted = !video.muted;
    syncSoundButton();
    if (video.paused && motionEnabled()) video.play().catch(() => closeTrailer());
  });
  replayButton?.addEventListener('click', () => openTrailer({ replay: true }));
  reducedMotion.addEventListener?.('change', event => {
    if (event.matches && overlay.classList.contains('is-visible')) closeTrailer(true);
  });
  window.addEventListener('cc:motionchange', event => {
    if (!event.detail.enabled && overlay.classList.contains('is-visible')) closeTrailer(true);
  });

  openTrailer();
})();
