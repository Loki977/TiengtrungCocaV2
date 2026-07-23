import assert from "node:assert/strict";
import fs from "node:fs/promises";

globalThis.fetch = async (url) => {
  try {
    return new Response(await fs.readFile(String(url)), { status: 200 });
  } catch {
    return new Response("", { status: 404 });
  }
};

const {
  annotateWritingLesson,
  areAnswersEquivalent,
  areAnswersExactlyEquivalent,
  generateLessons,
  loadWritingAnnotations
} = await import("../lesson-engine.js");
const { getLessonConfig } = await import("../lesson-config.js");
const { getWritingPlan } = await import("../writing-content-plan.mjs");

const forbiddenPatterns = [
  /今天我们学习/u,
  /我们会用到/u,
  /造句/u,
  /本课重点表达/u,
  /这个词和第\d+课的主题有关/u,
  /围绕.+讨论时.+正确使用/u,
  /Hôm nay chúng ta học từ/iu,
  /Trong chủ đề.+chúng ta sẽ dùng từ/iu
];

const expectedLessonCounts = { hsk1: 15, hsk2: 15, hsk3: 20, hsk4: 20, hsk5: 36, hsk6: 40 };
const expectedSentenceCounts = { hsk1: 149, hsk2: 150, hsk3: 200, hsk4: 200, hsk5: 360, hsk6: 400 };
const expectedVocabularyPerLesson = { hsk2: 20, hsk3: 30, hsk4: 40, hsk5: 40, hsk6: 50 };
const correctedClassifierExamples = [
  "这篇文章的标题很吸引人。",
  "这条项链很漂亮。",
  "这块手表的价值很高。",
  "这台机器消耗很多电。",
  "这片平原很广阔。"
];
const allTitles = new Set();
const writingAnnotations = await loadWritingAnnotations();
const allowedWordTypes = new Set([
  "Danh từ", "Danh từ riêng", "Động từ", "Tính từ", "Phó từ", "Đại từ", "Số từ",
  "Lượng từ", "Phương vị từ", "Giới từ", "Liên từ", "Trợ từ", "Thán từ", "Từ tượng thanh", "Cụm từ"
]);
const allowedComponentKeys = new Set([
  "subject", "predicate", "object", "adverbial", "attribute", "complement", "conjunction",
  "time", "location", "purpose", "reason", "condition", "head", "subject-head", "object-head",
  "ba", "bei", "pp"
]);

assert.equal(
  writingAnnotations.meta.wordCount,
  Object.keys(writingAnnotations.wordTypes).length,
  "Chú giải Luyện viết sai tổng số từ"
);
assert.equal(
  writingAnnotations.meta.sentenceCount,
  Object.keys(writingAnnotations.sentences).length,
  "Chú giải Luyện viết sai tổng số câu"
);

function componentKeys(sentence) {
  return writingAnnotations.sentences[sentence]?.map((item) => item.key) || [];
}

assert.deepEqual(
  componentKeys("请把桌子擦干净。"),
  ["predicate", "ba", "object", "predicate", "complement"],
  "Câu 把 phải tách dấu hiệu, đối tượng, động từ và bổ ngữ kết quả"
);
assert.deepEqual(
  componentKeys("他被老师表扬了。"),
  ["subject", "bei", "adverbial", "predicate"],
  "Câu 被 phải tách chủ thể chịu tác động, tác nhân và vị ngữ"
);
assert.deepEqual(
  componentKeys("他的汉语说得很流利。"),
  ["attribute", "subject-head", "predicate", "complement"],
  "Cấu trúc 得 phải gom đúng cụm bổ ngữ trạng thái"
);

function verifyAnnotations(level, lessons) {
  for (const lesson of lessons.map((item) => annotateWritingLesson(item, writingAnnotations))) {
    for (const word of lesson.vocabularies) {
      assert.ok(word.wordTypes.length, `${level} thiếu loại từ: ${word.chinese}`);
      assert.ok(word.wordTypes.every((type) => allowedWordTypes.has(type)), `${level} có loại từ lạ: ${word.chinese}`);
    }
    for (const sentence of lesson.sentences) {
      assert.ok(sentence.components.length >= 1, `${level} thiếu thành phần câu: ${sentence.chinese}`);
      assert.ok(sentence.components.some((item) => item.key === "predicate"), `${level} thiếu vị ngữ: ${sentence.chinese}`);
      assert.ok(sentence.components.every((item) => allowedComponentKeys.has(item.key) && item.label && item.text), `${level} có nhãn câu lỗi: ${sentence.chinese}`);
      assert.equal(
        sentence.components.map((item) => item.text).join("").replace(/\s+/gu, ""),
        sentence.chinese.replace(/\s+/gu, ""),
        `${level} phân tích làm thay đổi câu: ${sentence.chinese}`
      );
    }
  }
}

const hsk1Lessons = await generateLessons("hsk1", getLessonConfig("hsk1"));
verifyAnnotations("hsk1", hsk1Lessons);
assert.equal(hsk1Lessons.length, expectedLessonCounts.hsk1, "HSK1 thiếu bài luyện viết");
assert.equal(hsk1Lessons.flatMap((lesson) => lesson.sentences).length, expectedSentenceCounts.hsk1, "HSK1 thiếu câu luyện viết");
for (const lesson of hsk1Lessons) {
  assert.ok(lesson.title.trim(), `HSK1 bài ${lesson.lessonId} thiếu tên`);
  assert.ok(!allTitles.has(lesson.title.trim()), `Tên bài bị trùng giữa các cấp: ${lesson.title}`);
  allTitles.add(lesson.title.trim());
  assert.equal(new Set(lesson.vocabularies.map((word) => word.chinese)).size, lesson.vocabularies.length, `HSK1 bài ${lesson.lessonId} lặp từ`);
  for (const word of lesson.vocabularies) {
    assert.ok(word.chinese && word.pinyin && word.vietnamese, `HSK1 bài ${lesson.lessonId} thiếu dữ liệu từ`);
  }
}

for (const level of ["hsk2", "hsk3", "hsk4", "hsk5", "hsk6"]) {
  const lessons = await generateLessons(level, getLessonConfig(level));
  verifyAnnotations(level, lessons);
  const allSentences = lessons.flatMap((lesson) => lesson.sentences);
  const rawItems = JSON.parse(await fs.readFile(`assets/data/writing/${level}.json`, "utf8"));
  const ids = rawItems.map((item) => item.id);
  const plan = getWritingPlan(level);

  assert.equal(new Set(ids).size, ids.length, `${level} có ID trùng`);
  assert.equal(plan.length, expectedLessonCounts[level], `${level} thiếu cấu hình chủ đề`);
  assert.ok(plan.every((item) => item.sourceLesson !== item.lessonId), `${level} vẫn giữ nguyên thứ tự Khóa học`);

  assert.equal(lessons.length, expectedLessonCounts[level], `${level} thiếu bài luyện viết`);
  assert.equal(allSentences.length, expectedSentenceCounts[level], `${level} thiếu câu luyện viết`);
  assert.equal(
    new Set(allSentences.map((sentence) => sentence.chinese)).size,
    allSentences.length,
    `${level} không được lặp câu giữa các bài`
  );

  for (const lesson of lessons) {
    assert.ok(lesson.title.trim(), `${level} bài ${lesson.lessonId} thiếu tên`);
    assert.ok(!allTitles.has(lesson.title.trim()), `Tên bài bị trùng giữa các cấp: ${lesson.title}`);
    allTitles.add(lesson.title.trim());
    assert.equal(
      lesson.sentences.length,
      lesson.sentenceCount,
      `${level} bài ${lesson.lessonId} phải có đủ số câu đã công bố`
    );

    assert.equal(
      lesson.vocabularies.length,
      expectedVocabularyPerLesson[level],
      `${level} bài ${lesson.lessonId} phải có đủ ${expectedVocabularyPerLesson[level]} từ`
    );

    assert.equal(
      new Set(lesson.vocabularies.map((word) => word.chinese)).size,
      lesson.vocabularies.length,
      `${level} bài ${lesson.lessonId} không được lặp từ`
    );

    for (const word of lesson.vocabularies) {
      assert.ok(word.chinese, `${level} bài ${lesson.lessonId} có từ thiếu Hanzi`);
      assert.ok(word.pinyin && word.vietnamese, `${level} bài ${lesson.lessonId} có từ thiếu pinyin hoặc nghĩa`);
    }

    assert.equal(
      new Set(lesson.sentences.map((sentence) => sentence.chinese)).size,
      lesson.sentences.length,
      `${level} bài ${lesson.lessonId} không được lặp câu`
    );

    for (const sentence of lesson.sentences) {
      const combinedText = `${sentence.chinese} ${sentence.vietnamese}`;
      assert.ok(
        !forbiddenPatterns.some((pattern) => pattern.test(combinedText)),
        `${level} bài ${lesson.lessonId} còn câu theo khuôn: ${combinedText}`
      );
      assert.ok(
        Number(sentence.vocabulary.lessonId) === Number(lesson.lessonId),
        `${level} bài ${lesson.lessonId} có câu lấy sai nhóm chủ đề: ${sentence.chinese}`
      );
      assert.ok(sentence.pinyin && sentence.vietnamese, `${level} bài ${lesson.lessonId} thiếu pinyin hoặc bản dịch`);
      assert.ok(!/\p{Script=Han}/u.test(sentence.pinyin), `${level} bài ${lesson.lessonId} có pinyin lỗi`);
      assert.ok(/^[^\p{L}]*\p{Lu}/u.test(sentence.vietnamese), `${level} bài ${lesson.lessonId} có bản dịch chưa viết hoa`);



      assert.ok(areAnswersEquivalent(sentence.chinese, sentence.chinese, "zh"));
      assert.ok(areAnswersEquivalent(sentence.pinyin, sentence.pinyin, "pinyin"));
      assert.ok(areAnswersEquivalent(sentence.vietnamese, sentence.vietnamese, "vi"));
    }
  }

  const courseDir = `assets/giaotrinhhsk/${level}`;
  const courseFiles = (await fs.readdir(courseDir))
    .filter((name) => /^lesson-\d+\.json$/u.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const courseWordSets = await Promise.all(courseFiles.map(async (name) => {
    const course = JSON.parse(await fs.readFile(`${courseDir}/${name}`, "utf8"));
    return new Set([...(course.vocabulary || []), ...(course.extendedVocabulary || [])].map((word) => word.hanzi));
  }));
  for (const lesson of lessons) {
    const maxOverlap = Math.max(...courseWordSets.map((courseWords) => (
      lesson.vocabularies.filter((word) => courseWords.has(word.chinese)).length / lesson.vocabularies.length
    )));
    assert.ok(maxOverlap < 0.5, `${level} bài ${lesson.lessonId} còn trùng ${(maxOverlap * 100).toFixed(1)}% với một bài Khóa học`);
  }
}

const hsk6WritingRows = JSON.parse(await fs.readFile("assets/data/writing/hsk6.json", "utf8"));
const hsk6WritingExamples = hsk6WritingRows.flatMap((item) => item.examples || []).map((example) => example.hanzi);
for (const sentence of correctedClassifierExamples) {
  assert.ok(hsk6WritingExamples.includes(sentence), `HSK6 phải dùng lượng từ đúng: ${sentence}`);
}

assert.equal(
  areAnswersEquivalent(
    "Cuối tuần tôi đi chơi ở công viên",
    "Cuối tuần tôi đi công viên chơi.",
    "vi"
  ),
  true,
  "Bản dịch đúng đại ý phải được chấp nhận"
);
assert.equal(
  areAnswersEquivalent(
    "Tôi đi công viên",
    "Cuối tuần tôi đi công viên chơi.",
    "vi"
  ),
  false,
  "Câu thiếu ý chính không được tính đúng"
);
assert.equal(
  areAnswersEquivalent("Tôi không uống bia", "Tôi uống bia.", "vi"),
  false,
  "Không được bỏ qua khác biệt phủ định"
);
assert.equal(
  areAnswersEquivalent("Wo dasuan qu lvyou", "Wǒ dǎsuàn qù lǚyóu.", "pinyin"),
  true,
  "Pinyin không dấu nhưng đúng phải được chấp nhận"
);

assert.equal(areAnswersExactlyEquivalent("我喜欢学习中文", "我喜欢学习中文。", "zh"), true, "Được bỏ qua dấu câu");
assert.equal(areAnswersExactlyEquivalent("我喜欢中文", "我喜欢学习中文。", "zh"), false, "Thiếu chữ không được tính đúng");
assert.equal(areAnswersExactlyEquivalent("Wo xihuan xuexi Zhongwen", "Wǒ xǐhuan xuéxí Zhōngwén.", "pinyin"), true, "Pinyin không dấu nhưng đủ phải đúng");
assert.equal(areAnswersExactlyEquivalent("Wo xihuan Zhongwen", "Wǒ xǐhuan xuéxí Zhōngwén.", "pinyin"), false, "Pinyin thiếu âm tiết phải sai");
assert.equal(areAnswersExactlyEquivalent("Tôi thích học tiếng Trung", "Tôi thích học tiếng Trung.", "vi"), true, "Nghĩa Việt đầy đủ phải đúng");
assert.equal(areAnswersExactlyEquivalent("Tôi thích tiếng Trung", "Tôi thích học tiếng Trung.", "vi"), false, "Nghĩa Việt thiếu từ phải sai");

const lessonPageSource = await fs.readFile("lesson-page.js", "utf8");
const inputHandlerStart = lessonPageSource.indexOf("function handleAnswerInput");
const inputHandlerEnd = lessonPageSource.indexOf("\nfunction submitCurrentAnswer", inputHandlerStart);
const inputHandlerSource = lessonPageSource.slice(inputHandlerStart, inputHandlerEnd);
assert.ok(inputHandlerStart >= 0 && inputHandlerEnd > inputHandlerStart, "Phải tìm thấy handler nhập đáp án");
assert.equal(inputHandlerSource.includes("submitCurrentAnswer("), false, "Gõ đúng không được tự chấm");
assert.match(lessonPageSource, /Bấm “Kết quả” để chấm đáp án/, "Enter phải yêu cầu bấm Kết quả");
assert.match(lessonPageSource, /const TTS_NORMAL_RATE = 0\.754/, "Tốc độ nghe thường phải tăng 30%");
assert.match(lessonPageSource, /const TTS_SLOW_RATE = 0\.35/, "Tốc độ chậm phải giảm thêm khoảng 40%");
assert.match(lessonPageSource, /new SentenceStructure\(\{ level \}\)/, "Cấu trúc câu phải dùng component chung");
assert.equal(lessonPageSource.includes("function renderSentenceComponents"), false, "Không được lặp renderer cấu trúc câu trong trang");
assert.match(lessonPageSource, /mode: "cn-to-vi"/, "Luyện viết phải mặc định ở chế độ Trung → Việt");
assert.match(lessonPageSource, /sentence-answer-translation/, "Trung → Việt phải hiện đáp án tiếng Việt nội tuyến");
assert.match(lessonPageSource, /return String\(item\.vietnamese \|\| ""\)/, "Thanh tiến độ Trung → Việt phải dùng đáp án tiếng Việt nguyên dạng");
assert.match(lessonPageSource, /isAnswered \|\| isRevealed \? getExpectedAnswerValue\(item\)/, "Câu đã bấm Đáp án phải giữ vạch tiến độ đúng khi quay lại");
assert.match(lessonPageSource, /showSymbols: state\.showSentenceStructureLabels/, "CMS phải có thể ẩn riêng ký hiệu cấu trúc câu");

const sentenceStructureSource = await fs.readFile("assets/js/sentence-structure.js", "utf8");
for (const symbol of ["S", "V", "O", "A", "C", "Att", "H"]) {
  assert.ok(sentenceStructureSource.includes(`symbol: "${symbol}"`), `Thiếu ký hiệu cấu trúc ${symbol}`);
}
assert.match(sentenceStructureSource, /if \(showSymbols\)/, "Ẩn ký hiệu không được ẩn màu hoặc gạch chân của cụm câu");

const adminWritingSource = await fs.readFile("assets/js/admin-super.js", "utf8");
const adminWritingHtml = await fs.readFile("admin-super.html", "utf8");
assert.match(adminWritingHtml, /id="writingCmsGlobalSentenceLabels"/, "CMS phải có công tắc ký hiệu cấu trúc câu hàng loạt");
assert.match(adminWritingSource, /saveWritingSentenceLabelSetting/, "CMS phải lưu công tắc ký hiệu cấu trúc câu hàng loạt");

const adminHtml = await fs.readFile("admin-super.html", "utf8");
const adminSource = await fs.readFile("assets/js/admin-super.js", "utf8");
const rulesSource = await fs.readFile("firestore.rules", "utf8");
const writingListSource = await fs.readFile("hsk1-writing-lessons.html", "utf8");
assert.match(adminHtml, /data-tab="writing"/, "Admin phải có tab CMS Luyện viết");
for (const id of ["writingCmsLevel", "writingCmsLesson", "writingCmsVocab", "writingCmsSentences", "writingCmsSave"]) {
  assert.ok(adminHtml.includes(`id="${id}"`), `CMS Luyện viết thiếu ${id}`);
}
assert.match(adminSource, /writingLessonOverrides/, "CMS phải lưu override Luyện viết vào Firestore");
assert.match(adminSource, /WRITING_VOCAB_TARGETS = \{ hsk1: 10, hsk2: 20, hsk3: 30, hsk4: 40, hsk5: 40, hsk6: 50 \}/, "CMS phải kiểm tra đúng số từ từng HSK");
assert.match(rulesSource, /match \/writingLessonOverrides\/\{docId\}[\s\S]*allow write: if isSuperAdmin\(\)/, "Chỉ Super Admin được ghi CMS Luyện viết");
assert.match(writingListSource, /query\(collection\(shared\.db, "writingLessonOverrides"\), where\("level", "==", config\.level\)\)/, "Danh sách bài phải đọc thay đổi từ CMS");
assert.match(writingListSource, /normalizeWritingLessonContent\(override, item\)/, "Danh sách bài phải áp dụng override đã chuẩn hóa");

console.log("Writing quality, independence and CMS checks passed for HSK1 through HSK6.");
