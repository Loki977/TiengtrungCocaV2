import { createAuthAdapter } from './auth-adapter.js';
import { loadConfig, loadExamIndex, loadExam, loadAnswerKey, flattenQuestions } from './data-loader.js';
import { formatDuration, hasAnswer, scoreExam, evaluateWriting } from './exam-engine.js';
import { SectionTimer } from './timer.js';
import { AttemptStore, createAttemptId, getOwnerId } from './autosave.js';
import { ExamAudioController } from './audio-controller.js';
import { ReorderBoard } from './reorder-board.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const SUBJECTIVE_WRITING_TYPES = new Set(['short_writing', 'long_writing', 'summary_writing']);

const els = Object.fromEntries([
  'loadingView', 'homeView', 'introView', 'examView', 'resultView', 'userChip', 'loginBtn', 'logoutBtn',
  'examCount', 'levelCards', 'examListTitle', 'examListSummary', 'examGrid', 'emptyState', 'backToListBtn', 'introLevel', 'introStandard',
  'introTitle', 'introDescription', 'introDuration', 'introTimedDuration', 'introQuestions', 'introPassScore',
  'introSectionCards', 'soundTestBtn', 'introViBtn', 'introZhBtn', 'introAudio', 'resumeBtn', 'startBtn',
  'examLevel', 'examTitle', 'sectionProgress', 'progressText', 'timer', 'sectionName', 'partName', 'flagBtn',
  'hsk6SourceNotice', 'examAudioPanel', 'examAudioTitle', 'audioRule', 'audioPlayBtn', 'examAudio',
  'questionInstruction', 'questionPrompt', 'questionContext', 'questionContextHanzi', 'questionContextPinyin',
  'questionText', 'questionHanzi', 'questionPinyin', 'questionImage', 'answerArea', 'prevBtn', 'nextBtn',
  'answerSheet', 'closeSheetBtn', 'questionNavigator', 'finishSectionBtn', 'submitBtn', 'openSheetBtn',
  'sheetScrim', 'answeredCount', 'attemptModeLabel', 'resultTitle', 'resultScore', 'resultMaxScore',
  'resultSummary', 'resultSaveStatus', 'writingStatus', 'resultSections', 'correctCount', 'wrongCount', 'unansweredCount',
  'resultTime', 'weakTypes', 'reviewBtn', 'retryBtn', 'resultHomeBtn', 'reviewList', 'toast',
].map(id => [id, document.getElementById(id)]));

const state = {
  config: null,
  auth: null,
  index: [],
  meta: null,
  exam: null,
  questions: [],
  answers: {},
  tokenOrders: {},
  flags: {},
  mode: 'official',
  currentIndex: 0,
  currentSectionIndex: 0,
  unlockedSectionIndex: 0,
  sectionDeadline: 0,
  hsk6Phase: null,
  attemptId: null,
  store: null,
  startedAt: 0,
  submitted: false,
  lastResult: null,
  answerKey: null,
  timerRemaining: 0,
  preloadAudios: [],
  selectedLevel: 'HSK 1',
  savedResults: [],
  accessSettings: {},
};

const sectionTimer = new SectionTimer({ onTick: updateTimer, onExpire: handleTimerExpired });
const audioController = new ExamAudioController(els.examAudio, renderAudioState);

function showOnly(target) {
  [els.loadingView, els.homeView, els.introView, els.examView, els.resultView].forEach(view => {
    view.hidden = view !== target;
  });
  closeAnswerSheet();
  if (target !== els.examView) audioController.stop();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { els.toast.hidden = true; }, 3600);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);
}

function setupUser() {
  const user = state.auth.user;
  els.userChip.hidden = !user;
  els.logoutBtn.hidden = !user;
  els.loginBtn.hidden = Boolean(user);
  if (user) els.userChip.textContent = user.displayName || user.email || 'Đã đăng nhập';
}

function renderLevelCards() {
  const active = state.index.filter(item => item.active !== false);
  const availableLevels = new Set(active.map(item => item.level));
  if (!availableLevels.has(state.selectedLevel)) {
    state.selectedLevel = [...availableLevels][0] || 'HSK 1';
  }

  const chineseLevels = ['一级', '二级', '三级', '四级', '五级', '六级'];
  els.levelCards.replaceChildren();
  for (let levelNumber = 1; levelNumber <= 6; levelNumber += 1) {
    const level = `HSK ${levelNumber}`;
    const examTotal = active.filter(item => item.level === level).length;
    const selected = level === state.selectedLevel;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `level-card${selected ? ' is-selected' : ''}`;
    button.dataset.level = level;
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${level}, ${examTotal} đề thi${selected ? ', đang chọn' : ''}`);
    button.innerHTML = `
      <span class="level-card__top">
        <strong>${level}</strong>
        <span class="level-card__check" aria-hidden="true">✓</span>
      </span>
      <span class="level-card__chinese">${chineseLevels[levelNumber - 1]}</span>
      <span class="level-card__count">${examTotal} đề thi</span>`;
    button.addEventListener('click', () => {
      state.selectedLevel = level;
      renderLevelCards();
      renderExamCards();
    });
    els.levelCards.append(button);
  }
}

function effectiveAccessType(meta) {
  const configured = state.accessSettings?.exams?.[meta.id]?.accessType;
  return configured === 'vip' || configured === 'free'
    ? configured
    : (meta.accessType === 'vip' ? 'vip' : 'free');
}

function latestResultForExam(examId) {
  return state.savedResults.find(result => result.examId === examId) || null;
}

function resultCardModel(result) {
  if (!result) return null;
  const pending = Number(result.pendingWritingMax || 0) > 0 && !['passed', 'not_passed'].includes(result.finalStatus);
  const earned = pending ? Number(result.objectiveEarned || 0) : Number(result.finalEarned ?? result.objectiveEarned ?? 0);
  const maximum = pending ? Number(result.objectiveMax || 0) : Number(result.finalMax || result.objectiveMax || 0);
  return {
    pending,
    earned: Math.round(earned * 100) / 100,
    maximum: Math.round(maximum * 100) / 100,
    label: pending ? 'Chờ chấm' : (result.finalStatus === 'passed' ? 'Đạt' : 'Chưa đạt'),
    className: pending ? 'is-pending' : (result.finalStatus === 'passed' ? 'is-passed' : 'is-failed'),
  };
}

async function loadSavedResults() {
  const ownerId = getOwnerId(state.auth?.user);
  const localResults = AttemptStore.listCompleted({ ownerId });
  let remoteResults = [];
  if (state.auth?.user) {
    try {
      remoteResults = await state.auth.listResults();
    } catch (error) {
      console.warn('Không tải được kết quả cloud; dùng bản lưu trên thiết bị.', error);
    }
  }
  const merged = new Map(localResults.map(result => [result.attemptId, result]));
  remoteResults.forEach(result => merged.set(result.attemptId, result));
  state.savedResults = [...merged.values()]
    .filter(result => result?.examId && result?.attemptId)
    .sort((a, b) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0));
}

async function deleteSavedResult(result) {
  if (!window.confirm('Xóa kết quả này? Điểm và bài tự luận đã lưu của lượt thi sẽ bị xóa.')) return;
  try {
    if (state.auth.user) await state.auth.deleteResult(result.attemptId);
    AttemptStore.deleteCompleted({
      ownerId: getOwnerId(state.auth.user),
      examId: result.examId,
      attemptId: result.attemptId,
      mode: result.mode,
    });
    await loadSavedResults();
    renderExamCards();
    toast('Đã xóa kết quả lượt thi.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Không thể xóa kết quả.');
  }
}

function renderExamCards() {
  const active = state.index.filter(item => item.active !== false);
  const exams = active.filter(item => item.level === state.selectedLevel);
  els.examCount.textContent = active.length;
  els.examListTitle.textContent = `Đề thi ${state.selectedLevel}`;
  els.examListSummary.textContent = `${exams.length} đề hoàn chỉnh`;
  els.emptyState.hidden = exams.length > 0;
  els.examGrid.replaceChildren();
  exams.forEach(meta => {
    const accessType = effectiveAccessType(meta);
    const locked = accessType === 'vip' && !state.auth.isVipActive();
    const savedResult = latestResultForExam(meta.id);
    const resultModel = resultCardModel(savedResult);
    const card = document.createElement('article');
    card.className = `exam-card panel${locked ? ' is-vip-locked' : ''}`;
    card.innerHTML = `
      <div class="card-meta">
        <span class="badge">${escapeHtml(meta.level)}</span>
        <span class="meta-pill">HSK 2.0</span>
        <span class="access-pill ${accessType === 'vip' ? 'is-vip' : 'is-free'}">${accessType === 'vip' ? 'VIP' : 'Miễn phí'}</span>
      </div>
      <h3>${escapeHtml(meta.title)}</h3>
      <p>${escapeHtml(meta.description)}</p>
      <div class="exam-meta">
        <span>${meta.questionCount} câu</span>
        <span>${meta.officialTotalDurationMinutes} phút công bố</span>
        <span>${meta.timedDurationMinutes} phút tính giờ</span>
      </div>
      ${resultModel ? `
        <div class="exam-card-result ${resultModel.className}" aria-label="Kết quả gần nhất: ${resultModel.label}">
          <span><strong>${resultModel.earned}/${resultModel.maximum}</strong> điểm</span>
          <b>${resultModel.label}</b>
        </div>` : ''}
      <div class="exam-card-actions">
        <button class="btn btn-primary" data-action="open" type="button">${locked ? 'Mở khóa VIP' : 'Xem cấu trúc đề'}</button>
        ${savedResult ? '<button class="btn btn-ghost btn-delete-result" data-action="delete" type="button">Xóa kết quả</button>' : ''}
      </div>`;
    card.querySelector('[data-action="open"]').addEventListener('click', () => openIntro(meta));
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteSavedResult(savedResult));
    els.examGrid.append(card);
  });
}

async function openIntro(meta) {
  if (effectiveAccessType(meta) === 'vip' && !state.auth.isVipActive()) {
    if (!state.auth.user) {
      toast('Vui lòng đăng nhập để mở đề VIP.');
      setTimeout(() => state.auth.goToLogin(), 700);
    } else {
      toast('Đề này dành cho tài khoản VIP.');
      state.auth.openVipPurchase();
    }
    return;
  }
  try {
    showOnly(els.loadingView);
    state.meta = meta;
    state.exam = await loadExam(meta.path);
    state.questions = flattenQuestions(state.exam);
    preloadListeningWindow(0, state.exam.levelNumber === 6 ? 5 : 10);
    els.introLevel.textContent = state.exam.level;
    els.introStandard.textContent = 'HSK 2.0 hiện hành';
    els.introTitle.textContent = state.exam.title;
    els.introDescription.textContent = state.exam.description;
    els.introDuration.textContent = `${state.exam.officialTotalDurationMinutes} phút`;
    els.introTimedDuration.textContent = `${state.exam.timedDurationMinutes} phút`;
    els.introQuestions.textContent = state.exam.totalQuestionCount;
    els.introPassScore.textContent = `${state.exam.passPoints}/${state.exam.totalPoints}`;
    els.introSectionCards.replaceChildren();
    state.exam.sections.forEach(section => {
      const card = document.createElement('article');
      card.className = 'intro-section-card';
      card.innerHTML = `<span>${section.id === 'listening' ? '听' : section.id === 'reading' ? '读' : '写'}</span>
        <div><strong>${escapeHtml(section.title)}</strong><small>${section.questionCount} câu · ${section.durationMinutes} phút · ${section.parts.length} phần nhỏ</small></div>`;
      els.introSectionCards.append(card);
    });
    updateResumeButton();
    showOnly(els.introView);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Không tải được đề thi.');
    showOnly(els.homeView);
  }
}

function selectedMode() {
  return $('input[name="examMode"]:checked')?.value || 'official';
}

function latestAttempt(mode = selectedMode()) {
  if (!state.exam) return null;
  return AttemptStore.latest({ ownerId: getOwnerId(state.auth?.user), examId: state.exam.id, mode });
}

function updateResumeButton() {
  const saved = latestAttempt();
  els.resumeBtn.hidden = !saved;
  if (saved) els.resumeBtn.textContent = `Tiếp tục lượt ${saved.mode === 'official' ? 'thi thật' : 'luyện tập'}`;
}

function getSectionQuestions(sectionIndex) {
  return state.questions.filter(question => question.sectionIndex === sectionIndex);
}

function preloadListeningWindow(startIndex, count = 3) {
  const listening = state.questions.filter(question => question.sectionId === 'listening' && question.audioPath);
  state.preloadAudios.forEach(audio => {
    audio.removeAttribute('src');
    audio.load();
  });
  state.preloadAudios = listening.slice(startIndex, startIndex + count).map(question => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = question.audioPath;
    return audio;
  });
}

function firstIndexOfSection(sectionIndex) {
  return state.questions.findIndex(question => question.sectionIndex === sectionIndex);
}

function lastIndexOfSection(sectionIndex) {
  return state.questions.reduce((last, question, index) => question.sectionIndex === sectionIndex ? index : last, -1);
}

function startExam(resume = false) {
  if (!state.auth.user && state.questions.some(question => SUBJECTIVE_WRITING_TYPES.has(question.questionType))) {
    toast('Vui lòng đăng nhập để bài tự luận được lưu và giáo viên có thể chấm.');
    setTimeout(() => state.auth.goToLogin(), 800);
    return;
  }
  const mode = selectedMode();
  const saved = resume ? latestAttempt(mode) : null;
  state.store?.close();
  state.mode = mode;
  state.attemptId = saved?.attemptId || createAttemptId();
  state.store = new AttemptStore({
    ownerId: getOwnerId(state.auth.user),
    examId: state.exam.id,
    attemptId: state.attemptId,
    mode,
  });
  state.answers = saved?.answers || {};
  state.tokenOrders = saved?.tokenOrders || {};
  state.flags = saved?.flags || {};
  state.currentSectionIndex = Number.isInteger(saved?.currentSectionIndex) ? saved.currentSectionIndex : 0;
  state.unlockedSectionIndex = mode === 'practice'
    ? state.exam.sections.length - 1
    : (Number.isInteger(saved?.unlockedSectionIndex) ? saved.unlockedSectionIndex : state.currentSectionIndex);
  state.currentIndex = Number.isInteger(saved?.currentIndex) ? saved.currentIndex : firstIndexOfSection(state.currentSectionIndex);
  state.sectionDeadline = Number(saved?.sectionDeadline || 0);
  state.hsk6Phase = saved?.hsk6Phase || null;
  state.startedAt = Number(saved?.startedAt || Date.now());
  state.submitted = false;
  state.answerKey = null;
  state.lastResult = null;
  audioController.setCounts(saved?.audioPlayCounts || {});

  els.examLevel.textContent = state.exam.level;
  els.examTitle.textContent = state.exam.title;
  els.attemptModeLabel.textContent = mode === 'official' ? 'Chế độ thi thật' : 'Chế độ luyện tập';
  els.finishSectionBtn.hidden = mode !== 'official';
  els.submitBtn.hidden = mode === 'official' && state.currentSectionIndex < state.exam.sections.length - 1;
  setupSectionTimer(Boolean(saved));
  renderNavigator();
  renderQuestion();
  saveProgress();
  showOnly(els.examView);
}

function setupSectionTimer(resuming) {
  sectionTimer.stop();
  if (state.mode === 'practice') {
    els.timer.textContent = 'Luyện tập';
    els.timer.classList.remove('is-warning');
    return;
  }
  const section = state.exam.sections[state.currentSectionIndex];
  if (section.id === 'writing' && state.exam.levelNumber === 6 && !state.hsk6Phase) {
    state.hsk6Phase = 'source_reading';
  }
  let duration = section.durationMinutes * 60;
  if (state.hsk6Phase === 'source_reading') duration = 10 * 60;
  if (state.hsk6Phase === 'summary_writing') duration = 35 * 60;
  const deadline = resuming && state.sectionDeadline ? state.sectionDeadline : 0;
  state.sectionDeadline = sectionTimer.start({ durationSeconds: duration, deadline });
}

function updateTimer(seconds) {
  state.timerRemaining = seconds;
  els.timer.textContent = formatDuration(seconds);
  els.timer.classList.toggle('is-warning', seconds <= 300);
  if (seconds % 10 === 0) saveProgress();
}

function handleTimerExpired() {
  if (state.exam.levelNumber === 6 && state.exam.sections[state.currentSectionIndex].id === 'writing' && state.hsk6Phase === 'source_reading') {
    state.hsk6Phase = 'summary_writing';
    state.sectionDeadline = 0;
    setupSectionTimer(false);
    renderQuestion();
    saveProgress();
    toast('Hết 10 phút đọc. Bài nguồn đã được ẩn; bạn có 35 phút để viết tóm tắt.');
    return;
  }
  if (state.currentSectionIndex < state.exam.sections.length - 1) {
    advanceSection(true);
  } else {
    submitExam(true);
  }
}

function currentQuestion() {
  return state.questions[state.currentIndex];
}

function renderQuestion() {
  const question = currentQuestion();
  if (!question) return;
  state.currentSectionIndex = question.sectionIndex;
  const sectionQuestions = getSectionQuestions(question.sectionIndex);
  const within = sectionQuestions.findIndex(item => item.id === question.id);
  const answeredInSection = sectionQuestions.filter(item => hasAnswer(state.answers[item.id])).length;

  els.sectionName.textContent = question.sectionTitle;
  els.partName.textContent = question.partTitle;
  els.progressText.textContent = `Câu ${within + 1}/${sectionQuestions.length}`;
  els.sectionProgress.textContent = `${question.sectionTitle}: ${answeredInSection}/${sectionQuestions.length} câu đã làm`;
  els.questionInstruction.textContent = question.instruction || '';
  els.questionPrompt.textContent = question.prompt || '';
  els.questionContextHanzi.textContent = question.context || '';
  els.questionContextPinyin.textContent = question.contextPinyin || '';
  els.questionContext.hidden = !question.context;
  els.questionContextPinyin.hidden = !question.contextPinyin;
  els.questionHanzi.textContent = question.hanzi || '';
  els.questionPinyin.textContent = question.pinyin || question.promptPinyin || '';
  els.questionText.hidden = !(question.hanzi || question.promptPinyin);
  els.questionPinyin.hidden = !(question.pinyin || question.promptPinyin);
  els.questionImage.hidden = !question.imagePath;
  if (question.imagePath) {
    els.questionImage.src = question.imagePath;
    els.questionImage.alt = question.imageAlt || 'Hình minh họa câu hỏi';
  } else {
    els.questionImage.removeAttribute('src');
  }

  renderHsk6Source(question);
  renderAnswer(question);
  renderQuestionAudio(question);
  els.flagBtn.classList.toggle('is-flagged', Boolean(state.flags[question.id]));
  els.flagBtn.setAttribute('aria-pressed', String(Boolean(state.flags[question.id])));
  els.flagBtn.textContent = state.flags[question.id] ? 'Đã đánh dấu' : 'Đánh dấu câu';

  const sectionFirst = firstIndexOfSection(question.sectionIndex);
  const sectionLast = lastIndexOfSection(question.sectionIndex);
  els.prevBtn.disabled = state.mode === 'official' ? state.currentIndex <= sectionFirst : state.currentIndex === 0;
  els.nextBtn.textContent = state.currentIndex === sectionLast
    ? (question.sectionIndex === state.exam.sections.length - 1 ? 'Kiểm tra trước khi nộp' : 'Hoàn thành phần')
    : 'Câu tiếp';
  els.finishSectionBtn.hidden = state.mode !== 'official';
  els.submitBtn.hidden = state.mode === 'official' && question.sectionIndex < state.exam.sections.length - 1;
  updateNavigator();
}

function renderHsk6Source(question) {
  const isSummary = question.questionType === 'summary_writing';
  els.hsk6SourceNotice.hidden = !isSummary;
  if (!isSummary) return;
  if (state.mode === 'practice' || state.hsk6Phase === 'source_reading') {
    els.hsk6SourceNotice.innerHTML = `<strong>Giai đoạn đọc bài nguồn</strong><p>${escapeHtml(question.sourceText)}</p>
      <small>Trong chế độ thi thật, ô viết bị khóa trong 10 phút này và bài nguồn sẽ tự ẩn khi hết giờ.</small>`;
  } else {
    els.hsk6SourceNotice.innerHTML = '<strong>Giai đoạn viết tóm tắt</strong><p>Bài nguồn đã được ẩn. Hãy viết khoảng 400 chữ, chỉ tóm tắt nội dung và không thêm quan điểm cá nhân.</p>';
  }
}

function renderAnswer(question) {
  els.answerArea.replaceChildren();
  const saved = state.answers[question.id] ?? '';
  if (question.questionType === 'single_choice') {
    question.options.forEach(option => {
      const label = document.createElement('label');
      label.className = 'answer-option';
      label.innerHTML = `<input type="radio" name="answer" value="${escapeHtml(option.id)}" ${String(saved) === String(option.id) ? 'checked' : ''}>
        <span class="option-copy"><span class="option-hanzi"><strong>${escapeHtml(option.id)}.</strong> ${escapeHtml(option.text)}</span>
        ${option.pinyin ? `<span class="option-pinyin">${escapeHtml(option.pinyin)}</span>` : ''}</span>`;
      label.querySelector('input').addEventListener('change', event => setAnswer(question.id, event.target.value));
      els.answerArea.append(label);
    });
    return;
  }
  if (question.questionType === 'true_false') {
    [['true', 'Đúng'], ['false', 'Sai']].forEach(([id, text]) => {
      const label = document.createElement('label');
      label.className = 'answer-option';
      label.innerHTML = `<input type="radio" name="answer" value="${id}" ${String(saved) === id ? 'checked' : ''}><span>${text}</span>`;
      label.querySelector('input').addEventListener('change', event => setAnswer(question.id, event.target.value));
      els.answerArea.append(label);
    });
    return;
  }
  if (question.questionType === 'reorder' && Array.isArray(question.tokens)) {
    const board = new ReorderBoard({
      questionId: question.id,
      tokens: question.tokens,
      savedOrder: state.tokenOrders[question.id],
      onChange: (answer, order) => {
        state.tokenOrders[question.id] = order;
        setAnswer(question.id, answer, false);
      },
    });
    els.answerArea.append(board.element);
    return;
  }
  if (question.tokens) {
    const tokens = document.createElement('div');
    tokens.className = 'word-tokens';
    question.tokens.forEach(token => {
      const span = document.createElement('span');
      span.textContent = token;
      tokens.append(span);
    });
    els.answerArea.append(tokens);
  }
  const long = ['long_writing', 'summary_writing'].includes(question.questionType);
  const input = document.createElement(long ? 'textarea' : 'input');
  input.className = long ? 'answer-textarea' : 'answer-input';
  input.value = saved;
  input.placeholder = question.placeholder || 'Nhập câu trả lời';
  if (long) input.rows = 10;
  const sourceLocked = question.questionType === 'summary_writing'
    && state.mode === 'official'
    && state.hsk6Phase === 'source_reading';
  input.disabled = sourceLocked;
  const helper = document.createElement('div');
  helper.className = 'writing-helper';
  const updateHelper = () => {
    if (!long) return;
    const check = evaluateWriting(question, input.value);
    helper.textContent = `${check.characters} chữ${check.targetCharacters ? ` / mục tiêu ${check.targetCharacters}` : ''}`
      + (check.missingWords.length ? ` · Còn thiếu: ${check.missingWords.join('、')}` : '');
  };
  input.addEventListener('input', event => {
    setAnswer(question.id, event.target.value, false);
    updateHelper();
  });
  input.addEventListener('blur', () => saveProgress());
  els.answerArea.append(input);
  if (long) {
    updateHelper();
    els.answerArea.append(helper);
  }
}

function setAnswer(questionId, value, rerender = true) {
  state.answers[questionId] = value;
  saveProgress();
  if (rerender) updateNavigator();
  else updateAnsweredCount();
}

function renderQuestionAudio(question) {
  const listening = question.sectionId === 'listening' && question.audioPath;
  els.examAudioPanel.hidden = !listening;
  if (!listening) {
    audioController.stop();
    return;
  }
  const changed = audioController.setQuestion(question, state.mode);
  els.examAudioTitle.textContent = `Audio ${question.partTitle.toLowerCase()} · câu ${question.questionIndex + 1}`;
  els.audioRule.textContent = state.mode === 'official'
    ? `Phát tự động tối đa ${question.repeatCount} lần; không tua hoặc nghe lại.`
    : 'Chế độ luyện tập cho phép nghe lại.';
  if (state.mode === 'official' && changed && audioController.canPlay()) {
    window.setTimeout(() => audioController.play().catch(() => {
      toast('Trình duyệt chặn phát tự động. Hãy bấm “Phát audio”.');
    }), 120);
  }
  const listeningIndex = state.questions.filter(item => item.sectionId === 'listening').findIndex(item => item.id === question.id);
  if (listeningIndex >= 0) preloadListeningWindow(listeningIndex + 1, 3);
}

function renderAudioState(audioState) {
  const playing = Boolean(audioState.playing);
  els.audioPlayBtn.textContent = playing ? 'Đang phát…' : 'Phát audio';
  els.audioPlayBtn.setAttribute('aria-pressed', String(playing));
  els.audioPlayBtn.disabled = playing || (state.mode === 'official' && audioState.ended);
  if (state.store && Number(audioState.playCount) > 0) saveProgress();
}

function renderNavigator() {
  els.questionNavigator.replaceChildren();
  state.exam.sections.forEach((section, sectionIndex) => {
    const group = document.createElement('section');
    group.className = 'navigator-section';
    group.dataset.sectionIndex = sectionIndex;
    group.innerHTML = `<div class="navigator-section__title"><strong>${escapeHtml(section.title)}</strong><span></span></div><div class="navigator-numbers"></div>`;
    const holder = group.querySelector('.navigator-numbers');
    getSectionQuestions(sectionIndex).forEach((question, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-number';
      button.textContent = index + 1;
      button.dataset.questionId = question.id;
      button.dataset.index = state.questions.indexOf(question);
      button.setAttribute('aria-label', `${section.title}, câu ${index + 1}`);
      button.addEventListener('click', () => navigateTo(Number(button.dataset.index)));
      holder.append(button);
    });
    els.questionNavigator.append(group);
  });
  updateNavigator();
}

function updateNavigator() {
  $$('.navigator-section').forEach(group => {
    const sectionIndex = Number(group.dataset.sectionIndex);
    const locked = state.mode === 'official' && sectionIndex !== state.currentSectionIndex;
    group.classList.toggle('is-locked', locked);
    const sectionQuestions = getSectionQuestions(sectionIndex);
    const answered = sectionQuestions.filter(question => hasAnswer(state.answers[question.id])).length;
    group.querySelector('.navigator-section__title span').textContent = `${answered}/${sectionQuestions.length}`;
    group.querySelectorAll('.nav-number').forEach(button => {
      const questionId = button.dataset.questionId;
      button.disabled = locked;
      button.classList.toggle('is-current', Number(button.dataset.index) === state.currentIndex);
      button.classList.toggle('is-answered', hasAnswer(state.answers[questionId]));
      button.classList.toggle('is-flagged', Boolean(state.flags[questionId]));
    });
  });
  updateAnsweredCount();
}

function updateAnsweredCount() {
  const answered = state.questions.filter(question => hasAnswer(state.answers[question.id])).length;
  els.answeredCount.textContent = `${answered}/${state.questions.length}`;
}

function navigateTo(index) {
  const target = state.questions[index];
  if (!target) return;
  if (state.mode === 'official' && target.sectionIndex !== state.currentSectionIndex) {
    toast(target.sectionIndex < state.currentSectionIndex ? 'Phần này đã bị khóa.' : 'Bạn chưa thể mở phần tiếp theo.');
    return;
  }
  state.currentIndex = index;
  renderQuestion();
  saveProgress();
  closeAnswerSheet();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextQuestion() {
  const question = currentQuestion();
  const sectionLast = lastIndexOfSection(question.sectionIndex);
  if (state.currentIndex < sectionLast) {
    navigateTo(state.currentIndex + 1);
    return;
  }
  if (state.mode === 'official' && question.sectionIndex < state.exam.sections.length - 1) {
    advanceSection(false);
  } else if (question.sectionIndex === state.exam.sections.length - 1) {
    toast('Bạn đang ở câu cuối. Hãy kiểm tra phiếu trả lời trước khi nộp.');
    openAnswerSheet();
  } else {
    navigateTo(state.currentIndex + 1);
  }
}

function advanceSection(auto) {
  const section = state.exam.sections[state.currentSectionIndex];
  const unanswered = getSectionQuestions(state.currentSectionIndex).filter(question => !hasAnswer(state.answers[question.id])).length;
  if (!auto) {
    const message = unanswered
      ? `Phần ${section.title} còn ${unanswered} câu trống. Khi chuyển phần bạn không thể quay lại. Vẫn tiếp tục?`
      : `Kết thúc phần ${section.title}? Sau khi chuyển phần bạn không thể quay lại.`;
    if (!window.confirm(message)) return;
  }
  audioController.stop();
  state.currentSectionIndex += 1;
  state.unlockedSectionIndex = state.currentSectionIndex;
  state.currentIndex = firstIndexOfSection(state.currentSectionIndex);
  state.sectionDeadline = 0;
  state.hsk6Phase = null;
  setupSectionTimer(false);
  renderNavigator();
  renderQuestion();
  saveProgress();
  toast(auto ? `Hết giờ. Đã chuyển sang phần ${state.exam.sections[state.currentSectionIndex].title}.` : `Đã bắt đầu phần ${state.exam.sections[state.currentSectionIndex].title}.`);
}

function saveProgress() {
  if (!state.store || state.submitted) return;
  try {
    state.store.save({
      answers: state.answers,
      tokenOrders: state.tokenOrders,
      flags: state.flags,
      currentIndex: state.currentIndex,
      currentSectionIndex: state.currentSectionIndex,
      unlockedSectionIndex: state.unlockedSectionIndex,
      sectionDeadline: state.sectionDeadline,
      hsk6Phase: state.hsk6Phase,
      audioPlayCounts: audioController.getCounts(),
      startedAt: state.startedAt,
      standardVersion: state.exam.standardVersion,
    });
  } catch (error) {
    toast(error.message);
  }
}

async function submitExam(auto = false) {
  if (state.submitted) return;
  const unanswered = state.questions.filter(question => !hasAnswer(state.answers[question.id])).length;
  if (!auto && !window.confirm(unanswered ? `Bạn còn ${unanswered} câu trống. Vẫn nộp bài?` : 'Nộp bài ngay?')) return;
  state.submitted = true;
  sectionTimer.stop();
  audioController.stop();
  try {
    state.answerKey = await loadAnswerKey(state.exam);
    const result = scoreExam(state.exam, state.questions, state.answerKey, state.answers);
    result.elapsedSeconds = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
    result.examId = state.exam.id;
    result.attemptId = state.attemptId;
    result.mode = state.mode;
    result.standardVersion = state.exam.standardVersion;
    const subjectiveAnswers = Object.fromEntries(state.questions
      .filter(question => SUBJECTIVE_WRITING_TYPES.has(question.questionType) && hasAnswer(state.answers[question.id]))
      .map(question => [question.id, state.answers[question.id]]));
    result.writingSyncStatus = Object.keys(subjectiveAnswers).length ? 'syncing' : 'not_needed';
    result.cloudSyncStatus = state.auth.user ? 'syncing' : 'local_only';
    result.writingSubmissionIds = [];
    state.lastResult = result;
    state.store.complete(result);
    if (state.auth.user) {
      if (Object.keys(subjectiveAnswers).length) {
        try {
          const submitted = await state.auth.submitWritingAttempt({
            attemptId:state.attemptId,
            testId:state.exam.id,
            answers:state.answers,
            mode:state.mode,
            elapsedSeconds:result.elapsedSeconds,
          });
          result.writingSyncStatus = 'submitted';
          result.cloudSyncStatus = 'synced';
          result.writingSubmissionIds = submitted.submissions.map(item => item.submissionId);
          result.writingSubmissions = submitted.submissions;
        } catch (error) {
          console.warn('Không gửi được bài tự luận; bản local vẫn an toàn.', error);
          result.writingSyncStatus = 'failed';
          result.cloudSyncStatus = 'sync_failed';
          result.writingSyncErrorCode = error.code || 'writing_sync_failed';
        }
      } else {
        try {
          await state.auth.syncResult?.(result);
          result.cloudSyncStatus = 'synced';
        } catch (error) {
          result.cloudSyncStatus = 'sync_failed';
          console.warn('Không đồng bộ được kết quả; bản local vẫn an toàn.', error);
        }
      }
      state.store.updateCompleted(result);
    }
    renderResult(auto);
    showOnly(els.resultView);
  } catch (error) {
    state.submitted = false;
    console.error(error);
    toast('Chưa thể chấm bài. Bài làm vẫn được lưu; hãy thử lại.');
  }
}

function renderResult(auto) {
  const result = state.lastResult;
  els.resultTitle.textContent = state.exam.title;
  els.resultScore.textContent = result.objectiveEarned;
  els.resultMaxScore.textContent = result.pendingWritingMax ? result.objectiveMax : result.finalMax;
  els.resultSummary.textContent = auto
    ? 'Hệ thống đã tự kết thúc lượt thi khi hết giờ.'
    : (result.pendingWritingMax ? 'Đã chấm các câu khách quan. Bài tự luận chưa được cộng vào tổng điểm.' : (result.finalStatus === 'passed' ? 'Bạn đã đạt ngưỡng của đề.' : 'Bạn chưa đạt ngưỡng của đề.'));
  els.resultSaveStatus.textContent = result.cloudSyncStatus === 'synced'
    ? 'Đã lưu trên tài khoản và thiết bị này.'
    : (result.cloudSyncStatus === 'sync_failed'
      ? 'Đã lưu trên thiết bị; chưa đồng bộ được lên tài khoản.'
      : 'Đã lưu trên thiết bị này.');
  els.writingStatus.hidden = !result.pendingWritingMax;
  if (result.pendingWritingMax) {
    const syncFailed = result.writingSyncStatus === 'failed';
    els.writingStatus.innerHTML = `
      <strong>${syncFailed ? 'Bài tự luận chưa gửi được' : 'Đang chờ giáo viên chấm'}</strong>
      <p>Điểm hiện tại là ${result.objectiveEarned}/${result.objectiveMax}. Còn ${result.pendingWritingMax} điểm tự luận chờ chấm theo rubric.</p>
      <p>${syncFailed
        ? 'Bài làm vẫn còn trên thiết bị này. Hãy kiểm tra mạng rồi gửi lại.'
        : 'Giáo viên được ưu tiên chấm trước; AI chỉ chấm dự phòng nếu bài vẫn chưa được xử lý sau 4 giờ.'}</p>
      ${syncFailed ? '<button class="btn" id="retryWritingSyncBtn" type="button">Gửi lại bài tự luận</button>' : ''}`;
    document.getElementById('retryWritingSyncBtn')?.addEventListener('click', retryWritingSubmission);
  }
  els.resultSections.replaceChildren();
  result.sections.forEach(section => {
    const item = document.createElement('article');
    item.innerHTML = `<span>${escapeHtml(section.title)}</span><strong>${section.earned}/${section.objectiveMax}${section.pendingMax ? ` + ${section.pendingMax} chờ chấm` : ''}</strong><small>${section.correct}/${section.total} câu khách quan đúng</small>`;
    els.resultSections.append(item);
  });
  els.correctCount.textContent = result.correct;
  els.wrongCount.textContent = result.wrong;
  els.unansweredCount.textContent = result.unanswered;
  els.resultTime.textContent = formatDuration(result.elapsedSeconds);
  els.weakTypes.hidden = !result.weakTypes.length;
  if (result.weakTypes.length) {
    els.weakTypes.innerHTML = `<strong>Dạng câu cần luyện thêm:</strong> ${result.weakTypes.map(item => `${escapeHtml(item.type)} (${item.correct}/${item.total})`).join(', ')}`;
  }
  els.reviewList.hidden = true;
  els.reviewBtn.textContent = 'Xem đáp án & transcript';
}

async function retryWritingSubmission(event) {
  const button = event?.currentTarget;
  if (!state.auth.user || !state.lastResult || state.lastResult.writingSyncStatus !== 'failed') return;
  button.disabled = true;
  button.textContent = 'Đang gửi…';
  try {
    const submitted = await state.auth.submitWritingAttempt({
      attemptId:state.attemptId,
      testId:state.exam.id,
      answers:state.answers,
      mode:state.mode,
      elapsedSeconds:state.lastResult.elapsedSeconds,
    });
    state.lastResult.writingSyncStatus = 'submitted';
    state.lastResult.cloudSyncStatus = 'synced';
    state.lastResult.writingSyncErrorCode = null;
    state.lastResult.writingSubmissionIds = submitted.submissions.map(item => item.submissionId);
    state.lastResult.writingSubmissions = submitted.submissions;
    state.store.updateCompleted(state.lastResult);
    renderResult(false);
    toast('Đã gửi bài tự luận. Giáo viên có thể chấm trên CMS.');
  } catch (error) {
    console.warn(error);
    button.disabled = false;
    button.textContent = 'Gửi lại bài tự luận';
    toast('Vẫn chưa gửi được. Bài làm trên thiết bị này chưa bị mất.');
  }
}

function renderReview() {
  if (!state.lastResult || !state.answerKey) return;
  els.reviewList.replaceChildren();
  state.lastResult.details.forEach((detail, index) => {
    const article = document.createElement('article');
    article.className = `review-item ${detail.isCorrect === true ? 'is-correct' : detail.isCorrect === false ? 'is-wrong' : 'is-pending'}`;
    const answer = detail.keyEntry?.correctAnswer ?? detail.keyEntry?.acceptedAnswers?.join(' / ') ?? 'Chấm theo rubric';
    article.innerHTML = `<span class="eyebrow">${escapeHtml(detail.question.sectionTitle)} · Câu ${index + 1}</span>
      <h3>${escapeHtml(detail.question.prompt)}</h3>
      <p><strong>Bạn trả lời:</strong> ${escapeHtml(detail.userAnswer || 'Bỏ trống')}</p>
      <p><strong>Đáp án/chấm:</strong> ${escapeHtml(answer)}</p>
      ${detail.question.transcript ? `<details><summary>Transcript</summary><p lang="zh-CN">${escapeHtml(detail.question.transcript)}</p></details>` : ''}
      ${detail.keyEntry?.explanation ? `<p class="explanation">${escapeHtml(detail.keyEntry.explanation)}</p>` : ''}
      ${detail.writingCheck ? `<p>Kiểm tra cơ bản: ${detail.writingCheck.characters} chữ; ${detail.writingCheck.missingWords.length ? `thiếu ${escapeHtml(detail.writingCheck.missingWords.join('、'))}` : 'đủ từ bắt buộc'}.</p>` : ''}`;
    els.reviewList.append(article);
  });
  els.reviewList.hidden = false;
  els.reviewBtn.textContent = 'Ẩn đáp án';
  els.reviewList.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function playIntro(path, button) {
  if (!path) return;
  try {
    els.introAudio.pause();
    els.introAudio.src = path;
    button.disabled = true;
    await els.introAudio.play();
    els.introAudio.addEventListener('ended', () => { button.disabled = false; }, { once: true });
  } catch (error) {
    button.disabled = false;
    console.error(error);
    toast('Không thể phát audio hướng dẫn.');
  }
}

function openAnswerSheet() {
  els.answerSheet.classList.add('is-open');
  els.sheetScrim.hidden = false;
  els.openSheetBtn.setAttribute('aria-expanded', 'true');
}

function closeAnswerSheet() {
  els.answerSheet?.classList.remove('is-open');
  if (els.sheetScrim) els.sheetScrim.hidden = true;
  els.openSheetBtn?.setAttribute('aria-expanded', 'false');
}

function bindEvents() {
  els.backToListBtn.addEventListener('click', () => showOnly(els.homeView));
  $$('input[name="examMode"]').forEach(input => input.addEventListener('change', updateResumeButton));
  els.startBtn.addEventListener('click', () => startExam(false));
  els.resumeBtn.addEventListener('click', () => startExam(true));
  els.prevBtn.addEventListener('click', () => navigateTo(state.currentIndex - 1));
  els.nextBtn.addEventListener('click', nextQuestion);
  els.finishSectionBtn.addEventListener('click', () => {
    if (state.currentSectionIndex < state.exam.sections.length - 1) advanceSection(false);
    else submitExam(false);
  });
  els.submitBtn.addEventListener('click', () => submitExam(false));
  els.flagBtn.addEventListener('click', () => {
    const question = currentQuestion();
    state.flags[question.id] = !state.flags[question.id];
    renderQuestion();
    saveProgress();
  });
  els.audioPlayBtn.addEventListener('click', () => audioController.play().catch(error => toast(error.message || 'Không thể phát audio.')));
  els.soundTestBtn.addEventListener('click', () => playIntro(state.exam.introAudio.soundTest, els.soundTestBtn));
  els.introViBtn.addEventListener('click', () => playIntro(state.exam.introAudio.vi, els.introViBtn));
  els.introZhBtn.addEventListener('click', () => playIntro(state.exam.introAudio.zh, els.introZhBtn));
  els.openSheetBtn.addEventListener('click', openAnswerSheet);
  els.closeSheetBtn.addEventListener('click', closeAnswerSheet);
  els.sheetScrim.addEventListener('click', closeAnswerSheet);
  els.reviewBtn.addEventListener('click', () => {
    if (els.reviewList.hidden) renderReview();
    else {
      els.reviewList.hidden = true;
      els.reviewBtn.textContent = 'Xem đáp án & transcript';
    }
  });
  els.retryBtn.addEventListener('click', () => {
    showOnly(els.introView);
    updateResumeButton();
  });
  els.resultHomeBtn.addEventListener('click', async () => {
    await loadSavedResults();
    renderExamCards();
    showOnly(els.homeView);
  });
  els.loginBtn.addEventListener('click', () => state.auth.goToLogin());
  els.logoutBtn.addEventListener('click', async () => {
    await state.auth.signOut();
    location.reload();
  });
  window.addEventListener('beforeunload', event => {
    saveProgress();
    if (!state.submitted && !els.examView.hidden) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      saveProgress();
      els.examAudio.pause();
    }
  });
}

async function init() {
  bindEvents();
  try {
    state.config = await loadConfig();
    state.auth = await createAuthAdapter(state.config);
    setupUser();
    state.index = await loadExamIndex(state.config);
    const [accessSettings] = await Promise.all([
      state.auth.getExamAccessSettings().catch(error => {
        console.warn('Không tải được cấu hình quyền đề thi; dùng cấu hình mặc định.', error);
        return {};
      }),
      loadSavedResults(),
    ]);
    state.accessSettings = accessSettings || {};
    renderLevelCards();
    renderExamCards();
    showOnly(els.homeView);
  } catch (error) {
    console.error(error);
    els.loadingView.innerHTML = `<p>Không thể khởi tạo phòng thi: ${escapeHtml(error.message)}</p>`;
  }
}

init();
