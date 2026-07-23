import crypto from 'node:crypto';
import admin from 'firebase-admin';
import ttsHandler from '../../api/tts.js';
import { placementItemRepository } from './item-repository.mjs';
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
} from './engine.mjs';

const config = placementItemRepository.getConfig();
const items = placementItemRepository.getAll();
const MAX_BODY_BYTES = 64 * 1024;
const MAX_RESPONSE_TIME_MS = 10 * 60 * 1000;
const ALLOWED_ORIGIN = /^https:\/\/.*\.vercel\.app$|^https:\/\/tiengtrungcoca\.firebaseapp\.com$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export class PlacementApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getAdmin() {
  if (admin.apps.length) return admin;
  const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new PlacementApiError(503, 'firebase_not_configured', 'Dịch vụ xếp trình độ chưa được cấu hình.');
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
  return admin;
}

function setHeaders(req, res) {
  const origin = String(req.headers.origin || '');
  if (ALLOWED_ORIGIN.test(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
}

function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

function getBody(req) {
  const length = Number(req.headers['content-length'] || 0);
  if (length > MAX_BODY_BYTES) {
    throw new PlacementApiError(413, 'payload_too_large', 'Dữ liệu gửi lên quá lớn.');
  }
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  if (typeof req.body !== 'string') return {};
  try {
    return JSON.parse(req.body);
  } catch {
    throw new PlacementApiError(400, 'invalid_json', 'Dữ liệu JSON không hợp lệ.');
  }
}

async function authenticate(req) {
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new PlacementApiError(401, 'auth_required', 'Vui lòng đăng nhập để làm bài kiểm tra.');
  try {
    return await getAdmin().auth().verifyIdToken(token);
  } catch {
    throw new PlacementApiError(401, 'invalid_token', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  }
}

function stateRef(db, uid) {
  return db.collection('users').doc(uid).collection('private').doc('hskPlacement');
}

function statsRef(db, uid) {
  return db.collection('users').doc(uid).collection('private').doc('stats');
}

function attemptRef(db, uid, attemptId) {
  return db.collection('users').doc(uid).collection('hskPlacementAttempts').doc(attemptId);
}

const LEGACY_PLACEMENT_STATS_FIELDS = [
  'placementTestStatus',
  'placementAttemptId',
  'estimatedHskLevel',
  'estimatedHskRange',
  'placementConfidence',
  'placementSkillEstimates',
  'placementCompletedAt',
  'placementTestVersion',
  'placementTest'
];

function placementStatsWrite(previous, next) {
  const update = {
    placementStats: { ...(previous || {}), ...(next || {}) },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  for (const field of LEGACY_PLACEMENT_STATS_FIELDS) {
    update[field] = admin.firestore.FieldValue.delete();
  }
  return update;
}

function shuffleIds(options) {
  const ids = options.map((option) => option.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  return ids;
}

function presentationFor(item) {
  return item?.options ? { optionOrder: shuffleIds(item.options) } : {};
}

function itemsForAttempt(attempt) {
  if (!Array.isArray(attempt.itemOrder) || !attempt.itemOrder.length) return items;
  return attempt.itemOrder.map((id) => placementItemRepository.getById(id)).filter(Boolean);
}

function progress(attempt) {
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

function sanitizeResult(result) {
  if (!result) return null;
  return {
    estimatedHskLevel: result.estimatedHskLevel,
    estimatedRange: result.estimatedRange,
    confidence: result.confidence,
    skills: result.skills,
    strengths: result.strengths,
    needsWork: result.needsWork,
    answered: result.answered,
    correct: result.correct,
    completedAt: result.completedAt,
    methodologyVersion: result.methodologyVersion,
    disclaimer: result.disclaimer,
    warning: result.warning || ''
  };
}

function currentResponse(attempt) {
  if (attempt.status === 'completed' && attempt.result) {
    return {
      finished: true,
      attemptId: attempt.id,
      result: sanitizeResult(attempt.result)
    };
  }
  const item = placementItemRepository.getById(attempt.currentItemId);
  if (!item) throw new PlacementApiError(409, 'question_unavailable', 'Không tìm thấy câu hỏi hiện tại.');
  return {
    finished: false,
    attemptId: attempt.id,
    question: publicQuestion(item, attempt.currentPresentation?.optionOrder || null),
    progress: progress(attempt),
    audioPlaysUsed: Number(attempt.audioPlays?.[item.id] || 0),
    testInfo: {
      minItems: config.minItems,
      maxItems: config.maxItems,
      methodologyVersion: config.version
    }
  };
}

function createAttempt(uid) {
  const grid = createThetaGrid(config);
  const itemOrder = shuffleIds(items);
  const attempt = {
    id: crypto.randomUUID(),
    uid,
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    grid,
    posterior: createPrior(grid),
    answers: [],
    usedItemIds: [],
    answeredQuestionIds: {},
    audioPlays: {},
    itemOrder,
    methodologyVersion: config.version
  };
  const first = chooseNextItem(itemsForAttempt(attempt), attempt, config);
  if (!first) throw new PlacementApiError(503, 'question_bank_empty', 'Ngân hàng câu hỏi chưa sẵn sàng.');
  attempt.currentItemId = first.id;
  attempt.currentPresentation = presentationFor(first);
  return attempt;
}

async function startAttempt(uid, body) {
  const db = getAdmin().firestore();
  const userStateRef = stateRef(db, uid);
  const userStatsRef = statsRef(db, uid);
  const forceNew = body.restart === true;

  return db.runTransaction(async (transaction) => {
    const [stateSnapshot, statsSnapshot] = await Promise.all([
      transaction.get(userStateRef),
      transaction.get(userStatsRef)
    ]);
    const state = stateSnapshot.exists ? stateSnapshot.data() : {};
    const previousPlacement = statsSnapshot.exists ? statsSnapshot.data()?.placementStats || {} : {};
    if (!forceNew && state.activeAttemptId) {
      const activeRef = attemptRef(db, uid, state.activeAttemptId);
      const activeSnapshot = await transaction.get(activeRef);
      if (activeSnapshot.exists && activeSnapshot.data()?.status === 'in_progress') {
        return currentResponse(activeSnapshot.data());
      }
    }

    const attempt = createAttempt(uid);
    const ref = attemptRef(db, uid, attempt.id);
    transaction.set(ref, attempt);
    transaction.set(userStateRef, {
      status: 'in_progress',
      activeAttemptId: attempt.id,
      latestAttemptId: attempt.id,
      inviteDismissedAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    transaction.set(userStatsRef, placementStatsWrite(previousPlacement, {
      status: 'in_progress',
      attempts: Number(previousPlacement.attempts || 0) + 1,
      activeAttemptId: attempt.id,
      latestAttemptId: attempt.id,
      startedAt: attempt.startedAt,
      updatedAt: attempt.updatedAt
    }), { merge: true });
    return currentResponse(attempt);
  });
}

async function loadAttempt(uid, attemptId = '') {
  const db = getAdmin().firestore();
  let resolvedId = String(attemptId || '').trim();
  if (!resolvedId) {
    const stateSnapshot = await stateRef(db, uid).get();
    const state = stateSnapshot.exists ? stateSnapshot.data() : {};
    resolvedId = state.activeAttemptId || state.latestAttemptId || '';
  }
  if (!resolvedId || resolvedId.length > 128) {
    throw new PlacementApiError(404, 'attempt_not_found', 'Chưa có bài kiểm tra nào.');
  }
  const snapshot = await attemptRef(db, uid, resolvedId).get();
  if (!snapshot.exists) throw new PlacementApiError(404, 'attempt_not_found', 'Không tìm thấy bài kiểm tra.');
  return snapshot.data();
}

async function submitAnswer(uid, body) {
  const attemptId = String(body.attemptId || '').trim();
  const questionId = String(body.questionId || '').trim();
  if (!attemptId || !questionId) {
    throw new PlacementApiError(400, 'invalid_request', 'Thiếu mã bài kiểm tra hoặc câu hỏi.');
  }
  const db = getAdmin().firestore();
  const ref = attemptRef(db, uid, attemptId);
  const userStateRef = stateRef(db, uid);
  const userStatsRef = statsRef(db, uid);

  return db.runTransaction(async (transaction) => {
    const [attemptSnapshot, stateSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(userStateRef)
    ]);
    if (!attemptSnapshot.exists) {
      throw new PlacementApiError(404, 'attempt_not_found', 'Không tìm thấy bài kiểm tra.');
    }
    const attempt = attemptSnapshot.data();
    if (attempt.status === 'completed') return currentResponse(attempt);
    if (attempt.status !== 'in_progress') {
      throw new PlacementApiError(409, 'attempt_not_active', 'Bài kiểm tra không còn hoạt động.');
    }
    const activeAttemptId = stateSnapshot.exists ? stateSnapshot.data()?.activeAttemptId : '';
    if (activeAttemptId !== attempt.id) {
      throw new PlacementApiError(409, 'attempt_conflict', 'Một bài kiểm tra khác đang hoạt động.');
    }
    if (attempt.answeredQuestionIds?.[questionId]) {
      throw new PlacementApiError(409, 'duplicate_answer', 'Câu hỏi này đã được trả lời.');
    }
    if (attempt.currentItemId !== questionId) {
      throw new PlacementApiError(409, 'question_mismatch', 'Câu hỏi đã thay đổi. Hãy tải lại tiến độ.');
    }

    const item = placementItemRepository.getById(questionId);
    if (!item) throw new PlacementApiError(409, 'question_unavailable', 'Câu hỏi hiện tại không còn khả dụng.');
    const isCorrect = scoreResponse(item, body.answer);
    const before = summarizePosterior(attempt.posterior, attempt.grid, config);
    attempt.posterior = updatePosterior(attempt.posterior, attempt.grid, item, isCorrect);
    const after = summarizePosterior(attempt.posterior, attempt.grid, config);
    attempt.answers.push({
      questionId: item.id,
      hskLevel: item.hskLevel,
      skill: item.skill,
      type: item.type,
      difficulty: item.difficulty,
      discrimination: item.discrimination,
      isCorrect,
      responseTimeMs: Math.max(0, Math.min(MAX_RESPONSE_TIME_MS, Number(body.responseTimeMs || 0))),
      abilityBefore: before.mean,
      abilityAfter: after.mean,
      answeredAt: new Date().toISOString()
    });
    attempt.usedItemIds.push(item.id);
    attempt.answeredQuestionIds = { ...(attempt.answeredQuestionIds || {}), [item.id]: true };
    attempt.updatedAt = new Date().toISOString();

    if (shouldStop(attempt, config)) {
      attempt.status = 'completed';
      attempt.result = buildResult(attempt, config);
      attempt.currentItemId = null;
      attempt.currentPresentation = null;
    } else {
      const next = chooseNextItem(itemsForAttempt(attempt), attempt, config);
      if (!next) {
        attempt.status = 'completed';
        attempt.result = buildResult(attempt, config);
        attempt.result.warning = 'Ngân hàng câu hỏi phù hợp đã hết trước điều kiện dừng.';
        attempt.currentItemId = null;
        attempt.currentPresentation = null;
      } else {
        attempt.currentItemId = next.id;
        attempt.currentPresentation = presentationFor(next);
      }
    }

    let previousPlacement = {};
    if (attempt.status === 'completed') {
      const statsSnapshot = await transaction.get(userStatsRef);
      previousPlacement = statsSnapshot.exists ? statsSnapshot.data()?.placementStats || {} : {};
    }
    transaction.set(ref, attempt);
    if (attempt.status === 'completed') {
      const state = stateSnapshot.exists ? stateSnapshot.data() : {};
      transaction.set(userStateRef, {
        status: 'completed',
        activeAttemptId: admin.firestore.FieldValue.delete(),
        latestAttemptId: attempt.id,
        latestCompletedAttemptId: attempt.id,
        completedAt: attempt.result.completedAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      transaction.set(userStatsRef, placementStatsWrite(previousPlacement, {
        status: 'completed',
        completedAttempts: Number(previousPlacement.completedAttempts || 0) + 1,
        activeAttemptId: '',
        latestAttemptId: attempt.id,
        estimatedHskLevel: attempt.result.estimatedHskLevel,
        estimatedRange: attempt.result.estimatedRange,
        confidence: attempt.result.confidence,
        skillEstimates: attempt.result.skills,
        completedAt: attempt.result.completedAt,
        methodologyVersion: attempt.result.methodologyVersion,
        updatedAt: attempt.updatedAt
      }), { merge: true });
      if (state.activeAttemptId && state.activeAttemptId !== attempt.id) {
        throw new PlacementApiError(409, 'attempt_conflict', 'Một bài kiểm tra khác đang hoạt động.');
      }
    } else {
      transaction.set(userStateRef, {
        status: 'in_progress',
        activeAttemptId: attempt.id,
        latestAttemptId: attempt.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    return currentResponse(attempt);
  });
}

async function deferInvite(uid) {
  const db = getAdmin().firestore();
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const userStateRef = stateRef(db, uid);
    const userStatsRef = statsRef(db, uid);
    const [snapshot, statsSnapshot] = await Promise.all([
      transaction.get(userStateRef),
      transaction.get(userStatsRef)
    ]);
    const current = snapshot.exists ? snapshot.data() : {};
    const previousPlacement = statsSnapshot.exists ? statsSnapshot.data()?.placementStats || {} : {};
    const status = current.activeAttemptId ? 'in_progress' : 'skipped';
    transaction.set(userStateRef, {
      status,
      inviteDismissedAt: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    transaction.set(userStatsRef, placementStatsWrite(previousPlacement, {
      status,
      activeAttemptId: current.activeAttemptId || '',
      latestAttemptId: current.latestAttemptId || '',
      deferredAt: now,
      updatedAt: now
    }), { merge: true });
  });
  return { ok: true, status: 'skipped' };
}

async function getStatus(uid) {
  const db = getAdmin().firestore();
  const snapshot = await stateRef(db, uid).get();
  const state = snapshot.exists ? snapshot.data() : {};
  let result = null;
  if (state.latestCompletedAttemptId) {
    const attemptSnapshot = await attemptRef(db, uid, state.latestCompletedAttemptId).get();
    result = attemptSnapshot.exists ? sanitizeResult(attemptSnapshot.data()?.result) : null;
  }
  return {
    status: state.status || 'not_started',
    activeAttemptId: state.activeAttemptId || '',
      latestAttemptId: state.latestAttemptId || '',
      latestCompletedAttemptId: state.latestCompletedAttemptId || '',
      inviteDismissed: Boolean(state.inviteDismissedAt),
    result
  };
}

async function getResult(uid, attemptId) {
  const db = getAdmin().firestore();
  let resolvedId = String(attemptId || '').trim();
  if (!resolvedId) {
    const stateSnapshot = await stateRef(db, uid).get();
    resolvedId = stateSnapshot.data()?.latestCompletedAttemptId || '';
  }
  if (!resolvedId) throw new PlacementApiError(404, 'result_not_found', 'Chưa có kết quả xếp trình độ.');
  const snapshot = await attemptRef(db, uid, resolvedId).get();
  const attempt = snapshot.exists ? snapshot.data() : null;
  if (!attempt || attempt.status !== 'completed' || !attempt.result) {
    throw new PlacementApiError(404, 'result_not_found', 'Chưa có kết quả xếp trình độ.');
  }
  return { attemptId: resolvedId, result: sanitizeResult(attempt.result) };
}

async function getAudio(uid, attemptId, questionId, useFallback = false) {
  const db = getAdmin().firestore();
  const ref = attemptRef(db, uid, attemptId);
  const access = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new PlacementApiError(404, 'attempt_not_found', 'Không tìm thấy bài kiểm tra.');
    const attempt = snapshot.data();
    if (attempt.status !== 'in_progress' || attempt.currentItemId !== questionId) {
      throw new PlacementApiError(403, 'audio_not_current', 'Audio chỉ khả dụng cho câu hỏi hiện tại.');
    }
    const item = placementItemRepository.getById(questionId);
    if (!item?.audio) throw new PlacementApiError(404, 'audio_not_found', 'Câu hỏi này không có audio.');
    const used = Number(attempt.audioPlays?.[questionId] || 0);
    if (useFallback) {
      if (used < 1) throw new PlacementApiError(409, 'fallback_not_available', 'Hãy thử audio chính trước.');
      return { item, playsUsed: used, playsRemaining: Math.max(0, 2 - used) };
    }
    if (used >= 2) throw new PlacementApiError(429, 'audio_limit_reached', 'Bạn đã dùng đủ 2 lượt nghe.');
    attempt.audioPlays = { ...(attempt.audioPlays || {}), [questionId]: used + 1 };
    attempt.updatedAt = new Date().toISOString();
    transaction.set(ref, attempt);
    return {
      audioUrl: `/assets/audio/hsk-placement/${encodeURIComponent(questionId)}.mp3`,
      playsUsed: used + 1,
      playsRemaining: 1 - used
    };
  });
  if (!useFallback) return access;
  const fallback = await ttsHandler.getOrCreateAudio(access.item.audio.text, 'sentence');
  return {
    audioUrl: fallback.audioUrl,
    playsUsed: access.playsUsed,
    playsRemaining: access.playsRemaining,
    fallback: true
  };
}

export async function handlePlacementRequest(action, req, res) {
  setHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const decoded = await authenticate(req);
    const uid = decoded.uid;
    const body = req.method === 'POST' ? getBody(req) : {};
    const attemptId = String(req.query?.attemptId || body.attemptId || '');

    if (action === 'status' && req.method === 'GET') return sendJson(res, 200, await getStatus(uid));
    if (action === 'start' && req.method === 'POST') return sendJson(res, 201, await startAttempt(uid, body));
    if (action === 'attempt' && req.method === 'GET') return sendJson(res, 200, currentResponse(await loadAttempt(uid, attemptId)));
    if (action === 'answer' && req.method === 'POST') return sendJson(res, 200, await submitAnswer(uid, body));
    if (action === 'skip' && req.method === 'POST') return sendJson(res, 200, await deferInvite(uid));
    if (action === 'result' && req.method === 'GET') return sendJson(res, 200, await getResult(uid, attemptId));
    if (action === 'audio' && req.method === 'POST') {
      const questionId = String(body.questionId || '');
      if (!attemptId || !questionId) throw new PlacementApiError(400, 'invalid_request', 'Thiếu mã bài hoặc câu hỏi.');
      return sendJson(res, 200, await getAudio(uid, attemptId, questionId, body.fallback === true));
    }
    throw new PlacementApiError(405, 'method_not_allowed', 'Phương thức không được hỗ trợ.');
  } catch (error) {
    const status = error instanceof PlacementApiError ? error.status : 500;
    const code = error instanceof PlacementApiError ? error.code : 'internal_error';
    const message = error instanceof PlacementApiError ? error.message : 'Dịch vụ xếp trình độ đang tạm gián đoạn.';
    if (status >= 500) console.error('[hsk-placement]', error);
    return sendJson(res, status, { error: { code, message } });
  }
}

export const placementInternals = Object.freeze({
  config,
  items,
  currentResponse,
  createAttempt,
  sanitizeResult
});
