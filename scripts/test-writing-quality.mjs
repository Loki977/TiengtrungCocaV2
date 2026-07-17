import assert from "node:assert/strict";
import fs from "node:fs/promises";

globalThis.fetch = async (url) => {
  try {
    return new Response(await fs.readFile(String(url)), { status: 200 });
  } catch {
    return new Response("", { status: 404 });
  }
};

const { areAnswersEquivalent, generateLessons } = await import("../lesson-engine.js");
const { getLessonConfig } = await import("../lesson-config.js");

const forbiddenPatterns = [
  /今天我们学习/u,
  /我们会用到/u,
  /造句/u,
  /Hôm nay chúng ta học từ/iu,
  /Trong chủ đề.+chúng ta sẽ dùng từ/iu
];

const expectedLessonCounts = { hsk2: 15, hsk3: 20, hsk4: 20, hsk5: 36, hsk6: 40 };
const expectedSentenceCounts = { hsk2: 135, hsk3: 197, hsk4: 200, hsk5: 360, hsk6: 400 };

for (const level of ["hsk2", "hsk3", "hsk4", "hsk5", "hsk6"]) {
  const lessons = await generateLessons(level, getLessonConfig(level));
  const allSentences = lessons.flatMap((lesson) => lesson.sentences);

  assert.equal(lessons.length, expectedLessonCounts[level], `${level} thiếu bài luyện viết`);
  assert.equal(allSentences.length, expectedSentenceCounts[level], `${level} thiếu câu luyện viết`);
  assert.equal(
    new Set(allSentences.map((sentence) => sentence.chinese)).size,
    allSentences.length,
    `${level} không được lặp câu giữa các bài`
  );

  for (const lesson of lessons) {
    assert.equal(
      lesson.sentences.length,
      lesson.sentenceCount,
      `${level} bài ${lesson.lessonId} phải có đủ số câu đã công bố`
    );

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

      if (level === "hsk5" || level === "hsk6") {
        const sourcePath = `assets/giaotrinhhsk/${level}/lesson-${String(lesson.lessonId).padStart(2, "0")}.json`;
        const sourceLesson = JSON.parse(await fs.readFile(sourcePath, "utf8"));
        const sourceVocabulary = [...(sourceLesson.vocabulary || []), ...(sourceLesson.extendedVocabulary || [])];
        const sourceArticle = (sourceLesson.lessonText || []).map((item) => item.chinese || "").join("");
        const belongsToTopic = level === "hsk5"
          ? sourceVocabulary.some((item) => item.hanzi === sentence.vocabulary.chinese)
          : sourceArticle.includes(sentence.vocabulary.chinese);
        assert.ok(belongsToTopic, `${level} bài ${lesson.lessonId} có câu lệch nguồn chủ đề: ${sentence.chinese}`);
      }

      assert.ok(areAnswersEquivalent(sentence.chinese, sentence.chinese, "zh"));
      assert.ok(areAnswersEquivalent(sentence.pinyin, sentence.pinyin, "pinyin"));
      assert.ok(areAnswersEquivalent(sentence.vietnamese, sentence.vietnamese, "vi"));
    }
  }
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

console.log("Writing quality checks passed for HSK2 through HSK6.");
