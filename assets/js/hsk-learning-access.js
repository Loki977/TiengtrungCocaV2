/* Shared HSK learning-path access rules.
   Placement access is learning progress only; it never grants VIP access. */
(function (root, factory) {
  const api = factory(root);
  root.CCHskLearningAccess = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
  'use strict';

  const LOCAL_RESULT_KEY = 'cc:hsk-placement-local-result:v2';
  const LOCAL_PROGRESS_KEY = 'cc_local_progress';
  const COURSE_TOTALS = Object.freeze({ hsk1: 15, hsk2: 15, hsk3: 20, hsk4: 20, hsk5: 36, hsk6: 40 });

  function readJson(storage, key) {
    try {
      return JSON.parse(storage?.getItem?.(key) || 'null');
    } catch (_error) {
      return null;
    }
  }

  function normalizeLevel(value) {
    const match = String(value ?? '').match(/[1-6]/);
    return match ? Number(match[0]) : null;
  }

  function completedPlacementCandidate(source, origin) {
    const result = source?.result || source;
    const level = normalizeLevel(result?.estimatedHskLevel);
    const status = source?.status || (level ? 'completed' : '');
    if (status !== 'completed' || !level) return null;
    return {
      status: 'completed',
      level,
      completedAt: result?.completedAt || source?.completedAt || '',
      origin
    };
  }

  function getPlacement(stats = {}, storage = root.localStorage) {
    const remote = completedPlacementCandidate(stats?.placementStats, 'account');
    const localSaved = readJson(storage, LOCAL_RESULT_KEY);
    const local = completedPlacementCandidate(localSaved?.result ? {
      status: 'completed',
      ...localSaved.result,
      completedAt: localSaved.completedAt || localSaved.result.completedAt
    } : null, 'local');
    if (!remote) return local || { status: stats?.placementStats?.status || 'not_started', level: null, completedAt: '', origin: 'none' };
    if (!local) return remote;
    const remoteTime = Date.parse(remote.completedAt) || 0;
    const localTime = Date.parse(local.completedAt) || 0;
    return localTime > remoteTime ? local : remote;
  }

  function getCompletedLessons(stats = {}, storage = root.localStorage) {
    const signedIn = Boolean(root.CCFirebase?.getCurrentUser?.());
    const local = signedIn ? null : readJson(storage, LOCAL_PROGRESS_KEY);
    return {
      ...(local?.completedLessonIds && typeof local.completedLessonIds === 'object' ? local.completedLessonIds : {}),
      ...(stats?.completedLessonIds && typeof stats.completedLessonIds === 'object' ? stats.completedLessonIds : {})
    };
  }

  function isGuided(settings, level) {
    return settings?.courses?.[level]?.guided !== false;
  }

  function result(allowed, reason, message, placement) {
    return { allowed, reason, message, placementLevel: placement.level };
  }

  function resolveLessonAccess({ level = 'hsk1', lessonId = 1, stats = {}, settings = {}, storage = root.localStorage } = {}) {
    const normalizedLevel = String(level).toLowerCase();
    const levelNumber = normalizeLevel(normalizedLevel) || 1;
    const id = Math.max(1, Number(lessonId) || 1);
    const placement = getPlacement(stats, storage);
    const completed = getCompletedLessons(stats, storage);

    if (stats?.unlockedAll || !isGuided(settings, normalizedLevel)) {
      return result(true, 'open', 'Bài học đã được mở.', placement);
    }

    if (placement.status !== 'completed' || !placement.level) {
      if (levelNumber !== 1 || id > 3) {
        return result(false, 'placement_required', 'Hãy làm bài test trình độ để mở khóa lộ trình phù hợp.', placement);
      }
      if (id === 1 || completed[`hsk1-${id - 1}`]) {
        return result(true, 'starter_path', 'Bài học miễn phí trong lộ trình khởi đầu.', placement);
      }
      return result(false, 'previous_lesson', `Hãy hoàn thành Bài ${id - 1} trước để mở khóa bài học này.`, placement);
    }

    if (levelNumber <= placement.level) {
      return result(true, 'placement_level', `Đã mở theo kết quả HSK ${placement.level}.`, placement);
    }

    if (id === 1) {
      const previousLevel = `hsk${levelNumber - 1}`;
      const previousLastLesson = COURSE_TOTALS[previousLevel] || 1;
      if (completed[`${previousLevel}-${previousLastLesson}`]) {
        return result(true, 'next_course', 'Đã mở sau khi hoàn thành cấp trước.', placement);
      }
      return result(false, 'previous_course', `Hãy hoàn thành ${previousLevel.toUpperCase()} trước để mở khóa cấp học này.`, placement);
    }

    if (completed[`${normalizedLevel}-${id - 1}`]) {
      return result(true, 'sequential', 'Đã mở sau khi hoàn thành bài trước.', placement);
    }
    return result(false, 'previous_lesson', `Hãy hoàn thành Bài ${id - 1} trước để mở khóa bài học này.`, placement);
  }

  function getDisplayLevel(stats = {}, storage = root.localStorage) {
    const placement = getPlacement(stats, storage);
    if (placement.status === 'completed' && placement.level) return placement.level;
    return 1;
  }

  return Object.freeze({
    COURSE_TOTALS,
    getCompletedLessons,
    getDisplayLevel,
    getPlacement,
    isGuided,
    resolveLessonAccess
  });
});
