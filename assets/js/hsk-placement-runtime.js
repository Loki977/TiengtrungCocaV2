import {
  createThetaGrid,
  createPrior,
  chooseNextItem,
  scoreResponse,
  updatePosterior,
  summarizePosterior,
  shouldStop,
  buildResult,
  publicQuestion
} from '../../server/hsk-placement/engine.mjs';

const ATTEMPT_KEY = 'cc:hsk-placement-local-attempt:v2';
const RESULT_KEY = 'cc:hsk-placement-local-result:v2';
const SKIPPED_KEY = 'cc:hsk-placement-local-skipped:v2';

let bankPromise = null;
const memoryStorage = new Map();

function readJson(key) {
  try {
    const stored = localStorage.getItem(key);
    if (stored != null) return JSON.parse(stored);
  } catch {
    // Fall back to this tab when storage is blocked or malformed.
  }
  try {
    return JSON.parse(memoryStorage.get(key) || 'null');
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  const serialized = JSON.stringify(value);
  memoryStorage.set(key, serialized);
  try {
    localStorage.setItem(key, serialized);
  } catch {
    // The active in-memory attempt still works when storage is unavailable.
  }
}

function removeKey(key) {
  memoryStorage.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore browsers that block local storage.
  }
}

function randomIndex(max) {
  if (max <= 1) return 0;
  if (globalThis.crypto?.getRandomValues) {
    const sample = new Uint32Array(1);
    globalThis.crypto.getRandomValues(sample);
    return sample[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function shuffledIds(entries) {
  const ids = entries.map((entry) => entry.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  return ids;
}

async function fetchJson(relativeUrl) {
  const response = await fetch(new URL(relativeUrl, import.meta.url), { cache: 'force-cache' });
  if (!response.ok) throw new Error('Không tải được dữ liệu kiểm tra trình độ.');
  return response.json();
}

export function loadPlacementBank() {
  if (!bankPromise) {
    bankPromise = Promise.all([
      fetchJson('../../server/hsk-placement/data/items.json'),
      fetchJson('../../server/hsk-placement/data/test-config.json')
    ]).then(([items, config]) => ({
      items,
      config,
      itemMap: new Map(items.map((item) => [item.id, item]))
    }));
  }
  return bankPromise;
}

export const placementBankReady = loadPlacementBank();

function itemsForAttempt(bank, attempt) {
  if (!Array.isArray(attempt.itemOrder) || !attempt.itemOrder.length) return bank.items;
  return attempt.itemOrder.map((id) => bank.itemMap.get(id)).filter(Boolean);
}

function presentationFor(item) {
  return item?.options ? { optionOrder: shuffledIds(item.options) } : {};
}

function progress(attempt, config) {
  const summary = summarizePosterior(attempt.posterior, attempt.grid, config);
  const answered = attempt.answers.length;
  const estimatedTotal = Math.max(
    config.minItems,
    Math.min(
      config.maxItems,
      answered + Math.ceil(Math.max(0, summary.sd - config.targetPosteriorSd) * 8) + 4
    )
  );
  return {
    answered,
    minimum: config.minItems,
    maximum: config.maxItems,
    estimatedTotal,
    percent: Math.min(96, Math.round((answered / estimatedTotal) * 100)),
    statusText: answered < config.routingItems
      ? 'Đang xác định vùng năng lực'
      : 'Đang xác nhận ranh giới trình độ'
  };
}

function currentResponse(bank, attempt) {
  if (attempt.status === 'completed' && attempt.result) {
    return { finished: true, attemptId: attempt.id, result: attempt.result };
  }
  const item = bank.itemMap.get(attempt.currentItemId);
  if (!item) throw new Error('Không tìm thấy câu hỏi hiện tại.');
  return {
    finished: false,
    attemptId: attempt.id,
    question: publicQuestion(item, attempt.currentPresentation?.optionOrder || null),
    progress: progress(attempt, bank.config),
    testInfo: {
      minItems: bank.config.minItems,
      maxItems: bank.config.maxItems,
      methodologyVersion: bank.config.version
    }
  };
}

function createAttempt(bank) {
  const grid = createThetaGrid(bank.config);
  const attempt = {
    id: globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    grid,
    posterior: createPrior(grid),
    answers: [],
    usedItemIds: [],
    answeredQuestionIds: {},
    itemOrder: shuffledIds(bank.items),
    methodologyVersion: bank.config.version
  };
  const first = chooseNextItem(itemsForAttempt(bank, attempt), attempt, bank.config);
  if (!first) throw new Error('Ngân hàng câu hỏi chưa sẵn sàng.');
  attempt.currentItemId = first.id;
  attempt.currentPresentation = presentationFor(first);
  return attempt;
}

function saveAttempt(attempt) {
  writeJson(ATTEMPT_KEY, attempt);
  if (attempt.status === 'completed' && attempt.result) {
    writeJson(RESULT_KEY, {
      attemptId: attempt.id,
      result: attempt.result,
      completedAt: attempt.result.completedAt
    });
  }
}

export function getLocalPlacementAttempt() {
  return readJson(ATTEMPT_KEY);
}

export function getLocalPlacementResult(attemptId = '') {
  const saved = readJson(RESULT_KEY);
  if (!saved?.result) return null;
  if (attemptId && saved.attemptId !== attemptId) return null;
  return saved;
}

export function getLocalPlacementStatus() {
  const attempt = getLocalPlacementAttempt();
  if (attempt?.status === 'in_progress') {
    return { status: 'in_progress', activeAttemptId: attempt.id };
  }
  const result = getLocalPlacementResult();
  if (result) return { status: 'completed', latestAttemptId: result.attemptId };
  try {
    if (localStorage.getItem(SKIPPED_KEY) === '1') return { status: 'skipped' };
  } catch {
    if (memoryStorage.get(SKIPPED_KEY) === '1') return { status: 'skipped' };
  }
  return { status: 'not_started' };
}

export async function startLocalPlacement({ restart = false } = {}) {
  const bank = await placementBankReady;
  const existing = getLocalPlacementAttempt();
  if (!restart && existing?.status === 'in_progress') return currentResponse(bank, existing);
  if (!restart && existing?.status === 'completed' && existing.result) return currentResponse(bank, existing);

  const attempt = createAttempt(bank);
  removeKey(SKIPPED_KEY);
  saveAttempt(attempt);
  return currentResponse(bank, attempt);
}

export async function resumeLocalPlacement(attemptId = '') {
  const bank = await placementBankReady;
  const attempt = getLocalPlacementAttempt();
  if (!attempt || (attemptId && attempt.id !== attemptId)) {
    throw new Error('Chưa có bài kiểm tra đang làm.');
  }
  return currentResponse(bank, attempt);
}

export async function answerLocalPlacement({ attemptId, questionId, answer, responseTimeMs = 0 }) {
  const bank = await placementBankReady;
  const attempt = getLocalPlacementAttempt();
  if (!attempt || attempt.id !== attemptId) throw new Error('Không tìm thấy bài kiểm tra.');
  if (attempt.status !== 'in_progress') return currentResponse(bank, attempt);
  if (attempt.currentItemId !== questionId) throw new Error('Câu hỏi đã thay đổi.');
  if (attempt.answeredQuestionIds?.[questionId]) throw new Error('Câu hỏi này đã được trả lời.');

  const item = bank.itemMap.get(questionId);
  if (!item) throw new Error('Câu hỏi hiện tại không còn khả dụng.');
  const isCorrect = scoreResponse(item, answer);
  const before = summarizePosterior(attempt.posterior, attempt.grid, bank.config);
  attempt.posterior = updatePosterior(attempt.posterior, attempt.grid, item, isCorrect);
  const after = summarizePosterior(attempt.posterior, attempt.grid, bank.config);
  attempt.answers.push({
    questionId: item.id,
    hskLevel: item.hskLevel,
    skill: item.skill,
    type: item.type,
    difficulty: item.difficulty,
    discrimination: item.discrimination,
    isCorrect,
    submittedAnswer: answer,
    responseTimeMs: Math.max(0, Math.min(10 * 60 * 1000, Number(responseTimeMs) || 0)),
    abilityBefore: before.mean,
    abilityAfter: after.mean,
    answeredAt: new Date().toISOString()
  });
  attempt.usedItemIds.push(item.id);
  attempt.answeredQuestionIds = { ...(attempt.answeredQuestionIds || {}), [item.id]: true };
  attempt.updatedAt = new Date().toISOString();

  if (shouldStop(attempt, bank.config)) {
    attempt.status = 'completed';
    attempt.result = buildResult(attempt, bank.config);
    attempt.currentItemId = null;
    attempt.currentPresentation = null;
  } else {
    const next = chooseNextItem(itemsForAttempt(bank, attempt), attempt, bank.config);
    if (!next) {
      attempt.status = 'completed';
      attempt.result = buildResult(attempt, bank.config);
      attempt.result.warning = 'Ngân hàng câu hỏi phù hợp đã hết trước điều kiện dừng.';
      attempt.currentItemId = null;
      attempt.currentPresentation = null;
    } else {
      attempt.currentItemId = next.id;
      attempt.currentPresentation = presentationFor(next);
    }
  }

  saveAttempt(attempt);
  return currentResponse(bank, attempt);
}

export function deferLocalPlacement() {
  memoryStorage.set(SKIPPED_KEY, '1');
  try {
    localStorage.setItem(SKIPPED_KEY, '1');
  } catch {
    // Ignore blocked storage.
  }
}

export function getLocalPlacementSyncPayload(attemptId = '') {
  const attempt = getLocalPlacementAttempt();
  if (!attempt || attempt.status !== 'completed' || (attemptId && attempt.id !== attemptId)) return null;
  return {
    attemptId: attempt.id,
    startedAt: attempt.startedAt,
    responses: attempt.answers.map((entry) => ({
      questionId: entry.questionId,
      answer: entry.submittedAnswer,
      responseTimeMs: entry.responseTimeMs,
      answeredAt: entry.answeredAt
    }))
  };
}
