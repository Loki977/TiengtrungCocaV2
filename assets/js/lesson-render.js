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
  const boundRoots = new WeakSet();

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

  function isBasicHskLesson(lesson) {
    return [1, 2, 3].includes(Number(String(lesson?.level || '').replace(/\D/g, '')));
  }

  function isCoursePinyinVisible() {
    try {
      return localStorage.getItem('cc_coursePinyinVisible') !== 'false';
    } catch (_) {
      return true;
    }
  }

  function getPinyinEntries(lesson) {
    if (lesson.__exercisePinyinEntries) return lesson.__exercisePinyinEntries;
    const entries = new Map();
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) return value.forEach(visit);
      const hanzi = String(value.hanzi || value.chinese || value.zh || value.text || '').match(/[\u3400-\u9fff]+/g)?.join('') || '';
      const pinyin = String(value.pinyin || '').trim();
      if (hanzi && pinyin) {
        if (!entries.has(hanzi)) entries.set(hanzi, pinyin);
        const characters = [...hanzi];
        const syllables = pinyin.replace(/[，。！？?!、“”]/g, ' ').trim().split(/\s+/).filter(Boolean);
        if (characters.length === syllables.length) {
          characters.forEach((character, index) => {
            if (!entries.has(character)) entries.set(character, syllables[index]);
          });
        }
      }
      Object.values(value).forEach(visit);
    };
    visit(lesson.vocabulary);
    visit(lesson.extendedVocabulary);
    visit(lesson.vocabularyPages);
    visit(lesson.extendedVocabularyPages);
    visit(lesson.lessonText);
    lesson.__exercisePinyinEntries = [...entries].sort((a, b) => b[0].length - a[0].length);
    return lesson.__exercisePinyinEntries;
  }

  function getExercisePinyin(text, lesson) {
    if (!isBasicHskLesson(lesson)) return '';
    const preparedPinyin = window.CoursePinyin?.get?.(text, lesson);
    if (preparedPinyin) return preparedPinyin;
    const entries = getPinyinEntries(lesson);
    return (String(text).match(/[\u3400-\u9fff]+/g) || []).map(run => {
      const result = [];
      let cursor = 0;
      while (cursor < run.length) {
        const match = entries.find(([hanzi]) => run.startsWith(hanzi, cursor));
        if (!match) { cursor += 1; continue; }
        result.push(match[1]);
        cursor += match[0].length;
      }
      return result.join(' ');
    }).filter(Boolean).join(' · ');
  }

  function getFillBlankOptions(ex, lesson) {
    const answer = String(ex.answer || '').trim();
    const lessonAnswers = (lesson.exercises || [])
      .filter(item => item.type === 'fill-blank')
      .map(item => String(item.answer || '').trim());
    const commonDistractors = ['的', '了', '吗', '呢', '吧', '在', '是', '有', '也', '都', '很', '比', '最', '还是', '或者', '但是', '所以', '就', '才', '又', '再'];
    const pool = [...new Set([...(ex.options || []), ...lessonAnswers, ...commonDistractors])]
      .filter(item => item && normalizeAnswer(item) !== normalizeAnswer(answer));
    const seed = [...String(ex.question || answer)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const choices = [answer];
    for (let offset = 0; choices.length < 4 && offset < pool.length; offset += 1) {
      choices.push(pool[(seed + offset) % pool.length]);
    }
    const answerIndex = seed % choices.length;
    choices.splice(answerIndex, 0, choices.shift());
    return choices;
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

  function playAudioOrSpeak(lesson, text, audioPath, pinyin = '', audioProfile = '', lookupText = '') {
    if (window.CCAudio?.speak) {
      const mode = audioProfile === 'vocabulary' ? 'vocabulary' : audioProfile === 'lesson-passage' ? 'passage' : 'example';
      window.CCAudio.speak({
        text,
        lookupText: lookupText || text,
        pinyin,
        mode,
        audioProfile,
        volume: 1,
        lang: 'zh-CN'
      }).catch(() => {});
      return;
    }
    window.CCFirebase?.showToast?.('Dịch vụ audio tĩnh chưa sẵn sàng.', 'warning');
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
    const enhancedVocabulary = Number(lesson.level || 0) >= 4 && Number(lesson.meta?.version || 0) >= 2;
    const allowExampleAudio = getLessonLevelKey(lesson) !== 'hsk6';

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
            const example = item.example || item.examples?.[0]?.hanzi || '';
            const examplePinyin = item.examplePinyin || item.examples?.[0]?.pinyin || getExercisePinyin(example, lesson);
            const exampleTranslation = item.exampleTranslation || item.examples?.[0]?.translation || '';
            return `
              <div class="gt-vocab-card" data-level="${escapeHtml(getLessonLevelKey(lesson))}" data-lesson-id="${escapeHtml(lesson.lessonId || '')}" data-word-key="${escapeHtml(key)}" data-word="${escapeHtml(hanzi)}">
                <div class="gt-vocab-top">
                  <div class="gt-hanzi">${escapeHtml(hanzi)}</div>
                  <div class="gt-vocab-actions">
                    <button class="gt-bookmark-btn ${marked ? 'active' : ''}" data-bookmark="${escapeHtml(key)}" title="Đánh dấu từ khó">★</button>
                    <button class="gt-speak-btn" data-speak="${escapeHtml(hanzi)}" data-pinyin="${escapeHtml(item.pinyin || '')}" data-audio-profile="vocabulary" data-audio="${escapeHtml(item.audio || '')}" title="Nghe phát âm">🔊</button>
                  </div>
                </div>
                <div class="gt-pinyin">${escapeHtml(item.pinyin || '')}</div>
                <div class="gt-meaning">${escapeHtml(meaning)}</div>
                ${enhancedVocabulary && item.partOfSpeech ? `<div class="gt-word-type">${escapeHtml(item.partOfSpeech)}</div>` : ''}
                ${item.note ? `<p class="gt-note">💡 ${escapeHtml(item.note)}</p>` : ''}
                ${enhancedVocabulary && example ? `
                  <div class="gt-vocab-example">
                    <div class="gt-vocab-example-head">
                      <span>${escapeHtml(example)}</span>
                      ${allowExampleAudio ? `<button class="gt-speak-btn" data-speak="${escapeHtml(example)}" data-pinyin="${escapeHtml(examplePinyin)}" data-audio-profile="writing-sentence" title="Nghe câu ví dụ">🔊</button>` : ''}
                    </div>
                    ${examplePinyin ? `<div class="gt-pinyin">${escapeHtml(examplePinyin)}</div>` : ''}
                    ${exampleTranslation ? `<div class="gt-example-translation">${escapeHtml(exampleTranslation)}</div>` : ''}
                  </div>
                ` : ''}
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

  function renderReadingSegments(line) {
    const segments = Array.isArray(line.segments) ? line.segments : [];
    if (!segments.length) return escapeHtml(line.chinese || '');

    return segments.map(segment => {
      const text = segment.text || '';
      const clickable = segment.clickable !== false && (segment.pinyin || segment.meaning || segment.partOfSpeech || segment.note);
      if (!clickable) return escapeHtml(text);

      return `<button type="button" class="gt-reading-token"
        data-reading-text="${escapeHtml(text)}"
        data-reading-pinyin="${escapeHtml(segment.pinyin || '')}"
        data-reading-meaning="${escapeHtml(segment.meaning || '')}"
        data-reading-type="${escapeHtml(segment.partOfSpeech || '')}"
        data-reading-note="${escapeHtml(segment.note || '')}"
        aria-label="Tra nghĩa ${escapeHtml(text)}">${escapeHtml(text)}</button>`;
    }).join('');
  }

  function sliceReadingSegments(line, start, end) {
    const segments = Array.isArray(line.segments) ? line.segments : [];
    if (!segments.length) return [];

    let cursor = 0;
    return segments.reduce((result, segment) => {
      const text = String(segment.text || '');
      const segmentStart = cursor;
      const segmentEnd = cursor + text.length;
      cursor = segmentEnd;

      const sliceStart = Math.max(start, segmentStart);
      const sliceEnd = Math.min(end, segmentEnd);
      if (sliceStart >= sliceEnd) return result;

      result.push({
        ...segment,
        text: text.slice(sliceStart - segmentStart, sliceEnd - segmentStart)
      });
      return result;
    }, []);
  }

  function splitReadingContent(line) {
    const chinese = String(line.chinese || '');
    const paragraphs = [];
    const paragraphPattern = /[^\r\n]+/g;
    let match;

    while ((match = paragraphPattern.exec(chinese))) {
      const raw = match[0];
      const text = raw.trim();
      if (!text) continue;
      const offset = raw.indexOf(text);
      paragraphs.push({
        text,
        start: match.index + offset,
        end: match.index + offset + text.length
      });
    }

    const titleMarker = line.title ? `《${line.title}》` : '';
    const contentParagraphs = paragraphs[0]
      && (paragraphs[0].text === titleMarker || /^《[^》]+》$/.test(paragraphs[0].text))
      ? paragraphs.slice(1)
      : paragraphs;
    const noteIndex = contentParagraphs.findIndex(({ text }) => (
      text.startsWith('复述文章时，')
      || text.startsWith('为了把材料转化为本课可练习的HSK6表达，')
      || text.startsWith('本课的重点词语是：')
    ));

    let bodyParagraphs = contentParagraphs;
    let noteParagraphs = [];
    if (noteIndex >= 0 && contentParagraphs[noteIndex].text.startsWith('本课的重点词语是：')) {
      bodyParagraphs = contentParagraphs.slice(noteIndex + 1);
      noteParagraphs = contentParagraphs.slice(0, noteIndex + 1);
    } else if (noteIndex >= 0) {
      bodyParagraphs = contentParagraphs.slice(0, noteIndex);
      noteParagraphs = contentParagraphs.slice(noteIndex);
    }

    if (!bodyParagraphs.length) {
      bodyParagraphs = contentParagraphs;
      noteParagraphs = [];
    }

    const toReadingLine = paragraph => ({
      ...line,
      chinese: chinese.slice(paragraph.start, paragraph.end),
      segments: sliceReadingSegments(line, paragraph.start, paragraph.end)
    });
    const bodyStart = bodyParagraphs[0]?.start || 0;
    const bodyEnd = bodyParagraphs.at(-1)?.end || chinese.length;

    return {
      bodyText: chinese.slice(bodyStart, bodyEnd),
      bodyLine: {
        ...line,
        chinese: chinese.slice(bodyStart, bodyEnd),
        segments: sliceReadingSegments(line, bodyStart, bodyEnd)
      },
      notes: noteParagraphs.map(paragraph => ({
        text: paragraph.text,
        line: toReadingLine(paragraph)
      }))
    };
  }

  function renderInteractiveReading(line, lesson) {
    const reading = splitReadingContent(line);
    const pinyin = line.pinyin || getExercisePinyin(reading.bodyText, lesson);
    const titlePinyin = getExercisePinyin(line.title, lesson);
    return `
      <article class="gt-reading-card gt-interactive-reading">
        <div class="gt-reading-heading">
          <div>
            ${line.title ? `<h4>${escapeHtml(line.title)}</h4>` : '<span></span>'}
            ${titlePinyin ? `<div class="gt-auto-pinyin">${escapeHtml(titlePinyin)}</div>` : ''}
          </div>
          <button class="gt-reading-listen gt-speak-btn" data-speak="${escapeHtml(reading.bodyText)}" data-audio-lookup="${escapeHtml(line.chinese || reading.bodyText)}" data-audio-profile="lesson-passage" title="Nghe toàn bài">🔊 Nghe toàn bài</button>
        </div>
        <div class="gt-reading-chinese">${renderReadingSegments(reading.bodyLine)}</div>
        ${pinyin ? `<div class="gt-auto-pinyin">${escapeHtml(pinyin)}</div>` : ''}
        ${reading.notes.length ? `
          <div class="gt-reading-annotation" data-reading-annotation aria-label="Giới thiệu và chú thích">
            ${reading.notes.map(note => `<p>${renderReadingSegments(note.line)}</p>`).join('')}
          </div>
        ` : ''}
      </article>
    `;
  }

  function renderInteractiveDialogueLine(line, lesson) {
    const chinese = line.chinese || '';
    const sentencePinyin = line.pinyin || getExercisePinyin(chinese, lesson);
    const speakerPinyin = getExercisePinyin(line.speaker, lesson);
    const pinyin = [speakerPinyin, sentencePinyin].filter(Boolean).join(': ');
    return `
      <article class="gt-dialogue-line gt-interactive-dialogue">
        <div class="gt-dialogue-heading">
          <b>${escapeHtml(line.speaker || '')}</b>
          <button type="button" class="gt-dialogue-listen gt-speak-btn"
            data-speak="${escapeHtml(chinese)}"
            data-pinyin="${escapeHtml(pinyin)}"
            data-audio-profile="lesson-passage"
            data-audio="${escapeHtml(line.audio || '')}"
            title="Nghe câu thoại">🔊 Nghe câu</button>
        </div>
        <div class="gt-dialogue-chinese">${renderReadingSegments(line)}</div>
        ${pinyin ? `<div class="gt-pinyin">${escapeHtml(pinyin)}</div>` : ''}
        ${line.vietnamese ? `<div class="gt-dialogue-translation">${escapeHtml(line.vietnamese)}</div>` : ''}
      </article>
    `;
  }

  function renderReadingLookup() {
    return `
      <aside class="gt-reading-lookup" data-reading-lookup hidden role="dialog" aria-label="Tra nghĩa trong bài đọc" aria-live="polite">
        <button type="button" class="gt-reading-lookup-close" data-reading-lookup-close aria-label="Đóng bảng tra nghĩa">×</button>
        <strong class="gt-reading-lookup-word" data-reading-lookup-word></strong>
        <span class="gt-reading-lookup-pinyin" data-reading-lookup-pinyin></span>
        <span class="gt-reading-lookup-type" data-reading-lookup-type hidden></span>
        <p class="gt-reading-lookup-meaning" data-reading-lookup-meaning></p>
        <p class="gt-reading-lookup-note" data-reading-lookup-note hidden></p>
        <button type="button" class="gt-reading-lookup-speak gt-speak-btn" data-speak="" data-pinyin="" data-audio-profile="vocabulary" title="Nghe phát âm">🔊 Nghe phát âm</button>
      </aside>
    `;
  }

  function renderLessonText(lesson, page) {
    const pages = getSectionPages(lesson, 'lessonText');
    const lines = pages[page] || [];
    const hasInteractiveReading = lines.some(line => Array.isArray(line.segments) && line.segments.length);
    const isDialogue = lines.some(line => line.speaker || line.pinyin || line.vietnamese);
    const contentLabel = isDialogue ? 'Hội thoại' : sectionName('lessonText');

    return `
      <section class="gt-section gt-current-section" data-learning-section="lessonText">
        <h3 class="gt-section-title">💬 ${contentLabel}</h3>
        <div class="gt-page-meta">${contentLabel} ${page + 1}/${Math.max(pages.length, 1)}</div>
        <div class="gt-dialogue">
          ${lines.map(line => {
            const chinese = line.chinese || '';
            if (Array.isArray(line.segments) && line.segments.length) {
              return isDialogue ? renderInteractiveDialogueLine(line, lesson) : renderInteractiveReading(line, lesson);
            }
            const sentencePinyin = line.pinyin || getExercisePinyin(chinese, lesson);
            const linePinyin = [getExercisePinyin(line.speaker, lesson), sentencePinyin].filter(Boolean).join(': ');
            return `
              <button class="gt-dialogue-line" data-speak="${escapeHtml(chinese)}" data-pinyin="${escapeHtml(linePinyin)}" data-audio-profile="lesson-passage" data-audio="${escapeHtml(line.audio || '')}">
                <b>${escapeHtml(line.speaker || '')}</b> ${escapeHtml(chinese)}<br>
                ${linePinyin ? `<span class="gt-pinyin">${escapeHtml(linePinyin)}</span><br>` : ''}
                <span>${escapeHtml(line.vietnamese || '')}</span>
              </button>
            `;
          }).join('')}
        </div>
        ${hasInteractiveReading ? renderReadingLookup() : ''}
        <p class="gt-hint">${hasInteractiveReading ? 'Bấm vào từ hoặc cụm từ được đánh dấu để xem pinyin, nghĩa và nghe phát âm.' : 'Bấm vào từng câu để nghe phát âm.'}</p>
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
            ${item.title && getExercisePinyin(item.title, lesson) ? `<p class="gt-auto-pinyin">${escapeHtml(getExercisePinyin(item.title, lesson))}</p>` : ''}
            ${item.chinese ? `<p class="gt-reading-chinese">${escapeHtml(item.chinese)}</p>` : ''}
            ${item.chinese && (item.pinyin || getExercisePinyin(item.chinese, lesson)) ? `<p class="gt-pinyin">${escapeHtml(item.pinyin || getExercisePinyin(item.chinese, lesson))}</p>` : ''}
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
            <div>
              <h4>${escapeHtml(item.title || '')}</h4>
              ${getExercisePinyin(item.title, lesson) ? `<p class="gt-auto-pinyin">${escapeHtml(getExercisePinyin(item.title, lesson))}</p>` : ''}
            </div>
          </div>
          ${item.pattern ? `<div class="gt-pattern">${escapeHtml(item.pattern)}</div>${getExercisePinyin(item.pattern, lesson) ? `<p class="gt-auto-pinyin">${escapeHtml(getExercisePinyin(item.pattern, lesson))}</p>` : ''}` : ''}
          ${item.structure ? `<div class="gt-structure">Cấu trúc: ${escapeHtml(item.structure)}</div>${getExercisePinyin(item.structure, lesson) ? `<p class="gt-auto-pinyin">${escapeHtml(getExercisePinyin(item.structure, lesson))}</p>` : ''}` : ''}
          ${item.explanation ? `<p>${renderHighlightedHtml(item.explanation)}</p>${getExercisePinyin(item.explanation, lesson) ? `<p class="gt-auto-pinyin">${escapeHtml(getExercisePinyin(item.explanation, lesson))}</p>` : ''}` : ''}
          ${(item.examples || []).map(ex => `<div class="gt-grammar-example-wrap"><p class="gt-grammar-example">• ${renderHighlightedHtml(ex)}</p>${getExercisePinyin(ex, lesson) ? `<p class="gt-auto-pinyin">${escapeHtml(getExercisePinyin(ex, lesson))}</p>` : ''}</div>`).join('')}
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

  function renderExercise(ex, i, lesson) {
    const questionPinyin = getExercisePinyin(ex.question, lesson);
    const question = `
      <p><b>Câu ${i}.</b> ${escapeHtml(ex.question || '')}</p>
      ${questionPinyin ? `<p class="gt-exercise-pinyin">${escapeHtml(questionPinyin)}</p>` : ''}
    `;

    if (ex.type === 'multiple-choice') {
      return `
        <div class="gt-exercise-card">
          ${question}
          ${(ex.options || []).map(opt => {
            const optionPinyin = getExercisePinyin(opt, lesson);
            return `
            <button class="gt-quiz-option" data-answer="${escapeHtml(ex.answer || '')}" data-value="${escapeHtml(opt)}">
              <span>${escapeHtml(opt)}</span>
              ${optionPinyin ? `<span class="gt-exercise-pinyin">${escapeHtml(optionPinyin)}</span>` : ''}
            </button>
          `;
          }).join('')}
        </div>
      `;
    }

    if (ex.type === 'fill-blank' && isBasicHskLesson(lesson)) {
      return `
        <div class="gt-exercise-card">
          ${question}
          ${getFillBlankOptions(ex, lesson).map((opt, index) => `
            <button class="gt-quiz-option gt-quiz-option--labeled" data-answer="${escapeHtml(ex.answer || '')}" data-value="${escapeHtml(opt)}">
              <span class="gt-option-label">${String.fromCharCode(65 + index)}</span>
              <span>${escapeHtml(opt)}${getExercisePinyin(opt, lesson) ? `<span class="gt-exercise-pinyin">${escapeHtml(getExercisePinyin(opt, lesson))}</span>` : ''}</span>
            </button>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="gt-exercise-card">
        ${question}
        <div class="gt-answer-row">
          <input class="gt-answer-input" type="text" placeholder="Nhập đáp án của bạn..." data-answer="${escapeHtml(ex.answer || '')}" data-answer-pinyin="${escapeHtml(getExercisePinyin(ex.answer, lesson))}">
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
          ${(group.exercises || []).map((ex, index) => renderExercise(ex, index + 1, lesson)).join('')}
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
    const basicPinyin = isBasicHskLesson(lesson);
    const pinyinVisible = isCoursePinyinVisible();
    const titlePinyin = basicPinyin ? getExercisePinyin(lesson.chineseTitle, lesson) : '';

    window.__currentLessonData = lesson;

    return `
      <div class="lesson-detail-wrap gt-detail-wrap${basicPinyin ? ' gt-basic-pinyin' : ''}${basicPinyin && !pinyinVisible ? ' gt-pinyin-hidden' : ''}"${basicPinyin ? ' data-basic-pinyin' : ''}>
        <div class="detail-back-row">
          <button class="btn btn--outline btn--sm detail-back-btn" onclick="backToLessonList()">← Danh sách bài</button>
          <span class="detail-breadcrumb">HSK ${lesson.level || 1} › Bài ${lesson.lessonId}</span>
          ${basicPinyin ? `
            <button type="button" class="gt-pinyin-toggle" data-pinyin-toggle aria-pressed="${pinyinVisible}" title="Bật hoặc tắt pinyin">
              <span aria-hidden="true">拼</span>
              <span data-pinyin-toggle-label>${pinyinVisible ? 'Ẩn pinyin' : 'Hiện pinyin'}</span>
            </button>
          ` : ''}
        </div>

        <div class="gt-hero">
          <div class="gt-hero-icon">${escapeHtml(lesson.icon || '📚')}</div>
          <div>
            <span class="badge badge--orange">Bài ${lesson.lessonId}</span>
            <h2>${escapeHtml(lesson.title || '')}</h2>
            ${lesson.chineseTitle ? `<div class="gt-hero-chinese">${escapeHtml(lesson.chineseTitle)}</div>` : ''}
            ${titlePinyin ? `<div class="gt-hero-pinyin">${escapeHtml(titlePinyin)}</div>` : ''}
            <p>${lesson.meta?.estimatedMinutes ? `Khoảng ${lesson.meta.estimatedMinutes} phút` : 'Bài học'}${lesson.desc ? ` · ${escapeHtml(lesson.desc)}` : ''}</p>
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

  function playCourseFeedbackSound(kind) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const notes = kind === 'success' ? [523.25, 659.25, 783.99, 1046.5] : [392, 349.23, 293.66];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * (kind === 'success' ? 0.11 : 0.18);
        oscillator.type = kind === 'success' ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(kind === 'success' ? 0.08 : 0.065, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + (kind === 'success' ? 0.28 : 0.42));
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + (kind === 'success' ? 0.3 : 0.45));
      });
      window.setTimeout(() => context.close().catch(() => {}), 1300);
    } catch (_) {}
  }

  function launchCourseFireworks() {
    document.querySelector('.gt-answer-fireworks')?.remove();
    const box = document.createElement('div');
    box.className = 'gt-answer-fireworks';
    box.setAttribute('aria-hidden', 'true');
    [8, 92].forEach((startX, side) => {
      for (let index = 0; index < 20; index += 1) {
        const particle = document.createElement('i');
        particle.className = 'gt-answer-firework';
        particle.style.setProperty('--start-x', `${startX}vw`);
        particle.style.setProperty('--travel-x', `${(side === 0 ? 1 : -1) * (20 + Math.random() * 150)}px`);
        particle.style.setProperty('--travel-y', `-${80 + Math.random() * 150}px`);
        particle.style.setProperty('--hue', Math.floor(Math.random() * 360));
        particle.style.animationDelay = `${Math.random() * 90}ms`;
        box.appendChild(particle);
      }
    });
    document.body.appendChild(box);
    window.setTimeout(() => box.remove(), 1200);
  }

  function showCourseWrongAnswer() {
    const reaction = document.createElement('span');
    reaction.className = 'gt-wrong-reaction';
    reaction.textContent = '😢';
    reaction.setAttribute('aria-hidden', 'true');
    document.body.appendChild(reaction);
    window.setTimeout(() => reaction.remove(), 850);
  }

  function closeReadingLookup() {
    const lookup = document.querySelector('[data-reading-lookup]');
    if (!lookup) return;
    lookup.hidden = true;
    lookup.classList.remove('open');
  }

  function showReadingLookup(token) {
    const lookup = document.querySelector('[data-reading-lookup]');
    if (!lookup) return;

    const text = token.dataset.readingText || token.textContent || '';
    const pinyin = token.dataset.readingPinyin || '';
    const meaning = token.dataset.readingMeaning || '';
    const type = token.dataset.readingType || '';
    const note = token.dataset.readingNote || '';

    lookup.querySelector('[data-reading-lookup-word]').textContent = text;
    lookup.querySelector('[data-reading-lookup-pinyin]').textContent = pinyin;
    lookup.querySelector('[data-reading-lookup-meaning]').textContent = meaning;

    const typeEl = lookup.querySelector('[data-reading-lookup-type]');
    typeEl.textContent = type;
    typeEl.hidden = !type;

    const noteEl = lookup.querySelector('[data-reading-lookup-note]');
    noteEl.textContent = note;
    noteEl.hidden = !note;

    const speakButton = lookup.querySelector('[data-speak]');
    speakButton.dataset.speak = text;
    speakButton.dataset.pinyin = pinyin;
    lookup.hidden = false;
    lookup.classList.add('open');

    if (window.matchMedia('(max-width: 640px)').matches) {
      lookup.style.removeProperty('left');
      lookup.style.removeProperty('top');
      return;
    }

    const margin = 12;
    const tokenRect = token.getBoundingClientRect();
    const lookupRect = lookup.getBoundingClientRect();
    const left = Math.min(window.innerWidth - lookupRect.width - margin, Math.max(margin, tokenRect.left));
    let top = tokenRect.bottom + 10;
    if (top + lookupRect.height > window.innerHeight - margin) top = tokenRect.top - lookupRect.height - 10;
    lookup.style.left = `${left}px`;
    lookup.style.top = `${Math.max(margin, top)}px`;
  }

  function bindLessonRenderEvents(root = document) {
    if (boundRoots.has(root)) return;
    boundRoots.add(root);
    root.addEventListener('click', function (e) {
      const lesson = window.__currentLessonData;

      const pinyinToggle = e.target.closest('[data-pinyin-toggle]');
      if (pinyinToggle) {
        const detail = pinyinToggle.closest('.gt-detail-wrap');
        const visible = detail?.classList.contains('gt-pinyin-hidden');
        detail?.classList.toggle('gt-pinyin-hidden', !visible);
        pinyinToggle.setAttribute('aria-pressed', String(visible));
        const label = pinyinToggle.querySelector('[data-pinyin-toggle-label]');
        if (label) label.textContent = visible ? 'Ẩn pinyin' : 'Hiện pinyin';
        try {
          localStorage.setItem('cc_coursePinyinVisible', String(visible));
        } catch (_) {}
        return;
      }

      const readingToken = e.target.closest('.gt-reading-token');
      if (readingToken) showReadingLookup(readingToken);

      if (e.target.closest('[data-reading-lookup-close]')) closeReadingLookup();
      if (!readingToken && !e.target.closest('[data-reading-lookup]')) closeReadingLookup();

      const speakBtn = e.target.closest('[data-speak]');
      if (lesson && speakBtn && (speakBtn.classList.contains('gt-speak-btn') || speakBtn.classList.contains('gt-dialogue-line'))) {
        playAudioOrSpeak(
          lesson,
          speakBtn.dataset.speak,
          speakBtn.dataset.audio,
          speakBtn.dataset.pinyin,
          speakBtn.dataset.audioProfile,
          speakBtn.dataset.audioLookup
        );
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

      const quizOption = e.target.closest('.gt-quiz-option');
      if (quizOption) {
        const btn = quizOption;
        const parent = btn.closest('.gt-exercise-card');
        parent.querySelectorAll('.gt-quiz-option').forEach(b => {
          b.disabled = true;
          if (b.dataset.value === b.dataset.answer) b.classList.add('correct');
        });
        if (btn.dataset.value !== btn.dataset.answer) {
          btn.classList.add('wrong');
          showCourseWrongAnswer();
          playCourseFeedbackSound('sad');
        } else {
          launchCourseFireworks();
          playCourseFeedbackSound('success');
        }
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
          launchCourseFireworks();
          playCourseFeedbackSound('success');
          feedback.textContent = 'Chính xác!';
        } else {
          feedback.classList.add('wrong');
          showCourseWrongAnswer();
          playCourseFeedbackSound('sad');
          feedback.innerHTML = `Chưa đúng. Đáp án gợi ý: <b>${escapeHtml(input.dataset.answer)}</b>${input.dataset.answerPinyin ? `<span class="gt-exercise-pinyin">${escapeHtml(input.dataset.answerPinyin)}</span>` : ''}`;
        }
      }
    });

    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeReadingLookup();
    });
  }

  window.LessonRenderer = {
    renderLessonContent,
    bindLessonRenderEvents
  };
})();
