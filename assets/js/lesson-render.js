/* =============================================================
   lesson-render.js - HSK Lesson Engine V2
   - Render learningPath sections sequentially
   - Audio MP3 first, fallback to browser TTS
   - Local progress: section complete + page bookmark
   ============================================================= */

(function () {
  'use strict';

  const DEFAULT_SECTIONS = [
    'vocabulary',
    'extendedVocabulary',
    'lessonText',
    'story',
    'culture',
    'grammar',
    'exercises'
  ];

  const SECTION_LABELS = {
    vocabulary: 'Từ vựng',
    extendedVocabulary: 'Từ mở rộng',
    lessonText: 'Bài đọc',
    story: 'Đọc mở rộng',
    culture: 'Văn hóa',
    grammar: 'Ngữ pháp',
    exercises: 'Bài tập'
  };

  const EXERCISE_TYPES = [
    'multiple-choice',
    'fill-blank',
    'sentence-order',
    'error-correction',
    'translation',
    'reading',
    'writing'
  ];

  function chunkArray(items = [], size = 8) {
    const result = [];
    for (let i = 0; i < items.length; i += size) {
      result.push(items.slice(i, i + size));
    }
    return result;
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderHighlightedHtml(value = '') {
    return escapeHtml(value)
      .replace(/&lt;span class=(?:&#039;|&quot;)hl(?:&#039;|&quot;)&gt;/g, '<span class="hl">')
      .replace(/&lt;\/span&gt;/g, '</span>');
  }

  function normalizeAnswer(text = '') {
    return String(text).trim().toLowerCase().replace(/[。！？?!.,，\s]/g, '');
  }

  function getLessonKey(lesson) {
    return `lesson-progress-hsk${lesson.level || 1}-${lesson.lessonId}`;
  }

  function getLessonLevelKey(lesson) {
    const raw = String(lesson.level || lesson.hskLevel || '1').toLowerCase();
    return raw.startsWith('hsk') ? raw : `hsk${raw}`;
  }

  function getLessonXp(lesson) {
    return Number(lesson.xp || lesson.rewardXp || lesson.meta?.xp || 20) || 20;
  }

  async function awardLessonCompletion(lesson) {
    const firebase = window.CCFirebase;
    const payload = {
      level: getLessonLevelKey(lesson),
      lessonId: Number(lesson.lessonId || lesson.id || 1) || 1,
      title: lesson.title || `Bài ${lesson.lessonId || 1}`,
      xp: getLessonXp(lesson),
      meta: lesson.desc || lesson.description || ''
    };

    if (firebase?.completeLesson) {
      await firebase.completeLesson(payload);
      return;
    }

    try {
      const localStats = JSON.parse(localStorage.getItem('cc_local_progress') || '{}');
      const completedLessonIds = { ...(localStats.completedLessonIds || {}) };
      const completedKey = `${payload.level}-${payload.lessonId}`;
      const alreadyCompleted = Boolean(completedLessonIds[completedKey]);
      completedLessonIds[completedKey] = true;
      localStorage.setItem('cc_local_progress', JSON.stringify({
        ...localStats,
        xp: Number(localStats.xp || 0) + (alreadyCompleted ? 0 : payload.xp),
        todayXp: Number(localStats.todayXp || 0) + (alreadyCompleted ? 0 : payload.xp),
        lastXp: alreadyCompleted ? 0 : payload.xp,
        completedLessons: Object.keys(completedLessonIds).length,
        completedLessonIds
      }));
    } catch (error) {
      console.warn('[lesson-render] Không lưu được XP local', error);
    }
  }

  function readState(lesson) {
    try {
      const raw = JSON.parse(localStorage.getItem(getLessonKey(lesson))) || {};
      return {
        lessonId: lesson.lessonId,
        currentPage: 0,
        completed: {},
        done: {},
        pages: {},
        bookmarks: {},
        ...raw
      };
    } catch {
      return { lessonId: lesson.lessonId, currentPage: 0, completed: {}, done: {}, pages: {}, bookmarks: {} };
    }
  }

  function saveState(lesson, state) {
    localStorage.setItem(getLessonKey(lesson), JSON.stringify(state));
  }

  function getDoneMap(state) {
    return { ...(state.done || {}), ...(state.completed || {}) };
  }

  function writeDone(state, section, value = true) {
    state.completed = state.completed || {};
    state.done = state.done || {};
    state.completed[section] = value;
    state.done[section] = value;
  }

  function getAudioUrl(lesson, relativePath) {
    if (!relativePath) return '';
    const base = lesson.audio?.basePath || '';
    return relativePath.startsWith('assets/') ? relativePath : `${base}${relativePath}`;
  }

  function playAudioOrSpeak(lesson, text, audioPath) {
    const url = lesson.audio?.enabled && audioPath ? getAudioUrl(lesson, audioPath) : '';
    if (window.CCAudio?.speak) {
      window.CCAudio.speak({ text, mode: 'example', audioUrl: url, rate: 1, volume: 1, lang: 'zh-CN' }).catch(() => speakChinese(text));
      return;
    }
    speakChinese(text);
  }

  function speakChinese(text) {
    if (window.CCAudio?.speak) {
      window.CCAudio.speak({ text, mode: 'example', lang: 'zh-CN', rate: 1, volume: 1 }).catch(() => alert('Trình duyệt này chưa hỗ trợ phát âm.'));
      return;
    }
    alert('Trình duyệt này chưa hỗ trợ phát âm.');
  }


  function getSections(lesson) {
    const configured = lesson.learningPath?.sections;
    const sections = Array.isArray(configured) && configured.length ? configured : DEFAULT_SECTIONS;
    return sections.filter(section => DEFAULT_SECTIONS.includes(section) && hasSectionContent(lesson, section));
  }

  function hasSectionContent(lesson, section) {
    if (section === 'vocabulary') return Boolean((lesson.vocabulary || []).length);
    if (section === 'extendedVocabulary') return Boolean((lesson.extendedVocabulary || []).length);
    if (section === 'lessonText') return Boolean((lesson.lessonText || []).length);
    if (section === 'story') return Boolean((lesson.story || []).length);
    if (section === 'culture') return Boolean((lesson.culture || []).length);
    if (section === 'grammar') return Boolean((lesson.grammar || []).length);
    if (section === 'exercises') return Boolean((lesson.exercises || []).length || lesson.exerciseGroups);
    return false;
  }

  function getCurrentSection(lesson, state = readState(lesson)) {
    const sections = getSections(lesson);
    const done = getDoneMap(state);
    return sections.find(section => !done[section]) || null;
  }

  function getPage(state, section) {
    return Math.max(0, Number(state.pages?.[section] ?? state.currentPage ?? 0));
  }

  function setPage(state, section, page) {
    state.pages = state.pages || {};
    state.pages[section] = Math.max(0, page);
    state.currentPage = state.pages[section];
    state.currentSection = section;
  }

  function sectionName(key) {
    return SECTION_LABELS[key] || key;
  }

  function getVocabularyPages(lesson, section) {
    const existingPages = section === 'extendedVocabulary' ? lesson.extendedVocabularyPages : lesson.vocabularyPages;
    if (Array.isArray(existingPages) && existingPages.length) {
      return existingPages.map(page => Array.isArray(page) ? page : (page.items || []));
    }

    return chunkArray(section === 'extendedVocabulary' ? lesson.extendedVocabulary : lesson.vocabulary, 8);
  }

  function getLessonTextPages(lesson) {
    const lines = lesson.lessonText || [];
    if (lines.length > 8) return chunkArray(lines, 5);
    return lines.length ? [lines] : [];
  }

  function getSimplePages(lesson, section) {
    const items = lesson[section] || [];
    return items.length ? items.map(item => [item]) : [];
  }

  function getGrammarPages(lesson) {
    return (lesson.grammar || []).map(item => [item]);
  }

  function getExerciseGroups(lesson) {
    if (lesson.exerciseGroups) return lesson.exerciseGroups;

    const grouped = {};
    EXERCISE_TYPES.forEach(type => { grouped[type] = []; });

    (lesson.exercises || []).forEach(exercise => {
      const type = exercise.type || 'writing';
      grouped[type] = grouped[type] || [];
      grouped[type].push(exercise);
    });

    return grouped;
  }

  function getExercisePages(lesson) {
    const groups = getExerciseGroups(lesson);
    return EXERCISE_TYPES
      .map(type => ({ type, exercises: groups[type] || [] }))
      .filter(group => group.exercises.length);
  }

  function getSectionPages(lesson, section) {
    if (section === 'vocabulary' || section === 'extendedVocabulary') return getVocabularyPages(lesson, section);
    if (section === 'lessonText') return getLessonTextPages(lesson);
    if (section === 'story' || section === 'culture') return getSimplePages(lesson, section);
    if (section === 'grammar') return getGrammarPages(lesson);
    if (section === 'exercises') return getExercisePages(lesson);
    return [];
  }

  function sanitizeState(lesson) {
    const state = readState(lesson);
    const sections = getSections(lesson);
    const done = getDoneMap(state);
    let changed = false;

    Object.keys(done).forEach(section => {
      if (!sections.includes(section)) {
        delete state.completed?.[section];
        delete state.done?.[section];
        changed = true;
      }
    });

    sections.forEach(section => {
      const pages = getSectionPages(lesson, section);
      if (!pages.length && !done[section]) {
        writeDone(state, section, true);
        changed = true;
      }

      const page = getPage(state, section);
      if (pages.length && page > pages.length - 1) {
        setPage(state, section, pages.length - 1);
        changed = true;
      }
    });

    if (changed) saveState(lesson, state);
    return state;
  }

  function renderProgress(lesson, currentSection) {
    const state = readState(lesson);
    const sections = getSections(lesson);
    const done = getDoneMap(state);
    const doneCount = sections.filter(section => done[section]).length;
    const percent = sections.length ? Math.round((doneCount / sections.length) * 100) : 100;

    return `
      <div class="gt-progress-box">
        <div class="gt-progress-top">
          <b>Lesson ${String(lesson.lessonId).padStart(2, '0')}</b>
          <span>${percent}%</span>
        </div>
        <div class="gt-progress-bar"><div style="width:${percent}%"></div></div>
        <div class="gt-checklist">
          ${sections.map(section => {
            const status = done[section] ? '✓' : section === currentSection ? '▶' : '○';
            const cls = done[section] ? 'done' : section === currentSection ? 'current' : 'locked';
            return `<span class="gt-section-check ${cls}">${status} ${sectionName(section)}</span>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderNav(lesson, section, page, totalPages) {
    const sections = getSections(lesson);
    const isFirstSection = sections.indexOf(section) <= 0;
    const isFirstPage = page <= 0;
    return `
      <div class="gt-section-actions gt-learning-nav">
        <button class="btn btn--outline" data-flow-action="prev" ${isFirstSection && isFirstPage ? 'disabled' : ''}>Quay lại</button>
        <button class="btn btn--primary ripple" data-flow-action="next">
          ${page < totalPages - 1 ? 'Tiếp tục' : 'Hoàn thành phần này'}
        </button>
      </div>
    `;
  }

  function renderVocabulary(lesson, section, page) {
    const pages = getSectionPages(lesson, section);
    const items = pages[page] || [];
    const title = sectionName(section);

    return `
      <section class="gt-section gt-current-section" data-learning-section="${section}">
        <h3 class="gt-section-title">📖 ${title}</h3>
        <div class="gt-page-meta">${title} ${page + 1}/${Math.max(pages.length, 1)}</div>
        <div class="gt-vocab-grid">
          ${items.map((item, index) => {
            const key = item.id || item.hanzi || item.chinese || `${section}-${page}-${index}`;
            const marked = readState(lesson).bookmarks?.[key];
            const hanzi = item.hanzi || item.chinese || item.word || '';
            const meaning = item.meaning || item.meaning_vi || item.vietnamese || item.translation || '';
            return `
              <div class="gt-vocab-card" data-level="${escapeHtml(getLessonLevelKey(lesson))}" data-lesson-id="${escapeHtml(lesson.lessonId || '')}" data-word-key="${escapeHtml(key)}" data-word="${escapeHtml(hanzi)}">
                <div class="gt-vocab-top">
                  <div class="gt-hanzi">${escapeHtml(hanzi)}</div>
                  <div class="gt-vocab-actions">
                    <button class="gt-bookmark-btn ${marked ? 'active' : ''}" data-bookmark="${escapeHtml(key)}" title="Đánh dấu từ khó">★</button>
                    <button class="gt-speak-btn" data-speak="${escapeHtml(hanzi)}" data-audio="${escapeHtml(item.audio || '')}" title="Nghe phát âm">🔊</button>
                  </div>
                </div>
                <div class="gt-pinyin">${escapeHtml(item.pinyin || '')}</div>
                <div class="gt-meaning">${escapeHtml(meaning)}</div>
                ${item.note ? `<p class="gt-note">💡 ${escapeHtml(item.note)}</p>` : ''}
                <div class="gt-vocab-practice">
                  <label class="gt-practice-label">Đặt một câu tiếng Trung có sử dụng “${escapeHtml(hanzi)}”</label>
                  <textarea class="gt-practice-input" maxlength="120" placeholder="Nhập câu của bạn…"></textarea>
                  <div class="gt-practice-actions">
                    <button type="button" class="gt-practice-btn" data-practice-speak-word>🎤 Đọc từ</button>
                    <button type="button" class="gt-practice-btn" data-practice-speak-sentence>🎤 Đọc câu</button>
                    <button type="button" class="gt-practice-btn primary" data-practice-check>✓ Kiểm tra câu</button>
                  </div>
                  <div class="gt-practice-feedback" aria-live="polite"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${renderNav(lesson, section, page, pages.length)}
      </section>
    `;
  }

  function renderLessonText(lesson, page) {
    const pages = getSectionPages(lesson, 'lessonText');
    const lines = pages[page] || [];

    return `
      <section class="gt-section gt-current-section" data-learning-section="lessonText">
        <h3 class="gt-section-title">💬 ${sectionName('lessonText')}</h3>
        <div class="gt-page-meta">Bài đọc ${page + 1}/${Math.max(pages.length, 1)}</div>
        <div class="gt-dialogue">
          ${lines.map(line => {
            const chinese = line.chinese || '';
            return `
              <button class="gt-dialogue-line" data-speak="${escapeHtml(chinese)}" data-audio="${escapeHtml(line.audio || '')}">
                <b>${escapeHtml(line.speaker || '')}</b> ${escapeHtml(chinese)}<br>
                <span class="gt-pinyin">${escapeHtml(line.pinyin || '')}</span><br>
                <span>${escapeHtml(line.vietnamese || '')}</span>
              </button>
            `;
          }).join('')}
        </div>
        <p class="gt-hint">Bấm vào từng câu để nghe phát âm.</p>
        ${renderNav(lesson, 'lessonText', page, pages.length)}
      </section>
    `;
  }

  function renderStory(lesson, section, page) {
    const pages = getSectionPages(lesson, section);
    const items = pages[page] || [];
    const icon = section === 'culture' ? '🏮' : '📖';

    return `
      <section class="gt-section gt-current-section" data-learning-section="${section}">
        <h3 class="gt-section-title">${icon} ${sectionName(section)}</h3>
        <div class="gt-page-meta">${sectionName(section)} ${page + 1}/${Math.max(pages.length, 1)}</div>
        ${items.map(item => `
          <div class="gt-reading-card">
            ${item.title ? `<h4>${escapeHtml(item.title)}</h4>` : ''}
            ${item.chinese ? `<p class="gt-reading-chinese">${escapeHtml(item.chinese)}</p>` : ''}
            ${item.pinyin ? `<p class="gt-pinyin">${escapeHtml(item.pinyin)}</p>` : ''}
            ${item.vietnamese ? `<p>${escapeHtml(item.vietnamese)}</p>` : ''}
            ${item.content ? `<p>${escapeHtml(item.content)}</p>` : ''}
          </div>
        `).join('')}
        ${renderNav(lesson, section, page, pages.length)}
      </section>
    `;
  }

  function renderGrammar(lesson, page) {
    const pages = getSectionPages(lesson, 'grammar');
    const item = pages[page]?.[0] || {};

    return `
      <section class="gt-section gt-current-section" data-learning-section="grammar">
        <h3 class="gt-section-title">🧩 ${sectionName('grammar')}</h3>
        <div class="gt-page-meta">Ngữ pháp ${page + 1}/${Math.max(pages.length, 1)}</div>
        <div class="gt-grammar-card">
          <div class="gt-grammar-head">
            <span>${page + 1}</span>
            <h4>${escapeHtml(item.title || '')}</h4>
          </div>
          ${item.pattern ? `<div class="gt-pattern">${escapeHtml(item.pattern)}</div>` : ''}
          ${item.structure ? `<div class="gt-structure">Cấu trúc: ${escapeHtml(item.structure)}</div>` : ''}
          ${item.explanation ? `<p>${renderHighlightedHtml(item.explanation)}</p>` : ''}
          ${(item.examples || []).map(ex => `<p class="gt-grammar-example">• ${renderHighlightedHtml(ex)}</p>`).join('')}
        </div>
        ${renderNav(lesson, 'grammar', page, pages.length)}
      </section>
    `;
  }

  function exerciseTypeName(type) {
    return {
      'multiple-choice': 'Trắc nghiệm',
      'fill-blank': 'Điền từ',
      'sentence-order': 'Sắp xếp câu',
      'error-correction': 'Sửa lỗi sai',
      translation: 'Dịch',
      reading: 'Đọc hiểu',
      writing: 'Viết'
    }[type] || type;
  }

  function renderExercise(ex, i) {
    if (ex.type === 'multiple-choice') {
      return `
        <div class="gt-exercise-card">
          <p><b>Câu ${i}.</b> ${escapeHtml(ex.question || '')}</p>
          ${(ex.options || []).map(opt => `
            <button class="gt-quiz-option" data-answer="${escapeHtml(ex.answer || '')}" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="gt-exercise-card">
        <p><b>Câu ${i}.</b> ${escapeHtml(ex.question || '')}</p>
        <div class="gt-answer-row">
          <input class="gt-answer-input" type="text" placeholder="Nhập đáp án của bạn..." data-answer="${escapeHtml(ex.answer || '')}">
          <button class="gt-submit-btn">Nộp</button>
        </div>
        <div class="gt-feedback"></div>
      </div>
    `;
  }

  function renderExercises(lesson, page) {
    const pages = getSectionPages(lesson, 'exercises');
    const group = pages[page] || { type: 'writing', exercises: [] };

    return `
      <section class="gt-section gt-current-section" data-learning-section="exercises">
        <h3 class="gt-section-title">✍️ ${sectionName('exercises')}</h3>
        <div class="gt-page-meta">${exerciseTypeName(group.type)} ${page + 1}/${Math.max(pages.length, 1)}</div>
        <div class="gt-exercise-group">
          <h4>${exerciseTypeName(group.type)}</h4>
          ${(group.exercises || []).map((ex, index) => renderExercise(ex, index + 1)).join('')}
        </div>
        ${renderNav(lesson, 'exercises', page, pages.length)}
      </section>
    `;
  }

  function renderCurrentSection(lesson) {
    const state = sanitizeState(lesson);
    const section = getCurrentSection(lesson, state);

    if (!section) {
      return `
        <section class="gt-section gt-current-section gt-finished-box">
          <h3 class="gt-section-title">🎉 Hoàn thành bài học</h3>
          <p>Bạn đã học xong toàn bộ các phần của bài này.</p>
          <div class="gt-section-actions">
            <button class="btn btn--outline" data-flow-action="reset">Học lại bài này</button>
          </div>
        </section>
      `;
    }

    const pages = getSectionPages(lesson, section);
    const page = Math.min(getPage(state, section), Math.max(pages.length - 1, 0));

    if (section === 'vocabulary' || section === 'extendedVocabulary') return renderVocabulary(lesson, section, page);
    if (section === 'lessonText') return renderLessonText(lesson, page);
    if (section === 'story' || section === 'culture') return renderStory(lesson, section, page);
    if (section === 'grammar') return renderGrammar(lesson, page);
    if (section === 'exercises') return renderExercises(lesson, page);
    return '';
  }

  async function moveFlow(lesson, action) {
    const state = sanitizeState(lesson);
    const sections = getSections(lesson);
    const section = getCurrentSection(lesson, state);

    if (action === 'reset') {
      saveState(lesson, { lessonId: lesson.lessonId, currentPage: 0, completed: {}, done: {}, pages: {}, bookmarks: state.bookmarks || {} });
      return;
    }

    if (!section) return;

    const page = getPage(state, section);
    const totalPages = getSectionPages(lesson, section).length;
    const sectionIndex = sections.indexOf(section);

    if (action === 'prev') {
      if (page > 0) {
        setPage(state, section, page - 1);
      } else if (sectionIndex > 0) {
        const prevSection = sections[sectionIndex - 1];
        writeDone(state, prevSection, false);
        const prevTotal = getSectionPages(lesson, prevSection).length;
        setPage(state, prevSection, Math.max(0, prevTotal - 1));
      }
      saveState(lesson, state);
      return;
    }

    if (page < totalPages - 1) {
      setPage(state, section, page + 1);
    } else {
      writeDone(state, section, true);
      setPage(state, section, 0);
      const nextSection = sections[sectionIndex + 1];
      if (nextSection) {
        setPage(state, nextSection, 0);
      } else {
        state.lessonCompletedAt = new Date().toISOString();
      }
    }

    saveState(lesson, state);
    if (!sections.some((name) => !getDoneMap(state)[name])) {
      await awardLessonCompletion(lesson);
    }
  }

  function renderLessonContent(lesson, options = {}) {
    const prevId = options.prevId;
    const nextId = options.nextId;
    const state = sanitizeState(lesson);
    const currentSection = getCurrentSection(lesson, state);

    window.__currentLessonData = lesson;

    return `
      <div class="lesson-detail-wrap gt-detail-wrap">
        <div class="detail-back-row">
          <button class="btn btn--outline btn--sm detail-back-btn" onclick="backToLessonList()">← Danh sách bài</button>
          <span class="detail-breadcrumb">HSK ${lesson.level || 1} › Bài ${lesson.lessonId}</span>
        </div>

        <div class="gt-hero">
          <div class="gt-hero-icon">${escapeHtml(lesson.icon || '📚')}</div>
          <div>
            <span class="badge badge--orange">Bài ${lesson.lessonId}</span>
            <h2>${escapeHtml(lesson.title || '')}</h2>
            <p>${lesson.meta?.estimatedMinutes ? `Thời lượng khoảng ${lesson.meta.estimatedMinutes} phút. ` : ''}Học tuần tự từng phần: phần đã xong sẽ ẩn đi, phần tiếp theo mới mở.</p>
          </div>
        </div>

        ${renderProgress(lesson, currentSection)}
        ${renderCurrentSection(lesson)}

        <div class="detail-footer-nav">
          ${prevId ? `<button class="btn btn--outline" onclick="openLessonDetail(${prevId})">← Bài trước</button>` : '<span></span>'}
          <button class="btn btn--outline" onclick="backToLessonList()">📋 Danh sách</button>
          ${nextId ? `<button class="btn btn--primary ripple" onclick="openLessonDetail(${nextId})">Bài tiếp →</button>` : '<span></span>'}
        </div>
      </div>
    `;
  }

  function refreshCurrentLesson() {
    const lesson = window.__currentLessonData;
    if (!lesson) return;
    if (typeof window.openLessonDetail === 'function') {
      window.openLessonDetail(lesson.lessonId);
    }
  }

  function bindLessonRenderEvents(root = document) {
    root.addEventListener('click', function (e) {
      const lesson = window.__currentLessonData;

      const speakBtn = e.target.closest('[data-speak]');
      if (lesson && speakBtn && (speakBtn.classList.contains('gt-speak-btn') || speakBtn.classList.contains('gt-dialogue-line'))) {
        playAudioOrSpeak(lesson, speakBtn.dataset.speak, speakBtn.dataset.audio);
      }

      const bookmarkBtn = e.target.closest('.gt-bookmark-btn');
      if (lesson && bookmarkBtn) {
        const state = readState(lesson);
        state.bookmarks = state.bookmarks || {};
        const key = bookmarkBtn.dataset.bookmark;
        state.bookmarks[key] = !state.bookmarks[key];
        saveState(lesson, state);
        bookmarkBtn.classList.toggle('active', state.bookmarks[key]);
      }

      const flowBtn = e.target.closest('[data-flow-action]');
      if (lesson && flowBtn) {
        flowBtn.disabled = true;
        Promise.resolve(moveFlow(lesson, flowBtn.dataset.flowAction))
          .catch((error) => console.error('[lesson-render] Không lưu tiến độ bài học', error))
          .finally(() => refreshCurrentLesson());
      }

      if (e.target.classList.contains('gt-quiz-option')) {
        const btn = e.target;
        const parent = btn.closest('.gt-exercise-card');
        parent.querySelectorAll('.gt-quiz-option').forEach(b => {
          b.disabled = true;
          if (b.dataset.value === b.dataset.answer) b.classList.add('correct');
        });
        if (btn.dataset.value !== btn.dataset.answer) btn.classList.add('wrong');
      }

      if (e.target.classList.contains('gt-submit-btn')) {
        const card = e.target.closest('.gt-exercise-card');
        const input = card.querySelector('.gt-answer-input');
        const feedback = card.querySelector('.gt-feedback');

        const userAnswer = normalizeAnswer(input.value);
        const correctAnswer = normalizeAnswer(input.dataset.answer);

        feedback.className = 'gt-feedback show';

        if (!userAnswer) {
          feedback.classList.add('wrong');
          feedback.textContent = 'Bạn chưa nhập đáp án.';
          return;
        }

        if (userAnswer === correctAnswer) {
          feedback.classList.add('correct');
          feedback.textContent = 'Chính xác!';
        } else {
          feedback.classList.add('wrong');
          feedback.innerHTML = `Chưa đúng. Đáp án gợi ý: <b>${escapeHtml(input.dataset.answer)}</b>`;
        }
      }
    });
  }

  window.LessonRenderer = {
    renderLessonContent,
    bindLessonRenderEvents
  };
})();
