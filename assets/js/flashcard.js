/* =============================================================
   flashcard.js — 3D Flashcard Viewer
   Data source: assets/data/hsk1.json ... hsk6.json
   ============================================================= */

(function () {
  'use strict';

  const HSK_LEVELS = [
    { key: 'hsk1', label: 'HSK1', color: '#f7a600', soft: '#fff4d5' },
    { key: 'hsk2', label: 'HSK2', color: '#f6c400', soft: '#fff8d7' },
    { key: 'hsk3', label: 'HSK3', color: '#ff8a2a', soft: '#fff0df' },
    { key: 'hsk4', label: 'HSK4', color: '#37b86b', soft: '#eaf9f0' },
    { key: 'hsk5', label: 'HSK5', color: '#0877ff', soft: '#eaf3ff' },
    { key: 'hsk6', label: 'HSK6', color: '#f44868', soft: '#fff0f3' }
  ];

  const dataCache = new Map();

  let currentLevel = 'hsk1';
  let currentDeckName = 'HSK1';
  let cards = [];
  let currentIndex = 0;
  let mastered = new Set();
  let learning = new Set();
  let isFlipped = false;

  const selectorEl = document.getElementById('deckSelector');
  const fcCard = document.getElementById('fcCard');
  const fcScene = document.getElementById('fcScene');
  const fcHanzi = document.getElementById('fcHanzi');
  const fcPinyin = document.getElementById('fcPinyin');
  const fcType = document.getElementById('fcType');
  const fcMeaning = document.getElementById('fcMeaning');
  const fcBackPinyin = document.getElementById('fcBackPinyin');
  const fcExZh = document.getElementById('fcExZh');
  const fcExVi = document.getElementById('fcExVi');
  const fcLessonLabel = document.getElementById('fcLessonLabel');
  const navCurrent = document.getElementById('navCurrent');
  const navTotal = document.getElementById('navTotal');
  const navDeckName = document.getElementById('navDeckName');
  const statTotal = document.getElementById('statTotal');
  const statMastered = document.getElementById('statMastered');
  const statLearning = document.getElementById('statLearning');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnLearning = document.getElementById('btnLearning');
  const btnMastered = document.getElementById('btnMastered');
  const btnRestart = document.getElementById('btnRestart');
  const btnReview = document.getElementById('btnReview');
  const fcActive = document.getElementById('fcActive');
  const fcComplete = document.getElementById('fcComplete');
  const fcCompleteMsg = document.getElementById('fcCompleteMsg');
  const deckProgressFill = document.getElementById('deckProgressFill');
  const deckProgressLabel = document.getElementById('deckProgressLabel');
  const deckProgressPct = document.getElementById('deckProgressPct');
  const fcAudioBtn = document.getElementById('fcAudioBtn');

  function buildSelector() {
    selectorEl.innerHTML = '';

    HSK_LEVELS.forEach(level => {
      const btn = document.createElement('button');
      btn.className = `deck-btn deck-btn--${level.key}`;
      btn.dataset.level = level.key;
      btn.style.setProperty('--hsk-color', level.color);
      btn.style.setProperty('--hsk-soft', level.soft);
      btn.innerHTML = `
        <span class="deck-btn__label">${level.label}</span>
        <span class="deck-btn-count" id="count-${level.key}">...</span>
      `;
      btn.addEventListener('click', () => loadLevel(level.key));
      selectorEl.appendChild(btn);
    });
  }

  async function loadHSKData(level) {
    if (dataCache.has(level)) {
      return await dataCache.get(level);
    }

    const loadPromise = (async () => {
      const response = await fetch(`assets/data/${level}.json`);

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const json = await response.json();

      if (!Array.isArray(json)) {
        throw new Error(`${level}.json không phải dạng mảng`);
      }

      const normalized = json.map(item => normalizeFlashcardItem(item, level)).filter(card => {
        return card.chinese || card.pinyin || card.vietnamese;
      });

      return normalized;
    })().catch(error => {
      console.error(`[flashcard] Không tải được ${level}.json`, error);
      return [];
    });

    dataCache.set(level, loadPromise);
    return await loadPromise;
  }

  function normalizeFlashcardItem(item, level) {
    const rawExample = item.example || item.examples?.[0] || '';
    const example = normalizeExample(rawExample);
    const chinese = item.chinese || item.word || item.hanzi || '';
    const pinyin = item.pinyin || '';
    const vietnamese = item.vietnamese || item.meaning_vi || item.meaning || item.vi || '';

    const normalizedLevel = item.level
      ? String(item.level).toUpperCase()
      : (item.hsk ? `HSK${item.hsk}` : level.toUpperCase());

    return {
      chinese,
      pinyin,
      vietnamese,
      example,
      level: normalizedLevel,
      hanzi: chinese,
      meaning: vietnamese,
      type: String(item.type || level.toUpperCase()).trim() || level.toUpperCase(),
      exZh: example.chinese,
      exVi: example.vietnamese,
      lesson: level.toUpperCase()
    };
  }

  function normalizeExample(example) {
    if (!example) {
      return { chinese: '', pinyin: '', vietnamese: '' };
    }

    if (typeof example === 'string') {
      return { chinese: example, pinyin: '', vietnamese: '' };
    }

    return {
      chinese: example.chinese || example.hanzi || example.zh || '',
      pinyin: example.pinyin || '',
      vietnamese: example.vietnamese || example.translation || example.meaning || example.vi || ''
    };
  }

  async function hydrateCounts() {
    await Promise.all(HSK_LEVELS.map(async level => {
      const data = await loadHSKData(level.key);
      const countEl = document.getElementById(`count-${level.key}`);
      if (countEl) countEl.textContent = data.length;
    }));
  }

  async function loadLevel(level) {
    currentLevel = level;
    const levelMeta = HSK_LEVELS.find(item => item.key === level) || HSK_LEVELS[0];
    currentDeckName = levelMeta.label;

    setLoadingState(true);
    updateSelector();

    cards = [...await loadHSKData(level)];
    currentIndex = 0;
    mastered = new Set();
    learning = new Set();
    isFlipped = false;

    fcComplete.classList.remove('show');
    fcActive.style.display = '';
    setLoadingState(false);
    updateCard();
    updateProgress();
  }

  function setLoadingState(isLoading) {
    selectorEl.classList.toggle('is-loading', isLoading);
    fcScene.style.pointerEvents = isLoading ? 'none' : '';
    if (isLoading) {
      fcHanzi.textContent = '...';
      fcPinyin.textContent = 'Đang tải dữ liệu';
      fcMeaning.textContent = 'Vui lòng chờ';
      fcType.textContent = currentDeckName;
    }
  }

  function updateSelector() {
    document.querySelectorAll('.deck-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.level === currentLevel);
    });
  }

  function updateCard() {
    if (!cards.length) {
      renderEmptyState();
      return;
    }

    if (currentIndex >= cards.length) {
      showComplete();
      return;
    }

    const c = cards[currentIndex];
    fcHanzi.textContent = c.chinese;
    fcPinyin.textContent = c.pinyin;
    fcType.textContent = c.level;
    fcMeaning.textContent = c.vietnamese;
    fcBackPinyin.textContent = c.pinyin;
    fcExZh.textContent = c.exZh || c.chinese;
    fcExVi.textContent = c.exVi || c.vietnamese;
    if (fcLessonLabel) fcLessonLabel.textContent = currentDeckName;

    navCurrent.textContent = currentIndex + 1;
    navTotal.textContent = cards.length;
    navDeckName.textContent = currentDeckName;

    statTotal.textContent = cards.length;
    statMastered.textContent = mastered.size;
    statLearning.textContent = learning.size;

    btnPrev.disabled = currentIndex === 0;
    btnNext.disabled = currentIndex === cards.length - 1;
    btnLearning.disabled = false;
    btnMastered.disabled = false;

    if (isFlipped) {
      fcCard.style.transition = 'none';
      fcCard.classList.remove('flipped');
      isFlipped = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fcCard.style.transition = '';
        });
      });
    }

    fcCard.classList.remove('card--mastered', 'card--learning');
    if (mastered.has(currentIndex)) fcCard.classList.add('card--mastered');
    if (learning.has(currentIndex)) fcCard.classList.add('card--learning');
  }

  function renderEmptyState() {
    fcHanzi.textContent = '—';
    fcPinyin.textContent = 'Không có dữ liệu';
    fcType.textContent = currentDeckName;
    fcMeaning.textContent = 'Không tải được bộ thẻ';
    fcBackPinyin.textContent = '';
    fcExZh.textContent = 'Vui lòng kiểm tra file JSON trong assets/data.';
    fcExVi.textContent = '';
    if (fcLessonLabel) fcLessonLabel.textContent = currentDeckName;
    navCurrent.textContent = 0;
    navTotal.textContent = 0;
    navDeckName.textContent = currentDeckName;
    statTotal.textContent = 0;
    statMastered.textContent = 0;
    statLearning.textContent = 0;
    btnPrev.disabled = true;
    btnNext.disabled = true;
    btnLearning.disabled = true;
    btnMastered.disabled = true;
  }

  function flipCard(toState) {
    if (!cards.length) return;
    isFlipped = toState !== undefined ? toState : !isFlipped;
    fcCard.classList.toggle('flipped', isFlipped);
  }

  function speakCurrent() {
    const c = cards[currentIndex];
    if (!c) return;
    fcAudioBtn.classList.add('playing');
    window.CCSpeech?.speak({ text: c.chinese, audioSrc: c.audio || '', rate: 0.85, lang: 'zh-CN' })
      .catch(() => {})
      .finally(() => fcAudioBtn.classList.remove('playing'));
  }
  window.speakWord = speakCurrent;

  function updateProgress() {
    const total = cards.length;
    const pct = total ? Math.round((mastered.size / total) * 100) : 0;
    deckProgressFill.style.width = pct + '%';
    deckProgressLabel.textContent = currentDeckName;
    deckProgressPct.textContent = `${mastered.size} / ${total} đã thành thạo`;
  }

  function showComplete() {
    fcActive.style.display = 'none';
    fcComplete.classList.add('show');
    const total = cards.length;
    fcCompleteMsg.textContent =
      `Bạn đã học xong ${total} thẻ! 🎊 Đã thuộc: ${mastered.size} | Chưa thuộc: ${learning.size}`;
  }

  function handleLearning() {
    if (!cards.length) return;
    if (!isFlipped) { flipCard(true); return; }
    learning.add(currentIndex);
    mastered.delete(currentIndex);
    fcCard.classList.add('card--learning');
    setTimeout(() => {
      fcCard.classList.remove('card--learning');
      if (currentIndex < cards.length - 1) { currentIndex++; updateCard(); }
      else showComplete();
    }, 320);
    updateProgress();
  }

  function handleMastered() {
    if (!cards.length) return;
    if (!isFlipped) { flipCard(true); return; }
    mastered.add(currentIndex);
    learning.delete(currentIndex);
    fcCard.classList.add('card--mastered');
    setTimeout(() => {
      fcCard.classList.remove('card--mastered');
      if (currentIndex < cards.length - 1) { currentIndex++; updateCard(); }
      else showComplete();
    }, 320);
    updateProgress();
  }

  fcScene.addEventListener('click', () => flipCard());
  fcScene.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); flipCard(); } });

  btnPrev.addEventListener('click', () => {
    if (currentIndex > 0) { currentIndex--; updateCard(); }
  });
  btnNext.addEventListener('click', () => {
    if (currentIndex < cards.length - 1) { currentIndex++; updateCard(); }
  });

  btnLearning.addEventListener('click', handleLearning);
  btnMastered.addEventListener('click', handleMastered);

  fcAudioBtn.addEventListener('click', e => {
    e.stopPropagation();
    speakCurrent();
  });

  btnRestart.addEventListener('click', () => loadLevel(currentLevel));
  btnReview.addEventListener('click', () => {
    const reviewIndices = [...learning];
    if (reviewIndices.length === 0) { loadLevel(currentLevel); return; }
    const allCards = cards;
    cards = reviewIndices.map(i => allCards[i]).filter(Boolean);
    currentIndex = 0;
    mastered = new Set();
    learning = new Set();
    isFlipped = false;
    fcComplete.classList.remove('show');
    fcActive.style.display = '';
    updateCard();
    updateProgress();
  });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.key) {
      case ' ': e.preventDefault(); flipCard(); break;
      case 'ArrowLeft': if (currentIndex > 0) { currentIndex--; updateCard(); } break;
      case 'ArrowRight': if (currentIndex < cards.length - 1) { currentIndex++; updateCard(); } break;
      case '1': handleLearning(); break;
      case '2': handleMastered(); break;
      case 's':
      case 'S': speakCurrent(); break;
    }
  });

  buildSelector();
  hydrateCounts();
  loadLevel('hsk1');

})();
