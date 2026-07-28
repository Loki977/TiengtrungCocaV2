(function () {
  'use strict';

  if (window.CCLearningHUD) return;

  const scriptUrl = document.currentScript?.src || new URL('assets/js/learning-hud.js', document.baseURI).href;
  const styleUrl = new URL('../css/learning-hud.css?v=7', scriptUrl).href;
  const params = new URLSearchParams(location.search);
  const mobileHudQuery = window.matchMedia('(max-width: 767px)');
  const hudPositionKey = 'cc_learning_hud_position_v1';

  function normalizeLevel(value) {
    const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (/^\d$/.test(raw)) return `HSK${raw}`;
    return raw;
  }

  const state = {
    elapsedMs: 0,
    visibleStartedAt: document.hidden ? 0 : performance.now(),
    combo: 0,
    sessionXp: 0,
    directRewardXp: 0,
    baselineXp: null,
    level: normalizeLevel(params.get('level')),
    lesson: params.get('lesson') || '',
    accountLevel: 1,
    current: 0,
    total: 0,
    mounted: false,
    destroyed: false
  };

  let hud;
  let intervalId = 0;
  let mutationObserver;
  let mountQueued = false;
  let dragState = null;
  let suppressToggleClick = false;

  const iconMarkup = {
    time: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    xp: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9z"></path>',
    combo: '<path d="M13 3s1 4-2 6c-2 1.4-3 3-3 5a4 4 0 0 0 8 0c0-1.7-.8-3.3-2-4.4.1 2.3-1 3.4-2 4.1.4-3.4-2-4.5-2-4.5"></path>',
    account: '<path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6z"></path>',
    lesson: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 5.5v16M8 7h7"></path>',
    progress: '<path d="M4 12a8 8 0 1 0 8-8"></path><path d="M12 4v8h8"></path>'
  };

  function ensureStylesheet() {
    if ([...document.styleSheets].some((sheet) => sheet.href === styleUrl)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = styleUrl;
    document.head.appendChild(link);
  }

  function item(kind, label, value, secondary = false) {
    return `
      <div class="cc-learning-hud__item${secondary ? ' is-secondary' : ''}" data-hud-kind="${kind}">
        <span class="cc-learning-hud__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">${iconMarkup[kind]}</svg>
        </span>
        <span class="cc-learning-hud__copy">
          <small>${label}</small>
          <strong data-hud-value="${kind}">${value}</strong>
          ${kind === 'progress' ? '<span class="cc-learning-hud__progress"><span></span></span>' : ''}
        </span>
      </div>
    `;
  }

  function createHud() {
    hud = document.createElement('aside');
    hud.className = 'cc-learning-hud';
    hud.setAttribute('aria-label', 'Thông tin phiên học');
    hud.innerHTML = `
      <div class="cc-learning-hud__head">
        <span class="cc-learning-hud__title">
          <strong>Phiên học hiện tại</strong>
          <small>Cập nhật theo hoạt động thật</small>
        </span>
        <button class="cc-learning-hud__toggle" type="button" aria-expanded="false" aria-label="Mở rộng thông tin phiên học">
          <span class="cc-learning-hud__toggle-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">${iconMarkup.time}</svg>
          </span>
          <strong class="cc-learning-hud__toggle-time" data-hud-toggle-time>00:00:00</strong>
          <span class="cc-learning-hud__toggle-chevron" aria-hidden="true">⌄</span>
        </button>
      </div>
      <div class="cc-learning-hud__grid">
        ${item('time', 'Thời gian', '00:00:00')}
        ${item('xp', 'EXP phiên', '+0')}
        ${item('combo', 'Combo', '0')}
        ${item('account', 'Cấp tài khoản', '1', true)}
        ${item('lesson', 'Bài hiện tại', 'HSK', true)}
        ${item('progress', 'Tiến độ', '0%', true)}
      </div>
    `;
    const head = hud.querySelector('.cc-learning-hud__head');
    const toggle = hud.querySelector('.cc-learning-hud__toggle');
    toggle.addEventListener('click', (event) => {
      if (suppressToggleClick) {
        suppressToggleClick = false;
        event.preventDefault();
        return;
      }
      const expanded = hud.classList.toggle('is-expanded');
      event.currentTarget.setAttribute('aria-expanded', String(expanded));
      event.currentTarget.setAttribute('aria-label', expanded ? 'Thu gọn thông tin phiên học' : 'Mở rộng thông tin phiên học');
      window.requestAnimationFrame(clampSavedHudPosition);
    });
    head.addEventListener('pointerdown', beginHudDrag);
    window.addEventListener('pointermove', moveHud, { passive: false });
    window.addEventListener('pointerup', endHudDrag);
    window.addEventListener('pointercancel', endHudDrag);
  }

  function readSavedHudPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(hudPositionKey) || 'null');
      return Number.isFinite(saved?.left) && Number.isFinite(saved?.top) ? saved : null;
    } catch {
      return null;
    }
  }

  function saveHudPosition(left, top) {
    try {
      localStorage.setItem(hudPositionKey, JSON.stringify({ left: Math.round(left), top: Math.round(top) }));
    } catch {
      // Storage restrictions must not block the learning HUD.
    }
  }

  function clampHudPosition(left, top) {
    if (!hud) return { left, top };
    const rect = hud.getBoundingClientRect();
    const edge = 8;
    return {
      left: Math.min(Math.max(edge, left), Math.max(edge, window.innerWidth - rect.width - edge)),
      top: Math.min(Math.max(edge, top), Math.max(edge, window.innerHeight - rect.height - edge))
    };
  }

  function applyHudPosition(left, top, persist = false) {
    if (!hud || !mobileHudQuery.matches) return;
    const next = clampHudPosition(left, top);
    hud.style.left = `${next.left}px`;
    hud.style.top = `${next.top}px`;
    hud.style.right = 'auto';
    if (persist) saveHudPosition(next.left, next.top);
  }

  function clampSavedHudPosition() {
    if (!hud || !mobileHudQuery.matches || !hud.style.left) return;
    applyHudPosition(parseFloat(hud.style.left), parseFloat(hud.style.top), true);
  }

  function restoreHudPosition() {
    if (!mobileHudQuery.matches) {
      hud?.style.removeProperty('left');
      hud?.style.removeProperty('top');
      hud?.style.removeProperty('right');
      return;
    }
    const saved = readSavedHudPosition();
    if (saved) window.requestAnimationFrame(() => applyHudPosition(saved.left, saved.top));
  }

  function beginHudDrag(event) {
    if (!mobileHudQuery.matches || !hud || event.button !== 0 || event.isPrimary === false) return;
    const rect = hud.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false
    };
  }

  function moveHud(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (!dragState.moved && Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < 6) return;
    dragState.moved = true;
    hud.classList.add('is-dragging');
    event.preventDefault();
    applyHudPosition(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);
  }

  function endHudDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (dragState.moved) {
      const rect = hud.getBoundingClientRect();
      applyHudPosition(rect.left, rect.top, true);
      suppressToggleClick = true;
    }
    hud.classList.remove('is-dragging');
    dragState = null;
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
  }

  function activeElapsed() {
    return state.elapsedMs + (state.visibleStartedAt ? performance.now() - state.visibleStartedAt : 0);
  }

  function accountLevelFromStats(stats = {}) {
    if (Number.isFinite(Number(stats.accountLevel))) return Math.max(1, Number(stats.accountLevel));
    if (Number.isFinite(Number(stats.petLevel))) return Math.max(1, Number(stats.petLevel));
    const thresholds = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];
    const xp = Number(stats.xp || 0);
    return thresholds.reduce((level, threshold, index) => xp >= threshold ? index + 1 : level, 1);
  }

  function resolveLessonLabel() {
    const live = window.__currentLessonData;
    const level = normalizeLevel(state.level || live?.level || live?.hskLevel);
    const normalized = level
      ? (level.startsWith('HSK') ? level.replace(/HSK(\d)/, 'HSK $1') : level)
      : 'HSK';
    const lesson = state.lesson || live?.lessonId || live?.id || '';
    const lessonLabel = /^\d+(?:\.\d+)?$/.test(String(lesson)) ? `Bài ${lesson}` : String(lesson);
    return lesson ? `${normalized} · ${lessonLabel}` : normalized;
  }

  function setValue(kind, value) {
    const target = hud?.querySelector(`[data-hud-value="${kind}"]`);
    const next = String(value);
    if (target && target.textContent !== next) target.textContent = next;
  }

  function render() {
    if (!hud) return;
    const progress = state.total ? Math.min(100, Math.round((state.current / state.total) * 100)) : 0;
    const elapsed = formatDuration(activeElapsed());
    setValue('time', elapsed);
    const compactTime = hud.querySelector('[data-hud-toggle-time]');
    if (compactTime && compactTime.textContent !== elapsed) compactTime.textContent = elapsed;
    setValue('xp', `+${Math.max(0, Math.round(state.sessionXp))}`);
    setValue('combo', state.combo);
    setValue('account', state.accountLevel);
    setValue('lesson', resolveLessonLabel());
    setValue('progress', `${progress}%`);
    hud.style.setProperty('--cc-learning-progress', `${progress}%`);
  }

  function findHost() {
    const writingShell = document.querySelector('.lesson-shell');
    if (writingShell?.parentElement) return { host: writingShell.parentElement, before: writingShell };
    const foundationLesson = document.querySelector('[data-foundation-lesson]');
    if (foundationLesson?.parentElement) return { host: foundationLesson.parentElement, before: foundationLesson };
    const courseDetail = document.querySelector('#lessonDetail .lesson-detail-wrap');
    if (courseDetail) return { host: courseDetail, before: courseDetail.firstChild === hud ? hud.nextSibling : courseDetail.firstChild };
    return null;
  }

  function mountIfNeeded() {
    mountQueued = false;
    if (state.destroyed) return;
    const target = findHost();
    if (!target) {
      if (currentPageIsCourseList()) {
        hud?.remove();
        document.body.classList.remove('cc-learning-active');
        state.mounted = false;
      }
      return;
    }
    if (!hud) createHud();
    if (!state.mounted) {
      state.elapsedMs = 0;
      state.visibleStartedAt = document.hidden ? 0 : performance.now();
    }
    if (hud.parentElement !== target.host || hud.nextSibling !== target.before) {
      target.host.insertBefore(hud, target.before);
    }
    const live = window.__currentLessonData;
    if (live) {
      state.level = normalizeLevel(live.level || live.hskLevel || state.level);
      state.lesson = String(live.lessonId || live.id || state.lesson || '');
    }
    const foundationProgress = document.getElementById('lessonProgressLabel')?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
    const foundationRoot = document.querySelector('[data-foundation-lesson]');
    if (foundationProgress && foundationRoot) {
      state.level = 'HSK1';
      state.lesson = foundationRoot.dataset.foundationLessonLabel || 'Nền tảng';
      state.current = Number(foundationProgress[1]);
      state.total = Number(foundationProgress[2]);
    }
    document.body.classList.add('cc-learning-active');
    state.mounted = true;
    restoreHudPosition();
    render();
  }

  function currentPageIsCourseList() {
    return Boolean(document.getElementById('lessonDetail'));
  }

  function queueMount() {
    if (mountQueued) return;
    mountQueued = true;
    queueMicrotask(mountIfNeeded);
  }

  function updateFromStats(detail = {}) {
    const stats = detail.stats || window.CCFirebase?.getCurrentStats?.() || {};
    const xp = Number(stats.xp || 0);
    state.accountLevel = accountLevelFromStats(stats);
    const authoritative = detail.authReady === true || window.CCFirebase?.isAuthReady?.();
    if (state.baselineXp === null && authoritative) {
      state.baselineXp = xp;
    } else if (state.baselineXp !== null) {
      state.sessionXp = Math.max(state.directRewardXp, xp - state.baselineXp, 0);
    }
    render();
  }

  function onVisibilityChange() {
    if (document.hidden) {
      if (state.visibleStartedAt) state.elapsedMs += performance.now() - state.visibleStartedAt;
      state.visibleStartedAt = 0;
    } else if (!state.visibleStartedAt) {
      state.visibleStartedAt = performance.now();
    }
    render();
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    window.clearInterval(intervalId);
    mutationObserver?.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('resize', clampSavedHudPosition);
    window.removeEventListener('pointermove', moveHud);
    window.removeEventListener('pointerup', endHudDrag);
    window.removeEventListener('pointercancel', endHudDrag);
    document.body.classList.remove('cc-learning-active');
    hud?.remove();
  }

  function initialize() {
    ensureStylesheet();
    createHud();
    mountIfNeeded();
    intervalId = window.setInterval(render, 1000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('resize', clampSavedHudPosition);
    window.addEventListener('pagehide', destroy, { once: true });

    window.addEventListener('cc:learning-answer', (event) => {
      state.combo = event.detail?.correct ? state.combo + 1 : 0;
      render();
    });
    window.addEventListener('cc:learning-reward', (event) => {
      state.directRewardXp += Math.max(0, Number(event.detail?.xp || 0));
      state.sessionXp = Math.max(state.sessionXp, state.directRewardXp);
      render();
    });
    window.addEventListener('cc:learning-progress', (event) => {
      const detail = event.detail || {};
      state.current = Math.max(0, Number(detail.current || 0));
      state.total = Math.max(0, Number(detail.total || 0));
      if (detail.level) state.level = normalizeLevel(detail.level);
      if (detail.lesson) state.lesson = String(detail.lesson);
      queueMount();
      render();
    });
    window.addEventListener('cc:auth-ready', (event) => updateFromStats(event.detail || {}));
    window.addEventListener('cc:user-stats', (event) => updateFromStats(event.detail || {}));

    mutationObserver = new MutationObserver(queueMount);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  window.CCLearningHUD = Object.freeze({
    getState: () => ({ ...state, elapsedMs: activeElapsed() }),
    refresh: queueMount,
    destroy
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
