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
  const STORAGE_PREFIX = 'cc:flashcard:v2';

  let currentLevel = 'hsk1';
  let currentDeckName = 'HSK1';
  let sourceCards = [];
  let cards = [];
  let currentIndex = 0;
  let mastered = new Set();
  let learning = new Set();
  let masteredCount = 0;
  let deckMode = 'random';
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
  const btnRandomMode = document.getElementById('btnRandomMode');
  const btnSavedMode = document.getElementById('btnSavedMode');
  const btnCloseSaved = document.getElementById('btnCloseSaved');
  const fcSavedPanel = document.getElementById('fcSavedPanel');
  const fcSavedList = document.getElementById('fcSavedList');
  const savedModeCount = document.getElementById('savedModeCount');
  const masteredCounter = document.getElementById('masteredCounter');

  function normalizeKeyPart(value) {
    return String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function createCardKey(card, level = currentLevel) {
    return `${level}:${normalizeKeyPart(card.chinese)}\u001f${normalizeKeyPart(card.pinyin)}`;
  }

  function dedupeCards(rows, level) {
    const unique = new Map();
    rows.forEach(card => {
      const key = createCardKey(card, level);
      if (!unique.has(key)) unique.set(key, { ...card, key });
    });
    return [...unique.values()];
  }

  function shuffledCopy(rows) {
    const result = [...rows];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function storageKey(kind, level = currentLevel) {
    return `${STORAGE_PREFIX}:${kind}:${level}`;
  }

  function readSavedLearning(level) {
    try {
      const rows = JSON.parse(localStorage.getItem(storageKey('learning', level)) || '[]');
      return new Set(Array.isArray(rows) ? rows.filter(value => typeof value === 'string') : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveLearning() {
    try {
      localStorage.setItem(storageKey('learning'), JSON.stringify([...learning]));
    } catch (_) {}
  }

  function readMasteredCount(level) {
    try {
      const value = Number.parseInt(localStorage.getItem(storageKey('mastered-count', level)) || '0', 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (_) {
      return 0;
    }
  }

  function saveMasteredCount() {
    try {
      localStorage.setItem(storageKey('mastered-count'), String(masteredCount));
    } catch (_) {}
  }

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

      return dedupeCards(normalized, level);
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
      audio: String(item.audio || item.audioPath || '').trim(),
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

    sourceCards = [...await loadHSKData(level)];
    learning = readSavedLearning(level);
    masteredCount = readMasteredCount(level);
    getSavedCards();
    setLoadingState(false);
    startRandomMode();
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

  function updateModeControls() {
    const panelOpen = !fcSavedPanel.hidden;
    btnRandomMode.classList.toggle('is-active', deckMode === 'random' && !panelOpen);
    btnRandomMode.setAttribute('aria-pressed', String(deckMode === 'random' && !panelOpen));
    btnSavedMode.classList.toggle('is-active', deckMode === 'saved' || panelOpen);
    btnSavedMode.setAttribute('aria-expanded', String(panelOpen));
    savedModeCount.textContent = learning.size;
    masteredCounter.textContent = masteredCount;
  }

  function resetDeckView() {
    currentIndex = 0;
    mastered = new Set();
    isFlipped = false;
    fcComplete.classList.remove('show');
    fcActive.style.display = '';
    updateCard();
    updateProgress();
    updateModeControls();
  }

  function startRandomMode() {
    deckMode = 'random';
    cards = shuffledCopy(sourceCards);
    closeSavedPanel(false);
    resetDeckView();
  }

  function getSavedCards() {
    const availableKeys = new Set(sourceCards.map(card => card.key));
    const staleKeys = [...learning].filter(key => !availableKeys.has(key));
    if (staleKeys.length) {
      staleKeys.forEach(key => learning.delete(key));
      saveLearning();
    }
    return sourceCards.filter(card => learning.has(card.key));
  }

  function startSavedMode(selectedKey = '') {
    const savedCards = getSavedCards();
    if (!savedCards.length) {
      openSavedPanel();
      return;
    }
    deckMode = 'saved';
    cards = savedCards;
    closeSavedPanel(false);
    resetDeckView();
    const selectedIndex = selectedKey ? cards.findIndex(card => card.key === selectedKey) : 0;
    if (selectedIndex > 0) {
      currentIndex = selectedIndex;
      updateCard();
    }
    fcScene.focus({ preventScroll: true });
  }

  function renderSavedPanel() {
    const savedCards = getSavedCards();
    fcSavedList.replaceChildren();
    if (!savedCards.length) {
      const empty = document.createElement('p');
      empty.className = 'fc-saved-empty';
      empty.textContent = 'Chưa có từ nào được lưu. Hãy chọn “Chưa nhớ” sau khi lật thẻ.';
      fcSavedList.appendChild(empty);
      updateModeControls();
      return;
    }

    savedCards.forEach(card => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fc-saved-item';
      button.setAttribute('aria-label', `Ôn lại ${card.chinese}, ${card.pinyin}, ${card.vietnamese}`);

      const hanzi = document.createElement('span');
      hanzi.className = 'fc-saved-item__hanzi';
      hanzi.textContent = card.chinese;

      const detail = document.createElement('span');
      detail.className = 'fc-saved-item__detail';
      const pinyin = document.createElement('span');
      pinyin.className = 'fc-saved-item__pinyin';
      pinyin.textContent = card.pinyin || '—';
      const meaning = document.createElement('span');
      meaning.className = 'fc-saved-item__meaning';
      meaning.textContent = card.vietnamese || 'Chưa có nghĩa';
      detail.append(pinyin, meaning);
      button.append(hanzi, detail);
      button.addEventListener('click', () => startSavedMode(card.key));
      fcSavedList.appendChild(button);
    });
    updateModeControls();
  }

  function openSavedPanel() {
    fcSavedPanel.hidden = false;
    renderSavedPanel();
    btnCloseSaved.focus({ preventScroll: true });
  }

  function closeSavedPanel(returnFocus = true) {
    fcSavedPanel.hidden = true;
    updateModeControls();
    if (returnFocus) btnSavedMode.focus({ preventScroll: true });
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
    statMastered.textContent = masteredCount;
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
    if (mastered.has(c.key)) fcCard.classList.add('card--mastered');
    if (learning.has(c.key)) fcCard.classList.add('card--learning');
    updateModeControls();
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
    statMastered.textContent = masteredCount;
    statLearning.textContent = learning.size;
    btnPrev.disabled = true;
    btnNext.disabled = true;
    btnLearning.disabled = true;
    btnMastered.disabled = true;
  }

  function flipCard(toState) {
    if (!cards.length) return;
    isFlipped = toState !== undefined ? toState : !isFlipped;
    fcCard.classList.toggle('flipped', isFlipped);
    fcCard.classList.remove('card--pressed');
    void fcCard.offsetWidth;
    fcCard.classList.add('card--pressed');
  }

  function speakCurrent() {
    const c = cards[currentIndex];
    if (!c) return;
    fcAudioBtn.classList.add('playing');
    window.CCAudio?.speak({ text: c.chinese, pinyin: c.pinyin, mode: 'vocabulary', audioUrl: c.audio || '', lang: 'zh-CN' })
      .catch(() => {})
      .finally(() => fcAudioBtn.classList.remove('playing'));
  }
  window.speakWord = speakCurrent;

  function updateProgress() {
    const total = cards.length;
    const pct = total ? Math.round((mastered.size / total) * 100) : 0;
    deckProgressFill.style.width = pct + '%';
    deckProgressLabel.textContent = deckMode === 'saved' ? `${currentDeckName} · Ôn từ chưa thuộc` : `${currentDeckName} · Ngẫu nhiên`;
    deckProgressPct.textContent = `${mastered.size} / ${total} đã thuộc lượt này`;
    statMastered.textContent = masteredCount;
    statLearning.textContent = learning.size;
    updateModeControls();
  }

  function showComplete() {
    fcActive.style.display = 'none';
    fcComplete.classList.add('show');
    const total = cards.length;
    fcCompleteMsg.textContent =
      `Bạn đã học xong ${total} thẻ! 🎊 Đã thuộc lượt này: ${mastered.size} | Chưa thuộc đã lưu: ${learning.size}`;
  }

  function playFeedbackSound(kind) {
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

  function launchSideFireworks() {
    const box = document.createElement('div');
    box.className = 'fc-fireworks';
    box.setAttribute('aria-hidden', 'true');
    [8, 92].forEach((startX, side) => {
      for (let index = 0; index < 20; index += 1) {
        const particle = document.createElement('i');
        const distance = 80 + Math.random() * 150;
        particle.className = 'fc-firework';
        particle.style.setProperty('--start-x', `${startX}vw`);
        particle.style.setProperty('--travel-x', `${(side === 0 ? 1 : -1) * (20 + Math.random() * 150)}px`);
        particle.style.setProperty('--travel-y', `-${distance}px`);
        particle.style.setProperty('--hue', Math.floor(Math.random() * 360));
        particle.style.animationDelay = `${Math.random() * 90}ms`;
        box.appendChild(particle);
      }
    });
    document.body.appendChild(box);
    window.setTimeout(() => box.remove(), 1200);
  }

  function handleLearning() {
    if (!cards.length) return;
    if (!isFlipped) { flipCard(true); return; }
    const key = cards[currentIndex].key;
    learning.add(key);
    mastered.delete(key);
    saveLearning();
    renderSavedPanel();
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
    const key = cards[currentIndex].key;
    if (!mastered.has(key)) {
      masteredCount += 1;
      saveMasteredCount();
    }
    mastered.add(key);
    learning.delete(key);
    saveLearning();
    renderSavedPanel();
    fcCard.classList.add('card--mastered');
    launchSideFireworks();
    playFeedbackSound('success');
    setTimeout(() => {
      fcCard.classList.remove('card--mastered');
      if (currentIndex < cards.length - 1) { currentIndex++; updateCard(); }
      else showComplete();
    }, 320);
    updateProgress();
  }

  fcScene.addEventListener('click', () => flipCard());
  fcScene.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      flipCard();
    }
  });

  btnPrev.addEventListener('click', () => {
    if (currentIndex > 0) { currentIndex--; updateCard(); }
  });
  btnNext.addEventListener('click', () => {
    if (currentIndex < cards.length - 1) { currentIndex++; updateCard(); }
  });

  btnLearning.addEventListener('click', handleLearning);
  btnMastered.addEventListener('click', handleMastered);
  btnRandomMode.addEventListener('click', startRandomMode);
  btnSavedMode.addEventListener('click', () => {
    if (fcSavedPanel.hidden) openSavedPanel();
    else closeSavedPanel();
  });
  btnCloseSaved.addEventListener('click', () => closeSavedPanel());

  fcAudioBtn.addEventListener('click', e => {
    e.stopPropagation();
    speakCurrent();
  });

  btnRestart.addEventListener('click', () => loadLevel(currentLevel));
  btnReview.addEventListener('click', () => startSavedMode());

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !fcSavedPanel.hidden) {
      e.preventDefault();
      closeSavedPanel();
      return;
    }
    if (!fcSavedPanel.hidden) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    switch (e.key) {
      case ' ': e.preventDefault(); flipCard(); break;
      case 'ArrowLeft': if (currentIndex > 0) { currentIndex--; updateCard(); } break;
      case 'ArrowRight': if (currentIndex < cards.length - 1) { currentIndex++; updateCard(); } break;
      case '1': handleLearning(); break;
      case '2': handleMastered(); break;
      case 'r':
      case 'R': startRandomMode(); break;
      case 's':
      case 'S': speakCurrent(); break;
    }
  });

  buildSelector();
  hydrateCounts();
  loadLevel('hsk1');

})();
