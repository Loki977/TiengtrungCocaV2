import "./assets/js/speech-service.js?v=5";
import { doc, getDocFromServer } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
  annotateWritingLesson,
  areAnswersExactlyEquivalent,
  getLessonContent,
  loadWritingAnnotations,
  normalizeAnswer,
  normalizePinyin,
  normalizeWritingLessonContent
} from "./lesson-engine.js";
import { getLessonConfig } from "./lesson-config.js";
import { SentenceStructure } from "./assets/js/sentence-structure.js";

const params = new URLSearchParams(window.location.search);
const level = (params.get("level") || "hsk1").toLowerCase();
const lessonId = Number(params.get("lesson") || 1);
const app = document.getElementById("app");
const sentenceStructure = new SentenceStructure({ level });
const DISABLE_SEQUENTIAL_LESSON_LOCK = true;
const TTS_NORMAL_RATE = 0.754; // 0.58 × 1.30; tốc độ nghe thường.
const TTS_SLOW_RATE = 0.35;
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
  mode: "cn-to-vi",
  ttsVoice: null,
  ttsVoicesReady: false,
  currentUtterance: null,
  speechRequestId: 0,
  completionSaved: false,
  isCompletingAnswer: false,
  isReadingAnswer: false,
  hasCompletedCurrentQuestion: false,
  firebase: null,
  showSentenceStructureLabels: true
};

function getLessonListUrl() {
  return level === "hsk1" ? "hsk1-writing-lessons.html" : "hsk-writing.html";
}

function waitForSharedFirebase(timeoutMs = 12000) {
  if (window.CCFirebase?.db) return Promise.resolve(window.CCFirebase);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("firebase-ready", onReady);
      reject(new Error("Firebase chưa sẵn sàng để xác minh quyền truy cập."));
    }, timeoutMs);
    function onReady() {
      if (!window.CCFirebase?.db) return;
      clearTimeout(timer);
      resolve(window.CCFirebase);
    }
    window.addEventListener("firebase-ready", onReady, { once: true });
  });
}

function getConfiguredLessonAccess(settings = {}) {
  const courseValue = settings?.courses?.[level];
  const course = courseValue && typeof courseValue === "object"
    ? courseValue
    : { enabled: courseValue !== false, lessons: {} };
  const legacyLessons = settings?.lessons?.[level] || {};
  const key = `B${lessonId}`;
  const raw = course.lessons?.[key]
    || course.lessons?.[String(lessonId)]
    || legacyLessons?.[key]
    || legacyLessons?.[String(lessonId)]
    || {};
  const enabled = course.enabled !== false && raw.enabled !== false;
  const unlockType = enabled ? (raw.unlockType || "free") : "locked";
  return { enabled, unlockType, coinCost: Math.max(0, Number(raw.coinCost || 0)) };
}

function userHasCoinUnlock(stats = {}) {
  if (stats.unlockedAll) return true;
  const opened = stats.unlockedLessons?.[level];
  return Array.isArray(opened) && opened.map(String).includes(String(lessonId));
}

function blockLesson(message, { showVip = false, firebase = null } = {}) {
  app.className = "error";
  app.innerHTML = `<div><p>${message}</p><p><a href="${getLessonListUrl()}">Quay lại danh sách bài</a></p></div>`;
  if (showVip) {
    const openPurchase = firebase?.vip?.openPurchase || window.CCVip?.openPurchase;
    openPurchase?.({
      reason: message,
      user: firebase?.getCurrentUser?.() || null,
      backUrl: getLessonListUrl()
    });
  }
}

async function verifyLessonAccessBeforeLoad() {
  app.className = "loading";
  app.textContent = "Đang xác minh quyền truy cập...";
  const firebase = await waitForSharedFirebase();
  state.firebase = firebase;
  await firebase.authReady;

  let settingsSnap;
  try {
    settingsSnap = await getDocFromServer(doc(firebase.db, "adminSettings", "learning"));
  } catch (error) {
    console.warn("[lesson-page] Không đọc được cấu hình quyền từ Firestore server.", error);
    blockLesson("Không thể xác minh quyền bài học vì kết nối Firestore đang gián đoạn. Nội dung đã được chặn để tránh lộ bài VIP.", { showVip: true, firebase });
    return false;
  }

  const settings = settingsSnap.exists() ? settingsSnap.data() : {};
  state.showSentenceStructureLabels = settings?.writing?.showSentenceStructureLabels !== false;
  const access = getConfiguredLessonAccess(settings);
  if (!access.enabled || access.unlockType === "locked") {
    blockLesson("Bài học này đang được Admin khóa hoặc cập nhật.");
    return false;
  }

  if (access.unlockType === "vip") {
    const result = await firebase.getFreshVipAccess({ syncUi: true });
    if (!result?.verified || !result?.state?.active) {
      const message = result?.reason === "unavailable"
        ? "Không thể xác minh quyền VIP vì kết nối Firestore đang gián đoạn. Nội dung VIP đã được chặn."
        : result?.reason === "signed-out"
          ? "Bài học này dành cho thành viên VIP. Hãy đăng nhập hoặc chọn gói nâng cấp."
          : result?.state?.expired
            ? "VIP của tài khoản đã hết hạn. Hãy gia hạn để tiếp tục bài học."
            : "Bài học này dành cho thành viên VIP. Chọn gói phù hợp để mở khóa.";
      blockLesson(message, { showVip: true, firebase });
      return false;
    }
  }

  if (access.unlockType === "coins") {
    const stats = firebase.getCurrentStats?.() || {};
    if (!firebase.getCurrentUser?.() || !userHasCoinUnlock(stats)) {
      blockLesson(`Bài học này cần được mở bằng ${access.coinCost} xu từ danh sách bài trước.`);
      return false;
    }
  }

  return true;
}

init();

async function init() {
  try {
    if (!Number.isInteger(lessonId) || lessonId < 1) {
      blockLesson("Mã bài học không hợp lệ.");
      return;
    }
    if (!await verifyLessonAccessBeforeLoad()) return;

    // Dữ liệu JSON/static chỉ được fetch sau khi guard quyền hoàn tất.
    state.config = getLessonConfig(level);
    const staticLesson = await getLessonContent(level, lessonId);
    const annotations = await loadWritingAnnotations();
    state.lesson = annotateWritingLesson(await loadWritingLessonOverride(staticLesson), annotations);

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

async function loadWritingLessonOverride(fallbackLesson) {
  const firebase = state.firebase || window.CCFirebase;
  if (!firebase?.db) return fallbackLesson;
  try {
    const snap = await getDocFromServer(doc(firebase.db, "writingLessonOverrides", `${level}_${lessonId}`));
    if (!snap.exists()) return fallbackLesson;
    const data = snap.data();
    return normalizeWritingLessonContent(data.content || data, fallbackLesson);
  } catch (error) {
    console.warn("[lesson-page] Không tải được CMS Luyện viết, dùng dữ liệu tĩnh.", error);
    return fallbackLesson;
  }
}

function renderShell() {
  const closeUrl = getLessonListUrl();

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
            <input id="modeViToCn" type="checkbox" />
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
            <div class="sentence-reveal" id="sentenceReveal" hidden></div>
            <input class="answer-input" id="answerInput" autocomplete="off" spellcheck="false" />
            <div class="writing-token-progress" id="answerMeter" aria-label="Tiến độ theo từng từ"></div>
            <button class="check-answer-btn" id="checkAnswerBtn" type="button">Kết quả</button>
            <div class="feedback" id="feedback" aria-live="polite"></div>
          </div>
        </article>

        <aside class="memory-panel" id="memoryPanel">
          <h2>NỘI DUNG CẦN NHỚ</h2>
          <div id="memoryBox"></div>
        </aside>
      </section>

      <section class="sentence-legend" id="sentenceLegend" hidden aria-labelledby="sentenceLegendTitle">
        <h2 id="sentenceLegendTitle">Ký hiệu cấu trúc câu</h2>
        <div class="sentence-legend__grid" id="sentenceLegendGrid"></div>
        <p>Các nhãn không có ký hiệu chuẩn sẽ hiển thị bằng ${Number(level.replace(/\D/g, "")) >= 4 ? "chữ Hán" : "tiếng Việt"}.</p>
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
    if (event.key !== "Enter") return;
    event.preventDefault();
    document.getElementById("checkAnswerBtn")?.focus();
    setFeedback("Bấm “Kết quả” để chấm đáp án.");
  });

  document.getElementById("prevBtn").addEventListener("click", goPrev);
  document.getElementById("nextBtn").addEventListener("click", goNext);
  document.getElementById("listenBtn").addEventListener("click", () => playCurrentWithButton("listenBtn", TTS_NORMAL_RATE));
  document.getElementById("slowListenBtn").addEventListener("click", () => playCurrentWithButton("slowListenBtn", TTS_SLOW_RATE));
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
  const workspace = document.querySelector(".workspace");
  document.querySelector(".lesson-shell")?.classList.toggle("is-sentence", isSentence);
  const memoryPanel = document.getElementById("memoryPanel");
  const legend = document.getElementById("sentenceLegend");
  workspace?.classList.toggle("is-sentence", isSentence);
  memoryPanel.hidden = isSentence;
  legend.hidden = !isSentence || !state.showSentenceStructureLabels;
  if (isSentence) sentenceStructure.renderLegend(document.getElementById("sentenceLegendGrid"));
  const promptWord = document.getElementById("promptWord");
  if (isSentence && prompt === item.chinese && item.components?.length) {
    promptWord.classList.add("has-components");
    sentenceStructure.render(promptWord, item.components, { showSymbols: state.showSentenceStructureLabels });
  } else {
    promptWord.classList.remove("has-components");
    promptWord.textContent = prompt;
  }
  document.getElementById("instruction").textContent = getInstructionText(isSentence);
  renderAnswerMeter(item, isAnswered || isRevealed ? getExpectedAnswerValue(item) : "", isAnswered || isRevealed);
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
  renderAnswerMeter(getCurrentItem(), input.value, false);
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
    renderAnswerMeter(item, getExpectedAnswerValue(item), true);
    renderMemory(item);
    setNextButtonState(false);
    playSuccessSound();
    launchWritingCelebration();
    return;
  }

  input.classList.add("wrong");
  input.classList.remove("correct");
  showWrongAnswerReaction();
  playFeedbackSound("sad");
  setFeedback("Chưa đúng, thử lại nhé.", "bad");
  renderAnswerMeter(item, input.value, true);
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
  renderAnswerMeter(item, getExpectedAnswerValue(item), true);
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

function playFeedbackSound(kind = "success") {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const notes = kind === "success" ? [523.25, 659.25, 783.99, 1046.5] : [392, 349.23, 293.66];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * (kind === "success" ? 0.11 : 0.18);
      oscillator.type = kind === "success" ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(kind === "success" ? 0.08 : 0.065, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + (kind === "success" ? 0.28 : 0.42));
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + (kind === "success" ? 0.3 : 0.45));
    });

    window.setTimeout(() => context.close().catch(() => {}), 1300);
  } catch (_) {
    // Audio is optional when a browser blocks sound playback.
  }
}

function playSuccessSound() {
  playFeedbackSound("success");
}

function showWrongAnswerReaction() {
  const reaction = document.createElement("span");
  reaction.className = "writing-wrong-reaction";
  reaction.textContent = "😢";
  reaction.setAttribute("aria-hidden", "true");
  document.body.appendChild(reaction);
  window.setTimeout(() => reaction.remove(), 850);
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
  const item = getCurrentItem();
  renderMemory(item);
  renderAnswerMeter(item, getExpectedAnswerValue(item), true);
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
    return areAnswersExactlyEquivalent(value, item.vietnamese, "vi");
  }

  return areAnswersExactlyEquivalent(value, item.chinese, "zh")
    || areAnswersExactlyEquivalent(value, item.pinyin, "pinyin");
}

function getExpectedAnswerValue(item) {
  if (state.mode === "cn-to-vi") {
    return String(item.vietnamese || "");
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

function getTokenStates(item, inputValue, revealResult = false) {
  const expectedTokens = getAnswerTokens(item);
  const inputTokens = getInputTokens(inputValue);

  if (!revealResult) {
    return expectedTokens.map((_, index) => inputTokens[index] ? "typing" : "pending");
  }

  if (isCorrectAnswer(inputValue, item)) {
    return expectedTokens.map(() => "correct");
  }

  return expectedTokens.map((expected, index) => {
    const entered = inputTokens[index];
    if (!entered) return "pending";
    if (entered === expected) return "correct";
    return expected.startsWith(entered) ? "typing" : "wrong";
  });
}

function renderAnswerMeter(item, inputValue = "", revealResult = false) {
  const meter = document.getElementById("answerMeter");
  const states = getTokenStates(item, inputValue, revealResult);
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
  if (isSentence) {
    const reveal = document.getElementById("sentenceReveal");
    if (state.mode === "vi-to-cn") {
      reveal.hidden = false;
      sentenceStructure.render(reveal, item.components, {
        animate: true,
        showSymbols: state.showSentenceStructureLabels
      });
    } else {
      reveal.hidden = false;
      reveal.replaceChildren();
      const translation = document.createElement("p");
      translation.className = "sentence-answer-translation";
      translation.textContent = item.vietnamese || "";
      reveal.append(translation);
    }
    return;
  }
  const wordTypes = Array.isArray(item.wordTypes) ? item.wordTypes : [];
  const chineseContent = escapeHtml(item.chinese || "...");

  document.getElementById("memoryBox").innerHTML = `
    <div class="memory-content${wordTypes.length ? " has-word-type" : ""}">
      <div class="memory-word">${chineseContent}</div>
      <p class="memory-pinyin">${escapeHtml(item.pinyin || "")}</p>
      <p class="memory-meaning">${escapeHtml(item.vietnamese || "")}</p>
      ${wordTypes.length ? `<p class="memory-word-type">${wordTypes.map(escapeHtml).join(" / ")}</p>` : ""}
      <p class="memory-note">Câu ví dụ của bài được tách sang phần luyện viết sau khi học hết từ vựng.</p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[character]);
}

function renderMemoryEmpty() {
  const isSentence = state.currentPhase === "sentence";
  const reveal = document.getElementById("sentenceReveal");
  reveal.replaceChildren();
  reveal.hidden = true;
  if (isSentence) return;
  document.getElementById("memoryBox").innerHTML = `
    <div class="memory-empty">
      Trả lời đúng hoặc bấm “Đáp án” để xem từ, pinyin và nghĩa.
    </div>
  `;
}

function setFeedback(message, type = "") {
  const feedback = document.getElementById("feedback");
  feedback.textContent = message;
  feedback.className = type ? `feedback ${type}` : "feedback";
}

async function playCurrentWithButton(buttonId, rate) {
  const button = document.getElementById(buttonId);
  if (!button || button.disabled) return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    await speakCurrent(rate, { silentOnUnsupported: true });
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

async function speakCurrent(rate = TTS_NORMAL_RATE, options = {}) {
  const item = getCurrentItem();
  if (!item?.chinese) return;
  try {
    await window.CCAudio.speak({
      text: formatChineseSpeechText(item.chinese),
      lookupText: item.chinese,
      pinyin: item.pinyin || '',
      mode: state.currentPhase === "sentence" ? "sentence" : "vocabulary",
      audioUrl: item.audio || item.audioPath || '',
      rate,
      pitch: TTS_PITCH,
      volume: TTS_VOLUME,
      lang: 'zh-CN'
    });
  } catch (error) {
    if (!options.silentOnUnsupported) setFeedback("Không thể phát âm trên trình duyệt này.", "bad");
  }
}

function speakChineseAndWait(text) {
  const spokenText = formatChineseSpeechText(text);
  if (!spokenText || !window.CCAudio?.speak) {
    return Promise.resolve();
  }
  return window.CCAudio.speak({
    text: spokenText,
    lookupText: text,
    mode: "answer",
    rate: TTS_NORMAL_RATE,
    pitch: TTS_PITCH,
    volume: Math.min(TTS_VOLUME, 0.9),
    lang: "zh-CN"
  }).catch(() => {});
}

function cancelSpeech() {
  window.CCAudio?.stop?.();
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
  const knownLessonTotals = { hsk1: 15, hsk2: 15, hsk3: 20, hsk4: 20, hsk5: 36, hsk6: 40 };
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
