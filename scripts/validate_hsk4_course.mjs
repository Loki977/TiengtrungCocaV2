import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const courseDir = path.join(root, 'assets', 'giaotrinhhsk', 'hsk4');
const index = JSON.parse(fs.readFileSync(path.join(courseDir, 'index.json'), 'utf8'));
const errors = [];
const lessons = [];

const countHanzi = value => (String(value).match(/[\u3400-\u9fff]/g) || []).length;
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

assert(index.length === 20, `index.json phải có 20 bài, hiện có ${index.length}.`);
assert(new Set(index.map(item => item.lessonId)).size === index.length, 'index.json có lessonId trùng.');

for (let lessonId = 1; lessonId <= 20; lessonId += 1) {
  const entry = index.find(item => Number(item.lessonId) === lessonId);
  assert(Boolean(entry), `Thiếu index HSK4 bài ${lessonId}.`);
  if (!entry) continue;

  const file = path.join(courseDir, entry.file);
  assert(fs.existsSync(file), `Thiếu file ${entry.file}.`);
  if (!fs.existsSync(file)) continue;

  const lesson = JSON.parse(fs.readFileSync(file, 'utf8'));
  lessons.push(lesson);
  const prefix = `Bài ${lessonId}`;
  const vocabulary = lesson.vocabulary || [];
  const extended = lesson.extendedVocabulary || [];
  const reading = lesson.lessonText?.[0];
  const chinese = reading?.chinese || '';
  const segments = reading?.segments || [];

  assert(Number(lesson.lessonId) === lessonId, `${prefix}: lessonId không khớp tên file.`);
  assert(lesson.level === 4, `${prefix}: level phải là 4.`);
  assert(lesson.xp === 30, `${prefix}: XP không còn là 30.`);
  assert(lesson.audio?.enabled === false, `${prefix}: trạng thái audio nền bị thay đổi.`);
  assert(Array.isArray(lesson.learningPath?.sections), `${prefix}: thiếu learningPath.`);
  assert(!lesson.learningPath?.sections?.some(section => ['story', 'culture'].includes(section)), `${prefix}: còn section cũ ngoài phạm vi.`);
  assert(new Set(vocabulary.map(item => item.id)).size === vocabulary.length, `${prefix}: trùng id từ chính.`);
  assert(new Set(vocabulary.map(item => item.hanzi)).size === vocabulary.length, `${prefix}: trùng từ chính trong cùng bài.`);
  assert(extended.length === 3, `${prefix}: cần đúng 3 từ mở rộng, hiện có ${extended.length}.`);
  assert(lesson.grammar?.length === 5, `${prefix}: cần đúng 5 điểm ngữ pháp.`);
  assert(lesson.grammar?.every(item => item.title && item.pattern && item.explanation && item.examples?.length), `${prefix}: có điểm ngữ pháp thiếu giải thích hoặc ví dụ.`);
  assert(lesson.exercises?.length >= 8, `${prefix}: thiếu bài tập.`);
  assert(lesson.lessonText?.length === 1, `${prefix}: phải có đúng một bài đọc mới.`);
  assert(countHanzi(chinese) >= 300 && countHanzi(chinese) <= 500, `${prefix}: bài đọc có ${countHanzi(chinese)} chữ Hán, ngoài khoảng 300–500.`);
  assert(segments.map(segment => segment.text).join('') === chinese, `${prefix}: phân đoạn làm thay đổi bài đọc.`);
  assert(segments.some(segment => segment.clickable), `${prefix}: không có cụm từ tra cứu.`);
  const clickableHanzi = segments
    .filter(segment => segment.clickable)
    .reduce((total, segment) => total + countHanzi(segment.text), 0);
  const lookupCoverage = clickableHanzi / Math.max(1, countHanzi(chinese));
  assert(lookupCoverage >= 0.85, `${prefix}: độ phủ tra cứu chỉ đạt ${(lookupCoverage * 100).toFixed(1)}%.`);

  for (const item of [...vocabulary, ...extended]) {
    assert(Boolean(item.hanzi && item.pinyin && item.meaning), `${prefix}: thiếu Hán tự/pinyin/nghĩa ở ${item.hanzi || item.id}.`);
    assert(chinese.includes(item.hanzi), `${prefix}: bài đọc thiếu ${item.hanzi}.`);
  }
  for (const item of vocabulary) {
    assert(Boolean(item.example && item.examplePinyin && item.exampleTranslation), `${prefix}: ${item.hanzi} thiếu ví dụ/pinyin/bản dịch.`);
  }
  for (const item of extended) {
    assert(Boolean(item.partOfSpeech && item.example), `${prefix}: từ mở rộng ${item.hanzi} thiếu từ loại hoặc ví dụ.`);
  }

  for (const item of [...vocabulary, ...extended]) {
    assert(
      segments.some(segment => segment.clickable && segment.text.includes(item.hanzi)),
      `${prefix}: ${item.hanzi} chưa nằm trong cụm tra cứu của bài đọc.`
    );
  }

  lesson.quality.lookupCoveragePercent = Number((lookupCoverage * 100).toFixed(1));
}

const allVocabulary = lessons.flatMap(lesson => lesson.vocabulary.map(item => ({ lessonId: lesson.lessonId, hanzi: item.hanzi })));
const wordLessons = new Map();
for (const item of allVocabulary) {
  if (!wordLessons.has(item.hanzi)) wordLessons.set(item.hanzi, []);
  wordLessons.get(item.hanzi).push(item.lessonId);
}
const repeatedAcrossLessons = [...wordLessons.entries()]
  .filter(([, lessonIds]) => lessonIds.length > 1)
  .map(([hanzi, lessonIds]) => ({ hanzi, lessonIds }));

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    lessons: lessons.length,
    mainVocabularySlots: allVocabulary.length,
    uniqueMainVocabulary: wordLessons.size,
    extendedVocabulary: lessons.reduce((total, lesson) => total + lesson.extendedVocabulary.length, 0),
    readingHanziRange: {
      min: Math.min(...lessons.map(lesson => lesson.meta.hanziCount)),
      max: Math.max(...lessons.map(lesson => lesson.meta.hanziCount))
    },
    interactiveSegments: lessons.reduce((total, lesson) => total + lesson.quality.interactiveSegments, 0),
    lookupCoveragePercent: {
      min: Math.min(...lessons.map(lesson => lesson.quality.lookupCoveragePercent)),
      max: Math.max(...lessons.map(lesson => lesson.quality.lookupCoveragePercent))
    },
    repeatedAcrossLessons
  }, null, 2));
}
