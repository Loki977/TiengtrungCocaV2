#!/usr/bin/env python3
"""Assign every dictionary item to HSK 1-9 (UI combines 7-9).

Source data: official HSK 3.0 Examination Syllabus (effective 2026-07),
materialized in assets/data/tang-thu-cac/hsk-2026-levels.json.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "assets/data/tang-thu-cac/hsk-2026-levels.json"
BASE_PATH = ROOT / "assets/data/all.json"
ADDITIONS_PATH = ROOT / "assets/data/tang-thu-cac/standard-hanzi-8105-additions.json"
MANIFEST_PATH = ROOT / "assets/data/tang-thu-cac/hsk-classification-manifest.json"
VALID_LEVELS = {1, 2, 3, 4, 5, 6, "7-9"}
LEVEL_ORDER = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, "7-9": 7}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFC", str(value or "")).strip()
    text = re.sub(r"\s+", "", text)
    text = text.replace("（", "(").replace("）", ")")
    text = re.sub(r"(?<=[\u3400-\u9fff])\d+$", "", text)
    return text


def candidates(value: Any) -> list[str]:
    raw = normalize(value)
    options = [raw]
    if "(" in raw:
        before, rest = raw.split("(", 1)
        inside = rest.rsplit(")", 1)[0]
        options.extend([before, inside])
    if raw.endswith("儿") and len(raw) > 1:
        options.append(raw[:-1])
    # Preserve order while removing blanks/duplicates.
    return list(dict.fromkeys(option for option in options if option))


def build_indexes(source: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    word_index: dict[str, dict[str, Any]] = {}
    for row in source["words"]:
        key = normalize(row.get("normalized") or row.get("word"))
        previous = word_index.get(key)
        if not previous or LEVEL_ORDER[row["level"]] < LEVEL_ORDER[previous["level"]]:
            word_index[key] = row

    char_index: dict[str, dict[str, Any]] = {}
    for row in source["characters"]:
        char_index.setdefault(row["char"], row)
    return word_index, char_index


def official_word_match(hanzi: Any, word_index: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    for key in candidates(hanzi):
        if key in word_index:
            return word_index[key]
    return None


def assign_base(item: dict[str, Any], word_index: dict[str, dict[str, Any]]) -> str:
    match = official_word_match(item.get("hanzi"), word_index)
    if match:
        item["hsk_level"] = match["level"]
        item["hsk_source"] = "official-vocabulary-2026"
        item["hsk_official_index"] = match["index"]
        return item["hsk_source"]

    legacy = item.get("hsk")
    if isinstance(legacy, int) and 1 <= legacy <= 6:
        item["hsk_level"] = legacy
        item["hsk_source"] = "legacy-hsk-fallback"
        item.pop("hsk_official_index", None)
        return item["hsk_source"]

    item["hsk_level"] = "7-9"
    item["hsk_source"] = "advanced-fallback"
    item.pop("hsk_official_index", None)
    return item["hsk_source"]


def assign_addition(
    item: dict[str, Any],
    word_index: dict[str, dict[str, Any]],
    char_index: dict[str, dict[str, Any]],
) -> str:
    match = official_word_match(item.get("hanzi"), word_index)
    if match:
        item["hsk_level"] = match["level"]
        item["hsk_source"] = "official-vocabulary-2026"
        item["hsk_official_index"] = match["index"]
        return item["hsk_source"]

    hanzi = normalize(item.get("hanzi"))
    char_match = char_index.get(hanzi) if len(hanzi) == 1 else None
    if char_match:
        item["hsk_level"] = char_match["level"]
        item["hsk_source"] = "official-character-2026"
        item["hsk_official_index"] = char_match["index"]
        return item["hsk_source"]

    # The product requirement forbids unclassified entries. Characters outside
    # the official recognition list are assigned to the advanced 7-9 bucket.
    item["hsk_level"] = "7-9"
    item["hsk_source"] = "advanced-fallback"
    item.pop("hsk_official_index", None)
    return item["hsk_source"]


def level_counts(items: list[dict[str, Any]]) -> dict[str, int]:
    counts = Counter(str(item.get("hsk_level")) for item in items)
    return {key: counts.get(key, 0) for key in ["1", "2", "3", "4", "5", "6", "7-9"]}


def validate(items: list[dict[str, Any]], label: str) -> None:
    invalid = [item.get("id") for item in items if item.get("hsk_level") not in VALID_LEVELS]
    if invalid:
        raise ValueError(f"{label}: {len(invalid)} invalid/unclassified items; examples={invalid[:10]}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Validate and report without writing files")
    args = parser.parse_args()

    source = load_json(SOURCE_PATH)
    base = load_json(BASE_PATH)
    additions = load_json(ADDITIONS_PATH)
    word_index, char_index = build_indexes(source)

    source_counts = Counter()
    for item in base:
        source_counts[assign_base(item, word_index)] += 1
    for item in additions:
        source_counts[assign_addition(item, word_index, char_index)] += 1

    validate(base, "all.json")
    validate(additions, "standard additions")
    combined = base + additions

    manifest = {
        "schema_version": 1,
        "generated_by": "scripts/apply-hsk-levels.py",
        "source": source["meta"],
        "display_groups": [1, 2, 3, 4, 5, 6, "7-9"],
        "total_entries": len(combined),
        "unclassified": 0,
        "counts": level_counts(combined),
        "base_counts": level_counts(base),
        "standard_character_counts": level_counts(additions),
        "classification_sources": dict(sorted(source_counts.items())),
        "fallback_policy": {
            "legacy-hsk-fallback": "Keep the existing HSK 1-6 level when an old project word is not an exact 2026 syllabus entry.",
            "advanced-fallback": "Assign remaining non-syllabus entries to the combined advanced HSK 7-9 group so no item is unclassified.",
        },
    }

    if not args.check:
        with BASE_PATH.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(base, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        with ADDITIONS_PATH.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(additions, handle, ensure_ascii=False, separators=(",", ":"))
        with MANIFEST_PATH.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(manifest, handle, ensure_ascii=False, indent=2)
            handle.write("\n")

    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
