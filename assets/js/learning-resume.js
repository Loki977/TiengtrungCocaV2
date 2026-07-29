(function () {
  'use strict';

  const SAVE_DELAY_MS = 700;
  let pendingActivity = null;
  let saveTimer = 0;
  let isSaving = false;
  let lastSavedSignature = '';
  let retryCount = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function normalizeActivity(raw = {}) {
    const kind = raw.kind === 'writing' ? 'writing' : 'course';
    const level = /^hsk[1-6]$/i.test(String(raw.level || ''))
      ? String(raw.level).toLowerCase()
      : 'hsk1';
    const lesson = Math.max(1, Number(raw.lesson) || 1);
    const total = Math.max(1, Number(raw.total) || 1);
    const current = clamp(raw.current, 0, total);
    const fallbackHref = kind === 'writing'
      ? `lesson.html?level=${level}&lesson=${lesson}`
      : `hsk.html?level=${level}&lesson=${lesson}`;

    return {
      kind,
      level,
      lesson,
      title: String(raw.title || `Bài ${lesson}`).trim(),
      meta: String(raw.meta || (kind === 'writing' ? 'Luyện viết' : 'Khóa học')).trim(),
      progress: clamp(raw.progress ?? Math.round((current / total) * 100), 0, 100),
      current,
      total,
      next: String(raw.next || `${current}/${total}`).trim(),
      href: String(raw.href || fallbackHref).trim(),
      updatedAt: Date.now()
    };
  }

  function activitySignature(activity) {
    const { updatedAt, ...stableActivity } = activity;
    return JSON.stringify(stableActivity);
  }

  async function flush() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (isSaving || !pendingActivity) return;

    const firebase = window.CCFirebase;
    if (!firebase?.saveUserStats) return;

    const activity = pendingActivity;
    const signature = activitySignature(activity);
    if (signature === lastSavedSignature) {
      pendingActivity = null;
      return;
    }

    isSaving = true;
    try {
      await firebase.authReady;
      if (pendingActivity === activity) pendingActivity = null;
      await firebase.saveUserStats({ currentLesson: activity });
      lastSavedSignature = signature;
      retryCount = 0;
      document.documentElement.dataset.learningResumeStatus = 'saved';
    } catch (error) {
      pendingActivity = activity;
      retryCount += 1;
      document.documentElement.dataset.learningResumeStatus = 'error';
      console.warn('[learning-resume] Chưa lưu được hoạt động học gần nhất.', error);
    } finally {
      isSaving = false;
      if (pendingActivity && retryCount < 2) {
        saveTimer = window.setTimeout(flush, SAVE_DELAY_MS * (retryCount + 1));
      }
    }
  }

  function record(rawActivity) {
    pendingActivity = normalizeActivity(rawActivity);
    retryCount = 0;
    document.documentElement.dataset.learningResumeStatus = 'pending';
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flush, SAVE_DELAY_MS);
    return pendingActivity;
  }

  window.addEventListener('cc:learning-progress', (event) => {
    if (!event.detail?.kind) return;
    record(event.detail);
  });
  window.addEventListener('firebase-ready', () => {
    if (pendingActivity) flush();
  });
  window.addEventListener('pagehide', flush);

  window.CCLearningResume = Object.freeze({ record, flush });
})();
