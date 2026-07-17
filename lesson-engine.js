import { getLessonConfig } from "./lesson-config.js";

const dataCache = new Map();
const lessonCache = new Map();

export async function loadHSKData(level) {
  const key = normalizeLevel(level);

  if (dataCache.has(key)) {
    return dataCache.get(key);
  }

  const dataPath = key === "hsk5" || key === "hsk6"
    ? `assets/data/writing/${key}.json`
    : `assets/data/${key}.json`;
  const response = await fetch(dataPath);

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

    const sentences = pickSentences(
      collectSentences(vocabSlice, {
        primaryExamplesOnly: ["hsk2", "hsk3", "hsk4", "hsk5", "hsk6"].includes(key)
      }),
      config.sentenceCount,
      `${key}-${config.lessonId}`
    );

    return {
      lessonId: config.lessonId,
      title: config.title,
      vocabularyCount: vocabSlice.length,
      sentenceCount: sentences.length,
      vocabularies: vocabSlice,
      sentences
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
    .replace(/[，。！？；：、,.!?;:()[\]{}"“”‘’]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

export function areAnswersEquivalent(value, expected, language = "vi") {
  const mode = String(language || "vi").toLowerCase();

  if (mode === "pinyin") {
    return isCloseSequence(normalizePinyin(value), normalizePinyin(expected));
  }

  if (mode === "zh" || mode === "chinese") {
    return isCloseSequence(normalizeAnswer(value), normalizeAnswer(expected));
  }

  const actualText = normalizeVietnameseForComparison(value);
  const expectedText = normalizeVietnameseForComparison(expected);

  if (!actualText || !expectedText) {
    return false;
  }

  if (actualText === expectedText) {
    return true;
  }

  const actualTokens = getMeaningTokens(actualText);
  const expectedTokens = getMeaningTokens(expectedText);

  if (!actualTokens.length || !expectedTokens.length || hasConflictingNegation(actualTokens, expectedTokens)) {
    return false;
  }

  const actualSet = new Set(actualTokens);
  const expectedSet = new Set(expectedTokens);
  const overlap = [...expectedSet].filter((token) => actualSet.has(token)).length;
  const expectedCoverage = overlap / expectedSet.size;
  const actualCoverage = overlap / actualSet.size;
  const requiredCoverage = expectedSet.size <= 2 ? 1 : expectedSet.size <= 4 ? 0.75 : 0.65;

  return expectedCoverage >= requiredCoverage && actualCoverage >= 0.6;
}

function normalizeLevel(level) {
  return String(level || "hsk1").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeVocabulary(item) {
  const examples = Array.isArray(item.examples)
    ? item.examples.map((example, sourceIndex) => ({
      chinese: example.hanzi || example.chinese || "",
      pinyin: example.pinyin || "",
      vietnamese: capitalizeVietnameseLines(example.translation || example.meaning_vi || example.meaning || ""),
      answerTokens: Array.isArray(example.answerTokens) ? example.answerTokens : null,
      sourceIndex
    })).filter((example) => example.chinese || example.pinyin || example.vietnamese)
    : [];

  return {
    id: item.id,
    level: item.hsk ? `hsk${item.hsk}` : "",
    chinese: item.hanzi || item.chinese || item.word || "",
    pinyin: item.pinyin || "",
    vietnamese: capitalizeVietnameseLines(item.meaning_vi || item.meaning || item.vietnamese || item.translation || ""),
    lesson: item.lesson,
    lessonId: item.lessonId || item.lesson,
    examples
  };
}

function capitalizeVietnameseLines(value) {
  return String(value || "").replace(
    /(^|[\r\n]+)([^\p{L}\r\n]*)(\p{L})/gu,
    (_, lineBreak, prefix, letter) => `${lineBreak}${prefix}${letter.toLocaleUpperCase("vi-VN")}`
  );
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

function collectSentences(vocabularies, { primaryExamplesOnly = false } = {}) {
  const seen = new Set();

  return vocabularies.flatMap((item) => {
    const examples = primaryExamplesOnly
      ? item.examples.filter((example) => example.sourceIndex === 0)
      : item.examples;

    return examples.map((example) => ({
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

const VIETNAMESE_FILLER_WORDS = new Set([
  "anh", "ay", "ban", "cac", "cai", "chi", "chiec", "cho", "chung", "co",
  "con", "cua", "do", "em", "la", "ma", "minh", "mot", "nay", "nguoi",
  "nhung", "o", "ta", "thi", "toi"
]);

const NEGATION_TOKENS = new Set(["chang", "chua", "dung", "khong"]);

function normalizeVietnameseForComparison(value) {
  return String(value || "")
    .normalize("NFKC")
    .normalize("NFD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMeaningTokens(value) {
  const tokens = String(value || "").split(/\s+/).filter(Boolean);
  const meaningful = tokens.filter((token) => !VIETNAMESE_FILLER_WORDS.has(token));
  return meaningful.length ? meaningful : tokens;
}

function hasConflictingNegation(actualTokens, expectedTokens) {
  const actualNegation = actualTokens.some((token) => NEGATION_TOKENS.has(token));
  const expectedNegation = expectedTokens.some((token) => NEGATION_TOKENS.has(token));
  return actualNegation !== expectedNegation;
}

function isCloseSequence(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (actual === expected) {
    return true;
  }

  const longestLength = Math.max(actual.length, expected.length);

  if (longestLength < 4) {
    return false;
  }

  const distance = levenshteinDistance(actual, expected);
  const similarity = 1 - distance / longestLength;
  const allowedSingleSlip = longestLength >= 6 && distance === 1;
  return allowedSingleSlip || (longestLength >= 10 && similarity >= 0.88);
}

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}
