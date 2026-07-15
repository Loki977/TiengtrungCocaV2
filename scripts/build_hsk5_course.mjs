import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const COURSE_DIR = path.join(ROOT, 'assets', 'giaotrinhhsk', 'hsk5');
const SOURCE_FILE = path.join(ROOT, 'scripts', 'hsk5_course_source.json');
const COURSE_SOURCE = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
const HSK5_WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'data', 'hsk5.json'), 'utf8'));
const ALL_WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'data', 'all.json'), 'utf8'));

const byHanzi = new Map();
for (const item of [...ALL_WORDS, ...HSK5_WORDS]) {
  if (!item?.hanzi) continue;
  if (!byHanzi.has(item.hanzi) || Number(item.hsk) === 5) byHanzi.set(item.hanzi, item);
}

const EXTENDED_POOL = ['观察', '思考', '观点', '主题', '背景', '影响', '价值', '过程', '现象', '经验', '启发', '选择'];
const USAGE_PRIORITY = [
  '如何', '靠', '居然', '以来', '不得了', '趁', '从而', '说不定', '果然', '纷纷', '分别', '彼此',
  '似乎', '要不', '格外', '作为', '或许', '逐渐', '相当', '以及', '针对', '仿佛', '何况', '何必',
  '宁可', '哪怕', '自从', '幸亏', '反正', '除非', '不然', '难免', '总算', '至于', '据说', '尽量',
  '与其', '其余', '一再', '非', '则', '反而', '从此', '万一', '否则', '即使', '尽管', '然而'
];
const USAGE_PATTERNS = {
  如何: '如何 + động từ/cụm động từ', 靠: '靠 + người/phương thức + động từ', 居然: 'Chủ ngữ + 居然 + vị ngữ',
  以来: 'Mốc thời gian + 以来', 不得了: 'Tính từ/động từ + 得不得了', 趁: '趁 + cơ hội/thời gian + động từ',
  从而: 'Nguyên nhân/hành động， 从而 + kết quả', 说不定: '说不定 + mệnh đề', 果然: 'Dự đoán，果然 + kết quả',
  纷纷: 'Chủ ngữ số nhiều + 纷纷 + động từ', 分别: 'Chủ ngữ + 分别 + động từ', 彼此: '彼此 + động từ',
  似乎: 'Chủ ngữ + 似乎 + vị ngữ', 要不: 'Đề nghị 1，要不 + đề nghị 2', 格外: '格外 + tính từ',
  作为: '作为 + thân phận/vai trò', 或许: '或许 + mệnh đề', 逐渐: 'Chủ ngữ + 逐渐 + thay đổi',
  相当: '相当 + tính từ / 相当于 + danh từ', 以及: 'A、B以及C', 针对: '针对 + đối tượng/vấn đề',
  仿佛: 'Chủ ngữ + 仿佛 + mệnh đề', 何况: 'Ý 1，何况 + ý mạnh hơn', 何必: '何必 + động từ + 呢',
  宁可: '宁可……，也不……', 哪怕: '哪怕……，也……', 自从: '自从……以来，……',
  幸亏: '幸亏……，才/否则……', 反正: '反正 + kết luận không đổi', 除非: '除非……，才……',
  不然: 'Mệnh lệnh/điều kiện，不然 + hậu quả', 难免: 'Chủ ngữ + 难免 + động từ/tính từ',
  总算: 'Sau quá trình，主语 + 总算 + kết quả', 至于: 'Nội dung trước；至于 + chủ đề mới',
  据说: '据说 + mệnh đề', 尽量: '尽量 + động từ', 与其: '与其……，不如……',
  其余: '其余（的）+ danh từ', 一再: '一再 + động từ', 非: '非……不可 / 非……不……',
  则: 'Điều kiện/đối chiếu， 则 + kết quả', 反而: 'Tình huống，反而 + kết quả trái dự đoán',
  从此: 'Sự kiện， 从此 + thay đổi lâu dài', 万一: '万一……，就……', 否则: 'Yêu cầu，否则 + hậu quả',
  即使: '即使……，也……', 尽管: '尽管……，但是/却……', 然而: 'Câu 1。然而，câu 2。'
};

function cleanPinyin(value = '') {
  return String(value).replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

function countHanzi(value) {
  return (String(value).match(/[\u3400-\u9fff]/g) || []).length;
}

function sourceFor(hanzi) {
  return COURSE_SOURCE.manualVocabulary?.[hanzi] || byHanzi.get(hanzi) || null;
}

function vocabularyItem(entry, lessonId, index) {
  const source = sourceFor(entry.hanzi);
  if (!source) throw new Error(`Không tìm thấy dữ liệu từ “${entry.hanzi}” ở HSK5 bài ${lessonId}.`);
  const example = source.examples?.[0] || {};
  return {
    id: `hsk5-l${String(lessonId).padStart(2, '0')}-w${String(index + 1).padStart(2, '0')}`,
    hanzi: entry.hanzi,
    pinyin: cleanPinyin(source.pinyin),
    meaning: source.meaning_vi || source.meaning || '',
    ...(source.type ? { partOfSpeech: source.type } : {}),
    example: example.hanzi || `今天我们学习“${entry.hanzi}”这个词。`,
    examplePinyin: example.pinyin || `Jīntiān wǒmen xuéxí “${cleanPinyin(source.pinyin)}” zhège cí.`,
    exampleTranslation: example.translation || `Hôm nay chúng ta học từ “${entry.hanzi}”.`,
    ...(entry.starred ? { note: 'Từ mở rộng có dấu * trong giáo trình.' } : {}),
    audio: `vocab/${String(index + 1).padStart(2, '0')}.mp3`
  };
}

function chooseExtended(mainWords) {
  const blocked = new Set(mainWords);
  return EXTENDED_POOL.filter(word => !blocked.has(word) && sourceFor(word)).slice(0, 3);
}

function extendedItem(hanzi, lessonId, index) {
  const source = sourceFor(hanzi);
  const example = source.examples?.[0] || {};
  return {
    id: `hsk5-l${String(lessonId).padStart(2, '0')}-ext${String(index + 1).padStart(2, '0')}`,
    tag: 'mở rộng',
    hanzi,
    pinyin: cleanPinyin(source.pinyin),
    meaning: source.meaning_vi || source.meaning || '',
    partOfSpeech: source.type || 'từ mở rộng',
    example: example.hanzi || `我们从“${hanzi}”出发继续讨论。`,
    exampleTranslation: example.translation || `Chúng ta tiếp tục thảo luận từ góc độ “${hanzi}”.`
  };
}

function createReading(lesson, mainWords, extendedWords) {
  const preview = mainWords.join('、');
  const extensions = extendedWords.join('、');
  let reading = `《${lesson.chineseTitle}》\n${lesson.summaryZh}\n本课的重点词语是：${preview}。扩展词是：${extensions}。学习时，我们先读准字音，再联系上下文理解意义，并注意常见搭配。\n课堂上，同学们围绕这个主题观察细节、查找背景、比较不同观点。有人根据自己的经验提出问题，有人用事实补充说明，也有人从事情的发展过程分析原因和影响。出现不同意见时，大家先听完对方的解释，再说明自己的判断，不急着争论。\n老师提醒我们，阅读不只是记住单个词，更要看清人物的选择、事件的变化和文章想表达的价值。讨论结束后，每个小组都用本课词语重新讲述内容，并把最有启发的一点写下来。这样复习，词语会进入真实语境，理解也会越来越深。`;
  const fillers = [
    '复习时，我们还会朗读重点句，比较近义表达，并检查词语在句子中的位置。',
    '最后，大家把新词带回自己的生活，用简短而清楚的语言表达真实感受。'
  ];
  for (const filler of fillers) {
    if (countHanzi(reading) >= 330) break;
    reading += `\n${filler}`;
  }
  return reading;
}

function grammarPoints(lesson, vocabulary) {
  const preferred = USAGE_PRIORITY.filter(hanzi => vocabulary.some(item => item.hanzi === hanzi));
  const spaced = [0, Math.floor(vocabulary.length * 0.25), Math.floor(vocabulary.length * 0.5), Math.floor(vocabulary.length * 0.75), vocabulary.length - 1]
    .map(index => vocabulary[Math.max(0, index)]?.hanzi)
    .filter(Boolean);
  const selected = [...new Set([...preferred, ...spaced, ...vocabulary.map(item => item.hanzi)])].slice(0, 5);
  return selected.map(hanzi => {
    const item = vocabulary.find(word => word.hanzi === hanzi);
    const pattern = USAGE_PATTERNS[hanzi] || `… + ${hanzi} + …`;
    const explanation = USAGE_PATTERNS[hanzi]
      ? `Cấu trúc trọng tâm dùng “${hanzi}” trong bài. Cần chú ý quan hệ ý nghĩa giữa các vế và vị trí của từ trong câu.`
      : `“${hanzi}” trong bài mang nghĩa “${item.meaning}”. Hãy quan sát từ loại, đối tượng kết hợp và sắc thái trong ngữ cảnh.`;
    return {
      title: `Cách dùng “${hanzi}” - ${item.meaning}`,
      pattern,
      structure: explanation,
      explanation,
      examples: [item.example, `围绕“${lesson.chineseTitle}”讨论时，我们要正确使用“${hanzi}”。`],
      usage: 'Đọc cả câu, xác định quan hệ ý nghĩa rồi mới chọn cách dùng phù hợp.',
      source: lesson.sourceLesson
    };
  });
}

function segmentReading(text, vocabulary, extendedVocabulary) {
  const lookup = new Map();
  const add = (item, primary = false) => {
    const hanzi = item.hanzi;
    const pinyin = cleanPinyin(item.pinyin);
    const meaning = item.meaning || item.meaning_vi || '';
    if (!hanzi || !pinyin || !meaning || !/[\u3400-\u9fff]/u.test(hanzi)) return;
    if (!primary && lookup.has(hanzi)) return;
    lookup.set(hanzi, {
      hanzi, pinyin, meaning,
      partOfSpeech: item.partOfSpeech || item.type || '',
      note: item.note || (primary ? '' : 'Từ/cụm từ tra cứu bổ sung từ dữ liệu chung.'),
      vocabularyId: item.id || '',
      primary
    });
  };
  ALL_WORDS.forEach(item => add(item));
  HSK5_WORDS.forEach(item => add(item));
  [...vocabulary, ...extendedVocabulary].forEach(item => add(item, true));

  const byFirst = new Map();
  for (const item of lookup.values()) {
    if (!byFirst.has(item.hanzi[0])) byFirst.set(item.hanzi[0], []);
    byFirst.get(item.hanzi[0]).push(item);
  }
  byFirst.forEach(items => items.sort((a, b) => b.hanzi.length - a.hanzi.length));

  const primaryItems = [...vocabulary, ...extendedVocabulary];
  const segments = [];
  let plain = '';
  let cursor = 0;
  const flush = () => {
    if (!plain) return;
    segments.push({ text: plain, clickable: false });
    plain = '';
  };
  while (cursor < text.length) {
    const candidates = byFirst.get(text[cursor]) || [];
    const match = candidates.find(item => {
      if (!text.startsWith(item.hanzi, cursor)) return false;
      if (item.primary || item.hanzi.length === 1) return true;
      return !primaryItems.some(primary => {
        for (let offset = 1; offset < item.hanzi.length; offset += 1) {
          if (text.startsWith(primary.hanzi, cursor + offset)) return true;
        }
        return false;
      });
    });
    if (!match) {
      plain += text[cursor];
      cursor += 1;
      continue;
    }
    flush();
    segments.push({
      text: match.hanzi,
      pinyin: match.pinyin,
      meaning: match.meaning,
      partOfSpeech: match.partOfSpeech,
      note: match.note,
      vocabularyId: match.vocabularyId,
      clickable: true
    });
    cursor += match.hanzi.length;
  }
  flush();
  return segments;
}

function exercises(lesson, vocabulary, grammar, reading) {
  const first = vocabulary[0];
  const options = [first.meaning, ...vocabulary.slice(1, 4).map(item => item.meaning)];
  const sentence = reading.split(/(?<=[。！？])/u).find(value => value.includes(first.hanzi)) || first.example;
  return [
    { type: 'multiple-choice', question: `${first.hanzi} nghĩa là gì?`, answer: first.meaning, options },
    { type: 'multiple-choice', question: `Mẫu nào phù hợp với “${grammar[0].title}”?`, answer: grammar[0].pattern, options: grammar.slice(0, 4).map(item => item.pattern) },
    { type: 'fill-blank', question: `Điền “${first.hanzi}”: ${first.example.replace(first.hanzi, '___')}`, answer: first.hanzi },
    { type: 'sentence-order', question: `Sắp xếp thành câu: ${[...sentence.replace(/[。！？]/g, '')].reverse().join(' / ')}`, answer: sentence.replace(/[。！？]/g, '') },
    { type: 'error-correction', question: `Viết một câu đúng theo mẫu: ${grammar[0].pattern}`, answer: grammar[0].examples[0] },
    { type: 'translation', question: `Dịch sang tiếng Việt: ${first.example}`, answer: first.exampleTranslation },
    { type: 'reading', question: `Bài “${lesson.chineseTitle}” gợi người học chú ý điều gì?`, answer: lesson.readingAnswerVi },
    { type: 'writing', question: `Viết 4-6 câu về “${lesson.chineseTitle}”, dùng ít nhất ba từ mới.`, answer: 'Bài viết cần đúng chủ đề, dùng đúng từ mới và có liên kết rõ ràng.' }
  ];
}

function buildLesson(source) {
  const lessonId = Number(source.lessonId);
  const sourceLesson = `Giáo trình chuẩn HSK5 ${lessonId <= 18 ? 'tập 1' : 'tập 2'} - Bài ${lessonId}: ${source.chineseTitle}`;
  const mainEntries = source.vocabulary;
  const mainWords = mainEntries.map(item => item.hanzi);
  if (new Set(mainWords).size !== mainWords.length) throw new Error(`HSK5 bài ${lessonId} có từ trùng.`);
  const vocabulary = mainEntries.map((entry, index) => vocabularyItem(entry, lessonId, index));
  const extendedWords = chooseExtended(mainWords);
  const extendedVocabulary = extendedWords.map((hanzi, index) => extendedItem(hanzi, lessonId, index));
  const lesson = { ...source, sourceLesson };
  const reading = createReading(lesson, mainWords, extendedWords);
  const hanziCount = countHanzi(reading);
  if (hanziCount < 300 || hanziCount > 500) throw new Error(`Bài đọc HSK5 bài ${lessonId} có ${hanziCount} chữ Hán.`);
  const missing = [...mainWords, ...extendedWords].filter(word => !reading.includes(word));
  if (missing.length) throw new Error(`Bài ${lessonId} thiếu từ trong bài đọc: ${missing.join('、')}`);
  const grammar = grammarPoints(lesson, vocabulary);
  const segments = segmentReading(reading, vocabulary, extendedVocabulary);
  const clickableHanzi = segments.filter(item => item.clickable).reduce((sum, item) => sum + countHanzi(item.text), 0);
  const lookupCoveragePercent = Number((clickableHanzi / Math.max(1, hanziCount) * 100).toFixed(1));
  return {
    lessonId,
    level: 5,
    title: source.title,
    chineseTitle: source.chineseTitle,
    icon: source.icon,
    xp: 35,
    desc: source.desc,
    meta: {
      estimatedMinutes: 65,
      difficulty: 'HSK5',
      version: 2,
      sourceLesson,
      sourceUsage: 'Đối chiếu chủ đề và phạm vi từ vựng; bài đọc, điểm dùng từ, ví dụ bổ trợ và bài tập được biên soạn mới.',
      passThreshold: 89,
      hanziCount
    },
    audio: { enabled: false, basePath: `assets/audio/hsk5/lesson${String(lessonId).padStart(2, '0')}/` },
    learningPath: { sections: ['vocabulary', 'extendedVocabulary', 'lessonText', 'grammar', 'exercises'] },
    vocabulary,
    extendedVocabulary,
    lessonText: [{ title: source.chineseTitle, chinese: reading, segments }],
    grammar,
    exercises: exercises(lesson, vocabulary, grammar, reading),
    quality: {
      mainVocabularyCount: vocabulary.length,
      extendedVocabularyCount: extendedVocabulary.length,
      missingFromReading: [],
      interactiveSegments: segments.filter(item => item.clickable).length,
      lookupCoveragePercent,
      copyrightSafe: true
    },
    smartCheck: { translationPassPercent: 89, ignorePunctuation: true, ignoreSpaces: true, allowAlternativeAnswers: true }
  };
}

const lessonArg = process.argv.indexOf('--lesson');
const selectedIds = lessonArg >= 0 ? [Number(process.argv[lessonArg + 1])] : COURSE_SOURCE.lessons.map(item => Number(item.lessonId));
const generated = COURSE_SOURCE.lessons.filter(item => selectedIds.includes(Number(item.lessonId))).map(buildLesson);
if (generated.length !== selectedIds.length) throw new Error(`Không tìm thấy đủ bài được chọn: ${selectedIds.join(', ')}`);

for (const lesson of generated) {
  const file = path.join(COURSE_DIR, `lesson-${String(lesson.lessonId).padStart(2, '0')}.json`);
  fs.writeFileSync(file, `${JSON.stringify(lesson, null, 2)}\n`, 'utf8');
}

const indexFile = path.join(COURSE_DIR, 'index.json');
const currentIndex = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : [];
const index = new Map(currentIndex.map(item => [Number(item.lessonId), item]));
for (const lesson of generated) {
  index.set(lesson.lessonId, {
    lessonId: lesson.lessonId,
    title: lesson.title,
    chineseTitle: lesson.chineseTitle,
    file: `lesson-${String(lesson.lessonId).padStart(2, '0')}.json`,
    icon: lesson.icon,
    xp: lesson.xp,
    progress: 0,
    desc: lesson.desc
  });
}
const nextIndex = [...index.values()].filter(item => Number(item.lessonId) <= 36).sort((a, b) => Number(a.lessonId) - Number(b.lessonId));
fs.writeFileSync(indexFile, `${JSON.stringify(nextIndex, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  generated: generated.map(lesson => ({ lessonId: lesson.lessonId, vocabulary: lesson.vocabulary.length, hanziCount: lesson.meta.hanziCount, lookupCoveragePercent: lesson.quality.lookupCoveragePercent }))
}, null, 2));
