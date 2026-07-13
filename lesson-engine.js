import { getLessonConfig } from "./lesson-config.js";

const dataCache = new Map();
const lessonCache = new Map();

export async function loadHSKData(level) {
  const key = normalizeLevel(level);

  if (dataCache.has(key)) {
    return dataCache.get(key);
  }

  const response = await fetch(`assets/data/${key}.json`);

  if (!response.ok) {
    throw new Error(`Không tải được dữ liệu ${key}.json`);
  }

  const rawItems = await response.json();
  const normalized = rawItems.map(normalizeVocabulary).filter((item) => item.chinese || item.pinyin || item.vietnamese);

  dataCache.set(key, normalized);
  return normalized;
}

export async function generateLessons(level, lessonConfig = getLessonConfig(level)) {
  const key = normalizeLevel(level);

  if (!lessonConfig) {
    throw new Error(`Chưa có cấu hình bài học cho ${key}`);
  }

  const cacheKey = `${key}:${JSON.stringify(lessonConfig.lessons.map((item) => [item.lessonId, item.vocabularyCount, item.sentenceCount]))}`;

  if (lessonCache.has(cacheKey)) {
    return lessonCache.get(cacheKey);
  }

  const vocabularies = await loadHSKData(key);
  const configs = buildConcreteLessonConfig(key, lessonConfig, vocabularies.length);
  const hasExplicitLessons = vocabularies.some((item) => {
    const explicitLesson = item.lessonId ?? item.lesson;
    return explicitLesson !== null
      && explicitLesson !== undefined
      && explicitLesson !== ""
      && Number.isFinite(Number(explicitLesson));
  });
  let cursor = 0;

  const lessons = configs.map((config) => {
    const requestedCount = config.vocabularyCount;
    const vocabSlice = hasExplicitLessons
      ? vocabularies.filter((item) => Number(item.lessonId ?? item.lesson) === Number(config.lessonId))
      : vocabularies.slice(cursor, cursor + requestedCount);

    if (!hasExplicitLessons) {
      cursor += requestedCount;
    }

    if (vocabSlice.length < requestedCount) {
      console.warn(
        `[lesson-engine] ${key} bài ${config.lessonId} thiếu ${requestedCount - vocabSlice.length} từ vựng. ` +
        `Yêu cầu ${requestedCount}, còn ${vocabSlice.length}.`
      );
    }

    return {
      lessonId: config.lessonId,
      title: config.title,
      vocabularyCount: vocabSlice.length || requestedCount,
      sentenceCount: config.sentenceCount,
      vocabularies: vocabSlice,
      sentences: pickSentences(collectSentences(vocabSlice), config.sentenceCount, `${key}-${config.lessonId}`)
    };
  });

  if (!hasExplicitLessons && cursor < vocabularies.length) {
    console.warn(`[lesson-engine] ${key} còn ${vocabularies.length - cursor} từ vựng chưa được phân vào bài học.`);
  }

  lessonCache.set(cacheKey, lessons);
  return lessons;
}

export async function getLessonContent(level, lessonId) {
  const key = normalizeLevel(level);
  const lessons = await generateLessons(key, getLessonConfig(key));
  const id = Number(lessonId || 1);
  const lesson = lessons.find((item) => item.lessonId === id);

  if (!lesson) {
    throw new Error(`Không tìm thấy ${key} bài ${id}`);
  }

  return lesson;
}

export function normalizePinyin(value) {
  return String(value || "")
    .normalize("NFKC")
    .normalize("NFD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[üÜ]/g, "u")
    .replace(/v/g, "u")
    .replace(/[1-5]/g, "")
    .replace(/[’'·]/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function normalizeAnswer(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

function normalizeLevel(level) {
  return String(level || "hsk1").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeVocabulary(item) {
  const examples = Array.isArray(item.examples)
    ? item.examples.map((example) => ({
      chinese: example.hanzi || example.chinese || "",
      pinyin: example.pinyin || "",
      vietnamese: example.translation || example.meaning_vi || example.meaning || "",
      answerTokens: Array.isArray(example.answerTokens) ? example.answerTokens : null
    })).filter((example) => example.chinese || example.pinyin || example.vietnamese)
    : [];

  return {
    id: item.id,
    level: item.hsk ? `hsk${item.hsk}` : "",
    chinese: item.hanzi || item.chinese || item.word || "",
    pinyin: item.pinyin || "",
    vietnamese: item.meaning_vi || item.meaning || item.vietnamese || item.translation || "",
    lesson: item.lesson,
    lessonId: item.lessonId || item.lesson,
    examples
  };
}

function buildConcreteLessonConfig(level, config, totalVocabulary) {
  if (!config.splitEvenly) {
    return config.lessons;
  }

  const lessonCount = config.lessons.length;
  const baseCount = Math.floor(totalVocabulary / lessonCount);
  const remainder = totalVocabulary % lessonCount;

  return config.lessons.map((lesson, index) => ({
    ...lesson,
    vocabularyCount: baseCount + (index < remainder ? 1 : 0)
  }));
}

function collectSentences(vocabularies) {
  const seen = new Set();

  return vocabularies.flatMap((item) => {
    return item.examples.map((example) => ({
      vocabulary: item,
      chinese: example.chinese,
      pinyin: example.pinyin,
      vietnamese: example.vietnamese,
      answerTokens: example.answerTokens
    }));
  }).filter((item) => {
    if (!item.chinese && !item.pinyin && !item.vietnamese) {
      return false;
    }

    const key = normalizeSentenceKey(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function pickSentences(pool, count, seedText) {
  if (!count || !pool.length) {
    return [];
  }

  if (pool.length < count) {
    console.warn(`[lesson-engine] Thiếu câu mẫu cho ${seedText}. Yêu cầu ${count}, có ${pool.length}.`);
  }

  return seededShuffle(pool, seedText).slice(0, Math.min(count, pool.length));
}

function normalizeSentenceKey(item) {
  return [item.chinese, item.pinyin, item.vietnamese]
    .map((value) => String(value || "").replace(/\s+/g, "").toLowerCase().trim())
    .join("|");
}

function seededShuffle(items, seedText) {
  const result = [...items];
  const random = mulberry32(hashString(seedText));

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
