import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getWritingPlan } from "../writing-content-plan.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const masterEntries = JSON.parse(fs.readFileSync(path.join(rootDir, "assets/data/all.json"), "utf8"));
const checkOnly = process.argv.includes("--check");
const outputDir = path.join(rootDir, "assets/data/writing");
const TARGETS = Object.freeze({ hsk2: 20, hsk3: 30, hsk4: 40, hsk5: 40, hsk6: 50 });
const LESSON_TOTALS = Object.freeze({ hsk2: 15, hsk3: 20, hsk4: 20, hsk5: 36, hsk6: 40 });
const SENTENCE_TARGET = 10;

const forbiddenPatterns = [
  /今天我们学习/u,
  /我们会用到/u,
  /造句/u,
  /这个句子里有/u,
  /这个.+很重要/u,
  /本课重点表达/u,
  /这个词和第\d+课的主题有关/u,
  /围绕.+讨论时.+正确使用/u,
  /他想先.+这件事/u,
  /我们先.+然后继续/u,
  /Hôm nay chúng ta học từ/iu,
  /Trong chủ đề.+chúng ta sẽ dùng từ/iu,
  /Trong câu này có từ/iu,
  /này rất quan trọng/iu
];

const masterByHanzi = new Map();
for (const entry of masterEntries) {
  const hanzi = clean(entry.hanzi);
  if (!hanzi) continue;
  const rows = masterByHanzi.get(hanzi) || [];
  rows.push(entry);
  masterByHanzi.set(hanzi, rows);
}

for (const level of Object.keys(TARGETS)) {
  const levelNumber = Number(level.replace("hsk", ""));
  const target = TARGETS[level];
  const lessons = loadCourseLessons(level, LESSON_TOTALS[level]);
  const plan = getWritingPlan(level);
  if (plan.length !== lessons.length) {
    throw new Error(`${level} có ${plan.length}/${lessons.length} chủ đề Luyện viết.`);
  }

  const generalPool = buildGeneralPool(levelNumber);
  const courseHanzi = new Set(lessons.flatMap((lesson) => courseCandidates(lesson, levelNumber).map((item) => item.hanzi)));
  const preservedGroups = buildPreservedSentenceGroups(level, levelNumber, lessons, generalPool);
  const reservedSentenceHanzi = new Set([...preservedGroups.values()].flat().map((candidate) => candidate.hanzi));
  const usedHanzi = new Set();
  const usedSentences = new Set();
  const output = [];

  for (const topic of plan) {
    const sourceLesson = lessons.find((item) => Number(item.lessonId) === Number(topic.sourceLesson));
    if (!sourceLesson) throw new Error(`${level} thiếu bài nguồn ${topic.sourceLesson}.`);

    const selected = [];
    const selectedHanzi = new Set();
    const preserveTarget = level === "hsk2" ? 9 : SENTENCE_TARGET;
    const preserved = preservedGroups.get(Number(topic.sourceLesson)) || [];

    for (const candidate of preserved.slice(0, preserveTarget)) {
      const example = candidate.chosenExample || pickUniqueExample(candidate, usedSentences);
      if (!example || !canSelect(candidate, selectedHanzi, usedHanzi)) continue;
      addCandidate(selected, candidate, example, "preserved-course-sentence", selectedHanzi, usedHanzi, usedSentences);
    }

    const topicPool = buildTopicPool(sourceLesson, topic.title, generalPool, courseHanzi, reservedSentenceHanzi, levelNumber);
    const fallbackPool = rotate(
      generalPool.filter((candidate) => !courseHanzi.has(candidate.hanzi) && !reservedSentenceHanzi.has(candidate.hanzi)),
      hash(`${level}-${topic.lessonId}-${topic.sourceLesson}`) % Math.max(generalPool.length, 1)
    );
    const ordered = uniqueCandidates([...topicPool, ...fallbackPool]);

    for (const candidate of ordered) {
      if (selected.length >= SENTENCE_TARGET) break;
      if (!canSelect(candidate, selectedHanzi, usedHanzi)) continue;
      const example = pickUniqueExample(candidate, usedSentences);
      if (!example) continue;
      addCandidate(selected, candidate, example, "dictionary-topic-sentence", selectedHanzi, usedHanzi, usedSentences);
    }

    if (selected.length < SENTENCE_TARGET) {
      throw new Error(`${level} bài ${topic.lessonId} chỉ có ${selected.length}/${SENTENCE_TARGET} câu mẫu đạt chuẩn.`);
    }

    for (const candidate of ordered) {
      if (selected.length >= target) break;
      if (!canSelect(candidate, selectedHanzi, usedHanzi)) continue;
      addCandidate(selected, candidate, null, "dictionary-topic", selectedHanzi, usedHanzi, usedSentences);
    }

    if (selected.length < target) {
      throw new Error(`${level} bài ${topic.lessonId} chỉ có ${selected.length}/${target} từ.`);
    }

    output.push(...selected.map((candidate, index) => serializeCandidate(candidate, levelNumber, topic.lessonId, index)));
  }

  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  const outputPath = path.join(outputDir, `${level}.json`);
  if (checkOnly) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    if (current.replace(/\r\n/g, "\n") !== serialized) {
      throw new Error(`${path.relative(rootDir, outputPath)} chưa được cập nhật. Chạy npm run build:writing-data.`);
    }
  } else {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, serialized, "utf8");
    console.log(`Generated ${path.relative(rootDir, outputPath)} (${output.length} từ, ${target} từ/bài).`);
  }
}

function loadCourseLessons(level, expectedTotal) {
  const courseDir = path.join(rootDir, "assets/giaotrinhhsk", level);
  const files = fs.readdirSync(courseDir)
    .filter((name) => /^lesson-\d+\.json$/u.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (files.length !== expectedTotal) {
    throw new Error(`${level} có ${files.length}/${expectedTotal} file bài học.`);
  }
  return files.map((file) => {
    const lesson = JSON.parse(fs.readFileSync(path.join(courseDir, file), "utf8"));
    return { ...lesson, lessonId: Number(lesson.lessonId || file.match(/\d+/u)?.[0]) };
  });
}

// Tái tạo đúng nhóm 10 câu tốt của dữ liệu trước khi chuẩn hóa. Nhờ đó HSK3–HSK6
// giữ nguyên toàn bộ câu, chỉ chuyển cả nhóm sang chủ đề mới tương ứng; HSK2 giữ 9/10.
function buildPreservedSentenceGroups(level, levelNumber, lessons, generalPool) {
  const groups = new Map();
  const usedHanzi = new Set();
  const usedSentences = new Set();
  for (const lesson of lessons) {
    const articleText = lessonArticleText(lesson);
    const topicPool = generalPool
      .filter((entry) => entry.hanzi && articleText.includes(entry.hanzi))
      .map((entry, index) => ({ ...entry, source: "article", sourceIndex: index }));
    const ordered = uniqueCandidates([
      ...courseCandidates(lesson, levelNumber),
      ...topicPool,
      ...rotate(generalPool, hash(`${level}-${lesson.lessonId}`) % Math.max(generalPool.length, 1))
    ]);
    const selected = [];
    const localHanzi = new Set();
    for (const candidate of ordered) {
      if (selected.length >= SENTENCE_TARGET) break;
      if (!canSelect(candidate, localHanzi, usedHanzi)) continue;
      const example = pickUniqueExample(candidate, usedSentences);
      if (!example) continue;
      selected.push({ ...candidate, chosenExample: example });
      localHanzi.add(candidate.hanzi);
      usedHanzi.add(candidate.hanzi);
      usedSentences.add(example.hanzi);
    }
    if (selected.length !== SENTENCE_TARGET) {
      throw new Error(`${level} bài nguồn ${lesson.lessonId} không tái tạo đủ câu cần giữ.`);
    }
    groups.set(Number(lesson.lessonId), selected);
  }
  return groups;
}

function courseCandidates(lesson, levelNumber) {
  return uniqueCandidates([...(lesson.vocabulary || []), ...(lesson.extendedVocabulary || [])]
    .map((entry, index) => makeCandidate(entry, levelNumber, { source: "course", sourceIndex: index })));
}

function buildTopicPool(lesson, title, generalPool, courseHanzi, reservedSentenceHanzi, levelNumber) {
  const articleText = lessonArticleText(lesson);
  const titleTokens = vietnameseTokens(title);
  return generalPool
    .filter((candidate) => !courseHanzi.has(candidate.hanzi) && !reservedSentenceHanzi.has(candidate.hanzi))
    .map((candidate) => {
      const inArticle = articleText.includes(candidate.hanzi);
      const meaning = normalizeVietnamese(candidate.meaning);
      const titleMatches = titleTokens.filter((token) => meaning.includes(token)).length;
      const exampleMatches = candidate.examples.some((example) => articleText.includes(example.hanzi));
      const wordLengthBonus = [...candidate.hanzi].length >= 2 ? 25 : levelNumber <= 2 ? 5 : -25;
      const levelDistance = Math.abs(Number(candidate.hsk || levelNumber) - levelNumber);
      return {
        ...candidate,
        topicScore: (inArticle ? 600 : 0) + titleMatches * 120 + (exampleMatches ? 40 : 0) + wordLengthBonus - levelDistance * 35
      };
    })
    .filter((candidate) => candidate.topicScore > 0)
    .sort((a, b) => b.topicScore - a.topicScore || a.sourceIndex - b.sourceIndex);
}

function buildGeneralPool(levelNumber) {
  const priorities = levelNumber === 2 ? [2, 1, 3, 4, 5, 6]
    : levelNumber === 3 ? [3, 2, 1, 4, 5, 6]
      : levelNumber === 4 ? [4, 3, 2, 1, 5, 6]
        : levelNumber === 5 ? [5, 4, 6, 3, 2, 1]
          : [6, 5, 4, 3, 2, 1];
  const rank = new Map(priorities.map((value, index) => [value, index]));
  return uniqueCandidates(masterEntries
    .filter((entry) => clean(entry.hanzi) && clean(entry.pinyin) && clean(entry.meaning_vi || entry.meaning))
    .map((entry, index) => makeCandidate(entry, levelNumber, { source: "dictionary", sourceIndex: index }))
    .sort((a, b) => (rank.get(a.hsk) ?? 99) - (rank.get(b.hsk) ?? 99) || a.sourceIndex - b.sourceIndex));
}

function makeCandidate(entry, preferredLevel, meta = {}) {
  const hanzi = clean(entry.hanzi || entry.chinese || entry.word);
  const masters = masterByHanzi.get(hanzi) || [];
  const master = masters.find((item) => Number(item.hsk) === preferredLevel) || masters[0] || {};
  const explicitExample = entry.example && entry.examplePinyin && entry.exampleTranslation
    ? [{ hanzi: entry.example, pinyin: entry.examplePinyin, translation: entry.exampleTranslation }]
    : [];
  const examples = [...explicitExample, ...(Array.isArray(entry.examples) ? entry.examples : []), ...(Array.isArray(master.examples) ? master.examples : [])]
    .map(normalizeExample)
    .filter(isUsableExample);
  return {
    hanzi,
    traditional: clean(entry.traditional || master.traditional),
    pinyin: clean(entry.pinyin || master.pinyin),
    meaning: clean(entry.meaning_vi || entry.meaning || entry.vietnamese || master.meaning_vi || master.meaning),
    hsk: Number(entry.hsk || master.hsk || preferredLevel),
    type: clean(entry.type || master.type),
    audio: clean(entry.audio),
    examples,
    ...meta
  };
}

function addCandidate(selected, candidate, chosenExample, source, selectedHanzi, usedHanzi, usedSentences) {
  selected.push({ ...candidate, chosenExample, source });
  selectedHanzi.add(candidate.hanzi);
  usedHanzi.add(candidate.hanzi);
  if (chosenExample) usedSentences.add(chosenExample.hanzi);
}

function serializeCandidate(candidate, levelNumber, lessonId, index) {
  return {
    id: `writing-hsk${levelNumber}-l${String(lessonId).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
    hsk: levelNumber,
    hanzi: candidate.hanzi,
    traditional: candidate.traditional || "",
    pinyin: candidate.pinyin,
    meaning: candidate.meaning,
    meaning_vi: candidate.meaning,
    examples: candidate.chosenExample ? [candidate.chosenExample] : [],
    lesson: lessonId,
    type: candidate.type || "",
    audio: candidate.audio || "",
    source: candidate.source || "dictionary-topic"
  };
}

function pickUniqueExample(candidate, usedSentences) {
  return candidate.examples.find((example) => !usedSentences.has(example.hanzi)) || null;
}

function normalizeExample(example) {
  return {
    hanzi: clean(example?.hanzi || example?.chinese),
    pinyin: clean(example?.pinyin),
    translation: capitalizeVietnamese(clean(example?.translation || example?.meaning_vi || example?.meaning))
  };
}

function isUsableExample(example) {
  const combined = `${example?.hanzi || ""} ${example?.translation || ""}`;
  return Boolean(
    example?.hanzi
    && example?.pinyin
    && /[a-z]/iu.test(example.pinyin)
    && !/\p{Script=Han}/u.test(example.pinyin)
    && example?.translation
    && !forbiddenPatterns.some((pattern) => pattern.test(combined))
  );
}

function lessonArticleText(lesson) {
  return JSON.stringify({
    title: lesson.chineseTitle || lesson.title || "",
    lessonText: lesson.lessonText || [],
    story: lesson.story || [],
    culture: lesson.culture || [],
    grammar: lesson.grammar || []
  });
}

function vietnameseTokens(value) {
  const stopWords = new Set(["mot", "nhung", "trong", "khong", "duoc", "khi", "cua", "nhieu", "nao", "nhu", "the", "co", "la", "va"]);
  return normalizeVietnamese(value).split(/[^a-z]+/u).filter((token) => token.length >= 4 && !stopWords.has(token));
}

function normalizeVietnamese(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function canSelect(candidate, selectedHanzi, usedHanzi) {
  return Boolean(candidate.hanzi && candidate.pinyin && candidate.meaning
    && !selectedHanzi.has(candidate.hanzi) && !usedHanzi.has(candidate.hanzi));
}

function uniqueCandidates(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.hanzi || seen.has(item.hanzi)) return false;
    seen.add(item.hanzi);
    return true;
  });
}

function rotate(items, offset) {
  if (!items.length) return [];
  const index = Math.max(0, offset % items.length);
  return [...items.slice(index), ...items.slice(0, index)];
}

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function capitalizeVietnamese(value) {
  return String(value || "").replace(
    /(^|[\r\n]+)([^\p{L}\r\n]*)(\p{L})/gu,
    (_, lineBreak, prefix, letter) => `${lineBreak}${prefix}${letter.toLocaleUpperCase("vi-VN")}`
  );
}
