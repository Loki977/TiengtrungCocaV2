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
  if (!exam?.id) errors.push('Thiếu exam.id.');
  if (!exam?.title) errors.push('Thiếu exam.title.');
  if (!Number.isFinite(exam?.durationMinutes) || exam.durationMinutes <= 0) errors.push('durationMinutes không hợp lệ.');
  if (!Array.isArray(exam?.sections) || !exam.sections.length) errors.push('Đề thi chưa có phần thi.');
  const supported = new Set(['single_choice', 'true_false', 'fill_blank']);
  const ids = new Set();
  for (const section of exam?.sections || []) {
    for (const question of section.questions || []) {
      if (!question.id) errors.push(`Phần ${section.id || '?'} có câu thiếu id.`);
      if (ids.has(question.id)) errors.push(`Trùng question.id: ${question.id}.`);
      ids.add(question.id);
      if (!supported.has(question.type)) errors.push(`Câu ${question.id || '?'} có type không hỗ trợ.`);
      if (!question.prompt) errors.push(`Câu ${question.id || '?'} thiếu prompt.`);
      if (question.type === 'single_choice' && (!Array.isArray(question.options) || question.options.length < 2)) {
        errors.push(`Câu ${question.id || '?'} thiếu phương án.`);
      }
    }
  }
  return errors;
}

export const loadConfig = () => fetchJson('./assets/data/thi-thu/config.json', 'thi-thu:config');
export const loadExamIndex = config => fetchJson(config.examIndexPath, 'thi-thu:index');
export async function loadExam(path) {
  const exam = await fetchJson(path, `thi-thu:exam:${path}`);
  const errors = validateExam(exam);
  if (errors.length) throw new Error(`Đề thi không hợp lệ:\n- ${errors.join('\n- ')}`);
  return exam;
}
