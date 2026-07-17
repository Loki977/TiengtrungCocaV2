import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const masterEntries = JSON.parse(fs.readFileSync(path.join(rootDir, "assets/data/all.json"), "utf8"));
const checkOnly = process.argv.includes("--check");
const outputDir = path.join(rootDir, "assets/data/writing");
const entriesByHanzi = new Map();

const forbiddenPatterns = [
  /今天我们学习/u,
  /我们会用到/u,
  /造句/u,
  /这个句子里有/u,
  /这个.+很重要/u,
  /他想先.+这件事/u,
  /我们先.+然后继续/u,
  /Hôm nay chúng ta học từ/iu,
  /Trong chủ đề.+chúng ta sẽ dùng từ/iu,
  /Trong câu này có từ/iu,
  /này rất quan trọng/iu
];

for (const entry of masterEntries) {
  if (!entry.hanzi || !Array.isArray(entry.examples) || !entry.examples.length) {
    continue;
  }

  const existing = entriesByHanzi.get(entry.hanzi) || [];
  existing.push(entry);
  entriesByHanzi.set(entry.hanzi, existing);
}

for (const level of [5, 6]) {
  const selectedSentences = new Set();
  const writingEntries = [];
  const lessonCandidateGroups = [];
  const courseDir = path.join(rootDir, `assets/giaotrinhhsk/hsk${level}`);
  const lessonFiles = fs.readdirSync(courseDir)
    .filter((name) => /^lesson-\d+\.json$/u.test(name))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));

  for (const lessonFile of lessonFiles) {
    const lesson = JSON.parse(fs.readFileSync(path.join(courseDir, lessonFile), "utf8"));
    const lessonVocabulary = [...(lesson.vocabulary || []), ...(lesson.extendedVocabulary || [])];
    const candidates = (level === 5
      ? buildHsk5Candidates(lessonVocabulary)
      : buildHsk6Candidates(lesson, lessonVocabulary))
      .sort((left, right) => right.score - left.score || left.courseIndex - right.courseIndex);

    lessonCandidateGroups.push({ lesson, candidates });
  }

  const selectionsByLesson = new Map();
  const constrainedFirst = [...lessonCandidateGroups].sort((left, right) => {
    const leftCount = new Set(left.candidates.map((candidate) => candidate.example.hanzi)).size;
    const rightCount = new Set(right.candidates.map((candidate) => candidate.example.hanzi)).size;
    return leftCount - rightCount;
  });

  for (const { lesson, candidates } of constrainedFirst) {
    const lessonSelection = [];
    const lessonWords = new Set();
    const lessonSentences = new Set();

    for (const candidate of candidates) {
      if (
        lessonSelection.length >= 10
        || lessonWords.has(candidate.courseEntry.hanzi)
        || lessonSentences.has(candidate.example.hanzi)
        || selectedSentences.has(candidate.example.hanzi)
      ) {
        continue;
      }

      lessonSelection.push(candidate);
      lessonWords.add(candidate.courseEntry.hanzi);
      lessonSentences.add(candidate.example.hanzi);
      selectedSentences.add(candidate.example.hanzi);
    }

    if (lessonSelection.length < 10) {
      throw new Error(`HSK${level} bài ${lesson.lessonId} chỉ chọn được ${lessonSelection.length}/10 câu.`);
    }

    selectionsByLesson.set(Number(lesson.lessonId), lessonSelection);
  }

  for (const { lesson } of lessonCandidateGroups) {
    const lessonSelection = selectionsByLesson.get(Number(lesson.lessonId));
    writingEntries.push(...lessonSelection.map((candidate, index) => ({
      id: `writing-hsk${level}-l${String(lesson.lessonId).padStart(2, "0")}-${index + 1}`,
      hsk: level,
      hanzi: candidate.courseEntry.hanzi,
      traditional: candidate.masterEntry.traditional || "",
      pinyin: candidate.courseEntry.pinyin || candidate.masterEntry.pinyin || "",
      meaning: candidate.courseEntry.meaning || candidate.masterEntry.meaning_vi || candidate.masterEntry.meaning || "",
      meaning_vi: candidate.courseEntry.meaning || candidate.masterEntry.meaning_vi || candidate.masterEntry.meaning || "",
      examples: [{
        hanzi: candidate.example.hanzi,
        pinyin: candidate.example.pinyin,
        translation: capitalizeVietnamese(candidate.example.translation)
      }],
      lesson: Number(lesson.lessonId),
      type: candidate.masterEntry.type || ""
    })));
  }

  const serialized = `${JSON.stringify(writingEntries, null, 2)}\n`;
  const outputPath = path.join(outputDir, `hsk${level}.json`);

  if (checkOnly) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    if (current.replace(/\r\n/g, "\n") !== serialized) {
      throw new Error(`${path.relative(rootDir, outputPath)} chưa được cập nhật. Chạy npm run build:writing-data.`);
    }
  } else {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, serialized, "utf8");
    console.log(`Generated ${path.relative(rootDir, outputPath)} (${writingEntries.length} mục).`);
  }
}

function buildHsk5Candidates(lessonVocabulary) {
  return lessonVocabulary.flatMap((courseEntry, courseIndex) => {
    const masterEntry = pickMasterEntry(courseEntry.hanzi, 5) || courseEntry;

    if (courseEntry.example && courseEntry.examplePinyin && courseEntry.exampleTranslation) {
      const example = {
        hanzi: courseEntry.example,
        pinyin: courseEntry.examplePinyin,
        translation: courseEntry.exampleTranslation
      };

      if (isUsableExample(example)) {
        return [{
          courseEntry,
          courseIndex,
          masterEntry,
          example,
          score: 400 + scoreCandidate(5, courseEntry, masterEntry, example)
        }];
      }
    }

    return buildMasterCandidates(5, courseEntry, courseIndex, 0);
  });
}

function buildHsk6Candidates(lesson, lessonVocabulary) {
  const articleText = (lesson.lessonText || []).map((item) => item.chinese || "").join("");
  const courseEntriesByHanzi = new Map(lessonVocabulary.map((entry) => [entry.hanzi, entry]));

  return masterEntries.flatMap((masterEntry, courseIndex) => {
    if (!masterEntry.hanzi || !articleText.includes(masterEntry.hanzi)) {
      return [];
    }

    const courseEntry = courseEntriesByHanzi.get(masterEntry.hanzi) || masterEntry;
    return (masterEntry.examples || []).slice(0, 1).flatMap((example) => {
      if (!isUsableExample(example)) {
        return [];
      }

      const wordLength = [...masterEntry.hanzi].length;
      const topicScore = Number(masterEntry.hsk) === 6 ? 220 : Number(masterEntry.hsk) === 5 ? 90 : 0;
      const courseScore = courseEntriesByHanzi.has(masterEntry.hanzi) ? 120 : 0;
      const wordScore = wordLength >= 2 ? 70 : -60;

      return [{
        courseEntry,
        courseIndex,
        masterEntry,
        example,
        score: 300 + topicScore + courseScore + wordScore
          + scoreCandidate(6, courseEntry, masterEntry, example)
      }];
    });
  });
}

function buildMasterCandidates(level, courseEntry, courseIndex, bonusScore) {
  return (entriesByHanzi.get(courseEntry.hanzi) || []).flatMap((masterEntry) => {
    return masterEntry.examples.slice(0, 1).flatMap((example) => {
      if (!isUsableExample(example)) {
        return [];
      }

      return [{
        courseEntry,
        courseIndex,
        masterEntry,
        example,
        score: bonusScore + scoreCandidate(level, courseEntry, masterEntry, example)
      }];
    });
  });
}

function pickMasterEntry(hanzi, level) {
  const entries = entriesByHanzi.get(hanzi) || [];
  return entries.find((entry) => Number(entry.hsk) === level) || entries[0] || null;
}

function isUsableExample(example) {
  const combinedText = `${example?.hanzi || ""} ${example?.translation || ""}`;
  const pinyin = String(example?.pinyin || "");
  return Boolean(
    example?.hanzi
    && /[a-z]/iu.test(pinyin)
    && !/\p{Script=Han}/u.test(pinyin)
    && example?.translation
    && !forbiddenPatterns.some((pattern) => pattern.test(combinedText))
  );
}

function capitalizeVietnamese(value) {
  return String(value || "").replace(
    /(^|[\r\n]+)([^\p{L}\r\n]*)(\p{L})/gu,
    (_, lineBreak, prefix, letter) => `${lineBreak}${prefix}${letter.toLocaleUpperCase("vi-VN")}`
  );
}

function scoreCandidate(level, courseEntry, masterEntry, example) {
  const chineseLength = [...example.hanzi].length;
  const translationLength = String(example.translation || "").split(/\s+/).filter(Boolean).length;
  let score = Number(masterEntry.hsk) === level ? 100 : 0;

  if (example.hanzi.includes(courseEntry.hanzi)) score += 35;
  if (chineseLength >= 8 && chineseLength <= 28) score += 18;
  if (translationLength >= 6 && translationLength <= 24) score += 12;
  score += Math.min(chineseLength, 24) / 4;
  return score;
}
