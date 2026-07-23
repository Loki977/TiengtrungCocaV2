import {
  showPlacementToast,
  playPlacementAudio,
  preloadPlacementAudio,
  stopPlacementAudio,
  placementLabels
} from './hsk-placement-client.js';
import {
  placementBankReady,
  getLocalPlacementStatus,
  startLocalPlacement,
  resumeLocalPlacement,
  answerLocalPlacement,
  deferLocalPlacement
} from './hsk-placement-runtime.js';

const byId = (id) => document.getElementById(id);
const screenIds = ['introScreen', 'testScreen', 'deferredScreen'];
const state = {
  attemptId: '',
  question: null,
  questionStartedAt: 0,
  selectedAnswer: null,
  orderedTokens: [],
  audioPlays: 0,
  soundEnabled: localStorage.getItem('hskPlacementSound') !== 'false',
  localStatus: 'not_started',
  busy: false
};

function showScreen(id) {
  screenIds.forEach((screenId) => byId(screenId)?.classList.toggle('placement-hidden', screenId !== id));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.dataset.motion === 'off';
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function setBusy(value) {
  state.busy = value;
  ['startButton', 'resumeButton', 'submitButton', 'startDeferredButton'].forEach((id) => {
    const button = byId(id);
    if (button) button.disabled = value;
  });
}

function renderQuestion(payload, { autoplay = true } = {}) {
  state.attemptId = payload.attemptId;
  state.question = payload.question;
  state.questionStartedAt = performance.now();
  state.selectedAnswer = null;
  state.orderedTokens = [];
  state.audioPlays = 0;
  stopPlacementAudio();

  byId('progressStatus').textContent = payload.progress.statusText;
  byId('progressText').textContent = `Đã hoàn thành ${payload.progress.answered} câu`;
  byId('progressBar').style.width = `${payload.progress.percent}%`;
  const progressTrack = document.querySelector('.placement-progress-track');
  progressTrack?.setAttribute('aria-valuenow', String(payload.progress.percent));
  byId('questionCounter').textContent = `${payload.progress.answered} câu đã hoàn thành`;
  byId('skillBadge').textContent = placementLabels.skills[payload.question.skill] || 'Năng lực tiếng Trung';
  byId('questionPrompt').textContent = payload.question.prompt;
  byId('validationMessage').textContent = '';

  const audioAvailable = Boolean(payload.question.audioAvailable);
  byId('audioPanel').classList.toggle('placement-hidden', !audioAvailable);
  if (audioAvailable) preloadPlacementAudio(payload.question.id);
  const remaining = Math.max(0, 2 - state.audioPlays);
  byId('audioHint').textContent = remaining ? `Còn ${remaining} lượt nghe` : 'Đã dùng đủ lượt nghe';
  byId('playAudioButton').disabled = remaining === 0;
  renderAnswerArea(payload.question);
  showScreen('testScreen');
  if (audioAvailable && state.soundEnabled && autoplay) {
    void playAudio({ automatic: true });
  }
}

function renderAnswerArea(question) {
  const area = byId('answerArea');
  area.replaceChildren();
  if (question.type === 'choice') {
    question.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'placement-option';
      button.setAttribute('aria-pressed', 'false');

      const mark = document.createElement('span');
      mark.className = 'placement-option__mark';
      mark.textContent = String.fromCharCode(65 + index);
      mark.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.textContent = option.text;
      button.append(mark, text);
      button.addEventListener('click', () => {
        state.selectedAnswer = option.id;
        area.querySelectorAll('.placement-option').forEach((node) => {
          const selected = node === button;
          node.classList.toggle('is-selected', selected);
          node.setAttribute('aria-pressed', String(selected));
        });
      });
      area.appendChild(button);
    });
    return;
  }

  if (question.type === 'order') {
    const builder = document.createElement('div');
    builder.className = 'placement-order-builder';
    const chosen = document.createElement('div');
    chosen.id = 'chosenTokens';
    chosen.className = 'placement-order-zone';
    chosen.setAttribute('aria-label', 'Câu đang sắp xếp');
    const pool = document.createElement('div');
    pool.id = 'tokenPool';
    pool.className = 'placement-order-zone';
    pool.setAttribute('aria-label', 'Các từ chưa dùng');
    builder.append(chosen, pool);
    area.appendChild(builder);
    question.tokens.forEach((token, tokenIndex) => addTokenButton({ token, tokenIndex, parent: pool, otherZone: chosen, fromPool: true }));
    return;
  }

  const label = document.createElement('label');
  label.className = 'placement-sr-only';
  label.htmlFor = 'placementInputAnswer';
  label.textContent = 'Nhập chữ hoặc từ còn thiếu';
  const input = document.createElement('input');
  input.id = 'placementInputAnswer';
  input.className = 'placement-input';
  input.placeholder = 'Nhập chữ hoặc từ còn thiếu';
  input.autocomplete = 'off';
  input.addEventListener('input', () => { state.selectedAnswer = input.value; });
  area.append(label, input);
  setTimeout(() => input.focus(), 50);
}

function addTokenButton({ token, tokenIndex, parent, otherZone, fromPool }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'placement-token';
  button.textContent = token;
  button.dataset.tokenIndex = String(tokenIndex);
  button.addEventListener('click', () => {
    if (fromPool) {
      state.orderedTokens.push({ token, tokenIndex });
    } else {
      state.orderedTokens = state.orderedTokens.filter((entry) => entry.tokenIndex !== tokenIndex);
    }
    button.remove();
    addTokenButton({ token, tokenIndex, parent: otherZone, otherZone: parent, fromPool: !fromPool });
  });
  parent.appendChild(button);
}

function getAnswer() {
  if (state.question?.type === 'order') return state.orderedTokens.map((entry) => entry.token);
  return state.selectedAnswer;
}

function isAnswerPresent(answer) {
  if (Array.isArray(answer)) return answer.length === state.question.tokens.length;
  return String(answer ?? '').trim().length > 0;
}

async function startTest(restart = false) {
  if (state.busy) return;
  setBusy(true);
  try {
    const payload = await startLocalPlacement({ restart });
    if (payload.finished) {
      window.location.assign(`hsk-placement-result.html?attemptId=${encodeURIComponent(payload.attemptId)}`);
      return;
    }
    renderQuestion(payload);
  } catch (error) {
    showPlacementToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function resumeTest() {
  if (state.busy) return;
  setBusy(true);
  try {
    const payload = await resumeLocalPlacement(state.attemptId);
    if (payload.finished) {
      window.location.assign(`hsk-placement-result.html?attemptId=${encodeURIComponent(payload.attemptId)}`);
      return;
    }
    renderQuestion(payload);
  } catch (error) {
    showPlacementToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function submitAnswer(event) {
  event.preventDefault();
  if (state.busy) return;
  const answer = getAnswer();
  if (!isAnswerPresent(answer)) {
    byId('validationMessage').textContent = state.question.type === 'order'
      ? 'Hãy dùng đủ các từ để tạo thành câu.'
      : 'Hãy chọn hoặc nhập một đáp án.';
    return;
  }
  setBusy(true);
  try {
    const payload = await answerLocalPlacement({
      attemptId: state.attemptId,
      questionId: state.question.id,
      answer,
      responseTimeMs: Math.round(performance.now() - state.questionStartedAt)
    });
    if (payload.finished) {
      window.location.assign(`hsk-placement-result.html?attemptId=${encodeURIComponent(payload.attemptId)}`);
      return;
    }
    renderQuestion(payload);
  } catch (error) {
    showPlacementToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function playAudio({ automatic = false } = {}) {
  if (!state.soundEnabled) {
    showPlacementToast('Hãy bật âm thanh ở góc trên.');
    return;
  }
  if (state.audioPlays >= 2) return;
  const button = byId('playAudioButton');
  button.disabled = true;
  try {
    await playPlacementAudio(state.question.id);
    state.audioPlays += 1;
    const playsRemaining = Math.max(0, 2 - state.audioPlays);
    byId('audioHint').textContent = playsRemaining
      ? `Còn ${playsRemaining} lượt nghe`
      : 'Đã dùng đủ lượt nghe';
    button.disabled = playsRemaining === 0;
  } catch (error) {
    button.disabled = false;
    if (automatic && error?.name === 'NotAllowedError') return;
    showPlacementToast(error.code === 'audio_limit_reached' ? 'Bạn đã dùng đủ 2 lượt nghe.' : 'Không phát được audio câu hiện tại.');
  }
}

async function deferTest() {
  if (state.localStatus === 'completed') {
    window.location.assign('profile.html');
    return;
  }
  deferLocalPlacement();
  showScreen('deferredScreen');
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem('hskPlacementSound', String(state.soundEnabled));
  byId('soundToggle').textContent = `${state.soundEnabled ? '🔊' : '🔇'} Âm thanh: ${state.soundEnabled ? 'Bật' : 'Tắt'}`;
  byId('soundToggle').setAttribute('aria-pressed', String(state.soundEnabled));
  if (!state.soundEnabled) stopPlacementAudio();
}

async function initialize() {
  const status = getLocalPlacementStatus();
  state.localStatus = status.status;
  state.attemptId = status.activeAttemptId || '';
  showScreen(status.status === 'skipped' ? 'deferredScreen' : 'introScreen');
  placementBankReady.catch((error) => showPlacementToast(error.message));

  const params = new URLSearchParams(location.search);
  if (params.get('restart') === '1') {
    await startTest(true);
    return;
  }
  if (status.status === 'in_progress' && status.activeAttemptId) {
    byId('resumeButton').classList.remove('placement-hidden');
    if (params.get('resume') === '1') {
      await resumeTest();
      return;
    }
  }
  if (status.status === 'completed') {
    byId('startButton').textContent = 'Kiểm tra lại';
    byId('skipButton').textContent = 'Về trang cá nhân';
  }
}

byId('startButton')?.addEventListener('click', () => startTest(state.localStatus === 'completed'));
byId('resumeButton')?.addEventListener('click', resumeTest);
byId('skipButton')?.addEventListener('click', deferTest);
byId('startDeferredButton')?.addEventListener('click', () => startTest(false));
byId('answerForm')?.addEventListener('submit', submitAnswer);
byId('playAudioButton')?.addEventListener('click', () => playAudio());
byId('soundToggle')?.addEventListener('click', toggleSound);
byId('soundToggle').textContent = `${state.soundEnabled ? '🔊' : '🔇'} Âm thanh: ${state.soundEnabled ? 'Bật' : 'Tắt'}`;
byId('soundToggle').setAttribute('aria-pressed', String(state.soundEnabled));
window.addEventListener('pagehide', stopPlacementAudio);

initialize();
