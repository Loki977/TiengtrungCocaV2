(function () {
  'use strict';

  const scene = document.getElementById('writingHeroScene');
  if (!scene) return;

  let inViewport = true;
  const syncPlayback = () => {
    scene.classList.toggle('is-paused', document.hidden || !inViewport);
  };

  document.addEventListener('visibilitychange', syncPlayback);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      inViewport = entries[0]?.isIntersecting !== false;
      syncPlayback();
    }, { threshold: 0.05 });
    observer.observe(scene);
  }

  syncPlayback();
})();
