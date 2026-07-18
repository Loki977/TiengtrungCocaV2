(() => {
  'use strict';

  const SESSION_KEY = 'camCocaTrailerPlayed';
  const LOAD_TIMEOUT_MS = 3000;
  const FADE_MS = 700;
  const overlay = document.getElementById('homeTrailer');
  const video = document.getElementById('homeTrailerVideo');
  const skipButton = document.getElementById('homeTrailerSkip');
  const soundButton = document.getElementById('homeTrailerSound');
  const replayButton = document.getElementById('replayTrailer');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let loadTimer;
  let closeTimer;

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
    clearTimeout(loadTimer);
    clearTimeout(closeTimer);
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
    if (!replay && (hasPlayedThisSession() || reducedMotion.matches)) return;

    clearTimeout(closeTimer);
    markPlayed();
    overlay.classList.remove('is-closing');
    overlay.classList.add('is-visible');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('trailer-open');
    video.muted = !replay;
    syncSoundButton();
    video.src = video.dataset.src;
    video.currentTime = 0;
    video.load();

    loadTimer = window.setTimeout(() => closeTrailer(), LOAD_TIMEOUT_MS);
    const playWhenReady = () => {
      if (!overlay.classList.contains('is-visible') || overlay.classList.contains('is-closing')) return;
      clearTimeout(loadTimer);
      video.play().catch(() => {
        if (!video.muted) {
          video.muted = true;
          syncSoundButton();
          return video.play().catch(() => closeTrailer());
        }
        closeTrailer();
      });
    };

    if (replay || video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) playWhenReady();
    else video.addEventListener('canplay', playWhenReady, { once: true });
  };

  video.addEventListener('ended', () => closeTrailer());
  video.addEventListener('error', () => closeTrailer());
  skipButton.addEventListener('click', () => closeTrailer());
  soundButton?.addEventListener('click', () => {
    video.muted = !video.muted;
    syncSoundButton();
    if (video.paused) video.play().catch(() => closeTrailer());
  });
  replayButton?.addEventListener('click', () => openTrailer({ replay: true }));
  reducedMotion.addEventListener?.('change', event => {
    if (event.matches && overlay.classList.contains('is-visible')) closeTrailer(true);
  });

  openTrailer();
})();
