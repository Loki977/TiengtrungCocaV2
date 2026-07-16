import { createAuthAdapter } from './auth-adapter.js';
import { loadConfig, loadExamIndex, loadExam } from './data-loader.js';
import { flattenQuestions, scoreExam, formatDuration } from './exam-engine.js';

const $ = selector => document.querySelector(selector);

const els = {
  authGate: $('#authGate'),
  loadingView: $('#loadingView'),
  homeView: $('#homeView'),
  introView: $('#introView'),
  examView: $('#examView'),
  resultView: $('#resultView'),
  loginBtn: $('#loginBtn'),
  logoutBtn: $('#logoutBtn'),
  userChip: $('#userChip'),
  examCount: $('#examCount'),
  levelFilter: $('#levelFilter'),
  examGrid: $('#examGrid'),
  emptyState: $('#emptyState'),
  backToListBtn: $('#backToListBtn'),
  introLevel: $('#introLevel'),
  introTitle: $('#introTitle'),
  introDescription: $('#introDescription'),
  introDuration: $('#introDuration'),
  introQuestions: $('#introQuestions'),
  introPassScore: $('#introPassScore'),
  introInstructions: $('#introInstructions'),
  resumeBtn: $('#resumeBtn'),
  startBtn: $('#startBtn'),
  examLevel: $('#examLevel'),
  examTitle: $('#examTitle'),
  progressText: $('#progressText'),
  timer: $('#timer'),
  sectionName: $('#sectionName'),
  questionPoints: $('#questionPoints'),
  examAudioPanel: $('#examAudioPanel'),
  examAudioTitle: $('#examAudioTitle'),
  audioPlayBtn: $('#audioPlayBtn'),
  examAudio: $('#examAudio'),
  questionPrompt: $('#questionPrompt'),
  questionContext: $('#questionContext'),
  questionContextHanzi: $('#questionContextHanzi'),
  questionContextPinyin: $('#questionContextPinyin'),
  questionText: $('#questionText'),
  questionHanzi: $('#questionHanzi'),
  questionPinyin: $('#questionPinyin'),
  questionImage: $('#questionImage'),
  answerArea: $('#answerArea'),
  prevBtn: $('#prevBtn'),
  nextBtn: $('#nextBtn'),
  answeredCount: $('#answeredCount'),
  questionNavigator: $('#questionNavigator'),
  submitBtn: $('#submitBtn'),
  resultTitle: $('#resultTitle'),
  resultScore: $('#resultScore'),
  resultMaxScore: $('#resultMaxScore'),
  resultSummary: $('#resultSummary'),
  resultSections: $('#resultSections'),
  correctCount: $('#correctCount'),
  wrongCount: $('#wrongCount'),
  resultTime: $('#resultTime'),
  reviewBtn: $('#reviewBtn'),
  retryBtn: $('#retryBtn'),
  resultHomeBtn: $('#resultHomeBtn'),
  reviewList: $('#reviewList'),
  toast: $('#toast')
};

const state = {
  config: null,
  auth: null,
  index: [],
  selectedMeta: null,
  exam: null,
  questions: [],
  answers: {},
  currentIndex: 0,
  remainingSeconds: 0,
  startedAt: 0,
  timerId: null,
  submitted: false,
  lastResult: null,
  audioTimes: {},
  lastAudioSaveSecond: -1
};

function showOnly(target) {
  for (const view of [els.loadingView, els.homeView, els.introView, els.examView, els.resultView, els.authGate]) {
    view.hidden = view !== target;
  }
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { els.toast.hidden = true; }, 2800);
}

function storageKey(examId) {
  const uid = state.auth?.user?.uid || 'guest';
  return `thi-thu:progress:${uid}:${examId}`;
}

function rememberAudioTime() {
  const questionId = els.examAudio.dataset.questionId;
  if (!questionId || !Number.isFinite(els.examAudio.currentTime)) return;
  state.audioTimes[questionId] = Number(els.examAudio.currentTime || 0);
}

function saveProgress() {
  if (!state.exam || state.submitted) return;
  rememberAudioTime();
  localStorage.setItem(storageKey(state.exam.id), JSON.stringify({
    answers: state.answers,
    currentIndex: state.currentIndex,
    remainingSeconds: state.remainingSeconds,
    startedAt: state.startedAt,
    audioTimes: state.audioTimes,
    savedAt: Date.now()
  }));
}

function readProgress(examId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(examId)) || 'null');
  } catch {
    return null;
  }
}

function clearProgress() {
  if (state.exam) localStorage.removeItem(storageKey(state.exam.id));
}

function setupUser() {
  const user = state.auth.user;
  if (!user) return;
  els.userChip.textContent = user.displayName || user.email || 'Đã đăng nhập';
  els.userChip.hidden = false;
  els.logoutBtn.hidden = false;
}

function populateFilters() {
  const levels = [...new Set(state.index.map(item => item.level).filter(Boolean))];
  for (const level of levels) {
    const option = document.createElement('option');
    option.value = level;
    option.textContent = level;
    els.levelFilter.append(option);
  }
}

function renderExamCards() {
  const level = els.levelFilter.value;
  const exams = state.index.filter(exam => exam.active !== false && (level === 'all' || exam.level === level));

  els.examGrid.innerHTML = '';
  els.emptyState.hidden = exams.length > 0;
  els.examCount.textContent = state.index.filter(exam => exam.active !== false).length;

  for (const exam of exams) {
    const card = document.createElement('article');
    card.className = 'exam-card panel';
    card.innerHTML = `
      <div class="card-meta">
        <span class="badge">${escapeHtml(exam.level || 'HSK')}</span>
        <span class="meta-pill">${Number(exam.durationMinutes || 0)} phút</span>
        <span class="meta-pill">${Number(exam.questionCount || 0)} câu</span>
      </div>
      <h3>${escapeHtml(exam.title)}</h3>
      <p>${escapeHtml(exam.description || '')}</p>
      <button class="btn btn-primary" type="button">Xem đề thi</button>
    `;
    card.querySelector('button').addEventListener('click', () => openIntro(exam));
    els.examGrid.append(card);
  }
}

async function openIntro(meta) {
  try {
    showOnly(els.loadingView);
    state.selectedMeta = meta;
    state.exam = await loadExam(meta.path);
    state.questions = flattenQuestions(state.exam);

    els.introLevel.textContent = state.exam.level;
    els.introTitle.textContent = state.exam.title;
    els.introDescription.textContent = state.exam.description || '';
    els.introDuration.textContent = `${state.exam.durationMinutes} phút`;
    els.introQuestions.textContent = state.questions.length;
    els.introPassScore.textContent = state.exam.passPoints
      ? `${state.exam.passPoints}/${state.exam.totalPoints || 200}`
      : `${state.exam.passScore || 60}%`;
    els.introInstructions.textContent = state.exam.instructions || 'Không tải lại trang trong lúc làm bài.';

    const saved = readProgress(state.exam.id);
    els.resumeBtn.hidden = !saved;
    showOnly(els.introView);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Không tải được đề thi.');
    showOnly(els.homeView);
  }
}

function startExam(resume = false) {
  const saved = resume ? readProgress(state.exam.id) : null;
  state.answers = saved?.answers || {};
  state.currentIndex = Number.isInteger(saved?.currentIndex) ? saved.currentIndex : 0;
  state.remainingSeconds = Number.isFinite(saved?.remainingSeconds)
    ? saved.remainingSeconds
    : state.exam.durationMinutes * 60;
  state.startedAt = saved?.startedAt || Date.now();
  state.submitted = false;
  state.lastResult = null;
  state.audioTimes = saved?.audioTimes || {};
  state.lastAudioSaveSecond = -1;

  els.examAudio.pause();
  els.examAudio.removeAttribute('src');
  delete els.examAudio.dataset.questionId;
  els.examAudio.load();

  els.examLevel.textContent = state.exam.level;
  els.examTitle.textContent = state.exam.title;
  renderNavigator();
  renderQuestion();
  startTimer();
  showOnly(els.examView);
}

function startTimer() {
  clearInterval(state.timerId);
  updateTimer();
  state.timerId = setInterval(() => {
    state.remainingSeconds -= 1;
    updateTimer();
    if (state.remainingSeconds <= 0) {
      submitExam(true);
    } else if (state.remainingSeconds % 10 === 0) {
      saveProgress();
    }
  }, 1000);
}

function updateTimer() {
  els.timer.textContent = formatDuration(state.remainingSeconds);
  els.timer.classList.toggle('is-warning', state.remainingSeconds <= 300);
}

function renderQuestion() {
  const question = state.questions[state.currentIndex];
  if (!question) return;

  rememberAudioTime();

  els.progressText.textContent = `Câu ${state.currentIndex + 1}/${state.questions.length}`;
  els.sectionName.textContent = question.part || question.sectionTitle;
  els.questionPoints.textContent = `${question.points} điểm`;
  els.questionPrompt.textContent = question.prompt;
  els.questionContextHanzi.textContent = question.context || '';
  els.questionContextPinyin.textContent = question.contextPinyin || '';
  els.questionContextPinyin.hidden = !question.contextPinyin;
  els.questionContext.hidden = !question.context;
  els.questionHanzi.textContent = question.hanzi || '';
  els.questionPinyin.textContent = question.pinyin || '';
  els.questionPinyin.hidden = !question.pinyin;
  els.questionText.hidden = !question.hanzi;
  els.questionImage.src = question.image || '';
  els.questionImage.alt = question.imageAlt || `Minh họa cho câu ${state.currentIndex + 1}`;
  els.questionImage.hidden = !question.image;
  const audioSrc = question.audio || '';
  const isListening = question.sectionId === 'listening' && Boolean(audioSrc);
  els.examAudioPanel.hidden = !isListening;
  if (isListening) {
    els.examAudioTitle.textContent = `Audio câu ${state.currentIndex + 1}`;
    if (els.examAudio.dataset.questionId !== question.id) {
      els.examAudio.pause();
      setAudioButtonState(false);
      els.examAudio.dataset.questionId = question.id;
      state.lastAudioSaveSecond = -1;
      els.examAudio.src = audioSrc;
      els.examAudio.load();
      const savedTime = Number(state.audioTimes[question.id] || 0);
      if (savedTime > 0) {
        els.examAudio.addEventListener('loadedmetadata', () => {
          els.examAudio.currentTime = Math.min(savedTime, Math.max(0, els.examAudio.duration - 0.1));
        }, { once: true });
      }
    }
  } else if (!els.examAudio.paused) {
    els.examAudio.pause();
    setAudioButtonState(false);
  }
  els.answerArea.innerHTML = '';

  if (question.type === 'single_choice') {
    for (const option of question.options) {
      const label = document.createElement('label');
      label.className = 'answer-option';
      const checked = String(state.answers[question.id]) === String(option.id);
      label.innerHTML = `
        <input type="radio" name="answer" value="${escapeAttr(option.id)}" ${checked ? 'checked' : ''}>
        <span class="option-copy">
          <span class="option-hanzi"><strong>${escapeHtml(option.id)}.</strong> ${escapeHtml(option.text)}</span>
          ${option.pinyin ? `<span class="option-pinyin">${escapeHtml(option.pinyin)}</span>` : ''}
        </span>
      `;
      label.querySelector('input').addEventListener('change', event => {
        state.answers[question.id] = event.target.value;
        saveProgress();
        renderNavigator();
      });
      els.answerArea.append(label);
    }
  } else if (question.type === 'true_false') {
    for (const option of [
      { id: 'true', text: 'Đúng' },
      { id: 'false', text: 'Sai' }
    ]) {
      const label = document.createElement('label');
      label.className = 'answer-option';
      const checked = String(state.answers[question.id]) === option.id;
      label.innerHTML = `
        <input type="radio" name="answer" value="${option.id}" ${checked ? 'checked' : ''}>
        <span>${option.text}</span>
      `;
      label.querySelector('input').addEventListener('change', event => {
        state.answers[question.id] = event.target.value;
        saveProgress();
        renderNavigator();
      });
      els.answerArea.append(label);
    }
  } else if (question.type === 'fill_blank') {
    const input = document.createElement('input');
    input.className = 'answer-input';
    input.placeholder = question.placeholder || 'Nhập câu trả lời';
    input.value = state.answers[question.id] || '';
    input.addEventListener('input', event => {
      state.answers[question.id] = event.target.value;
      saveProgress();
      renderNavigator();
    });
    els.answerArea.append(input);
  }

  els.prevBtn.disabled = state.currentIndex === 0;
  els.nextBtn.textContent = state.currentIndex === state.questions.length - 1 ? 'Kiểm tra trước khi nộp' : 'Câu tiếp';
  updateNavigatorCurrent();
}

function renderNavigator() {
  els.questionNavigator.innerHTML = '';
  state.questions.forEach((question, index) => {
    const button = document.createElement('button');
    button.className = 'nav-number';
    button.type = 'button';
    button.textContent = index + 1;
    if (hasAnswer(state.answers[question.id])) button.classList.add('is-answered');
    if (index === state.currentIndex) button.classList.add('is-current');
    button.addEventListener('click', () => {
      state.currentIndex = index;
      renderQuestion();
      saveProgress();
    });
    els.questionNavigator.append(button);
  });
  updateAnsweredCount();
}

function updateNavigatorCurrent() {
  [...els.questionNavigator.children].forEach((button, index) => {
    button.classList.toggle('is-current', index === state.currentIndex);
    button.classList.toggle('is-answered', hasAnswer(state.answers[state.questions[index].id]));
  });
  updateAnsweredCount();
}

function updateAnsweredCount() {
  const answered = state.questions.filter(question => hasAnswer(state.answers[question.id])).length;
  els.answeredCount.textContent = `${answered}/${state.questions.length}`;
}

function hasAnswer(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function submitExam(auto = false) {
  if (state.submitted) return;

  const answered = state.questions.filter(question => hasAnswer(state.answers[question.id])).length;
  if (!auto && answered < state.questions.length) {
    const ok = confirm(`Bạn còn ${state.questions.length - answered} câu chưa trả lời. Vẫn nộp bài?`);
    if (!ok) return;
  } else if (!auto) {
    const ok = confirm('Nộp bài ngay?');
    if (!ok) return;
  }

  state.submitted = true;
  clearInterval(state.timerId);
  clearProgress();

  const result = scoreExam(state.exam, state.answers);
  const elapsed = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
  state.lastResult = { ...result, elapsed };

  renderResult(auto);
  showOnly(els.resultView);
}

function renderResult(auto) {
  const result = state.lastResult;
  const passed = state.exam.passPoints
    ? result.earned >= state.exam.passPoints
    : result.percentage >= (state.exam.passScore || 60);

  els.examAudio.pause();

  els.resultTitle.textContent = passed ? 'Bạn đã đạt yêu cầu' : 'Bạn chưa đạt yêu cầu';
  els.resultScore.textContent = result.earned;
  els.resultMaxScore.textContent = result.maxScore;
  els.resultSummary.textContent = auto
    ? `Đã hết thời gian. Bạn đạt ${result.earned}/${result.maxScore} điểm (${result.percentage}%).`
    : `Bạn đạt ${result.earned}/${result.maxScore} điểm (${result.percentage}%).`;
  els.resultSections.innerHTML = result.sectionScores.map(section => `
    <div>
      <span>${escapeHtml(section.title.replace(/\s*-\s*\d+\s*điểm$/i, ''))}</span>
      <strong>${section.earned}/${section.maxScore}</strong>
    </div>
  `).join('');
  els.correctCount.textContent = result.correct;
  els.wrongCount.textContent = result.wrong;
  els.resultTime.textContent = formatDuration(result.elapsed);
  els.reviewList.hidden = true;
  els.reviewBtn.textContent = 'Xem đáp án';
}

function renderReview() {
  els.reviewList.innerHTML = '';

  state.lastResult.details.forEach((item, index) => {
    const article = document.createElement('article');
    article.className = `review-item panel ${item.isCorrect ? 'is-correct' : 'is-wrong'}`;
    article.innerHTML = `
      <span class="eyebrow">${escapeHtml(item.question.sectionTitle)} · Câu ${index + 1}</span>
      <h3>${escapeHtml(item.question.prompt)}</h3>
      ${item.question.hanzi ? `<p class="review-chinese">${escapeHtml(item.question.hanzi)}<small>${escapeHtml(item.question.pinyin || '')}</small></p>` : ''}
      ${item.question.transcript ? `<p class="review-chinese"><strong>Nội dung audio:</strong> ${escapeHtml(item.question.transcript)}<small>${escapeHtml(item.question.transcriptPinyin || '')}</small></p>` : ''}
      <p><strong>Bạn trả lời:</strong> ${escapeHtml(displayAnswer(item.question, item.userAnswer))}</p>
      <p><strong>Đáp án:</strong> ${escapeHtml(displayAnswer(item.question, item.question.answer))}</p>
      ${item.question.explanation ? `<p class="explanation">${escapeHtml(item.question.explanation)}</p>` : ''}
    `;
    els.reviewList.append(article);
  });

  els.reviewList.hidden = false;
  els.reviewBtn.textContent = 'Ẩn đáp án';
  els.reviewList.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function displayAnswer(question, value) {
  if (!hasAnswer(value)) return 'Chưa trả lời';
  if (question.type === 'single_choice') {
    const option = question.options.find(item => String(item.id) === String(value));
    return option ? `${option.id}. ${option.text}` : String(value);
  }
  if (question.type === 'true_false') return String(value) === 'true' ? 'Đúng' : 'Sai';
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function setAudioButtonState(isPlaying) {
  els.audioPlayBtn.textContent = isPlaying ? '❚❚ Tạm dừng' : '▶ Phát audio';
  els.audioPlayBtn.classList.toggle('is-playing', isPlaying);
  els.audioPlayBtn.setAttribute('aria-pressed', String(isPlaying));
}

function bindEvents() {
  els.levelFilter.addEventListener('change', renderExamCards);
  els.backToListBtn.addEventListener('click', () => showOnly(els.homeView));
  els.startBtn.addEventListener('click', () => {
    clearProgress();
    startExam(false);
  });
  els.resumeBtn.addEventListener('click', () => startExam(true));
  els.prevBtn.addEventListener('click', () => {
    state.currentIndex = Math.max(0, state.currentIndex - 1);
    renderQuestion();
    saveProgress();
  });
  els.nextBtn.addEventListener('click', () => {
    if (state.currentIndex < state.questions.length - 1) {
      state.currentIndex += 1;
      renderQuestion();
      saveProgress();
    } else {
      toast('Bạn đang ở câu cuối. Kiểm tra phiếu trả lời rồi nộp bài.');
    }
  });
  els.submitBtn.addEventListener('click', () => submitExam(false));
  els.reviewBtn.addEventListener('click', () => {
    if (els.reviewList.hidden) renderReview();
    else {
      els.reviewList.hidden = true;
      els.reviewBtn.textContent = 'Xem đáp án';
    }
  });
  els.retryBtn.addEventListener('click', () => startExam(false));
  els.resultHomeBtn.addEventListener('click', () => showOnly(els.homeView));
  els.audioPlayBtn.addEventListener('click', async () => {
    if (!els.examAudio.src) return;
    if (!els.examAudio.paused) {
      els.examAudio.pause();
      return;
    }
    try {
      await els.examAudio.play();
    } catch (error) {
      console.error(error);
      toast('Không thể phát audio câu này.');
    }
  });
  els.examAudio.addEventListener('play', () => setAudioButtonState(true));
  els.examAudio.addEventListener('pause', () => setAudioButtonState(false));
  els.examAudio.addEventListener('ended', () => setAudioButtonState(false));
  els.loginBtn.addEventListener('click', () => state.auth.goToLogin());
  els.logoutBtn.addEventListener('click', async () => {
    await state.auth.signOut();
    location.reload();
  });
  window.addEventListener('beforeunload', event => {
    saveProgress();
    const examInProgress = Boolean(
      state.exam
      && !state.submitted
      && !els.examView.hidden
      && state.timerId
    );
    if (!examInProgress) return;
    event.preventDefault();
    event.returnValue = '';
  });
  els.examAudio.addEventListener('timeupdate', () => {
    rememberAudioTime();
    const second = Math.floor(els.examAudio.currentTime);
    if (second > 0 && second % 5 === 0 && second !== state.lastAudioSaveSecond) {
      state.lastAudioSaveSecond = second;
      saveProgress();
    }
  });
}

async function init() {
  bindEvents();

  try {
    state.config = await loadConfig();
    state.auth = await createAuthAdapter(state.config);

    if (state.auth.status === 'unauthenticated' || state.auth.status === 'missing') {
      showOnly(els.authGate);
      if (state.auth.status === 'missing') {
        toast('Không tìm thấy phiên Firebase. Kiểm tra đường dẫn firebase-auth.js.');
      } else {
        state.auth.goToLogin();
      }
      return;
    }

    setupUser();
    state.index = await loadExamIndex(state.config);
    populateFilters();
    renderExamCards();
    showOnly(els.homeView);
  } catch (error) {
    console.error(error);
    els.loadingView.innerHTML = `<p>Không thể khởi tạo phòng thi: ${escapeHtml(error.message)}</p>`;
  }
}

init();
