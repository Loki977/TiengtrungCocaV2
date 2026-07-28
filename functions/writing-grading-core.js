'use strict';

const crypto = require('node:crypto');

const RUBRIC_VERSION = 'writing-rubric-2026-07-v1';
const AI_MAX_ATTEMPTS = 3;
const AI_CONFIDENCE_RECHECK = 0.62;
const AI_BATCH_LIMIT = 12;
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const SUBJECTIVE_TYPES = Object.freeze(['short_writing', 'long_writing', 'summary_writing']);
const TERMINAL_STATUSES = new Set(['graded_manual', 'graded_ai']);

const RUBRICS = Object.freeze({
  short_writing: Object.freeze({
    title: 'Đặt câu bằng từ cho sẵn',
    criteria: Object.freeze({
      taskCompletion: 20,
      content: 20,
      grammar: 25,
      vocabulary: 20,
      coherence: 15,
      characters: 0
    }),
    instructions: 'Phải dùng đủ từ bắt buộc, đúng nghĩa, đúng ngữ pháp và trật tự từ; chấp nhận cách diễn đạt khác đáp án mẫu nếu tự nhiên.'
  }),
  long_writing: Object.freeze({
    title: 'Viết đoạn văn',
    criteria: Object.freeze({
      taskCompletion: 20,
      content: 20,
      grammar: 20,
      vocabulary: 15,
      coherence: 15,
      characters: 10
    }),
    instructions: 'Đánh giá mức hoàn thành yêu cầu, nội dung, ngữ pháp, từ vựng, mạch lạc, chữ Hán và độ dài.'
  }),
  summary_writing: Object.freeze({
    title: 'Viết bài tóm tắt',
    criteria: Object.freeze({
      taskCompletion: 15,
      content: 30,
      grammar: 15,
      vocabulary: 15,
      coherence: 15,
      characters: 10
    }),
    instructions: 'Tóm tắt trung thành nội dung nguồn, mạch lạc, dùng tiếng Trung chính xác và không thêm quan điểm cá nhân.'
  })
});

const RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: AI_BATCH_LIMIT,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['questionId', 'score', 'maxScore', 'confidence', 'criteria', 'feedback', 'suggestedAnswer'],
        properties: {
          questionId: { type: 'string' },
          score: { type: 'number' },
          maxScore: { type: 'number' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          criteria: {
            type: 'object',
            additionalProperties: false,
            required: ['taskCompletion', 'content', 'grammar', 'vocabulary', 'coherence', 'characters'],
            properties: {
              taskCompletion: { type: 'number', minimum: 0 },
              content: { type: 'number', minimum: 0 },
              grammar: { type: 'number', minimum: 0 },
              vocabulary: { type: 'number', minimum: 0 },
              coherence: { type: 'number', minimum: 0 },
              characters: { type: 'number', minimum: 0 }
            }
          },
          feedback: { type: 'string' },
          suggestedAnswer: { type: 'string' }
        }
      }
    }
  }
});

function safeText(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function roundScore(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function gradingHash({ questionId, answer, rubricVersion = RUBRIC_VERSION }) {
  return crypto
    .createHash('sha256')
    .update(`${safeText(questionId, 160)}\n${String(answer ?? '')}\n${safeText(rubricVersion, 80)}`)
    .digest('hex');
}

function rubricFor(questionType, hskLevel) {
  const base = RUBRICS[questionType];
  if (!base) throw Object.assign(new Error('Dạng câu không dùng rubric tự luận.'), { code: 'unsupported_writing_type' });
  const level = safeText(hskLevel, 16);
  const levelExpectation = {
    'HSK 4': questionType === 'short_writing'
      ? 'Ở HSK 4, ưu tiên một câu hoàn chỉnh, dùng đúng từ cho sẵn và phù hợp ngữ cảnh hoặc hình minh họa.'
      : '',
    'HSK 5': questionType === 'long_writing'
      ? 'Ở HSK 5, bài cần phát triển thành đoạn khoảng 80 chữ và sử dụng đầy đủ các từ bắt buộc nếu đề cung cấp.'
      : '',
    'HSK 6': questionType === 'summary_writing'
      ? 'Ở HSK 6, bài cần tóm tắt trung thành khoảng 400 chữ, không thêm quan điểm cá nhân.'
      : ''
  }[level] || '';
  return {
    version: RUBRIC_VERSION,
    hskLevel: level,
    questionType,
    title: base.title,
    criteria: { ...base.criteria },
    instructions: [base.instructions, levelExpectation].filter(Boolean).join(' ')
  };
}

function retryDelayMs(attempt) {
  const delays = [15 * 60_000, 60 * 60_000, 4 * 60 * 60_000];
  return delays[Math.min(Math.max(Number(attempt || 1) - 1, 0), delays.length - 1)];
}

function canAiClaim(submission, nowMs = Date.now()) {
  if (!submission || submission.status !== 'pending_manual') return false;
  if (Number(submission.aiAttempts || 0) >= AI_MAX_ATTEMPTS) return false;
  const eligible = Number(submission.retryAtMillis || submission.aiEligibleAtMillis || 0);
  return eligible > 0 && eligible <= nowMs;
}

function manualGradePatch(submission, {
  score,
  feedback,
  gradedBy
}) {
  const maxScore = Number(submission.maxScore || 0);
  const finalScore = roundScore(clamp(score, 0, maxScore));
  return {
    status: 'graded_manual',
    manualScore: finalScore,
    finalScore,
    scoreSource: 'manual',
    feedback: safeText(feedback, 2000),
    gradedBy: safeText(gradedBy, 160),
    aiClaimToken: null,
    aiRetryExhausted: false
  };
}

function aiSuccessPatch(submission, claimToken, result) {
  if (submission.status !== 'ai_grading' || submission.aiClaimToken !== claimToken) return null;
  const maxScore = Number(submission.maxScore || 0);
  const aiScore = roundScore(clamp(result.score, 0, maxScore));
  return {
    status: 'graded_ai',
    aiScore,
    finalScore: aiScore,
    scoreSource: 'ai',
    feedback: safeText(result.feedback, 2000),
    confidence: clamp(result.confidence, 0, 1),
    criteria: result.criteria,
    suggestedAnswer: safeText(result.suggestedAnswer, 3000),
    gradedBy: 'gemini',
    aiClaimToken: null,
    lastAiErrorCode: null,
    aiRetryExhausted: false
  };
}

function aiFailurePatch(submission, claimToken, errorCode, failedAtMillis = Date.now()) {
  if (submission.status !== 'ai_grading' || submission.aiClaimToken !== claimToken) return null;
  const attempts = Number(submission.aiAttempts || 0);
  const exhausted = attempts >= AI_MAX_ATTEMPTS;
  return {
    status: 'pending_manual',
    retryAtMillis: exhausted ? null : failedAtMillis + retryDelayMs(attempts),
    aiClaimToken: null,
    aiRetryExhausted: exhausted,
    lastAiErrorCode: safeText(errorCode || 'ai_error', 120)
  };
}

function normalizeAiItem(raw, expected) {
  if (!raw || safeText(raw.questionId, 160) !== expected.questionId) {
    throw Object.assign(new Error('AI trả về sai questionId.'), { code: 'ai_invalid_question_id' });
  }
  const maxScore = Number(expected.maxScore);
  const resultMax = Number(raw.maxScore);
  if (!Number.isFinite(resultMax) || Math.abs(resultMax - maxScore) > 0.02) {
    throw Object.assign(new Error('AI trả về sai maxScore.'), { code: 'ai_invalid_max_score' });
  }
  const criteria = {};
  for (const name of ['taskCompletion', 'content', 'grammar', 'vocabulary', 'coherence', 'characters']) {
    const value = Number(raw.criteria?.[name]);
    if (!Number.isFinite(value) || value < 0) {
      throw Object.assign(new Error(`AI trả về criteria.${name} không hợp lệ.`), { code: 'ai_invalid_criteria' });
    }
    criteria[name] = roundScore(value);
  }
  const score = Number(raw.score);
  const confidence = Number(raw.confidence);
  if (!Number.isFinite(score) || score < 0 || score > maxScore + 0.02) {
    throw Object.assign(new Error('AI trả về score ngoài phạm vi.'), { code: 'ai_invalid_score' });
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw Object.assign(new Error('AI trả về confidence không hợp lệ.'), { code: 'ai_invalid_confidence' });
  }
  return {
    questionId: expected.questionId,
    score: roundScore(score),
    maxScore: roundScore(maxScore),
    confidence: Math.round(confidence * 1000) / 1000,
    criteria,
    feedback: safeText(raw.feedback, 1200),
    suggestedAnswer: safeText(raw.suggestedAnswer, 2400)
  };
}

function parseGeminiPayload(payload, expectedItems) {
  const text = (payload?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim();
  if (!text) throw Object.assign(new Error('Gemini không trả về nội dung.'), { code: 'gemini_empty_response' });
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Gemini trả về JSON không hợp lệ.'), { code: 'gemini_invalid_json' });
  }
  if (!Array.isArray(parsed.items) || parsed.items.length !== expectedItems.length) {
    throw Object.assign(new Error('Gemini trả về thiếu kết quả.'), { code: 'gemini_invalid_item_count' });
  }
  const byId = new Map(parsed.items.map(item => [safeText(item?.questionId, 160), item]));
  return {
    items: expectedItems.map(item => normalizeAiItem(byId.get(item.questionId), item)),
    usage: {
      inputTokens: Number(payload?.usageMetadata?.promptTokenCount || 0),
      outputTokens: Number(payload?.usageMetadata?.candidatesTokenCount || 0),
      totalTokens: Number(payload?.usageMetadata?.totalTokenCount || 0)
    }
  };
}

function aiInputItems(items) {
  return items.map(item => ({
    questionId: safeText(item.questionId, 160),
    hskLevel: safeText(item.hskLevel, 16),
    questionType: safeText(item.questionType, 40),
    maxScore: roundScore(item.maxScore),
    prompt: safeText(item.prompt, 3000),
    requiredWords: Array.isArray(item.requiredWords) ? item.requiredWords.map(word => safeText(word, 80)).slice(0, 20) : [],
    answer: safeText(item.answer, 6000),
    rubric: item.rubric
  }));
}

async function requestGemini(items, {
  apiKey,
  model = DEFAULT_MODEL,
  fetchImpl = globalThis.fetch,
  recheck = false
} = {}) {
  if (!apiKey) throw Object.assign(new Error('Chưa cấu hình Gemini API key.'), { code: 'gemini_not_configured' });
  if (typeof fetchImpl !== 'function') throw Object.assign(new Error('Fetch không khả dụng.'), { code: 'fetch_unavailable' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  const input = aiInputItems(items);
  const prompt = [
    'Bạn là giám khảo phần Viết HSK. Chấm độc lập từng mục theo rubric được cung cấp.',
    'Chấp nhận cách diễn đạt khác đáp án mẫu nếu đúng nghĩa, đúng ngữ pháp và tự nhiên.',
    'Feedback ngắn, rõ bằng tiếng Việt; suggestedAnswer bằng tiếng Trung.',
    'Không suy đoán thông tin cá nhân. Không dùng web hay công cụ bên ngoài.',
    recheck ? 'Đây là lượt kiểm tra thứ hai vì độ tin cậy thấp hoặc kết quả trước không hợp lệ; hãy rà kỹ tính nhất quán của điểm.' : '',
    JSON.stringify({ rubricVersion: RUBRIC_VERSION, items: input })
  ].filter(Boolean).join('\n');
  try {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: Math.min(1800, 500 + input.length * 500),
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA
          }
        }),
        signal: controller.signal
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('Gemini grading request failed.');
      error.code = `gemini_http_${response.status}`;
      error.retryable = [429, 500, 502, 503, 504].includes(response.status);
      throw error;
    }
    return { ...parseGeminiPayload(payload, input), model };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('Gemini grading timed out.'), { code: 'gemini_timeout', retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function gradeWithGemini(items, options = {}) {
  let first;
  try {
    first = await requestGemini(items, options);
  } catch (error) {
    if (error?.retryable === false) throw error;
    return { ...(await requestGemini(items, { ...options, recheck: true })), apiCalls: 2, rechecked: true };
  }
  const lowConfidence = first.items.some(item => item.confidence < AI_CONFIDENCE_RECHECK);
  if (!lowConfidence) return { ...first, apiCalls: 1, rechecked: false };
  const second = await requestGemini(items, { ...options, recheck: true });
  const secondById = new Map(second.items.map(item => [item.questionId, item]));
  return {
    ...second,
    items: first.items.map(item => {
      const candidate = secondById.get(item.questionId);
      return candidate && candidate.confidence > item.confidence ? candidate : item;
    }),
    usage: {
      inputTokens: first.usage.inputTokens + second.usage.inputTokens,
      outputTokens: first.usage.outputTokens + second.usage.outputTokens,
      totalTokens: first.usage.totalTokens + second.usage.totalTokens
    },
    apiCalls: 2,
    rechecked: true
  };
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return Number(value) || 0;
}

async function refreshAttemptAggregate({
  db,
  Timestamp,
  userId,
  attemptId,
  nowMs = Date.now()
}) {
  const safeUserId = safeText(userId, 180);
  const safeAttemptId = safeText(attemptId, 180);
  if (!safeUserId || !safeAttemptId) return { updated: false, reason: 'missing_identity' };

  const attemptRef = db.collection('users').doc(safeUserId)
    .collection('mockExamAttempts').doc(safeAttemptId);
  const [attemptDocument, submissionsSnapshot] = await Promise.all([
    attemptRef.get(),
    db.collection('writingSubmissions').where('userId', '==', safeUserId).get()
  ]);
  if (!attemptDocument.exists) return { updated: false, reason: 'attempt_not_found' };

  const submissions = submissionsSnapshot.docs
    .map(document => document.data())
    .filter(item => safeText(item.attemptId, 180) === safeAttemptId);
  if (!submissions.length) return { updated: false, reason: 'no_submissions' };

  let writingEarned = 0;
  let gradedWritingMax = 0;
  let pendingWritingMax = 0;
  submissions.forEach(item => {
    const maxScore = Number(item.maxScore || 0);
    if (TERMINAL_STATUSES.has(item.status)) {
      writingEarned += Number(item.finalScore || 0);
      gradedWritingMax += maxScore;
    } else {
      pendingWritingMax += maxScore;
    }
  });

  const attempt = attemptDocument.data();
  const objectiveEarned = Number(attempt.objectiveEarned || 0);
  const finalEarned = roundScore(objectiveEarned + writingEarned);
  const pending = roundScore(pendingWritingMax);
  const passPoints = Number(attempt.passPoints || 0);
  const patch = {
    writingEarned: roundScore(writingEarned),
    gradedWritingMax: roundScore(gradedWritingMax),
    pendingWritingMax: pending,
    finalEarned,
    finalStatus: pending > 0 ? 'pending_writing' : (finalEarned >= passPoints ? 'passed' : 'not_passed'),
    writingUpdatedAt: Timestamp.fromMillis(nowMs)
  };
  await attemptRef.set(patch, { merge: true });
  return { updated: true, ...patch };
}

function historyWith(data, event) {
  const existing = Array.isArray(data.gradingHistory) ? data.gradingHistory.slice(-19) : [];
  return [...existing, event];
}

function safeErrorCode(error) {
  return safeText(error?.code || 'ai_grading_failed', 120).replace(/[^a-z0-9_-]/gi, '_');
}

async function processDueWritingSubmissions({
  db,
  Timestamp,
  FieldValue,
  apiKey,
  model = DEFAULT_MODEL,
  nowMs = Date.now(),
  limit = AI_BATCH_LIMIT,
  fetchImpl = globalThis.fetch
}) {
  const now = Timestamp.fromMillis(nowMs);
  const snapshot = await db.collection('writingSubmissions')
    .where('status', '==', 'pending_manual')
    .where('retryAt', '<=', now)
    .limit(Math.min(Math.max(Number(limit) || 1, 1), AI_BATCH_LIMIT))
    .get();
  const groups = new Map();
  snapshot.docs.forEach(document => {
    const data = document.data();
    const attemptId = safeText(data.attemptId || data.testId, 180);
    const groupKey = `${safeText(data.userId, 180)}\n${attemptId}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(document.ref);
  });

  const report = { scanned: snapshot.size, claimed: 0, graded: 0, cached: 0, skipped: 0, failed: 0, apiCalls: 0, inputTokens: 0, outputTokens: 0 };

  for (const refs of groups.values()) {
    const claimToken = crypto.randomUUID();
    const claimedRefs = await db.runTransaction(async transaction => {
      const documents = await Promise.all(refs.map(ref => transaction.get(ref)));
      const eligible = [];
      documents.forEach(document => {
        if (!document.exists) return;
        const data = document.data();
        const normalized = {
          ...data,
          retryAtMillis: timestampMillis(data.retryAt),
          aiEligibleAtMillis: timestampMillis(data.aiEligibleAt)
        };
        if (!canAiClaim(normalized, nowMs)) return;
        transaction.update(document.ref, {
          status: 'ai_grading',
          aiClaimToken: claimToken,
          aiClaimedAt: now,
          aiAttempts: Number(data.aiAttempts || 0) + 1,
          updatedAt: now
        });
        eligible.push(document.ref);
      });
      return eligible;
    });
    report.claimed += claimedRefs.length;
    if (!claimedRefs.length) continue;

    const claimedSnapshots = await db.getAll(...claimedRefs);
    const active = claimedSnapshots.filter(document => document.exists
      && document.data().status === 'ai_grading'
      && document.data().aiClaimToken === claimToken);
    report.skipped += claimedRefs.length - active.length;
    if (!active.length) continue;

    try {
      const cacheRefs = active.map(document => db.collection('writingGradingCache').doc(document.data().gradingHash));
      const cacheSnapshots = await db.getAll(...cacheRefs);
      const results = new Map();
      let uncached = [];
      active.forEach((document, index) => {
        const cached = cacheSnapshots[index];
        if (cached?.exists && cached.data()?.rubricVersion === document.data().rubricVersion) {
          results.set(document.id, cached.data().result);
          report.cached += 1;
        } else {
          const data = document.data();
          uncached.push({
            submissionId: document.id,
            questionId: data.questionId,
            hskLevel: data.hskLevel,
            questionType: data.questionType,
            maxScore: data.maxScore,
            prompt: data.prompt,
            requiredWords: data.requiredWords,
            answer: data.answer,
            rubric: data.rubric
          });
        }
      });

      if (uncached.length) {
        const latest = await db.getAll(...uncached.map(item => db.collection('writingSubmissions').doc(item.submissionId)));
        const stillClaimed = new Set(latest
          .filter(document => document.exists
            && document.data().status === 'ai_grading'
            && document.data().aiClaimToken === claimToken)
          .map(document => document.id));
        report.skipped += uncached.length - stillClaimed.size;
        uncached = uncached.filter(item => stillClaimed.has(item.submissionId));
      }

      if (uncached.length) {
        const graded = await gradeWithGemini(uncached, { apiKey, model, fetchImpl });
        report.apiCalls += graded.apiCalls;
        report.inputTokens += graded.usage.inputTokens;
        report.outputTokens += graded.usage.outputTokens;
        graded.items.forEach((item, index) => results.set(uncached[index].submissionId, item));
      }

      for (const document of active) {
        const result = results.get(document.id);
        if (!result) throw Object.assign(new Error('Thiếu kết quả chấm.'), { code: 'missing_ai_result' });
        const applied = await db.runTransaction(async transaction => {
          const current = await transaction.get(document.ref);
          if (!current.exists) return false;
          const data = current.data();
          const patch = aiSuccessPatch(data, claimToken, result);
          if (!patch) return false;
          transaction.update(document.ref, {
            ...patch,
            gradedAt: now,
            updatedAt: now,
            gradingHistory: historyWith(data, {
              source: 'ai',
              score: patch.finalScore,
              confidence: patch.confidence,
              atMillis: nowMs,
              model
            })
          });
          const cacheRef = db.collection('writingGradingCache').doc(data.gradingHash);
          transaction.set(cacheRef, {
            gradingHash: data.gradingHash,
            rubricVersion: data.rubricVersion,
            result,
            model,
            updatedAt: now
          }, { merge: false });
          return true;
        });
        if (applied) report.graded += 1;
        else report.skipped += 1;
      }
      const attemptsToRefresh = new Map();
      active.forEach(document => {
        const data = document.data();
        if (data.userId && data.attemptId) {
          attemptsToRefresh.set(`${data.userId}\n${data.attemptId}`, {
            userId: data.userId,
            attemptId: data.attemptId
          });
        }
      });
      for (const identity of attemptsToRefresh.values()) {
        await refreshAttemptAggregate({ db, Timestamp, ...identity, nowMs });
      }
    } catch (error) {
      report.failed += active.length;
      const errorCode = safeErrorCode(error);
      for (const document of active) {
        await db.runTransaction(async transaction => {
          const current = await transaction.get(document.ref);
          if (!current.exists) return;
          const data = current.data();
          const patch = aiFailurePatch(data, claimToken, errorCode, nowMs);
          if (!patch) return;
          transaction.update(document.ref, {
            ...patch,
            retryAt: patch.retryAtMillis ? Timestamp.fromMillis(patch.retryAtMillis) : null,
            updatedAt: now,
            gradingHistory: historyWith(data, {
              source: 'ai_error',
              errorCode,
              atMillis: nowMs
            })
          });
        });
      }
    }
  }
  return report;
}

module.exports = {
  AI_BATCH_LIMIT,
  AI_CONFIDENCE_RECHECK,
  AI_MAX_ATTEMPTS,
  DEFAULT_MODEL,
  RESPONSE_SCHEMA,
  RUBRICS,
  RUBRIC_VERSION,
  SUBJECTIVE_TYPES,
  TERMINAL_STATUSES,
  aiFailurePatch,
  aiInputItems,
  aiSuccessPatch,
  canAiClaim,
  gradeWithGemini,
  gradingHash,
  manualGradePatch,
  normalizeAiItem,
  parseGeminiPayload,
  processDueWritingSubmissions,
  refreshAttemptAggregate,
  retryDelayMs,
  rubricFor,
  safeText
};
