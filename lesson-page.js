import "./assets/js/speech-service.js";
import { getLessonContent, normalizeAnswer, normalizePinyin } from "./lesson-engine.js";
import { getLessonConfig } from "./lesson-config.js";

const params = new URLSearchParams(window.location.search);
const level = (params.get("level") || "hsk1").toLowerCase();
const lessonId = Number(params.get("lesson") || 1);
const app = document.getElementById("app");
const DISABLE_SEQUENTIAL_LESSON_LOCK = true;
const TTS_NORMAL_RATE = 0.82;
const TTS_SLOW_RATE = 0.58;
const TTS_PITCH = 0.92;
const TTS_VOLUME = 1.0;
const TTS_VOICE_PRIORITIES = [
  "Microsoft Yunxi Online (Natural) - Chinese (Mainland)",
  "Microsoft Xiaoxiao Online (Natural)",
  "Microsoft Yunjian Online (Natural)",
  "Google 普通话（中国大陆）",
  "Apple Ting-Ting"
];

const state = {
  lesson: null,
  config: null,
  currentIndex: 0,
  currentPhase: "vocabulary",
  answered: new Set(),
  revealed: new Set(),
  mode: "vi-to-cn",
  ttsVoice: null,
  ttsVoicesReady: false,
  currentUtterance: null,
  speechRequestId: 0,
  completionSaved: false,
  isCompletingAnswer: false,
  isReadingAnswer: false,
  hasCompletedCurrentQuestion: false
};

init();

async function init() {
  try {
    state.config = getLessonConfig(level);
    state.lesson = await getLessonContent(level, lessonId);

    if (!state.lesson.vocabularies.length) {
      app.className = "error";
      app.textContent = "Bài học này chưa có đủ dữ liệu từ vựng.";
      return;
    }

    renderShell();
    bindEvents();
    prepareChineseVoice();
    renderCurrentCard();
  } catch (error) {
    console.error(error);
    app.className = "error";
    app.textContent = "Không tải được bài học. Vui lòng kiểm tra dữ liệu JSON hoặc đường dẫn.";
  }
}

function renderShell() {
  const closeUrl = level === "hsk1" ? "hsk1-writing-lessons.html" : "hsk-writing.html";

  app.className = "";
  app.innerHTML = `
    <main class="lesson-shell">
      <header class="topbar">
        <a class="close-btn" href="${closeUrl}" aria-label="Đóng bài học">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18"></path>
            <path d="M6 6l12 12"></path>
          </svg>
        </a>

        <div class="progress-wrap">
          <div class="progress-meta">
            <span id="progressLabel">1/${getTotalCardCount()}</span>
            <span id="lessonLabel">${state.config?.label || level.toUpperCase()}</span>
          </div>
          <div class="progress-track">
            <div class="progress-bar" id="progressBar"></div>
          </div>
        </div>

        <div class="mode-switches">
          <label class="mode-switch">
            <input id="modeViToCn" type="checkbox" checked />
            <span class="mode-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22z"></path>
                <path d="M4 5.5v16"></path>
                <path d="M9 7h6"></path>
                <path d="M9 11h4"></path>
              </svg>
            </span>
            <span>Việt → Trung</span>
          </label>
          <label class="mode-switch">
            <input id="listenWriteMode" type="checkbox" />
            <span class="mode-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 13v-2a8 8 0 0 1 16 0v2"></path>
                <path d="M4 13a2 2 0 0 1 2-2h1v8H6a2 2 0 0 1-2-2z"></path>
                <path d="M20 13a2 2 0 0 0-2-2h-1v8h1a2 2 0 0 0 2-2z"></path>
              </svg>
            </span>
            <span>Nghe viết</span>
          </label>
        </div>
      </header>

      <section class="lesson-heading">
        <h1 id="pageTitle">${state.lesson.title} – Từ vựng</h1>
        <p id="pageDescription">Học hết từ vựng trước, sau đó luyện viết câu mẫu của bài.</p>
      </section>

      <section class="workspace">
        <article class="study-card">
          <div class="study-inner">
            <span class="badge" id="cardBadge">Từ vựng</span>
            <p class="instruction" id="instruction">Nhìn tiếng Việt, gõ pinyin hoặc chữ Hán.</p>
            <h2 class="prompt-word" id="promptWord"></h2>
            <input class="answer-input" id="answerInput" autocomplete="off" spellcheck="false" />
            <div class="writing-token-progress" id="answerMeter" aria-label="Tiến độ theo từng từ"></div>
            <button class="check-answer-btn" id="checkAnswerBtn" type="button">Kết quả</button>
            <div class="feedback" id="feedback" aria-live="polite"></div>
          </div>
        </article>

        <aside class="memory-panel">
          <h2>NỘI DUNG CẦN NHỚ</h2>
          <div id="memoryBox"></div>
        </aside>
      </section>
    </main>

    <nav class="bottom-nav" aria-label="Điều hướng bài học">
      <button class="nav-btn nav-btn--prev" id="prevBtn" type="button">
        <span class="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M19 12H5"></path><path d="m11 6-6 6 6 6"></path></svg>
        </span>
        <span>Trước</span>
      </button>
      <button class="nav-btn nav-btn--listen" id="listenBtn" type="button">
        <span class="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"></path><path d="M16 9a5 5 0 0 1 0 6"></path><path d="M19 6a9 9 0 0 1 0 12"></path></svg>
        </span>
        <span>Nghe</span>
      </button>
      <button class="nav-btn nav-btn--slow" id="slowListenBtn" type="button">
        <span class="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M5 15a6 6 0 0 1 6-6h4a4 4 0 0 1 4 4v2"></path><path d="M4 15h16"></path><path d="M7 15v3"></path><path d="M17 15v3"></path><path d="M10 9V6h4v3"></path></svg>
        </span>
        <span>Nghe chậm</span>
      </button>
      <button class="nav-btn nav-btn--save" id="saveBtn" type="button">
        <span class="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9z"></path></svg>
        </span>
        <span>Lưu</span>
      </button>
      <button class="nav-btn nav-btn--answer" id="showAnswerBtn" type="button">
        <span class="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M9.1 9a3 3 0 1 1 5.8 1c-.6 1.8-2.9 2-2.9 4"></path><path d="M12 18h.01"></path><circle cx="12" cy="12" r="9"></circle></svg>
        </span>
        <span>Đáp án</span>
      </button>
      <button class="nav-btn nav-btn--next primary" id="nextBtn" type="button">
        <span class="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>
        </span>
        <span>Tiếp</span>
      </button>
    </nav>
  `;
}

function bindEvents() {
  document.getElementById("answerInput").addEventListener("input", handleAnswerInput);
  document.getElementById("checkAnswerBtn").addEventListener("click", () => {
    const input = document.getElementById("answerInput");

    if (input.disabled && canGoNext()) {
      goNext();
      return;
    }

    submitCurrentAnswer(input);
  });
  document.getElementById("answerInput").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (event.target.disabled && canGoNext()) {
      goNext();
      return;
    }

    submitCurrentAnswer(event.target);
  });

  document.getElementById("prevBtn").addEventListener("click", goPrev);
  document.getElementById("nextBtn").addEventListener("click", goNext);
  document.getElementById("listenBtn").addEventListener("click", () => speakCurrent(TTS_NORMAL_RATE));
  document.getElementById("slowListenBtn").addEventListener("click", () => speakCurrent(TTS_SLOW_RATE));
  document.getElementById("saveBtn").addEventListener("click", saveCurrentWord);
  document.getElementById("showAnswerBtn").addEventListener("click", revealCurrentAnswer);
  document.getElementById("modeViToCn").addEventListener("change", (event) => {
    state.mode = event.target.checked ? "vi-to-cn" : "cn-to-vi";
    renderCurrentCard();
  });
  document.getElementById("listenWriteMode").addEventListener("change", (event) => {
    if (event.target.checked) {
      speakCurrent(TTS_NORMAL_RATE);
    }
  });
  document.querySelector(".close-btn")?.addEventListener("click", cancelSpeech);

  window.addEventListener("pagehide", cancelSpeech);
  window.addEventListener("beforeunload", cancelSpeech);
}

function renderCurrentCard() {
  cancelSpeech();

  const item = getCurrentItem();
  const isSentence = state.currentPhase === "sentence";
  const globalIndex = getGlobalCardIndex();
  const total = getTotalCardCount();
  const isRevealed = state.revealed.has(getCurrentCardKey());
  const isAnswered = state.answered.has(getCurrentCardKey());
  const prompt = getPrompt(item);

  state.isCompletingAnswer = false;
  state.isReadingAnswer = false;
  state.hasCompletedCurrentQuestion = isAnswered;

  document.getElementById("progressLabel").textContent = `${globalIndex + 1}/${total}`;
  document.getElementById("progressBar").style.width = `${((globalIndex + 1) / total) * 100}%`;
  document.getElementById("pageTitle").textContent = `${state.lesson.title} – ${isSentence ? "Luyện viết câu" : "Từ vựng"}`;
  document.getElementById("cardBadge").textContent = isSentence ? "Luyện viết câu" : "Từ vựng";
  document.getElementById("promptWord").textContent = prompt;
  document.getElementById("instruction").textContent = getInstructionText(isSentence);
  renderAnswerMeter(item, isAnswered ? getExpectedAnswerValue(item) : "");
  document.getElementById("saveBtn").disabled = isSentence;

  const input = document.getElementById("answerInput");
  input.value = "";
  input.classList.remove("correct", "wrong");
  input.placeholder = getInputPlaceholder(isSentence);
  input.disabled = isAnswered || isRevealed;
  document.getElementById("checkAnswerBtn").disabled = isAnswered || isRevealed;

  document.getElementById("feedback").textContent = isAnswered ? "Chính xác." : "";
  document.getElementById("feedback").className = isAnswered ? "feedback good" : "feedback";
  document.getElementById("prevBtn").disabled = globalIndex === 0;
  setNextButtonState(!canGoNext());

  if (isRevealed || isAnswered) {
    renderMemory(item);
  } else {
    renderMemoryEmpty();
    requestAnimationFrame(() => input.focus());
  }
}

function handleAnswerInput(event) {
  const input = event.target;

  if (state.isCompletingAnswer || state.hasCompletedCurrentQuestion) {
    return;
  }

  if (!input.value.trim()) {
    input.classList.remove("correct", "wrong");
    setFeedback("");
    renderAnswerMeter(getCurrentItem(), "");
    return;
  }

  input.classList.remove("correct", "wrong");
  setFeedback("");
  renderAnswerMeter(getCurrentItem(), input.value);

  if (state.currentPhase === "sentence" && isCorrectAnswer(input.value, getCurrentItem())) {
    submitCurrentAnswer(input);
  }
}

function submitCurrentAnswer(input) {
  const item = getCurrentItem();

  if (state.isCompletingAnswer || state.hasCompletedCurrentQuestion || input.disabled) {
    return;
  }

  if (!input.value.trim()) {
    input.classList.remove("correct", "wrong");
    setFeedback("");
    return;
  }

  if (isCorrectAnswer(input.value, item)) {
    if (state.currentPhase === "sentence") {
      completeCurrentSentence(input, item);
      return;
    }

    state.answered.add(getCurrentCardKey());
    state.hasCompletedCurrentQuestion = true;
    input.classList.add("correct");
    input.classList.remove("wrong");
    input.disabled = true;
    document.getElementById("checkAnswerBtn").disabled = true;
    setFeedback("Chính xác.", "good");
    renderAnswerMeter(item, getExpectedAnswerValue(item));
    renderMemory(item);
    setNextButtonState(false);
    return;
  }

  input.classList.add("wrong");
  input.classList.remove("correct");
  setFeedback("Chưa đúng, thử lại nhé.", "bad");
  renderAnswerMeter(item, input.value);
}

async function completeCurrentSentence(input, item) {
  const cardKey = getCurrentCardKey();
  state.isCompletingAnswer = true;
  state.hasCompletedCurrentQuestion = true;
  state.answered.add(cardKey);

  input.classList.add("correct");
  input.classList.remove("wrong");
  input.disabled = true;
  document.getElementById("checkAnswerBtn").disabled = true;
  renderAnswerMeter(item, getExpectedAnswerValue(item));
  renderMemory(item);
  setFeedback("Chính xác. Đang đọc đáp án...", "good");
  setNextButtonState(true, "Đang đọc đáp án...");

  playSuccessSound();
  launchWritingCelebration();
  state.isReadingAnswer = true;
  await speakChineseAndWait(item.chinese);

  if (cardKey !== getCurrentCardKey()) return;

  state.isReadingAnswer = false;
  state.isCompletingAnswer = false;
  setFeedback("Chính xác.", "good");
  setNextButtonState(false);
}

function setNextButtonState(disabled, label = "Tiếp") {
  const nextButton = document.getElementById("nextBtn");
  if (!nextButton) return;
  nextButton.disabled = disabled;
  const text = nextButton.querySelector("span:last-child");
  if (text) text.textContent = label;
}

function playSuccessSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    gain.connect(context.destination);

    [523.25, 659.25].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.08);
      oscillator.connect(gain);
      oscillator.start(now + index * 0.08);
      oscillator.stop(now + 0.34);
    });

    window.setTimeout(() => context.close().catch(() => {}), 500);
  } catch (_) {
    // Audio is optional when a browser blocks sound playback.
  }
}

function launchWritingCelebration() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  document.querySelector(".writing-celebration")?.remove();
  const celebration = document.createElement("div");
  celebration.className = "writing-celebration";
  celebration.setAttribute("aria-hidden", "true");
  const count = window.matchMedia?.("(max-width: 768px)").matches ? 18 : 30;

  celebration.innerHTML = Array.from({ length: count }, (_, index) => {
    const side = index % 2 ? "right" : "left";
    const rise = 30 + (index * 17) % 58;
    const drift = 16 + (index * 13) % 34;
    const delay = (index % 6) * 35;
    const horizontalOffset = side === "left" ? drift : -drift;
    return `<i class="writing-confetti writing-confetti--${side}" style="--x:${horizontalOffset}vw;--y:-${rise}vh;--delay:${delay}ms;--hue:${(index * 47) % 360}"></i>`;
  }).join("");
  document.body.appendChild(celebration);
  window.setTimeout(() => celebration.remove(), 2600);
}

function revealCurrentAnswer() {
  state.revealed.add(getCurrentCardKey());
  renderMemory(getCurrentItem());
  document.getElementById("answerInput").disabled = true;
  document.getElementById("checkAnswerBtn").disabled = true;
  document.getElementById("nextBtn").disabled = false;
  setFeedback("Đáp án đã được hiển thị.", "good");
}

function goPrev() {
  if (getGlobalCardIndex() <= 0) {
    return;
  }

  if (state.currentPhase === "sentence" && state.currentIndex === 0) {
    state.currentPhase = "vocabulary";
    state.currentIndex = state.lesson.vocabularies.length - 1;
  } else {
    state.currentIndex -= 1;
  }

  renderCurrentCard();
}

function goNext() {
  if (!canGoNext()) {
    return;
  }

  const vocabCount = state.lesson.vocabularies.length;
  const sentenceCount = getLessonSentences().length;

  if (state.currentPhase === "vocabulary" && state.currentIndex < vocabCount - 1) {
    state.currentIndex += 1;
    renderCurrentCard();
    return;
  }

  if (state.currentPhase === "vocabulary" && sentenceCount > 0) {
    state.currentPhase = "sentence";
    state.currentIndex = 0;
    renderCurrentCard();
    return;
  }

  if (state.currentPhase === "sentence" && state.currentIndex < sentenceCount - 1) {
    state.currentIndex += 1;
    renderCurrentCard();
    return;
  }

  setFeedback("Bạn đã hoàn thành bài học này.", "good");
  markLessonComplete();
}

function canGoNext() {
  if (state.isCompletingAnswer || state.isReadingAnswer) return false;
  if (DISABLE_SEQUENTIAL_LESSON_LOCK) return true;
  return state.answered.has(getCurrentCardKey()) || state.revealed.has(getCurrentCardKey());
}

function getCurrentVocabulary() {
  return state.lesson.vocabularies[state.currentIndex];
}

function getCurrentSentence() {
  return getLessonSentences()[state.currentIndex];
}

function getCurrentItem() {
  return state.currentPhase === "sentence" ? getCurrentSentence() : getCurrentVocabulary();
}

function getLessonSentences() {
  return Array.isArray(state.lesson?.sentences) ? state.lesson.sentences : [];
}

function getTotalCardCount() {
  return state.lesson.vocabularies.length + getLessonSentences().length;
}

function getGlobalCardIndex() {
  return state.currentPhase === "sentence"
    ? state.lesson.vocabularies.length + state.currentIndex
    : state.currentIndex;
}

function getCurrentCardKey() {
  return `${state.currentPhase}:${state.currentIndex}`;
}

function getInstructionText(isSentence) {
  if (document.getElementById("listenWriteMode")?.checked) {
    return isSentence ? "Nghe và viết lại cả câu." : "Nghe và viết lại từ.";
  }

  if (isSentence) {
    return state.mode === "vi-to-cn"
      ? "Nhìn nghĩa tiếng Việt, gõ câu tiếng Trung hoặc pinyin."
      : "Nhìn câu tiếng Trung, gõ nghĩa tiếng Việt.";
  }

  return state.mode === "vi-to-cn"
    ? "Nhìn tiếng Việt, gõ pinyin hoặc chữ Hán."
    : "Nhìn chữ Hán, gõ nghĩa tiếng Việt.";
}

function getInputPlaceholder(isSentence) {
  if (state.mode === "cn-to-vi") {
    return "Nhập nghĩa tiếng Việt";
  }

  return isSentence ? "Nhập câu tiếng Trung hoặc pinyin" : "Nhập pinyin hoặc chữ Hán";
}

function getPrompt(item) {
  if (document.getElementById("listenWriteMode")?.checked) {
    return state.currentPhase === "sentence" ? "Nghe và viết lại câu" : "Nghe và viết lại";
  }

  return state.mode === "vi-to-cn" ? item.vietnamese : item.chinese;
}

function isCorrectAnswer(value, item) {
  if (state.mode === "cn-to-vi") {
    return normalizeAnswer(value) === normalizeAnswer(item.vietnamese);
  }

  return normalizeAnswer(value) === normalizeAnswer(item.chinese)
    || normalizePinyin(value) === normalizePinyin(item.pinyin);
}

function getExpectedAnswerValue(item) {
  if (state.mode === "cn-to-vi") {
    return normalizeAnswer(item.vietnamese);
  }

  return normalizePinyin(item.pinyin) || normalizeAnswer(item.chinese);
}

function getAnswerTokens(item) {
  const sourceTokens = Array.isArray(item?.answerTokens) ? item.answerTokens : null;

  if (sourceTokens?.length) {
    return sourceTokens
      .map((token) => typeof token === "string" ? token : token?.answer || token?.pinyin || token?.hanzi || "")
      .map((token) => normalizeToken(token))
      .filter(Boolean);
  }

  const source = state.mode === "cn-to-vi" ? item?.vietnamese : item?.pinyin;
  const tokens = String(source || "")
    .trim()
    .split(/\s+/)
    .map((token) => normalizeToken(token))
    .filter(Boolean);

  // Chinese text without a supplied token structure remains one unit, never split by character.
  return tokens.length ? tokens : [normalizeToken(item?.chinese)].filter(Boolean);
}

function normalizeToken(value) {
  const text = String(value || "").replace(/[，。！？；：、,.!?;:()[\]{}"“”]/g, "").trim();
  return state.mode === "cn-to-vi" ? normalizeAnswer(text) : normalizePinyin(text);
}

function getInputTokens(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((token) => normalizeToken(token))
    .filter(Boolean);
}

function getTokenStates(item, inputValue) {
  const expectedTokens = getAnswerTokens(item);

  if (isCorrectAnswer(inputValue, item)) {
    return expectedTokens.map(() => "correct");
  }

  const inputTokens = getInputTokens(inputValue);
  return expectedTokens.map((expected, index) => {
    const entered = inputTokens[index];
    if (!entered) return "pending";
    if (entered === expected) return "correct";
    return expected.startsWith(entered) ? "typing" : "wrong";
  });
}

function renderAnswerMeter(item, inputValue = "") {
  const meter = document.getElementById("answerMeter");
  const states = getTokenStates(item, inputValue);
  const stateLabels = {
    pending: "chưa nhập",
    typing: "đang nhập",
    correct: "đúng",
    wrong: "sai"
  };

  meter.className = "writing-token-progress";
  meter.style.setProperty("--token-count", Math.max(states.length, 1));
  meter.innerHTML = states.map((tokenState, index) => {
    const label = stateLabels[tokenState];
    return `<span class="writing-token-bar is-${tokenState}" data-state="${tokenState}" aria-label="Từ ${index + 1}: ${label}" title="Từ ${index + 1}: ${label}"></span>`;
  }).join("");
}

function renderMemory(item) {
  const isSentence = state.currentPhase === "sentence";

  document.getElementById("memoryBox").innerHTML = `
    <div class="memory-content">
      <p class="memory-word">${item.chinese || "..."}</p>
      <p class="memory-pinyin">${item.pinyin || ""}</p>
      <p class="memory-meaning">${item.vietnamese || ""}</p>
      ${isSentence ? "" : `<p class="memory-note">Câu ví dụ của bài được tách sang phần luyện viết sau khi học hết từ vựng.</p>`}
    </div>
  `;
}

function renderMemoryEmpty() {
  const isSentence = state.currentPhase === "sentence";
  document.getElementById("memoryBox").innerHTML = `
    <div class="memory-empty">
      ${isSentence ? "Trả lời đúng hoặc bấm “Đáp án” để xem câu, pinyin và nghĩa." : "Trả lời đúng hoặc bấm “Đáp án” để xem từ, pinyin và nghĩa."}
    </div>
  `;
}

function setFeedback(message, type = "") {
  const feedback = document.getElementById("feedback");
  feedback.textContent = message;
  feedback.className = type ? `feedback ${type}` : "feedback";
}

async function speakCurrent(rate = TTS_NORMAL_RATE, options = {}) {
  const item = getCurrentItem();
  if (!item?.chinese) return;
  try {
    await window.CCSpeech.speak({
      text: formatChineseSpeechText(item.chinese),
      audioSrc: item.audio || item.audioPath || '',
      rate,
      pitch: TTS_PITCH,
      volume: TTS_VOLUME,
      lang: 'zh-CN'
    });
  } catch (error) {
    if (!options.silentOnUnsupported) setFeedback("Trình duyệt chưa hỗ trợ đọc âm thanh.", "bad");
  }
}

function speakChineseAndWait(text) {
  const spokenText = formatChineseSpeechText(text);
  if (!spokenText || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    return Promise.resolve();
  }

  cancelSpeech();
  const requestId = state.speechRequestId;

  return new Promise((resolve) => {
    let settled = false;
    let fallbackTimer;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallbackTimer);
      if (requestId === state.speechRequestId) state.currentUtterance = null;
      resolve();
    };
    const utterance = new SpeechSynthesisUtterance(spokenText);
    const voices = window.speechSynthesis.getVoices?.() || [];
    const preferredVoice = voices.find((voice) => TTS_VOICE_PRIORITIES.includes(voice.name))
      || voices.find((voice) => /^zh(?:-|_)/i.test(voice.lang));
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.lang = "zh-CN";
    utterance.rate = 0.72;
    utterance.pitch = TTS_PITCH;
    utterance.volume = Math.min(TTS_VOLUME, 0.9);
    utterance.onend = finish;
    utterance.onerror = finish;
    state.currentUtterance = utterance;
    fallbackTimer = window.setTimeout(finish, Math.min(18000, Math.max(5000, spokenText.length * 900)));

    try {
      window.speechSynthesis.speak(utterance);
    } catch (_) {
      finish();
    }
  });
}

function cancelSpeech() {
  window.CCSpeech?.stop?.();
  state.currentUtterance = null;
  state.speechRequestId += 1;
}

function prepareChineseVoice() {
  return Promise.resolve(null);
}

function normalizeVoiceText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatChineseSpeechText(text) {
  const cleanText = String(text || "").trim();

  if (!cleanText) {
    return "";
  }

  // Web Speech API does not support SSML reliably; final punctuation helps avoid clipping the last syllable.
  return /[。！？!?]$/.test(cleanText) ? cleanText : `${cleanText}。`;
}

async function markLessonComplete() {
  if (state.completionSaved) return;
  state.completionSaved = true;

  const xpReward = Number(state.lesson?.xp || state.config?.xp || 10) || 10;
  const firebase = window.CCFirebase;

  try {
    if (firebase?.completeLesson) {
      const before = firebase.getCurrentStats?.() || {};
      const completedKey = `${level}-${lessonId}`;
      const alreadyCompleted = Boolean(before.completedLessonIds?.[completedKey]);
      await firebase.completeLesson({
        level,
        lessonId,
        title: state.lesson?.title || `Bài ${lessonId}`,
        xp: xpReward,
        meta: state.lesson?.desc || state.lesson?.description || ''
      });
      setFeedback(alreadyCompleted ? "Bài này đã được ghi nhận trước đó." : `Bạn đã hoàn thành bài học này. +${xpReward} XP đã được lưu.`, "good");
    } else {
      const localStats = JSON.parse(localStorage.getItem("cc_local_progress") || "{}");
      const currentXp = Number(localStats.xp || 0);
      const completedLessonIds = { ...(localStats.completedLessonIds || {}) };
      const completedKey = `${level}-${lessonId}`;
      const alreadyCompleted = Boolean(completedLessonIds[completedKey]);
      completedLessonIds[completedKey] = true;
      localStorage.setItem("cc_local_progress", JSON.stringify({
        ...localStats,
        xp: currentXp + (alreadyCompleted ? 0 : xpReward),
        todayXp: Number(localStats.todayXp || 0) + (alreadyCompleted ? 0 : xpReward),
        lastXp: alreadyCompleted ? 0 : xpReward,
        completedLessons: Object.keys(completedLessonIds).length,
        completedLessonIds
      }));
      setFeedback("Bạn đã hoàn thành bài học. Tiến độ tạm lưu trên máy, đăng nhập để đồng bộ.", "good");
    }
  } catch (error) {
    console.error("Không lưu được tiến độ bài học:", error);
    state.completionSaved = false;
    setFeedback("Hoàn thành bài học, nhưng chưa lưu được tiến độ. Vui lòng thử lại.", "bad");
  }
}

function readCompletedLessonMap(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...value };
  if (Array.isArray(value)) return Object.fromEntries(value.map((item) => [String(item), true]));
  return {};
}

function getEstimatedCourseProgress() {
  const knownLessonTotals = { hsk1: 15, hsk2: 15, hsk3: 20, hsk4: 10, hsk5: 10, hsk6: 40 };
  const totalLessons = knownLessonTotals[level] || Math.max(lessonId, 1);
  return Math.min(100, Math.round((lessonId / totalLessons) * 100));
}

async function saveCurrentWord() {
  if (state.currentPhase === "sentence") {
    setFeedback("Phần câu luyện viết không lưu vào danh sách từ.", "bad");
    return;
  }

  const vocabulary = getCurrentVocabulary();
  const firebase = window.CCFirebase;

  if (!firebase?.getCurrentUser()) {
    setFeedback("Vui lòng đăng nhập để lưu từ theo tài khoản.", "bad");
    return;
  }

  const savedData = await firebase.getUserData("savedWords", { words: [] });
  const savedWords = Array.isArray(savedData?.words) ? savedData.words : [];
  const exists = savedWords.some((item) => item.level === level && item.chinese === vocabulary.chinese);

  if (!exists) {
    savedWords.push({
      level,
      lessonId,
      chinese: vocabulary.chinese,
      pinyin: vocabulary.pinyin,
      vietnamese: vocabulary.vietnamese
    });
    await firebase.saveUserData("savedWords", { words: savedWords });
  }

  setFeedback("Đã lưu từ này.", "good");
}
