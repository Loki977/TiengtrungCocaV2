/* =============================================================
   hsk.js — HSK Course Page Logic
   - Tab switching HSK 1-6
   - Lesson list rendering
   - Lesson detail loads JSON from assets/giaotrinhhsk
   Requires:
     assets/js/data.js
     assets/js/lesson-render.js
   ============================================================= */

(function () {
  'use strict';

  const COURSE = window.HSK_COURSE_DATA || {};
  const DISABLE_LESSON_LOCKS = false;
  const FOUNDATION_LESSON_ID = 'hsk1-pinyin-intro';

  const panelsWrap = document.getElementById('tabPanels');
  const detailWrap = document.getElementById('lessonDetail');

  let currentTab = 1;
  let currentLevel = 'hsk1';
  let currentLessonsIndex = [];
  let currentStats = window.CCFirebase?.getCurrentStats?.() || null;
  let contentDbPromise = null;
  let adminLearningSettings = null;
  let adminLearningSettingsVerifiedAt = 0;

  function waitForSharedFirebase() {
    if (window.CCFirebase?.db) return Promise.resolve(window.CCFirebase);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('firebase-ready', onReady);
        reject(new Error('Firebase dùng chung chưa sẵn sàng.'));
      }, 8000);
      function onReady() {
        if (!window.CCFirebase?.db) return;
        clearTimeout(timeout);
        resolve(window.CCFirebase);
      }
      window.addEventListener('firebase-ready', onReady, { once: true });
    });
  }

  async function getContentDb() {
    if (contentDbPromise) return contentDbPromise;
    contentDbPromise = (async () => {
      const fsMod = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
      const sharedFirebase = await waitForSharedFirebase();
      return { db: sharedFirebase.db, doc: fsMod.doc, getDoc: fsMod.getDoc, getDocFromServer: fsMod.getDocFromServer };
    })();
    return contentDbPromise;
  }

  function mergeDeep(base, extra) {
    const out = Array.isArray(base) ? [...base] : { ...(base || {}) };
    Object.entries(extra || {}).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) out[key] = mergeDeep(out[key], value);
      else if (value !== undefined) out[key] = value;
    });
    return out;
  }

  function defaultLearningSettings() {
    const totals = { hsk1:15, hsk2:15, hsk3:20, hsk4:20, hsk5:36, hsk6:40 };
    const courses = {};
    Object.entries(totals).forEach(([level,total]) => {
      courses[level] = { enabled: true, guided: true, lessons: {} };
      for (let i = 1; i <= total; i++) courses[level].lessons[`B${i}`] = { enabled: true, unlockType: 'free', coinCost: 0 };
    });
    return { courses, features:{} };
  }

  function normalizeCourseConfig(cfg, level) {
    const legacyCourseValue = cfg?.courses?.[level];
    const course = (legacyCourseValue && typeof legacyCourseValue === 'object') ? legacyCourseValue : { enabled: legacyCourseValue !== false };
    const legacyLessons = cfg?.lessons?.[level] || {};
    const lessons = { ...(course.lessons || {}) };
    Object.entries(legacyLessons).forEach(([id, value]) => {
      const key = String(id).startsWith('B') ? String(id) : `B${Number(id) || id}`;
      if (typeof value === 'object') lessons[key] = { enabled: value.enabled !== false, unlockType: value.unlockType || (value.enabled === false ? 'locked' : 'free'), coinCost: Number(value.coinCost || 0) };
      else lessons[key] = { enabled: value !== false, unlockType: value === false ? 'locked' : 'free', coinCost: 0 };
    });
    return { enabled: course.enabled !== false, guided: course.guided !== false, lessons };
  }

  function getLessonAccessConfig(level, lessonId) {
    const cfg = adminLearningSettings || defaultLearningSettings();
    const course = normalizeCourseConfig(cfg, level);
    const key = `B${Number(lessonId) || 1}`;
    const raw = course.lessons?.[key] || course.lessons?.[String(Number(lessonId) || 1)] || {};
    const enabled = raw.enabled !== false && raw.unlockType !== 'locked';
    return { enabled, unlockType: enabled ? 'free' : 'locked', coinCost: 0 };
  }

  function getLearningPathAccess(level, lessonId) {
    const liveStats = window.CCFirebase?.getCurrentStats?.() || currentStats || {};
    currentStats = liveStats;
    return window.CCHskLearningAccess?.resolveLessonAccess?.({
      level,
      lessonId,
      stats: liveStats,
      settings: adminLearningSettings || defaultLearningSettings()
    }) || { allowed: true, reason: 'open', message: '' };
  }

  function canOpenLesson(level, lessonId) {
    if (currentStats?.unlockedAll) return true;
    const access = getLessonAccessConfig(level, lessonId);
    if (!access.enabled || access.unlockType === 'locked') return false;
    if (!getLearningPathAccess(level, lessonId).allowed) return false;
    return true;
  }

  function getLessonActionLabel(level, lessonId) {
    const access = getLessonAccessConfig(level, lessonId);
    const learningPath = getLearningPathAccess(level, lessonId);
    if (!learningPath.allowed || !access.enabled || access.unlockType === 'locked') return 'Chưa mở khóa';
    return 'Học ngay';
  }

  async function loadAdminLearningSettings(options = {}) {
    const forceServer = options.forceServer === true;
    if (!forceServer && adminLearningSettings) return adminLearningSettings;
    try {
      const { db, doc, getDoc, getDocFromServer } = await getContentDb();
      const ref = doc(db, 'adminSettings', 'learning');
      const snap = forceServer ? await getDocFromServer(ref) : await getDoc(ref);
      adminLearningSettings = mergeDeep(defaultLearningSettings(), snap.exists() ? snap.data() : {});
      if (forceServer) adminLearningSettingsVerifiedAt = Date.now();
    } catch (error) {
      if (forceServer) throw error;
      console.warn('[hsk] Không tải được adminSettings/learning, chỉ dùng cấu hình mặc định để hiển thị danh sách.', error);
      adminLearningSettings = defaultLearningSettings();
    }
    return adminLearningSettings;
  }

  async function requireFreshLearningSettings() {
    if (adminLearningSettingsVerifiedAt && Date.now() - adminLearningSettingsVerifiedAt < 5000) return true;
    try {
      await loadAdminLearningSettings({ forceServer: true });
      return true;
    } catch (error) {
      console.warn('[hsk] Không xác minh được cấu hình khóa bài mới nhất.', error);
      toast('Không thể xác minh trạng thái khóa bài vì kết nối đang gián đoạn. Vui lòng kiểm tra mạng rồi thử lại.');
      return false;
    }
  }

  async function loadLessonOverride(level, lessonId) {
    try {
      const { db, doc, getDoc } = await getContentDb();
      const snap = await getDoc(doc(db, 'lessonOverrides', `${level}_${Number(lessonId)}`));
      if (snap.exists()) return snap.data();
    } catch (error) {
      console.warn('[hsk] Không tải được lesson override.', error);
    }
    return null;
  }

  function isCourseUnlocked(level) {
    if (currentStats?.unlockedAll) return true;
    return getLearningPathAccess(level, 1).allowed;
  }

  function isLessonUnlocked(level, lessonId) {
    return canOpenLesson(level, lessonId);
  }

  function toast(msg) {
    const existing = document.querySelector('.hsk-toast');
    existing && existing.remove();

    const el = document.createElement('div');
    el.className = 'hsk-toast';
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:3000;background:var(--charcoal);color:#fff;padding:12px 20px;border-radius:12px;font-family:Poppins,sans-serif;font-size:.875rem;font-weight:500;box-shadow:0 8px 32px rgba(0,0,0,.25);transform:translateY(16px);opacity:0;transition:all .25s ease;max-width:300px;';
    el.textContent = msg;
    document.body.appendChild(el);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transform = 'translateY(0)';
      el.style.opacity = '1';
    }));

    setTimeout(() => {
      el.style.transform = 'translateY(16px)';
      el.style.opacity = '0';
      el.addEventListener('transitionend', () => el.remove());
    }, 3000);
  }


  function getCompletedMap() {
    return currentStats?.completedLessonIds && typeof currentStats.completedLessonIds === 'object' ? currentStats.completedLessonIds : {};
  }

  function getCoursePercent(level, totalLessons) {
    const value = Number(currentStats?.courses?.[level]);
    if (Number.isFinite(value) && value > 0) return Math.min(100, Math.round(value));
    const numericLessonKey = new RegExp(`^${level}-\\d+$`);
    const count = Object.keys(getCompletedMap()).filter((key) => numericLessonKey.test(key)).length;
    return totalLessons ? Math.min(100, Math.round((count / totalLessons) * 100)) : 0;
  }

  function isLessonCompleted(level, lessonId) {
    return Boolean(getCompletedMap()[`${level}-${Number(lessonId)}`]);
  }

  function getLocalCompletedMap() {
    try {
      const value = JSON.parse(localStorage.getItem('cc_local_progress') || '{}');
      return value?.completedLessonIds && typeof value.completedLessonIds === 'object' ? value.completedLessonIds : {};
    } catch (_error) {
      return {};
    }
  }

  function isFoundationLessonCompleted() {
    return Boolean(getCompletedMap()[FOUNDATION_LESSON_ID] || getLocalCompletedMap()[FOUNDATION_LESSON_ID]);
  }

  function renderFoundationLessonCard() {
    if (currentLevel !== 'hsk1') return '';
    const completed = isFoundationLessonCompleted();
    return `
      <div class="lesson-item foundation-lesson ${completed ? 'completed' : ''} clickable-lesson active-lesson"
           data-foundation-id="${FOUNDATION_LESSON_ID}"
           role="button"
           tabindex="0"
           aria-label="${completed ? 'Mở lại' : 'Bắt đầu'} bài vỡ lòng Pinyin và thanh điệu">
        <span class="lesson-status ${completed ? 'lesson-status--done' : 'lesson-status--active'}">${completed ? 'Đã hoàn thành' : 'Khuyên học trước'}</span>
        <div class="lesson-item__icon" aria-hidden="true">ā</div>
        <div class="lesson-item__info">
          <div class="lesson-item__num">BÀI VỠ LÒNG</div>
          <div class="lesson-item__title">Pinyin và thanh điệu</div>
          <div class="lesson-item__desc">Làm quen với cách phát âm tiếng Trung</div>
          <div class="lesson-item__bar-row">
            <span class="lesson-item__xp">🔊 ā · á · ǎ · à</span>
            <span class="lesson-item__bar-pct">${completed ? 'Đã hoàn thành' : 'Bắt đầu'}</span>
          </div>
        </div>
        <div class="lesson-item__action"><div class="lesson-item__chevron" aria-hidden="true">›</div></div>
      </div>`;
  }

  async function loadLessonIndex(level) {
    const res = await fetch(`assets/giaotrinhhsk/${level}/index.json`);
    if (!res.ok) throw new Error(`Không tải được danh sách bài ${level}.`);
    return res.json();
  }

  async function loadLessonJson(level, file) {
    const res = await fetch(`assets/giaotrinhhsk/${level}/${file}`);
    if (!res.ok) throw new Error(`Không tải được nội dung bài: ${file}`);
    return res.json();
  }

  function showCoursePanel() {
    panelsWrap.style.display = '';
    detailWrap.style.display = 'none';
    detailWrap.innerHTML = '';
  }

  async function showDetailPanel(lessonId) {
    panelsWrap.style.display = 'none';
    detailWrap.style.display = 'block';
    await renderLessonDetail(lessonId);
    detailWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function renderPanel(num) {
    const d = COURSE[num];
    if (!d) return;

    currentLevel = `hsk${num}`;

    let lessonIndex = [];
    try {
      await loadAdminLearningSettings();
      lessonIndex = await loadLessonIndex(currentLevel);
      currentLessonsIndex = lessonIndex;
    } catch (err) {
      currentLessonsIndex = [];
      console.warn(err);
    }

    const isLocked = !DISABLE_LESSON_LOCKS && !isCourseUnlocked(currentLevel);
    const progressColor = d.status === 'completed' ? 'var(--green)' : 'var(--orange)';

    const coursePercent = getCoursePercent(currentLevel, lessonIndex.length || d.lessons || 0);
    const lessonRows = lessonIndex.length
      ? lessonIndex.map(l => {
          const access = getLessonAccessConfig(currentLevel, l.lessonId);
          const learningPath = getLearningPathAccess(currentLevel, l.lessonId);
          const isAvailable = !isLocked && canOpenLesson(currentLevel, l.lessonId);
          const completed = isLessonCompleted(currentLevel, l.lessonId);
          const lessonProgress = completed ? 100 : Number(l.progress || 0);
          const actionLabel = getLessonActionLabel(currentLevel, l.lessonId);
          const lockIcon = '🔒';
          const statusHtml = completed
            ? '<span class="lesson-status lesson-status--done">Đã học</span>'
            : (isAvailable ? `<span class="lesson-status lesson-status--active">${actionLabel}</span>` : `<span class="lesson-status lesson-status--locked">${lockIcon} ${actionLabel}</span>`);
          const canClick = true;
          return `
            <div class="lesson-item ${completed ? 'completed' : ''} ${canClick ? 'clickable-lesson' : 'locked'} ${isAvailable ? 'active-lesson' : 'needs-unlock'}"
                 data-detail="${l.lessonId}"
                 data-unlock-type="${access.unlockType}"
                 data-path-reason="${learningPath.reason}"
                 data-coin-cost="${access.coinCost}"
                 role="${canClick ? 'button' : 'listitem'}"
                 tabindex="${canClick ? '0' : '-1'}">
              ${statusHtml}
              <div class="lesson-item__icon">${completed ? '✓' : (isAvailable ? (l.icon || '📘') : lockIcon)}</div>
              <div class="lesson-item__info">
                <div class="lesson-item__num">${completed ? 'Đã hoàn thành' : `Bài ${l.lessonId}`}</div>
                <div class="lesson-item__title">${l.title}</div>
                <div class="lesson-item__desc">${l.desc || 'Từ vựng, bài khóa, ngữ pháp và bài tập'}</div>
                <div class="lesson-item__bar-row">
                  <div class="lesson-item__bar">
                    <div class="lesson-item__bar-fill" style="width:${lessonProgress}%"></div>
                  </div>
                  <span class="lesson-item__bar-pct">${lessonProgress}%</span>
                  <span class="lesson-item__xp">+${l.xp || 20} XP</span>
                  <span class="lesson-item__xp">🪙 ${Number(currentStats?.coins || 0).toLocaleString('vi-VN')}</span>
                </div>
              </div>
              <div class="lesson-item__action">
                <div class="lesson-item__chevron" aria-hidden="true">›</div>
              </div>
            </div>
          `;
        }).join('')
      : `<p style="text-align:center;color:var(--text-muted);padding:24px">Chưa có dữ liệu cho ${currentLevel.toUpperCase()}.</p>`;

    const html = `
      <div class="panel-header">
        <div class="panel-header__info">
          <h2>${d.title} <span style="font-size:1.4rem;color:rgba(45,45,45,.15)">${d.chinese || ''}</span></h2>
          <div class="panel-header__meta">
            <span class="ph-stat">📚 <strong>${d.vocab || 0}</strong> từ vựng</span>
            <span class="ph-stat">🎯 <strong>${lessonIndex.length || d.lessons || 0}</strong> bài học</span>
            <span class="ph-stat">⏱ <strong>${d.hours || 0} giờ</strong></span>
            ${d.status === 'completed' ? '<span class="badge" style="background:var(--green-light);color:var(--green-dark)">✓ Hoàn thành</span>' : ''}
            ${d.status === 'active' ? '<span class="badge badge--orange">▶ Đang học</span>' : ''}
            ${isLocked ? '<span class="badge" style="background:var(--border);color:var(--text-light)">🔒 Chưa mở khóa</span>' : ''}
          </div>
        </div>

        ${!isLocked ? `
          <div class="panel-header__progress-wrap">
            <p><span>Tiến độ tổng thể</span><strong style="color:var(--charcoal)">${coursePercent}%</strong></p>
            <div class="ph-bar"><div class="ph-bar__fill" style="width:${coursePercent}%;background:${progressColor}"></div></div>
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;opacity:.6">
            <span style="font-size:2rem">🔒</span>
            <span style="font-size:.8rem;color:var(--text-muted)">Hoàn thành cấp hoặc bài học phía trước để mở khóa</span>
          </div>
        `}
      </div>

      <div class="lesson-list">
        <div class="lesson-chapter">Giáo trình ${currentLevel.toUpperCase()}</div>
        ${renderFoundationLessonCard()}
        ${lessonRows}
      </div>
    `;

    panelsWrap.innerHTML = `<div class="tab-panel active" id="panel-${num}">${html}</div>`;

    panelsWrap.querySelectorAll('.clickable-lesson').forEach(row => {
      row.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        if (this.dataset.foundationId === FOUNDATION_LESSON_ID) {
          location.href = 'hsk1-pinyin-intro.html';
          return;
        }
        const id = parseInt(this.dataset.detail, 10);
        if (id) handleLessonClick(id);
      });

      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (this.dataset.foundationId === FOUNDATION_LESSON_ID) {
            location.href = 'hsk1-pinyin-intro.html';
            return;
          }
          const id = parseInt(this.dataset.detail, 10);
          if (id) handleLessonClick(id);
        }
      });
    });
  }

  async function handleLessonClick(lessonId) {
    if (!await requireFreshLearningSettings()) return;
    const learningPath = getLearningPathAccess(currentLevel, lessonId);
    if (!learningPath.allowed) return toast(learningPath.message || 'Hãy hoàn thành bài học phía trước để mở khóa.');
    const access = getLessonAccessConfig(currentLevel, lessonId);
    if (!access.enabled || access.unlockType === 'locked') return toast('Hãy mở khóa hoặc hoàn thành bài học phía trước trước.');
    openLessonDetail(lessonId);
  }

  async function renderLessonDetail(lessonId) {
    try {
      if (!currentLessonsIndex.length) {
        currentLessonsIndex = await loadLessonIndex(currentLevel);
      }

      const currentItem = currentLessonsIndex.find(l => Number(l.lessonId) === Number(lessonId));
      if (!currentItem) {
        detailWrap.innerHTML = '<p>Bài học không tồn tại.</p>';
        return;
      }

      detailWrap.innerHTML = '<p style="padding:24px;text-align:center">Đang xác minh quyền truy cập...</p>';

      if (!await requireFreshLearningSettings()) {
        showCoursePanel();
        return;
      }
      const access = getLessonAccessConfig(currentLevel, lessonId);
      const learningPath = getLearningPathAccess(currentLevel, lessonId);
      if (!learningPath.allowed) {
        detailWrap.innerHTML = `<p style="padding:24px;text-align:center;color:#9a3412">🔒 ${learningPath.message}</p>`;
        return;
      }
      if (!access.enabled || access.unlockType === 'locked') {
        const msg = '🔒 Hãy mở khóa hoặc hoàn thành bài học phía trước trước.';
        detailWrap.innerHTML = `<p style="padding:24px;text-align:center;color:#9a3412">${msg}</p>`;
        return;
      }

      // Chỉ tải JSON/static lesson sau khi quyền học theo lộ trình đã được xác minh.
      detailWrap.innerHTML = '<p style="padding:24px;text-align:center">Đang tải bài học...</p>';
      const override = await loadLessonOverride(currentLevel, lessonId);
      const lesson = override?.content || await loadLessonJson(currentLevel, currentItem.file);
      if (override?.visible === false || lesson.visible === false || override?.isLocked || lesson.isLocked) {
        detailWrap.innerHTML = '<p style="padding:24px;text-align:center;color:#9a3412">🔒 Hãy mở khóa hoặc hoàn thành bài học phía trước trước.</p>';
        return;
      }
      lesson.level = lesson.level || currentTab;
      lesson.chineseTitle = lesson.chineseTitle || currentItem.chineseTitle || '';
      if ([1, 2, 3].includes(Number(currentTab))) {
        await window.CoursePinyin?.prepare?.(lesson, Number(currentTab));
      }

      const currentIndex = currentLessonsIndex.findIndex(l => Number(l.lessonId) === Number(lessonId));
      const prevId = currentIndex > 0 ? currentLessonsIndex[currentIndex - 1].lessonId : null;
      const nextId = currentIndex < currentLessonsIndex.length - 1 ? currentLessonsIndex[currentIndex + 1].lessonId : null;

      detailWrap.innerHTML = window.LessonRenderer.renderLessonContent(lesson, { prevId, nextId });
    } catch (err) {
      detailWrap.innerHTML = `<p style="padding:24px;color:#b91c1c">${err.message}</p>`;
    }
  }

  function openLessonDetail(lessonId) {
    showDetailPanel(lessonId);
  }
  window.openLessonDetail = openLessonDetail;

  window.backToLessonList = async function () {
    showCoursePanel();
    currentStats = window.CCFirebase?.getCurrentStats?.() || currentStats;
    await renderPanel(currentTab);
  };

  window.handleLocked = function (title) {
    toast(`"${title}" — Hoàn thành các bài trước để mở khóa! 🔒`);
  };

  document.querySelectorAll('.hsk-tab').forEach(tab => {
    tab.addEventListener('click', async function () {
      const num = parseInt(this.dataset.tab, 10);
      if (num === currentTab && detailWrap.style.display === 'none') return;

      document.querySelectorAll('.hsk-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });

      this.classList.add('active');
      this.setAttribute('aria-selected', 'true');

      currentTab = num;
      currentLevel = `hsk${num}`;
      currentLessonsIndex = [];

      showCoursePanel();
      await renderPanel(num);
    });
  });

  window.addEventListener('cc:user-stats', async (event) => {
    currentStats = event.detail?.stats || currentStats;
    if (panelsWrap && detailWrap?.style.display !== 'block') await renderPanel(currentTab);
  });

  window.addEventListener('DOMContentLoaded', async () => {
    if (window.LessonRenderer) {
      window.LessonRenderer.bindLessonRenderEvents(document);
    }

    showCoursePanel();
    await renderPanel(1);
  });
})();
