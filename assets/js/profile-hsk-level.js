(function () {
  'use strict';

  function render(stats) {
    const access = window.CCHskLearningAccess;
    const badge = document.getElementById('profileLevelBadge');
    if (!access || !badge) return;
    const placement = access.getPlacement(stats || {});
    const level = access.getDisplayLevel(stats || {});
    badge.textContent = `🏆 HSK ${level}`;
    badge.title = placement.status === 'completed'
      ? `Cấp HSK theo bài test trình độ: HSK ${level}`
      : 'Chưa làm bài test trình độ · lộ trình bắt đầu từ HSK 1';
    badge.dataset.placementStatus = placement.status;
  }

  window.addEventListener('cc:user-stats', (event) => render(event.detail?.stats || {}));
  window.addEventListener('DOMContentLoaded', () => render(window.CCFirebase?.getCurrentStats?.() || {}));
})();
