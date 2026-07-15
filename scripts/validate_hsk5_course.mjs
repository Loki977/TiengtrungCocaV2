import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const courseDir = path.join(root, 'assets', 'giaotrinhhsk', 'hsk5');
const source = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'hsk5_course_source.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(courseDir, 'index.json'), 'utf8'));
const lessonArg = process.argv.indexOf('--lesson');
const selectedIds = lessonArg >= 0 ? [Number(process.argv[lessonArg + 1])] : Array.from({ length: 36 }, (_, index) => index + 1);
const errors = [];
const lessons = [];
const forbiddenReadingPhrases = [
  '本课的重点词语是',
  '扩展词是',
  '学习时，我们先',
  '课堂上，同学们',
  '老师提醒我们，阅读',
  '复习时，我们还会'
];

const countHanzi = value => (String(value).match(/[\u3400-\u9fff]/g) || []).length;
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

if (lessonArg < 0) {
  assert(index.length === 36, `index.json phải có 36 bài, hiện có ${index.length}.`);
  assert(new Set(index.map(item => Number(item.lessonId))).size === 36, 'index.json có lessonId trùng.');
}

for (const lessonId of selectedIds) {
  const entry = index.find(item => Number(item.lessonId) === lessonId);
  const sourceLesson = source.lessons.find(item => Number(item.lessonId) === lessonId);
  assert(Boolean(entry), `Thiếu index HSK5 bài ${lessonId}.`);
  assert(Boolean(sourceLesson), `Thiếu nguồn HSK5 bài ${lessonId}.`);
  if (!entry || !sourceLesson) continue;
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
  const expectedWords = sourceLesson.vocabulary.map(item => item.hanzi);

  assert(Number(lesson.lessonId) === lessonId, `${prefix}: lessonId không khớp.`);
  assert(lesson.level === 5, `${prefix}: level phải là 5.`);
  assert(lesson.xp === 35, `${prefix}: XP phải là 35.`);
  assert(lesson.title === sourceLesson.title && lesson.chineseTitle === sourceLesson.chineseTitle, `${prefix}: tiêu đề không khớp nguồn.`);
  assert(lesson.audio?.enabled === false, `${prefix}: audio nền phải giữ trạng thái tắt.`);
  assert(lesson.meta?.version === 2 && lesson.meta?.difficulty === 'HSK5', `${prefix}: thiếu meta HSK5 phiên bản 2.`);
  assert(lesson.meta?.passThreshold === 89, `${prefix}: ngưỡng đạt không còn là 89.`);
  assert(Array.isArray(lesson.learningPath?.sections), `${prefix}: thiếu learningPath.`);
  assert(!lesson.learningPath?.sections?.some(section => ['story', 'culture'].includes(section)), `${prefix}: còn section cũ ngoài phạm vi.`);
  assert(new Set(vocabulary.map(item => item.id)).size === vocabulary.length, `${prefix}: trùng id từ chính.`);
  assert(new Set(vocabulary.map(item => item.hanzi)).size === vocabulary.length, `${prefix}: trùng từ chính.`);
  assert(JSON.stringify(vocabulary.map(item => item.hanzi)) === JSON.stringify(expectedWords), `${prefix}: danh sách hoặc thứ tự từ không khớp PDF.`);
  assert(extended.length === 3, `${prefix}: cần đúng 3 từ mở rộng.`);
  assert(lesson.grammar?.length === 5, `${prefix}: cần đúng 5 điểm dùng từ/ngữ pháp.`);
  assert(lesson.grammar?.every(item => item.title && item.pattern && item.explanation && item.examples?.length >= 2), `${prefix}: mục ngữ pháp thiếu nội dung.`);
  assert(lesson.exercises?.length >= 8, `${prefix}: cần ít nhất 8 bài tập.`);
  assert(lesson.lessonText?.length === 1, `${prefix}: phải có đúng một bài đọc mới.`);
  const hanziCount = countHanzi(chinese);
  assert(hanziCount >= 400 && hanziCount <= 650, `${prefix}: bài đọc có ${hanziCount} chữ Hán, ngoài 400–650.`);
  for (const phrase of forbiddenReadingPhrases) {
    assert(!chinese.includes(phrase), `${prefix}: còn chú thích/đoạn mẫu trong bài đọc: ${phrase}`);
  }
  assert(lesson.meta?.hanziCount === hanziCount, `${prefix}: meta.hanziCount không đúng.`);
  assert(segments.map(segment => segment.text).join('') === chinese, `${prefix}: phân đoạn làm thay đổi bài đọc.`);
  assert(segments.some(segment => segment.clickable), `${prefix}: không có cụm tra cứu.`);
  const clickableHanzi = segments.filter(segment => segment.clickable).reduce((sum, segment) => sum + countHanzi(segment.text), 0);
  const lookupCoverage = clickableHanzi / Math.max(1, hanziCount);
  assert(lookupCoverage >= 0.80, `${prefix}: độ phủ tra cứu chỉ ${(lookupCoverage * 100).toFixed(1)}%.`);

  for (const item of [...vocabulary, ...extended]) {
    assert(Boolean(item.hanzi && item.pinyin && item.meaning), `${prefix}: thiếu Hán tự/pinyin/nghĩa ở ${item.hanzi || item.id}.`);
    assert(chinese.includes(item.hanzi), `${prefix}: bài đọc thiếu ${item.hanzi}.`);
    assert(segments.some(segment => segment.clickable && segment.text.includes(item.hanzi)), `${prefix}: ${item.hanzi} chưa tra cứu được trong bài đọc.`);
  }
  for (const item of vocabulary) {
    assert(Boolean(item.example && item.examplePinyin && item.exampleTranslation), `${prefix}: ${item.hanzi} thiếu ví dụ hoặc bản dịch.`);
  }
  for (const item of extended) {
    assert(Boolean(item.partOfSpeech && item.example), `${prefix}: từ mở rộng ${item.hanzi} thiếu dữ liệu.`);
  }
}

const allMain = lessons.flatMap(lesson => lesson.vocabulary.map(item => ({ lessonId: lesson.lessonId, hanzi: item.hanzi })));
const wordLessons = new Map();
for (const item of allMain) {
  if (!wordLessons.has(item.hanzi)) wordLessons.set(item.hanzi, []);
  wordLessons.get(item.hanzi).push(item.lessonId);
}
const repeatedAcrossLessons = [...wordLessons.entries()]
  .filter(([, lessonIds]) => lessonIds.length > 1)
  .map(([hanzi, lessonIds]) => ({ hanzi, lessonIds }));
const sentenceLessons = new Map();
for (const lesson of lessons) {
  const chinese = lesson.lessonText?.[0]?.chinese || '';
  for (const sentence of chinese.split(/[。！？!?]/u).map(value => value.trim()).filter(Boolean)) {
    if (countHanzi(sentence) < 18) continue;
    if (!sentenceLessons.has(sentence)) sentenceLessons.set(sentence, []);
    sentenceLessons.get(sentence).push(lesson.lessonId);
  }
}
const repeatedLongSentences = [...sentenceLessons.entries()]
  .filter(([, lessonIds]) => lessonIds.length > 1)
  .map(([sentence, lessonIds]) => ({ sentence, lessonIds }));
assert(repeatedLongSentences.length === 0, `Duplicate long sentences across HSK5 readings: ${JSON.stringify(repeatedLongSentences)}`);

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    lessons: lessons.length,
    mainVocabularySlots: allMain.length,
    uniqueMainVocabulary: wordLessons.size,
    extendedVocabulary: lessons.reduce((sum, lesson) => sum + lesson.extendedVocabulary.length, 0),
    readingHanziRange: {
      min: Math.min(...lessons.map(lesson => lesson.meta.hanziCount)),
      max: Math.max(...lessons.map(lesson => lesson.meta.hanziCount))
    },
    lookupCoveragePercent: {
      min: Math.min(...lessons.map(lesson => lesson.quality.lookupCoveragePercent)),
      max: Math.max(...lessons.map(lesson => lesson.quality.lookupCoveragePercent))
    },
    repeatedAcrossLessons,
    repeatedLongSentences
  }, null, 2));
}
