import json
import re
from pathlib import Path

from course_content_tools import COURSE_DIR, count_hanzi, load_json, lookup_coverage


EXPECTED_COUNTS = {1: 15, 2: 15, 3: 20, 4: 20, 5: 36, 6: 40}
EXPECTED_SECTIONS = [
    "vocabulary",
    "extendedVocabulary",
    "lessonText",
    "grammar",
    "exercises",
]
MOJIBAKE_RE = re.compile(r"(?:Ã.|ðŸ|â€|á»|Ä‘|Æ°)")


def text_segments(lesson):
    return [
        segment
        for line in lesson.get("lessonText") or []
        for segment in line.get("segments") or []
    ]


def validate_level(level):
    course_dir = COURSE_DIR / f"hsk{level}"
    index = load_json(course_dir / "index.json")
    errors = []
    rows = []

    if len(index) != EXPECTED_COUNTS[level]:
        errors.append(
            f"HSK{level}: index có {len(index)} bài, cần {EXPECTED_COUNTS[level]}"
        )

    lesson_ids = [int(item["lessonId"]) for item in index]
    if lesson_ids != list(range(1, EXPECTED_COUNTS[level] + 1)):
        errors.append(f"HSK{level}: lessonId không liên tục")

    for item in index:
        lesson_id = int(item["lessonId"])
        lesson_path = course_dir / item["file"]
        try:
            lesson = load_json(lesson_path)
        except Exception as error:
            errors.append(f"{lesson_path}: JSON lỗi: {error}")
            continue

        raw = lesson_path.read_text(encoding="utf-8")
        if MOJIBAKE_RE.search(raw):
            errors.append(f"HSK{level} bài {lesson_id}: phát hiện dấu hiệu mojibake")

        if int(lesson.get("lessonId") or 0) != lesson_id:
            errors.append(f"HSK{level} bài {lesson_id}: lessonId trong file không khớp")
        if int(lesson.get("level") or 0) != level:
            errors.append(f"HSK{level} bài {lesson_id}: level trong file không khớp")

        sections = (lesson.get("learningPath") or {}).get("sections")
        if sections != EXPECTED_SECTIONS:
            errors.append(
                f"HSK{level} bài {lesson_id}: learningPath không đúng cấu trúc chuẩn"
            )

        vocabulary = lesson.get("vocabulary") or []
        extended = lesson.get("extendedVocabulary") or []
        main_words = [row.get("hanzi") for row in vocabulary if row.get("hanzi")]
        extended_words = [row.get("hanzi") for row in extended if row.get("hanzi")]
        overlap = sorted(set(main_words) & set(extended_words))
        if overlap:
            errors.append(
                f"HSK{level} bài {lesson_id}: trùng từ chính/mở rộng: {overlap}"
            )
        if len(extended_words) != len(set(extended_words)):
            errors.append(f"HSK{level} bài {lesson_id}: trùng từ mở rộng")

        lesson_text = lesson.get("lessonText") or []
        segments = text_segments(lesson)
        full_text = "".join(line.get("chinese") or "" for line in lesson_text)
        coverage = lookup_coverage(segments, full_text)
        stored_coverage = (lesson.get("quality") or {}).get("lookupCoveragePercent")
        if stored_coverage != coverage:
            errors.append(
                f"HSK{level} bài {lesson_id}: coverage lưu {stored_coverage}, thực tế {coverage}"
            )

        if level in (1, 2):
            expected_lines = 10 if level == 1 else 12
            if len(lesson_text) != expected_lines:
                errors.append(
                    f"HSK{level} bài {lesson_id}: có {len(lesson_text)} câu, cần {expected_lines}"
                )
            for line_number, row in enumerate(lesson_text, start=1):
                for key in ("speaker", "chinese", "pinyin", "vietnamese", "segments"):
                    if not row.get(key):
                        errors.append(
                            f"HSK{level} bài {lesson_id} câu {line_number}: thiếu {key}"
                        )
            missing_extended = [word for word in extended_words if word not in full_text]
            if missing_extended:
                errors.append(
                    f"HSK{level} bài {lesson_id}: từ mở rộng không có trong hội thoại: {missing_extended}"
                )
            minimum_coverage = 84
        else:
            if len(lesson_text) != 1 or not lesson_text[0].get("title"):
                errors.append(
                    f"HSK{level} bài {lesson_id}: bài đọc phải là một văn bản có tiêu đề"
                )
            missing_words = [
                word for word in [*main_words, *extended_words] if word not in full_text
            ]
            if missing_words:
                errors.append(
                    f"HSK{level} bài {lesson_id}: thiếu từ trong bài đọc: {missing_words}"
                )
            hanzi_count = count_hanzi(full_text)
            limits = {3: (240, 520), 4: (250, 450), 5: (400, 650), 6: (550, 900)}[level]
            if not limits[0] <= hanzi_count <= limits[1]:
                errors.append(
                    f"HSK{level} bài {lesson_id}: {hanzi_count} chữ Hán ngoài {limits}"
                )
            reading_exercises = [
                row for row in lesson.get("exercises") or [] if row.get("type") == "reading"
            ]
            if len(reading_exercises) != 1:
                errors.append(
                    f"HSK{level} bài {lesson_id}: cần đúng một câu hỏi đọc hiểu"
                )
            minimum_coverage = 80 if level in (5, 6) else 82

        if level == 5:
            forbidden_notes = (
                "本课的重点词语是",
                "扩展词是",
                "学习时，我们先",
                "课堂上，同学们",
                "老师提醒我们，阅读",
                "复习时，我们还会",
            )
            for phrase in forbidden_notes:
                if phrase in full_text:
                    errors.append(
                        f"HSK5 bài {lesson_id}: còn chú thích/đoạn mẫu trong bài đọc: {phrase}"
                    )

        if coverage < minimum_coverage:
            errors.append(
                f"HSK{level} bài {lesson_id}: coverage {coverage}% dưới {minimum_coverage}%"
            )

        if level == 6:
            forbidden_notes = (
                "为了把材料转化为本课可练习的HSK6表达",
                "这些词不是网络原文的摘录",
                "把材料改写成学习文本时",
                "从语言训练的角度看",
                "因此，阅读结束后可以继续追问",
            )
            for phrase in forbidden_notes:
                if phrase in full_text:
                    errors.append(
                        f"HSK6 bài {lesson_id}: còn chú thích/đoạn đệm trong bài đọc: {phrase}"
                    )
            sources = (lesson.get("meta") or {}).get("referenceSources") or []
            if len(sources) != 1 or not str(sources[0].get("url") or "").startswith(
                "https://"
            ):
                errors.append(f"HSK6 bài {lesson_id}: thiếu nguồn tham khảo HTTPS")
            if not (lesson.get("quality") or {}).get("sourceBacked"):
                errors.append(f"HSK6 bài {lesson_id}: thiếu cờ sourceBacked")

        rows.append(
            {
                "lessonId": lesson_id,
                "mainVocabulary": len(vocabulary),
                "extendedVocabulary": len(extended),
                "lessonTextItems": len(lesson_text),
                "hanziCount": count_hanzi(full_text),
                "coverage": coverage,
            }
        )

    return errors, rows


def summarize(rows):
    return {
        "lessons": len(rows),
        "mainVocabulary": sum(row["mainVocabulary"] for row in rows),
        "extendedVocabulary": sum(row["extendedVocabulary"] for row in rows),
        "hanziRange": [
            min(row["hanziCount"] for row in rows),
            max(row["hanziCount"] for row in rows),
        ],
        "coverageRange": [
            min(row["coverage"] for row in rows),
            max(row["coverage"] for row in rows),
        ],
    }


def main():
    all_errors = []
    report = {}
    for level in EXPECTED_COUNTS:
        errors, rows = validate_level(level)
        all_errors.extend(errors)
        report[f"hsk{level}"] = summarize(rows)

    if all_errors:
        print(json.dumps({"ok": False, "errors": all_errors}, ensure_ascii=False, indent=2))
        raise SystemExit(1)

    print(json.dumps({"ok": True, "report": report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
