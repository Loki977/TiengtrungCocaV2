import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import gradingCore from '../../functions/writing-grading-core.js';
import { scoreExam } from '../../assets/js/thi-thu/exam-engine.js';

const {
  RUBRIC_VERSION,
  SUBJECTIVE_TYPES,
  gradingHash,
  rubricFor,
  safeText
} = gradingCore;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXAM_INDEX = path.join(ROOT, 'assets/data/mock-tests/exams/index.json');
const ALLOWED_ORIGIN = /^https:\/\/.*\.vercel\.app$|^https:\/\/tiengtrungcoca\.firebaseapp\.com$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_ATTEMPTS = 6;
const MAX_ANSWER_CHARS = 6000;

class WritingApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getAdmin() {
  if (admin.apps.length) return admin;
  const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) throw new WritingApiError(503, 'firebase_not_configured', 'Dịch vụ lưu bài chưa được cấu hình.');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
  return admin;
}

function services() {
  const sdk = getAdmin();
  return {
    auth: sdk.auth(),
    db: sdk.firestore(),
    Timestamp: sdk.firestore.Timestamp
  };
}

function setHeaders(req, res) {
  const origin = String(req.headers.origin || '');
  if (ALLOWED_ORIGIN.test(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    throw new WritingApiError(400, 'invalid_json', 'Dữ liệu JSON không hợp lệ.');
  }
}

async function authenticate(req) {
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new WritingApiError(401, 'auth_required', 'Vui lòng đăng nhập để gửi bài tự luận.');
  try {
    return await getAdmin().auth().verifyIdToken(token);
  } catch {
    throw new WritingApiError(401, 'invalid_token', 'Phiên đăng nhập đã hết hạn.');
  }
}

function safeId(value, name, max = 180) {
  const id = String(value || '').trim();
  if (!id || id.length > max || !/^[A-Za-z0-9:_-]+$/u.test(id)) {
    throw new WritingApiError(400, `invalid_${name}`, `${name} không hợp lệ.`);
  }
  return id;
}

function readJson(relativePath) {
  const absolute = path.resolve(ROOT, String(relativePath).replace(/^\.\//u, ''));
  if (!absolute.startsWith(`${ROOT}${path.sep}`)) throw new WritingApiError(400, 'invalid_exam_path', 'Đường dẫn đề thi không hợp lệ.');
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function loadExam(testId) {
  const index = JSON.parse(fs.readFileSync(EXAM_INDEX, 'utf8'));
  const meta = index.find(item => item.id === testId && item.active !== false);
  if (!meta) throw new WritingApiError(404, 'exam_not_found', 'Không tìm thấy đề thi.');
  const exam = readJson(meta.path);
  if (exam.id !== testId) throw new WritingApiError(409, 'exam_mismatch', 'Dữ liệu đề thi không đồng nhất.');
  return exam;
}

function flattenQuestions(exam) {
  return (exam.sections || []).flatMap(section =>
    (section.parts || []).flatMap(part => (part.questions || []).map(question => ({
      ...question,
      sectionId: section.id,
      sectionTitle: section.title,
      partId: part.id,
      partTitle: part.title
    })))
  );
}

function gradingPrompt(question) {
  const parts = [question.prompt || question.instruction || 'Viết câu trả lời bằng tiếng Trung.'];
  if (question.sourceText) parts.push(`Tài liệu nguồn:\n${question.sourceText}`);
  if (question.imageAlt) parts.push(`Mô tả hình:\n${question.imageAlt}`);
  return safeText(parts.filter(Boolean).join('\n\n'), 5000);
}

function submissionId(uid, attemptId, questionId) {
  return crypto.createHash('sha256').update(`${uid}\n${attemptId}\n${questionId}`).digest('hex');
}

function requestIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || String(req.socket?.remoteAddress || '');
}

function rateLimitId(uid, ip, nowMs) {
  const salt = String(process.env.WRITING_RATE_LIMIT_SALT || process.env.CRON_SECRET || 'writing-rate-v1');
  const bucket = Math.floor(nowMs / RATE_WINDOW_MS);
  return crypto.createHash('sha256').update(`${salt}\n${uid}\n${ip}\n${bucket}`).digest('hex');
}

function publicSubmission(document) {
  const data = document.data ? document.data() : document;
  const timestamp = value => value?.toMillis?.() || Number(value || 0) || null;
  return {
    submissionId: data.submissionId,
    attemptId: data.attemptId,
    testId: data.testId,
    hskLevel: data.hskLevel,
    questionId: data.questionId,
    questionType: data.questionType,
    prompt: data.prompt,
    requiredWords: data.requiredWords || [],
    answer: data.answer,
    status: data.status,
    maxScore: data.maxScore,
    manualScore: data.manualScore ?? null,
    aiScore: data.aiScore ?? null,
    finalScore: data.finalScore ?? null,
    scoreSource: data.scoreSource ?? null,
    feedback: data.feedback || '',
    confidence: data.confidence ?? null,
    suggestedAnswer: data.suggestedAnswer || '',
    submittedAt: timestamp(data.submittedAt),
    aiEligibleAt: timestamp(data.aiEligibleAt),
    gradedAt: timestamp(data.gradedAt),
    rubricVersion: data.rubricVersion
  };
}

async function submitAttempt(req, token, data) {
  const { db, Timestamp } = services();
  const attemptId = safeId(data.attemptId, 'attempt_id');
  const testId = safeId(data.testId, 'test_id');
  const answers = data.answers && typeof data.answers === 'object' ? data.answers : {};
  const exam = loadExam(testId);
  const questions = flattenQuestions(exam);
  const questionIds = new Set(questions.map(question => question.id));
  const safeAnswers = Object.fromEntries(Object.entries(answers)
    .filter(([questionId]) => questionIds.has(questionId))
    .map(([questionId, answer]) => [questionId, safeText(answer, MAX_ANSWER_CHARS)]));
  const subjective = questions.filter(question => SUBJECTIVE_TYPES.includes(question.questionType));
  if (!subjective.length) return { ok: true, submissions: [], pendingCount: 0 };
  const answerEntries = subjective
    .map(question => ({ question, answer: safeAnswers[question.id] || '' }))
    .filter(item => item.answer);
  if (!answerEntries.length) return { ok: true, submissions: [], pendingCount: 0 };
  if (answerEntries.some(item => String(answers[item.question.id] || '').length > MAX_ANSWER_CHARS)) {
    throw new WritingApiError(413, 'answer_too_long', 'Bài viết vượt quá giới hạn lưu trữ.');
  }

  const nowMs = Date.now();
  const submittedAt = Timestamp.fromMillis(nowMs);
  const aiEligibleAt = Timestamp.fromMillis(nowMs + FOUR_HOURS_MS);
  const rateRef = db.collection('writingRateLimits').doc(rateLimitId(token.uid, requestIp(req), nowMs));
  const submissionRefs = answerEntries.map(({ question }) =>
    db.collection('writingSubmissions').doc(submissionId(token.uid, attemptId, question.id))
  );

  const result = await db.runTransaction(async transaction => {
    const [rateSnapshot, ...existing] = await Promise.all([
      transaction.get(rateRef),
      ...submissionRefs.map(ref => transaction.get(ref))
    ]);
    const count = Number(rateSnapshot.exists ? rateSnapshot.data().count || 0 : 0);
    const allIdempotent = existing.every((snapshot, index) => {
      if (!snapshot.exists) return false;
      const { question, answer } = answerEntries[index];
      return snapshot.data().gradingHash === gradingHash({
        questionId: question.id,
        answer,
        rubricVersion: RUBRIC_VERSION
      });
    });
    if (allIdempotent) return { idempotent: true, ids: submissionRefs.map(ref => ref.id) };
    if (existing.some(snapshot => snapshot.exists)) {
      throw new WritingApiError(409, 'attempt_already_submitted', 'Lượt thi này đã gửi bài tự luận và không thể thay đáp án.');
    }
    if (count >= RATE_MAX_ATTEMPTS) {
      throw new WritingApiError(429, 'rate_limited', 'Bạn gửi bài quá nhanh. Hãy thử lại sau ít phút.');
    }

    transaction.set(rateRef, {
      count: count + 1,
      uidHash: crypto.createHash('sha256').update(token.uid).digest('hex'),
      createdAt: rateSnapshot.exists ? rateSnapshot.data().createdAt : submittedAt,
      updatedAt: submittedAt,
      expiresAt: Timestamp.fromMillis(nowMs + RATE_WINDOW_MS * 2)
    }, { merge: true });

    answerEntries.forEach(({ question, answer }, index) => {
      const rubric = rubricFor(question.questionType, exam.level);
      const id = submissionRefs[index].id;
      const hash = gradingHash({ questionId: question.id, answer, rubricVersion: RUBRIC_VERSION });
      transaction.create(submissionRefs[index], {
        submissionId: id,
        userId: token.uid,
        attemptId,
        testId,
        hskLevel: exam.level,
        questionId: question.id,
        questionType: question.questionType,
        prompt: gradingPrompt(question),
        requiredWords: Array.isArray(question.requiredWords) ? question.requiredWords.slice(0, 20) : [],
        answer,
        maxScore: Number(question.scoreWeight || 0),
        submittedAt,
        aiEligibleAt,
        retryAt: aiEligibleAt,
        status: 'pending_manual',
        manualScore: null,
        aiScore: null,
        finalScore: null,
        scoreSource: null,
        feedback: '',
        confidence: null,
        suggestedAnswer: '',
        gradedAt: null,
        gradedBy: null,
        aiAttempts: 0,
        aiClaimToken: null,
        aiRetryExhausted: false,
        rubricVersion: RUBRIC_VERSION,
        rubric,
        gradingHash: hash,
        gradingHistory: [{
          source: 'submission',
          status: 'pending_manual',
          atMillis: nowMs
        }],
        createdAt: submittedAt,
        updatedAt: submittedAt
      });
    });
    return { idempotent: false, ids: submissionRefs.map(ref => ref.id) };
  });

  const saved = await db.getAll(...result.ids.map(id => db.collection('writingSubmissions').doc(id)));
  const answerKey = readJson(exam.answerKeyPath);
  const attemptResult = scoreExam(exam, questions, answerKey, safeAnswers);
  const attemptRef = db.collection('users').doc(token.uid).collection('mockExamAttempts').doc(attemptId);
  await attemptRef.set({
    ...attemptResult,
    details:[],
    examId:testId,
    attemptId,
    mode:safeText(data.mode, 24) || 'official',
    standardVersion:exam.standardVersion,
    elapsedSeconds:Math.max(0, Math.floor(Number(data.elapsedSeconds || 0))),
    writingSyncStatus:'submitted',
    writingSubmissionIds:result.ids,
    submittedAt
  }, { merge:false });
  return {
    ok: true,
    idempotent: result.idempotent,
    pendingCount: saved.length,
    submissions: saved.filter(document => document.exists).map(publicSubmission)
  };
}

async function listMine(token, data) {
  const { db } = services();
  const attemptId = safeText(data.attemptId, 180);
  const snapshot = await db.collection('writingSubmissions').where('userId', '==', token.uid).limit(100).get();
  const submissions = snapshot.docs
    .filter(document => !attemptId || document.data().attemptId === attemptId)
    .sort((a, b) => (b.data().submittedAt?.toMillis?.() || 0) - (a.data().submittedAt?.toMillis?.() || 0))
    .map(publicSubmission);
  return { ok: true, submissions };
}

async function deleteAttempt(token, data) {
  const { db } = services();
  const attemptId = safeId(data.attemptId, 'attempt_id');
  const submissions = await db.collection('writingSubmissions')
    .where('userId', '==', token.uid)
    .limit(100)
    .get();
  const ownedSubmissions = submissions.docs.filter(document => document.data().attemptId === attemptId);
  const batch = db.batch();
  ownedSubmissions.forEach(document => batch.delete(document.ref));
  batch.delete(db.collection('users').doc(token.uid).collection('mockExamAttempts').doc(attemptId));
  await batch.commit();
  return { ok: true, attemptId, deletedWritingSubmissions: ownedSubmissions.length };
}

export async function handleWritingRequest(req, res) {
  setHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, code: 'method_not_allowed', message: 'Chỉ hỗ trợ POST.' });
  try {
    const body = getBody(req);
    const token = await authenticate(req);
    const action = safeText(body.action, 80);
    const data = body.data && typeof body.data === 'object' ? body.data : {};
    if (action === 'submitAttempt') return res.status(200).json(await submitAttempt(req, token, data));
    if (action === 'listMine') return res.status(200).json(await listMine(token, data));
    if (action === 'deleteAttempt') return res.status(200).json(await deleteAttempt(token, data));
    throw new WritingApiError(404, 'unknown_action', 'Writing action không tồn tại.');
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('[writing-api]', error?.code || error?.name, error?.message);
    return res.status(status).json({
      ok: false,
      code: error?.code || 'internal',
      message: status >= 500 ? 'Không thể xử lý bài tự luận.' : error.message
    });
  }
}
