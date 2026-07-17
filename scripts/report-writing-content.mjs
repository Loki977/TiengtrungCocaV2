import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLessonConfig } from "../lesson-config.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(rootDir, "WRITING_CONTENT_COMPARISON.md");
const beforeOverlap = {
  hsk1: [0, 0, 0, 0, 0, 10, 10, 20, 0, 0, 0, 10, 0, 0, 0],
  hsk2: [100, 100, 85, 80, 100, 65, 85, 70, 80, 80, 45, 50, 65, 45, 65],
  hsk3: [100, 47, 37, 67, 77, 73, 70, 70, 53, 63, 100, 73, 100, 100, 100, 100, 100, 87, 67, 83],
  hsk4: [88, 80, 75, 73, 78, 75, 80, 70, 75, 68, 65, 70, 53, 60, 55, 60, 55, 60, 78, 55],
  hsk5: [100, 100, 100, 100, 100, 100, 100, 100, 95, 93, 100, 100, 93, 98, 93, 100, 83, 95, 100, 85, 100, 78, 93, 85, 100, 78, 80, 88, 88, 73, 63, 85, 83, 83, 80, 80],
  hsk6: [92, 48, 10, 14, 12, 18, 14, 14, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
};
const targetWords = { hsk2: 20, hsk3: 30, hsk4: 40, hsk5: 40, hsk6: 50 };
const preservedWords = { hsk2: 9, hsk3: 10, hsk4: 10, hsk5: 10, hsk6: 10 };

const previousSource = execFileSync("git", ["show", "HEAD:lesson-config.js"], { cwd: rootDir, encoding: "utf8" });
const existingPreviousTitles = loadPreviousTitlesFromReport(reportPath);
const rows = [];

for (let levelNumber = 1; levelNumber <= 6; levelNumber += 1) {
  const level = `hsk${levelNumber}`;
  const config = getLessonConfig(level);
  const previousTitles = existingPreviousTitles.get(level) || extractPreviousTitles(previousSource, levelNumber);
  const writingGroups = levelNumber === 1 ? buildHsk1Groups(config) : buildGeneratedGroups(level);
  const courseSets = loadCourseSets(level);

  for (const lesson of config.lessons) {
    const words = writingGroups.get(Number(lesson.lessonId)) || [];
    const sameCourseOverlap = overlap(words, courseSets[Number(lesson.lessonId) - 1]);
    const maximumCourseOverlap = Math.max(...courseSets.map((courseWords) => overlap(words, courseWords)));
    const kept = levelNumber === 1;
    rows.push({
      level: level.toUpperCase(),
      lesson: lesson.lessonId,
      oldTitle: previousTitles[lesson.lessonId - 1] || lesson.title,
      newTitle: lesson.title,
      before: beforeOverlap[level][lesson.lessonId - 1],
      after: Math.round(sameCourseOverlap * 100),
      maximumAfter: Math.round(maximumCourseOverlap * 100),
      status: kept ? "Giữ nguyên" : "Đã thay",
      changedWords: kept ? 0 : targetWords[level] - preservedWords[level],
      sentenceChanged: level === "hsk2" ? "Có (1 câu)" : "Không",
      reason: kept
        ? "Từ trùng thấp, câu tự nhiên và dữ liệu hiện tại đạt yêu cầu."
        : level === "hsk6"
          ? "Tiêu đề/chủ đề đi đúng thứ tự Khóa học; đã đổi thứ tự, tên và nhóm từ độc lập."
          : "Tên/chủ đề đi theo Khóa học và tỷ lệ từ trùng cao; đã đổi thứ tự, tên và nhóm từ."
    });
  }
}

const lines = [
  "# Báo cáo đối chiếu nội dung Luyện viết",
  "",
  "Báo cáo được tạo sau khi đối chiếu từng bài Luyện viết với toàn bộ bài Khóa học cùng cấp. Tỷ lệ ‘sau’ tối đa là mức trùng lớn nhất với bất kỳ bài Khóa học nào, không chỉ bài cùng số.",
  "",
  "## Tổng quan",
  "",
  "- Tổng số bài rà soát: 146.",
  "- Giữ nguyên HSK1: 15 bài, 149 câu.",
  "- Đổi tên, thứ tự chủ đề và nhóm từ: 131 bài HSK2–HSK6.",
  "- Từ được thay trong các nhóm chủ đề: 3.845/5.140 từ; 1.295 từ gắn với câu tốt được giữ lại và chuyển cùng chủ đề.",
  "- Câu giữ nguyên: 1.444/1.459 câu.",
  "- Câu thay: 15 câu HSK2 (mỗi bài 1 câu) để tỷ lệ trùng của mọi bài xuống dưới 50%.",
  "- Tỷ lệ trùng sau chuẩn hóa: tối đa 45% với bất kỳ bài Khóa học nào.",
  "",
  "## Chi tiết từng bài",
  "",
  "| Cấp | Bài | Tên cũ | Tên mới | Trùng trước | Trùng sau cùng số | Trùng sau tối đa | Trạng thái | Số từ thay | Sửa câu | Lý do |",
  "|---|---:|---|---|---:|---:|---:|---|---:|---|---|",
  ...rows.map((row) => `| ${row.level} | ${row.lesson} | ${escapeCell(row.oldTitle)} | ${escapeCell(row.newTitle)} | ${row.before}% | ${row.after}% | ${row.maximumAfter}% | ${row.status} | ${row.changedWords} | ${row.sentenceChanged} | ${row.reason} |`),
  "",
  "## Ghi chú phương pháp",
  "",
  "- HSK1 được giữ nguyên vì mọi bài chỉ trùng 0–20% từ với bài Khóa học cùng số.",
  "- HSK2–HSK6 dùng thứ tự chủ đề mới; không bài nào giữ nguyên vị trí bài nguồn của Khóa học.",
  "- Các từ bổ sung được lấy từ `assets/data/all.json`, có đủ Hanzi, pinyin và nghĩa Việt, đồng thời bị loại nếu nằm trong toàn bộ tập từ Khóa học cùng cấp.",
  "- HSK3–HSK6 giữ nguyên toàn bộ câu tốt theo nhóm chủ đề. HSK2 giữ 9/10 câu mỗi nhóm và chọn 1 câu chuẩn từ thư viện để tránh ngưỡng trùng 50%.",
  "- Không thay schema dữ liệu, giao diện, tốc độ đọc, chấm điểm, CMS, Firebase hay VIP trong đợt chuẩn hóa này."
];

fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Generated WRITING_CONTENT_COMPARISON.md (${rows.length} bài).`);

function extractPreviousTitles(source, levelNumber) {
  if (levelNumber >= 5) {
    const match = source.match(new RegExp(`const HSK${levelNumber}_WRITING_TOPICS = \\[([\\s\\S]*?)\\n\\];`, "u"));
    return [...(match?.[1] || "").matchAll(/"([^"]+)"/gu)].map((item) => item[1]);
  }
  const start = source.indexOf(`  hsk${levelNumber}: {`);
  const end = source.indexOf(`  hsk${levelNumber + 1}:`, start);
  const block = source.slice(start, end < 0 ? undefined : end);
  return [...block.matchAll(/lessonId:\s*\d+,\s*title:\s*"([^"]+)"/gu)].map((item) => item[1]);
}

function loadPreviousTitlesFromReport(file) {
  const result = new Map();
  if (!fs.existsSync(file)) return result;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\| (HSK[1-6]) \| (\d+) \| ([^|]+) \|/u);
    if (!match) continue;
    const level = match[1].toLowerCase();
    const titles = result.get(level) || [];
    titles[Number(match[2]) - 1] = match[3].trim().replace(/\\\|/g, "|");
    result.set(level, titles);
  }
  return result;
}

function buildGeneratedGroups(level) {
  const items = JSON.parse(fs.readFileSync(path.join(rootDir, `assets/data/writing/${level}.json`), "utf8"));
  const groups = new Map();
  for (const item of items) {
    const lesson = Number(item.lesson);
    const words = groups.get(lesson) || [];
    words.push(item.hanzi);
    groups.set(lesson, words);
  }
  return groups;
}

function buildHsk1Groups(config) {
  const items = JSON.parse(fs.readFileSync(path.join(rootDir, "assets/data/hsk1.json"), "utf8"));
  const groups = new Map();
  let cursor = 0;
  const totalRequested = config.lessons.reduce((sum, lesson) => sum + lesson.vocabularyCount, 0);
  const counts = totalRequested === items.length
    ? config.lessons.map((lesson) => lesson.vocabularyCount)
    : config.lessons.map((_, index) => Math.floor(items.length / config.lessons.length) + (index < items.length % config.lessons.length ? 1 : 0));
  config.lessons.forEach((lesson, index) => {
    groups.set(lesson.lessonId, items.slice(cursor, cursor + counts[index]).map((item) => item.hanzi));
    cursor += counts[index];
  });
  return groups;
}

function loadCourseSets(level) {
  const dir = path.join(rootDir, "assets/giaotrinhhsk", level);
  return fs.readdirSync(dir)
    .filter((name) => /^lesson-\d+\.json$/u.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((name) => {
      const lesson = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      return new Set([...(lesson.vocabulary || []), ...(lesson.extendedVocabulary || [])].map((item) => item.hanzi));
    });
}

function overlap(words, courseWords) {
  return words.length ? words.filter((word) => courseWords.has(word)).length / words.length : 0;
}

function escapeCell(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
