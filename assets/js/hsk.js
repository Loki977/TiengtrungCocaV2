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
  const ADMIN_FIREBASE_CONFIG = { apiKey:'AIzaSyDoTP-Rw5Jb-wYJPbmwiTLwkcjIpdM_bLA', authDomain:'tiengtrungcoca.firebaseapp.com', projectId:'tiengtrungcoca', storageBucket:'tiengtrungcoca.firebasestorage.app', messagingSenderId:'216281367513', appId:'1:216281367513:web:97cfffea1f595c997b8fc8' };

  const panelsWrap = document.getElementById('tabPanels');
  const detailWrap = document.getElementById('lessonDetail');

  let currentTab = 1;
  let currentLevel = 'hsk1';
  let currentLessonsIndex = [];
  let currentStats = window.CCFirebase?.getCurrentStats?.() || null;
  let contentDbPromise = null;
  let adminLearningSettings = null;



  async function getContentDb() {
    if (contentDbPromise) return contentDbPromise;
    contentDbPromise = (async () => {
      const appMod = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js');
      const fsMod = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
      const app = appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp(ADMIN_FIREBASE_CONFIG);
      return { db: fsMod.getFirestore(app), doc: fsMod.doc, getDoc: fsMod.getDoc };
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
    const totals = { hsk1:15, hsk2:15, hsk3:20, hsk4:10, hsk5:10, hsk6:40 };
    const courses = {};
    Object.entries(totals).forEach(([level,total]) => {
      courses[level] = { enabled: true, lessons: {} };
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
    return { enabled: course.enabled !== false, lessons };
  }

  function getLessonAccessConfig(level, lessonId) {
    const cfg = adminLearningSettings || defaultLearningSettings();
    const course = normalizeCourseConfig(cfg, level);
    const key = `B${Number(lessonId) || 1}`;
    const raw = course.lessons?.[key] || course.lessons?.[String(Number(lessonId) || 1)] || {};
    const enabled = course.enabled !== false && raw.enabled !== false;
    const unlockType = enabled ? (raw.unlockType || 'free') : 'locked';
    return { enabled, unlockType, coinCost: Math.max(0, Number(raw.coinCost || 0)) };
  }

  function userHasCoinUnlock(level, lessonId) {
    const opened = currentStats?.unlockedLessons?.[level];
    return Array.isArray(opened) && opened.map(String).includes(String(Number(lessonId)));
  }

  function userIsVip() {
    if (!currentStats?.isVip) return false;
    if (!currentStats.vipUntil) return true;
    const end = new Date(currentStats.vipUntil);
    return Number.isNaN(end.getTime()) || end >= new Date();
  }

  function canOpenLesson(level, lessonId) {
    if (currentStats?.unlockedAll) return true;
    const access = getLessonAccessConfig(level, lessonId);
    if (!access.enabled || access.unlockType === 'locked') return false;
    if (access.unlockType === 'free') return true;
    if (access.unlockType === 'vip') return userIsVip();
    if (access.unlockType === 'coins') return userHasCoinUnlock(level, lessonId);
    return false;
  }

  function getLessonActionLabel(level, lessonId) {
    const access = getLessonAccessConfig(level, lessonId);
    if (!access.enabled || access.unlockType === 'locked') return 'Đang cập nhật';
    if (access.unlockType === 'vip') return userIsVip() ? 'Học ngay' : 'VIP';
    if (access.unlockType === 'coins') return userHasCoinUnlock(level, lessonId) ? 'Học ngay' : `Mở bằng ${access.coinCost} xu`;
    return 'Học ngay';
  }

  async function loadAdminLearningSettings() {
    if (adminLearningSettings) return adminLearningSettings;
    try {
      const { db, doc, getDoc } = await getContentDb();
      const snap = await getDoc(doc(db, 'adminSettings', 'learning'));
      adminLearningSettings = mergeDeep(defaultLearningSettings(), snap.exists() ? snap.data() : {});
    } catch (error) {
      console.warn('[hsk] Không tải được adminSettings/learning, dùng cấu hình mặc định.', error);
      adminLearningSettings = defaultLearningSettings();
    }
    return adminLearningSettings;
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
    const cfg = adminLearningSettings || defaultLearningSettings();
    return normalizeCourseConfig(cfg, level).enabled !== false;
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
    const prefix = `${level}-`;
    const count = Object.keys(getCompletedMap()).filter((key) => key.startsWith(prefix)).length;
    return totalLessons ? Math.min(100, Math.round((count / totalLessons) * 100)) : 0;
  }

  function isLessonCompleted(level, lessonId) {
    return Boolean(getCompletedMap()[`${level}-${Number(lessonId)}`]);
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
          const isAvailable = !isLocked && canOpenLesson(currentLevel, l.lessonId);
          const completed = isLessonCompleted(currentLevel, l.lessonId);
          const lessonProgress = completed ? 100 : Number(l.progress || 0);
          const actionLabel = getLessonActionLabel(currentLevel, l.lessonId);
          const lockIcon = access.unlockType === 'vip' ? '👑' : (access.unlockType === 'coins' ? '🪙' : '🔒');
          const statusHtml = completed
            ? '<span class="lesson-status lesson-status--done">Đã học</span>'
            : (isAvailable ? `<span class="lesson-status lesson-status--active">${actionLabel}</span>` : `<span class="lesson-status lesson-status--locked">${lockIcon} ${actionLabel}</span>`);
          const canClick = !isLocked && access.enabled !== false && access.unlockType !== 'locked';
          return `
            <div class="lesson-item ${completed ? 'completed' : ''} ${canClick ? 'clickable-lesson' : 'locked'} ${isAvailable ? 'active-lesson' : 'needs-unlock'}"
                 data-detail="${l.lessonId}"
                 data-unlock-type="${access.unlockType}"
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
            <span style="font-size:.8rem;color:var(--text-muted)">Admin chưa mở khóa cấp này</span>
          </div>
        `}
      </div>

      <div class="lesson-list">
        <div class="lesson-chapter">Giáo trình ${currentLevel.toUpperCase()}</div>
        ${lessonRows}
      </div>
    `;

    panelsWrap.innerHTML = `<div class="tab-panel active" id="panel-${num}">${html}</div>`;

    panelsWrap.querySelectorAll('.clickable-lesson').forEach(row => {
      row.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        const id = parseInt(this.dataset.detail, 10);
        if (id) handleLessonClick(id);
      });

      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const id = parseInt(this.dataset.detail, 10);
          if (id) handleLessonClick(id);
        }
      });
    });
  }

  async function handleLessonClick(lessonId) {
    const access = getLessonAccessConfig(currentLevel, lessonId);
    if (!access.enabled || access.unlockType === 'locked') return toast('Bài học này đang được cập nhật.');
    if (access.unlockType === 'vip' && !userIsVip()) return toast('Bài này chỉ dành cho tài khoản VIP.');
    if (access.unlockType === 'coins' && !userHasCoinUnlock(currentLevel, lessonId)) {
      if (Number(currentStats?.coins || 0) < access.coinCost) return toast('Bạn chưa đủ xu.');
      if (!confirm(`Dùng ${access.coinCost} xu để mở vĩnh viễn bài này?`)) return;
      try {
        await window.CCFirebase?.unlockLessonWithCoins?.({ level: currentLevel, lessonId, coinCost: access.coinCost });
        currentStats = window.CCFirebase?.getCurrentStats?.() || currentStats;
        toast('Đã mở bài bằng xu.');
        await renderPanel(currentTab);
      } catch (error) {
        toast(error?.message || 'Không mở được bài bằng xu.');
        return;
      }
    }
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

      detailWrap.innerHTML = '<p style="padding:24px;text-align:center">Đang tải bài học...</p>';

      const override = await loadLessonOverride(currentLevel, lessonId);
      const lesson = override?.content || await loadLessonJson(currentLevel, currentItem.file);
      if (override?.visible === false || lesson.visible === false || override?.isLocked || lesson.isLocked || !canOpenLesson(currentLevel, lessonId)) {
        const access = getLessonAccessConfig(currentLevel, lessonId);
        const msg = access.unlockType === 'vip' ? '🔒 Bài học VIP. Hãy dùng tài khoản VIP để học.' : (access.unlockType === 'coins' ? `🪙 Bài học cần ${access.coinCost} xu để mở.` : '🔒 Bài học này đang được Admin khóa.');
        detailWrap.innerHTML = `<p style="padding:24px;text-align:center;color:#9a3412">${msg}</p>`;
        return;
      }
      lesson.level = lesson.level || currentTab;

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

  window.backToLessonList = function () {
    showCoursePanel();
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
