#!/usr/bin/env python3
"""Build dictionary additions for the 8,105 characters in 通用规范汉字表.

Inputs are supplied explicitly so the generated project remains reproducible:
- Official 8,105-character spreadsheet/list (machine-readable transcription)
- Unicode Unihan Readings (kTGHZ2013, kDefinition, kVietnamese)
- CVDICT Chinese–Vietnamese dictionary (CC BY-SA 4.0)
- Existing project dictionary (used only for exact-hanzi de-duplication)

This script never overwrites the existing dictionary. It writes a separate lazy-loaded
JSON file containing only the exact single-character entries that are absent.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

XML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_official_xlsx(path: Path, sheet_name: str = "字表8105") -> list[dict]:
    """Read the official character table without external spreadsheet libraries."""
    with ZipFile(path) as zf:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root.findall(f"{{{XML_NS}}}si"):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{XML_NS}}}t")))

        wb = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        sheet_target = None
        sheets = wb.find(f"{{{XML_NS}}}sheets")
        if sheets is None:
            raise ValueError("Workbook không có danh sách sheet")
        for sheet in sheets:
            if sheet.attrib.get("name") == sheet_name:
                rid = sheet.attrib[f"{{{REL_NS}}}id"]
                sheet_target = rel_map[rid]
                break
        if not sheet_target:
            raise ValueError(f"Không tìm thấy sheet {sheet_name!r}")
        sheet_path = "xl/" + sheet_target.lstrip("/")
        root = ET.fromstring(zf.read(sheet_path))

        def cell_value(cell: ET.Element) -> str:
            kind = cell.attrib.get("t")
            if kind == "inlineStr":
                return "".join(t.text or "" for t in cell.iter(f"{{{XML_NS}}}t"))
            v = cell.find(f"{{{XML_NS}}}v")
            if v is None or v.text is None:
                return ""
            if kind == "s":
                return shared[int(v.text)]
            return v.text

        rows: list[dict] = []
        for row in root.findall(f".//{{{XML_NS}}}row"):
            values: dict[str, str] = {}
            for cell in row.findall(f"{{{XML_NS}}}c"):
                ref = cell.attrib.get("r", "")
                col = re.match(r"[A-Z]+", ref)
                if col:
                    values[col.group()] = cell_value(cell).strip()
            if values.get("A", "").isdigit() and values.get("B"):
                index = int(values["A"])
                ch = values["B"]
                if len(ch) != 1:
                    raise ValueError(f"Dòng {index} không phải một chữ: {ch!r}")
                rows.append({
                    "index": index,
                    "char": ch,
                    "unicode": values.get("C") or f"U+{ord(ch):04X}",
                    "level": 1 if index <= 3500 else (2 if index <= 6500 else 3),
                })

    if len(rows) != 8105:
        raise ValueError(f"Bảng chính phải có 8105 chữ, hiện đọc được {len(rows)}")
    if [r["index"] for r in rows] != list(range(1, 8106)):
        raise ValueError("Số thứ tự trong bảng không liên tục từ 1 đến 8105")
    chars = [r["char"] for r in rows]
    if len(set(chars)) != 8105:
        raise ValueError("Danh sách chính có chữ trùng")
    return rows


def read_unihan(path: Path, wanted: set[str]) -> dict[str, dict[str, str]]:
    keep = {"kTGHZ2013", "kMandarin", "kDefinition", "kVietnamese"}
    result: dict[str, dict[str, str]] = defaultdict(dict)
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            if not line or line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t", 2)
            if len(parts) != 3 or parts[1] not in keep:
                continue
            char = chr(int(parts[0][2:], 16))
            if char in wanted:
                result[char][parts[1]] = parts[2].strip()
    return dict(result)


def tghz_pinyin(value: str) -> str:
    """Extract ordered, unique pronunciation strings from kTGHZ2013."""
    readings: list[str] = []
    for match in re.finditer(r"(?:^|\s)[0-9.,]+:([^\s]+)", value or ""):
        for item in match.group(1).split(","):
            item = item.strip()
            if item and item not in readings:
                readings.append(item)
    return " / ".join(readings)


def clean_definition(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"\s+", " ", text).strip(" /;,.\t")
    text = text.replace("\u200b", "")
    return text


def read_cvdict(path: Path, wanted: set[str]) -> dict[str, dict[str, list[str]]]:
    pattern = re.compile(r"^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+/(.*)/$")
    result: dict[str, dict[str, list[str]]] = {
        ch: {"definitions": [], "traditional": [], "numeric_pinyin": []} for ch in wanted
    }
    with path.open(encoding="utf-8") as fh:
        for raw in fh:
            if not raw or raw.startswith("#"):
                continue
            m = pattern.match(raw.rstrip("\n"))
            if not m:
                continue
            traditional, simplified, numeric_pinyin, body = m.groups()
            if simplified not in wanted or len(simplified) != 1:
                continue
            bucket = result[simplified]
            if traditional != simplified and traditional not in bucket["traditional"]:
                bucket["traditional"].append(traditional)
            if numeric_pinyin and numeric_pinyin not in bucket["numeric_pinyin"]:
                bucket["numeric_pinyin"].append(numeric_pinyin)
            for definition in body.split("/"):
                definition = clean_definition(definition)
                if not definition:
                    continue
                # Skip metadata-only fragments while preserving actual meanings.
                if re.fullmatch(r"(?:CL|classifier):.*", definition, flags=re.I):
                    continue
                if definition not in bucket["definitions"]:
                    bucket["definitions"].append(definition)
    return result


def concise_vietnamese(definitions: list[str], han_viet: str, level: int, index: int) -> str:
    # Prefer informative, reasonably short meanings and avoid flooding the UI.
    useful = [d for d in definitions if len(d) <= 180]
    if not useful:
        useful = definitions
    # A surname-only gloss is lower priority when other meanings exist.
    useful.sort(key=lambda d: (bool(re.fullmatch(r"(?:họ|họ của người Trung Quốc).*", d, re.I)), len(d)))
    selected: list[str] = []
    total = 0
    for item in useful:
        projected = total + len(item) + (2 if selected else 0)
        if len(selected) >= 8 or projected > 520:
            break
        selected.append(item)
        total = projected

    hv = clean_definition(han_viet)
    if selected:
        meaning = "; ".join(selected)
        if hv and not any(hv.casefold() == d.casefold() for d in selected):
            meaning += f". Âm Hán Việt: {hv}"
        return meaning
    if hv:
        return f"Âm Hán Việt: {hv}."
    return f"Chữ Hán chuẩn cấp {level}, số thứ tự {index} trong 《通用规范汉字表》."


def build(args: argparse.Namespace) -> None:
    project = args.project.resolve()
    official = read_official_xlsx(args.official_xlsx.resolve())
    official_chars = {row["char"] for row in official}
    unihan = read_unihan(args.unihan.resolve(), official_chars)
    cvdict = read_cvdict(args.cvdict.resolve(), official_chars)

    existing_path = project / "assets/data/all.json"
    existing = json.loads(existing_path.read_text(encoding="utf-8"))
    if not isinstance(existing, list):
        raise TypeError("assets/data/all.json phải là một mảng JSON")
    existing_exact = {str(item.get("hanzi", "")) for item in existing}

    additions: list[dict] = []
    for row in official:
        ch = row["char"]
        if ch in existing_exact:
            continue
        u = unihan.get(ch, {})
        c = cvdict.get(ch, {"definitions": [], "traditional": [], "numeric_pinyin": []})
        pinyin = tghz_pinyin(u.get("kTGHZ2013", "")) or u.get("kMandarin", "")
        if not pinyin:
            raise ValueError(f"Thiếu Pinyin chuẩn cho {ch} ({row['index']})")
        meaning_vi = concise_vietnamese(
            c.get("definitions", []), u.get("kVietnamese", ""), row["level"], row["index"]
        )
        additions.append({
            "id": f"tghz-{row['index']:04d}",
            "hsk": None,
            "hanzi": ch,
            "traditional": ", ".join(c.get("traditional", [])),
            "pinyin": pinyin,
            "meaning": meaning_vi,
            "meaning_vi": meaning_vi,
            "meaning_en": u.get("kDefinition", ""),
            "examples": [],
            "lesson": None,
            "type": "Chữ Hán chuẩn",
            "radical": "",
            "stroke_count": 0,
            "favorite": False,
            "learned": False,
            "mastery": 0,
            "review_count": 0,
            "audio": "",
            "image": "",
            "standard_level": row["level"],
            "standard_index": row["index"],
            "unicode": f"U+{ord(ch):04X}",
            "source": "《通用规范汉字表》",
        })

    output_dir = project / "assets/data/tang-thu-cac"
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / "standard-hanzi-8105-additions.json"
    output.write_text(json.dumps(additions, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    list_dir = project / "scripts/data"
    list_dir.mkdir(parents=True, exist_ok=True)
    (list_dir / "standard-hanzi-8105.txt").write_text(
        "\n".join(row["char"] for row in official) + "\n", encoding="utf-8"
    )
    (list_dir / "standard-hanzi-8105-pinyin.txt").write_text(
        "\n".join(
            f"{row['index']}\t{row['char']}\t{tghz_pinyin(unihan[row['char']]['kTGHZ2013'])}\t{row['level']}"
            for row in official
        ) + "\n",
        encoding="utf-8",
    )

    added_chars = {item["hanzi"] for item in additions}
    coverage = official_chars & (existing_exact | added_chars)
    level_counts = {str(level): sum(1 for r in official if r["level"] == level) for level in (1, 2, 3)}
    manifest = {
        "title": "《通用规范汉字表》 dictionary integration",
        "official_character_count": len(official),
        "official_level_counts": level_counts,
        "exact_characters_already_present": len(official_chars & existing_exact),
        "exact_characters_added": len(additions),
        "official_character_coverage_after_merge": len(coverage),
        "deduplication_rule": "Exact Unicode string match against item.hanzi in assets/data/all.json",
        "output": "assets/data/tang-thu-cac/standard-hanzi-8105-additions.json",
        "sources": {
            "official_table": {
                "name": "《通用规范汉字表》",
                "publisher": "中华人民共和国教育部、国家语言文字工作委员会",
                "url": "https://www.moe.gov.cn/jyb_sjzl/ziliao/A19/201306/t20130601_186002.html",
                "input_sha256": sha256(args.official_xlsx.resolve()),
            },
            "unihan": {
                "name": "Unicode Unihan Readings",
                "license": "Unicode Data Files and Software License",
                "url": "https://www.unicode.org/reports/tr38/",
                "input_sha256": sha256(args.unihan.resolve()),
            },
            "cvdict": {
                "name": "CVDICT Chinese–Vietnamese dictionary",
                "author": "Phong Phan",
                "license": "CC BY-SA 4.0",
                "url": "https://github.com/ph0ngp/CVDICT",
                "input_sha256": sha256(args.cvdict.resolve()),
            },
        },
        "output_sha256": sha256(output),
    }
    (output_dir / "standard-hanzi-8105-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    expected_additions = len(official_chars - existing_exact)
    if len(additions) != expected_additions:
        raise ValueError(f"Kỳ vọng thêm {expected_additions} mục, thực tế {len(additions)}")
    if added_chars & existing_exact:
        raise ValueError("Dữ liệu bổ sung vẫn còn trùng chính xác với từ điển cũ")
    if len(coverage) != 8105:
        raise ValueError(f"Độ phủ sau gộp chỉ đạt {len(coverage)}/8105")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--official-xlsx", type=Path, required=True)
    parser.add_argument("--unihan", type=Path, required=True)
    parser.add_argument("--cvdict", type=Path, required=True)
    build(parser.parse_args())


if __name__ == "__main__":
    main()
