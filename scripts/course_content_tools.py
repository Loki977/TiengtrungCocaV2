import json
import re
from copy import deepcopy
from pathlib import Path

from pypinyin import Style, lazy_pinyin


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "assets" / "data"
COURSE_DIR = ROOT / "assets" / "giaotrinhhsk"
HANZI_RE = re.compile(r"[\u3400-\u9fff]")


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    Path(path).write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def count_hanzi(text):
    return len(HANZI_RE.findall(str(text or "")))


def clean_pinyin(value):
    return re.sub(r"\s*\[[^\]]*\]\s*$", "", str(value or "")).strip()


def sentence_pinyin(text):
    parts = lazy_pinyin(
        str(text or ""),
        style=Style.TONE,
        neutral_tone_with_five=False,
        errors=lambda value: [value],
    )
    value = " ".join(part for part in parts if part != " ")
    value = re.sub(r"\s+([，。！？；：、,.!?;:）】》])", r"\1", value)
    value = re.sub(r"([（【《])\s+", r"\1", value)
    value = re.sub(r"\s+", " ", value).strip()
    for index, char in enumerate(value):
        if char.isalpha():
            value = value[:index] + char.upper() + value[index + 1 :]
            break
    return value


def load_word_lookup():
    rows = load_json(DATA_DIR / "all.json")
    lookup = {}
    for row in rows:
        hanzi = str(row.get("hanzi") or "").strip()
        if not hanzi or not HANZI_RE.search(hanzi):
            continue
        lookup.setdefault(hanzi, row)
    return lookup


def normalize_vocab_item(row, item_id=None, tag=None, note=None):
    source = deepcopy(row)
    example = (source.get("examples") or [{}])[0]
    value = {
        "id": item_id or str(source.get("id") or source.get("hanzi") or ""),
        "hanzi": source.get("hanzi", ""),
        "pinyin": clean_pinyin(source.get("pinyin", "")),
        "meaning": source.get("meaning_vi") or source.get("meaning") or "",
    }
    part_of_speech = source.get("partOfSpeech") or source.get("type") or ""
    if part_of_speech:
        value["partOfSpeech"] = part_of_speech
    if tag:
        value["tag"] = tag
    if note:
        value["note"] = note
    if example.get("hanzi"):
        value["example"] = example["hanzi"]
    if example.get("pinyin"):
        value["examplePinyin"] = example["pinyin"]
    if example.get("translation"):
        value["exampleTranslation"] = example["translation"]
    return value


def build_extended_vocabulary(words, level, lesson_id, word_lookup, manual=None):
    manual = manual or {}
    result = []
    for index, word in enumerate(words, start=1):
        source = word_lookup.get(word) or manual.get(word)
        if not source:
            raise ValueError(f"Không tìm thấy dữ liệu từ mở rộng: {word}")
        if "meaning_vi" not in source and "meaning" not in source:
            raise ValueError(f"Từ mở rộng chưa có nghĩa: {word}")
        item = normalize_vocab_item(
            source,
            item_id=f"hsk{level}-l{lesson_id:02d}-ext{index:02d}",
            tag="mở rộng",
            note="Từ mở rộng xuất hiện trực tiếp trong bài khóa.",
        )
        result.append(item)
    return result


def segment_text(text, primary_items, word_lookup):
    merged = {}

    def add(item, primary=False):
        hanzi = str(item.get("hanzi") or "").strip()
        pinyin = clean_pinyin(item.get("pinyin", ""))
        meaning = item.get("meaning_vi") or item.get("meaning") or ""
        if not hanzi or not pinyin or not meaning or not HANZI_RE.search(hanzi):
            return
        if hanzi in merged and not primary:
            return
        merged[hanzi] = {
            "hanzi": hanzi,
            "pinyin": pinyin,
            "meaning": meaning,
            "partOfSpeech": item.get("partOfSpeech") or item.get("type") or "",
            "note": item.get("note") or (
                "Từ/cụm từ tra cứu bổ sung từ dữ liệu chung." if not primary else ""
            ),
            "vocabularyId": item.get("id") or "",
            "primary": primary,
        }

    for row in word_lookup.values():
        add(row)
    for row in primary_items:
        add(row, primary=True)

    by_first = {}
    for row in merged.values():
        by_first.setdefault(row["hanzi"][0], []).append(row)
    for rows in by_first.values():
        rows.sort(key=lambda row: len(row["hanzi"]), reverse=True)

    primary_words = [str(item.get("hanzi") or "") for item in primary_items]
    segments = []
    plain = ""
    cursor = 0

    def flush():
        nonlocal plain
        if plain:
            segments.append({"text": plain, "clickable": False})
            plain = ""

    while cursor < len(text):
        match = None
        for candidate in by_first.get(text[cursor], []):
            word = candidate["hanzi"]
            if not text.startswith(word, cursor):
                continue
            if candidate["primary"] or len(word) == 1:
                match = candidate
                break
            overlaps_primary = any(
                text.startswith(primary, cursor + offset)
                for primary in primary_words
                for offset in range(1, len(word))
                if primary
            )
            if not overlaps_primary:
                match = candidate
                break

        if not match:
            plain += text[cursor]
            cursor += 1
            continue

        flush()
        segments.append(
            {
                "text": match["hanzi"],
                "pinyin": match["pinyin"],
                "meaning": match["meaning"],
                "partOfSpeech": match["partOfSpeech"],
                "note": match["note"],
                "vocabularyId": match["vocabularyId"],
                "clickable": True,
            }
        )
        cursor += len(match["hanzi"])

    flush()
    return segments


def lookup_coverage(segments, text):
    clickable = sum(
        count_hanzi(item.get("text", ""))
        for item in segments
        if item.get("clickable")
    )
    total = max(1, count_hanzi(text))
    return round(clickable / total * 100, 1)


def chunk_list(items, size=8):
    return [
        {"page": index // size + 1, "items": items[index : index + size]}
        for index in range(0, len(items), size)
    ]


def ensure_all_words_present(text, words, label):
    missing = [word for word in words if word and word not in text]
    if missing:
        raise ValueError(f"{label} thiếu từ: {'、'.join(missing)}")
