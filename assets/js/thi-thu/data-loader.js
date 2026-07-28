const memoryCache = new Map();

async function fetchJson(url, cacheKey, { allowOffline = true } = {}) {
  if (memoryCache.has(url)) return structuredClone(memoryCache.get(url));
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    const data = await response.json();
    memoryCache.set(url, data);
    if (allowOffline) localStorage.setItem(cacheKey, JSON.stringify(data));
    return structuredClone(data);
  } catch (error) {
    const cached = allowOffline ? localStorage.getItem(cacheKey) : null;
    if (cached) return JSON.parse(cached);
    throw error;
  }
}

export function flattenQuestions(exam) {
  return (exam.sections || []).flatMap((section, sectionIndex) =>
    (section.parts || []).flatMap((part, partIndex) =>
      (part.questions || []).map((question, questionIndex) => ({
        ...question,
        sectionId: section.id,
        sectionTitle: section.title,
        sectionIndex,
        sectionDurationMinutes: section.durationMinutes,
        partId: part.id,
        partTitle: part.title,
        partIndex,
        questionIndex,
      }))
    )
  );
}

export function validateExam(exam) {
  const errors = [];
  if (!exam || typeof exam !== 'object') return ['Dữ liệu đề thi không hợp lệ.'];
  for (const field of ['id', 'title', 'standardVersion', 'answerKeyPath']) {
    if (!exam[field]) errors.push(`Thiếu exam.${field}.`);
  }
  if (exam.schemaVersion !== 2) errors.push('Engine chỉ nhận schemaVersion 2.');
  if (!/^HSK_[A-Z0-9_]+$/u.test(exam.standardVersion || '')) errors.push('standardVersion không hợp lệ.');
  if (!Array.isArray(exam.sections) || exam.sections.length < 2) errors.push('Đề phải có ít nhất hai phần.');

  const ids = new Set();
  for (const section of exam.sections || []) {
    if (!section.id || !Number.isFinite(section.durationMinutes)) errors.push(`Section ${section.id || '?'} thiếu cấu hình.`);
    const questions = (section.parts || []).flatMap(part => part.questions || []);
    if (questions.length !== section.questionCount) {
      errors.push(`${section.title || section.id}: khai báo ${section.questionCount} câu nhưng có ${questions.length}.`);
    }
    for (const question of questions) {
      if (!question.id) errors.push(`${section.id}: có câu thiếu id.`);
      if (ids.has(question.id)) errors.push(`Trùng question.id: ${question.id}.`);
      ids.add(question.id);
      if (!question.questionType) errors.push(`Câu ${question.id || '?'} thiếu questionType.`);
      if (!Number.isFinite(question.scoreWeight) || question.scoreWeight <= 0) errors.push(`Câu ${question.id || '?'} thiếu scoreWeight.`);
      if (section.id === 'listening' && (!question.audioPath || !question.transcript)) {
        errors.push(`Câu nghe ${question.id || '?'} thiếu audio hoặc transcript.`);
      }
    }
  }
  if (ids.size !== exam.totalQuestionCount) errors.push(`Tổng số câu không khớp: ${ids.size}/${exam.totalQuestionCount}.`);
  return errors;
}

export async function loadConfig() {
  return fetchJson('./assets/data/thi-thu/config.json', 'thi-thu:config:v2');
}

export async function loadExamIndex(config) {
  return fetchJson(config.examIndexPath, 'thi-thu:index:v2');
}

export async function loadExam(path) {
  const exam = await fetchJson(path, `thi-thu:exam:v2:${path}`);
  const errors = validateExam(exam);
  if (errors.length) throw new Error(`Đề thi không hợp lệ:\n- ${errors.join('\n- ')}`);
  return exam;
}

export async function loadAnswerKey(exam) {
  const key = await fetchJson(exam.answerKeyPath, `thi-thu:key:${exam.id}`, { allowOffline: false });
  if (key.examId !== exam.id || key.standardVersion !== exam.standardVersion) {
    throw new Error('Answer key không khớp đề thi hoặc phiên bản tiêu chuẩn.');
  }
  return key;
}
