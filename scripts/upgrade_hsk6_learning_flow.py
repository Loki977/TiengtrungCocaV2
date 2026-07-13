import json
from collections import OrderedDict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HSK6_DIR = ROOT / "assets" / "giaotrinhhsk" / "hsk6"
REPORT_PATH = HSK6_DIR / "learning-flow-report.md"
PAGE_SIZE = 8

LEARNING_PATH = {
    "mode": "sequential",
    "sections": [
        "vocabulary",
        "extendedVocabulary",
        "lessonText",
        "story",
        "culture",
        "grammar",
        "exercises",
    ],
    "allowSkip": False,
    "reviewAfterComplete": True,
}

EXERCISE_TYPES = [
    "multiple-choice",
    "fill-blank",
    "sentence-order",
    "error-correction",
    "translation",
    "reading",
    "writing",
]


def chunk_list(items, size=PAGE_SIZE):
    return [
        {"page": i // size + 1, "items": items[i : i + size]}
        for i in range(0, len(items), size)
    ]


def group_exercises(exercises):
    groups = OrderedDict((exercise_type, []) for exercise_type in EXERCISE_TYPES)
    for exercise in exercises:
        exercise_type = exercise.get("type", "writing")
        if exercise_type not in groups:
            groups[exercise_type] = []
        groups[exercise_type].append(exercise)
    return groups


def merge_learning_path(existing):
    if not isinstance(existing, dict):
        return dict(LEARNING_PATH)

    merged = dict(LEARNING_PATH)
    merged.update(existing)
    if not isinstance(merged.get("sections"), list) or not merged["sections"]:
        merged["sections"] = LEARNING_PATH["sections"]
    if "allowSkip" not in merged:
        merged["allowSkip"] = False
    if "reviewAfterComplete" not in merged:
        merged["reviewAfterComplete"] = True
    if "mode" not in merged:
        merged["mode"] = "sequential"
    return merged


def upgrade_lesson(path):
    data = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=OrderedDict)

    vocabulary = data.get("vocabulary") or []
    extended_vocabulary = data.get("extendedVocabulary") or []
    exercises = data.get("exercises") or []

    data["learningPath"] = merge_learning_path(data.get("learningPath"))
    data["vocabularyPages"] = chunk_list(vocabulary)
    data["extendedVocabularyPages"] = chunk_list(extended_vocabulary)
    data["exerciseGroups"] = group_exercises(exercises)

    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    json.loads(path.read_text(encoding="utf-8"))

    return {
        "file": path.name,
        "lessonId": data.get("lessonId"),
        "vocabulary": len(vocabulary),
        "vocabularyPages": len(data["vocabularyPages"]),
        "extendedVocabulary": len(extended_vocabulary),
        "extendedVocabularyPages": len(data["extendedVocabularyPages"]),
        "exercises": len(exercises),
        "exerciseGroups": {
            key: len(value) for key, value in data["exerciseGroups"].items() if value
        },
    }


def write_report(rows):
    lines = [
        "# HSK6 Learning Flow Upgrade Report",
        "",
        f"- Lessons processed: {len(rows)}",
        f"- Vocabulary page size: {PAGE_SIZE}",
        "",
        "| Lesson | Vocabulary | Vocab pages | Extended vocab | Extended pages | Exercises | Exercise groups |",
        "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]

    for row in rows:
        groups = ", ".join(
            f"{name}:{count}" for name, count in row["exerciseGroups"].items()
        )
        lines.append(
            f"| {row['file']} | {row['vocabulary']} | {row['vocabularyPages']} | "
            f"{row['extendedVocabulary']} | {row['extendedVocabularyPages']} | "
            f"{row['exercises']} | {groups or '-'} |"
        )

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    lesson_files = sorted(HSK6_DIR.glob("lesson-*.json"))
    if not lesson_files:
        raise SystemExit(f"No lesson JSON files found in {HSK6_DIR}")

    rows = [upgrade_lesson(path) for path in lesson_files]
    write_report(rows)

    print(f"Processed {len(rows)} lesson files.")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
