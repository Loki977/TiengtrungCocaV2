const memoryCache = new Map();

async function fetchJson(url, cacheKey) {
  if (memoryCache.has(url)) return structuredClone(memoryCache.get(url));

  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    const data = await response.json();
    memoryCache.set(url, data);
    localStorage.setItem(cacheKey, JSON.stringify(data));
    return structuredClone(data);
  } catch (error) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
    throw error;
  }
}

export function validateExam(exam) {
  const errors = [];
  if (!exam || typeof exam !== 'object') errors.push('Dữ liệu đề thi phải là một object.');
  if (!exam.id) errors.push('Thiếu exam.id.');
  if (!exam.title) errors.push('Thiếu exam.title.');
  if (!Number.isFinite(exam.durationMinutes) || exam.durationMinutes <= 0) {
    errors.push('durationMinutes phải là số lớn hơn 0.');
  }
  if (!Array.isArray(exam.sections) || !exam.sections.length) {
    errors.push('sections phải là mảng có ít nhất 1 phần thi.');
  }

  const supported = new Set(['single_choice', 'true_false', 'fill_blank']);
  const ids = new Set();

  for (const section of exam.sections || []) {
    if (!section.id) errors.push('Có section thiếu id.');
    if (!section.title) errors.push(`Section ${section.id || '?'} thiếu title.`);
    if (!Array.isArray(section.questions)) {
      errors.push(`Section ${section.id || '?'} thiếu questions.`);
      continue;
    }

    for (const question of section.questions) {
      if (!question.id) errors.push(`Section ${section.id}: có câu thiếu id.`);
      if (ids.has(question.id)) errors.push(`Trùng question.id: ${question.id}.`);
      ids.add(question.id);

      if (!supported.has(question.type)) {
        errors.push(`Câu ${question.id || '?'} dùng type chưa hỗ trợ: ${question.type}.`);
      }
      if (!question.prompt) errors.push(`Câu ${question.id || '?'} thiếu prompt.`);
      if (question.type === 'single_choice') {
        if (!Array.isArray(question.options) || question.options.length < 2) {
          errors.push(`Câu ${question.id || '?'} phải có ít nhất 2 options.`);
        }
        if (!question.answer) errors.push(`Câu ${question.id || '?'} thiếu answer.`);
      }
      if (question.type === 'true_false' && !['true', 'false'].includes(String(question.answer))) {
        errors.push(`Câu ${question.id || '?'} có answer true_false không hợp lệ.`);
      }
      if (question.type === 'fill_blank' && typeof question.answer !== 'string') {
        errors.push(`Câu ${question.id || '?'} phải có answer dạng chuỗi.`);
      }
    }
  }

  return errors;
}

export async function loadConfig() {
  return fetchJson('./assets/data/thi-thu/config.json', 'thi-thu:config');
}

export async function loadExamIndex(config) {
  return fetchJson(config.examIndexPath, 'thi-thu:index');
}

export async function loadExam(path) {
  const exam = await fetchJson(path, `thi-thu:exam:${path}`);
  const errors = validateExam(exam);
  if (errors.length) throw new Error(`Đề thi không hợp lệ:\n- ${errors.join('\n- ')}`);
  return exam;
}
