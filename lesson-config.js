import { WRITING_CONTENT_PLANS } from "./writing-content-plan.mjs";

export const LESSON_CONFIGS = {
  hsk1: {
    level: "hsk1",
    label: "HSK1 - Sơ cấp",
    description: "Giao tiếp sinh hoạt hằng ngày",
    splitEvenly: true,
    lessons: [
      { lessonId: 1, title: "Làm quen qua lời chào", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 2, title: "Lời cảm ơn và phút chia tay", vocabularyCount: 19, sentenceCount: 10 },
      { lessonId: 3, title: "Tên gọi, quê quán và quốc tịch", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 4, title: "Kết nối và giới thiệu bạn bè", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 5, title: "Người thân, tuổi tác và số đếm", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 6, title: "Học ngoại ngữ và khả năng biểu đạt", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 7, title: "Sắp xếp lịch trình theo ngày", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 8, title: "Bữa ăn và lựa chọn mua sắm", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 9, title: "Nghề nghiệp trong môi trường làm việc", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 10, title: "Tìm chỗ cho các vật dụng", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 11, title: "Các thời điểm của một ngày", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 12, title: "Khí hậu và cách chăm sóc cơ thể", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 13, title: "Việc đang làm ngay lúc này", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 14, title: "Chọn trang phục và kể việc đã qua", vocabularyCount: 20, sentenceCount: 10 },
      { lessonId: 15, title: "Đi lại trong chuyến du lịch", vocabularyCount: 20, sentenceCount: 9 }
    ]
  },
  hsk2: {
    level: "hsk2",
    label: "HSK2 - Sơ cấp",
    description: "Từ vựng và mẫu câu nền tảng",
    lessons: createPlannedLessons("hsk2", 20)
  },
  hsk3: {
    level: "hsk3",
    label: "HSK3 - Sơ cấp",
    description: "Diễn đạt chủ đề quen thuộc",
    lessons: createPlannedLessons("hsk3", 30)
  },
  hsk4: {
    level: "hsk4",
    label: "HSK4 - Trung cấp",
    description: "Giao tiếp linh hoạt hơn",
    lessons: createPlannedLessons("hsk4", 40)
  },
  hsk5: createEvenConfig("hsk5", "HSK5 - Cao cấp", "Đọc hiểu và thảo luận mở rộng", WRITING_CONTENT_PLANS.hsk5.map((item) => item[1]), 40),
  hsk6: createEvenConfig("hsk6", "HSK6 - Cao cấp", "Nâng cao phản xạ ngôn ngữ", WRITING_CONTENT_PLANS.hsk6.map((item) => item[1]), 50)
};

function createPlannedLessons(level, vocabularyCount) {
  return WRITING_CONTENT_PLANS[level].map(([, title], index) => ({
    lessonId: index + 1,
    title,
    vocabularyCount,
    sentenceCount: 10
  }));
}

function createEvenConfig(level, label, description, topics, vocabularyCount) {
  return {
    level,
    label,
    description,
    splitEvenly: true,
    lessons: topics.map((title, index) => ({
      lessonId: index + 1,
      title,
      vocabularyCount,
      sentenceCount: 10
    }))
  };
}

export function getLessonConfig(level) {
  const key = String(level || "").toLowerCase();
  return LESSON_CONFIGS[key];
}
