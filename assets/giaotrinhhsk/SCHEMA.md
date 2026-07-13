# Chuẩn JSON giáo trình HSK

Mỗi bài học đặt tại:

assets/giaotrinhhsk/hsk1/lesson-01.json

Cấu trúc chuẩn:

{
  "lessonId": 1,
  "level": 1,
  "title": "Xin chào",
  "meta": {
    "estimatedMinutes": 20,
    "difficulty": "HSK1",
    "version": 2
  },
  "audio": {
    "enabled": false,
    "basePath": "assets/audio/hsk1/lesson01/"
  },
  "vocabulary": [],
  "lessonText": [],
  "grammar": [],
  "exercises": []
}

Quy tắc audio:
- Nếu audio.enabled = true và mỗi câu/từ có audio, web sẽ phát mp3.
- Nếu không có audio, web tự dùng giọng đọc trình duyệt.

Ví dụ audio từ vựng:
{
  "hanzi": "你好",
  "pinyin": "nǐ hǎo",
  "meaning": "xin chào",
  "audio": "vocab/nihao.mp3"
}

Ví dụ audio bài khóa:
{
  "speaker": "A:",
  "chinese": "你好！",
  "pinyin": "Nǐ hǎo!",
  "vietnamese": "Xin chào!",
  "audio": "dialogue/001.mp3"
}
