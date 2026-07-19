from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import generate_audio as audio


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_json_write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def json_object(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return payload


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_shards(directory: Path) -> tuple[dict[str, str], int]:
    result: dict[str, str] = {}
    files = sorted(directory.glob("[0-9a-f][0-9a-f].json"))
    for path in files:
        items = json_object(path).get("items") or {}
        if not isinstance(items, dict):
            raise ValueError(f"Invalid shard items: {path}")
        result.update({str(key): str(value) for key, value in items.items()})
    return result, len(files)


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Audit shared learning audio inventory, global hashes, shards and MP3 files.")
    parser.add_argument("--input", type=Path, default=root / "assets/data/audio/learning-audio-inventory.json")
    parser.add_argument("--output", type=Path, default=root / "assets/audio/learning")
    parser.add_argument("--manifest", type=Path, default=root / "assets/audio/learning/manifest.json")
    parser.add_argument("--web-index", type=Path, default=root / "assets/audio/learning/web-index.json")
    parser.add_argument("--report", type=Path, default=root / "assets/audio/learning/audio-inventory-report.json")
    parser.add_argument("--voice", default=audio.DEFAULT_VOICE)
    parser.add_argument("--voice-version", default="v1")
    parser.add_argument("--rate", default=None)
    parser.add_argument("--volume", default="+0%")
    parser.add_argument("--pitch", default="+0Hz")
    parser.add_argument("--allow-partial", action="store_true")
    args = parser.parse_args()
    for name in ("input", "output", "manifest", "web_index", "report"):
        value = getattr(args, name)
        if not value.is_absolute():
            setattr(args, name, (root / value).resolve())
    return args


def main() -> int:
    args = parse_args()
    items = audio.load_input(args.input)
    groups = audio.build_groups(items, args)
    expected = {group.cache_key: group for group in groups}
    id_to_key = {item.id: group.cache_key for group in groups for item in group.items}
    rows = audio.manifest_entries(args.manifest)
    keys = [str(row.get("audioKey") or row.get("audioCacheKey") or "") for row in rows]
    manifest = {
        str(row.get("audioKey") or row.get("audioCacheKey")): row
        for row in rows
        if row.get("audioKey") or row.get("audioCacheKey")
    }
    missing = sorted(set(expected) - set(manifest))
    extra = sorted(set(manifest) - set(expected))
    duplicate_keys = sorted(key for key, count in Counter(keys).items() if key and count > 1)

    hash_shards, hash_shard_files = load_shards(args.output / "index" / "hash")
    id_shards, id_shard_files = load_shards(args.output / "index" / "id")
    hash_index_mismatch = sorted(
        key for key in set(manifest) | set(hash_shards)
        if str(manifest.get(key, {}).get("webPath") or "") != hash_shards.get(key, "")
    )
    id_index_mismatch = sorted(
        identifier for identifier in set(id_to_key) | set(id_shards)
        if id_to_key.get(identifier, "") != id_shards.get(identifier, "")
    )

    integrity_issues: list[dict[str, Any]] = []
    referenced_web: set[str] = set()
    checked_files: dict[str, tuple[int, str]] = {}
    web_root = (args.output / "web").resolve()
    for key, row in manifest.items():
        relative = str(row.get("webPath") or "")
        path = (Path(__file__).resolve().parent / relative).resolve()
        try:
            if path.parent != web_root or path.suffix.lower() != ".mp3":
                raise ValueError("path escapes learning/web")
            if relative not in checked_files:
                checked_files[relative] = (path.stat().st_size, sha256_file(path))
            size, digest = checked_files[relative]
            if size < 128:
                raise ValueError("empty MP3")
            if row.get("webFileSize") and int(row["webFileSize"]) != size:
                raise ValueError("MP3 size mismatch")
            if row.get("webSha256") != digest:
                raise ValueError("MP3 SHA-256 mismatch")
            if row.get("qcStatus") != "automated-pass":
                raise ValueError("MP3 is not QC-approved")
            referenced_web.add(path.name)
        except (OSError, ValueError, TypeError) as error:
            integrity_issues.append({"audioKey": key, "path": relative, "error": str(error)})

    physical_web = {path.name for path in web_root.glob("*.mp3")}
    orphan_files = sorted(physical_web - referenced_web)
    missing_files = sorted(referenced_web - physical_web)
    runtime_index = json_object(args.web_index)
    index_metadata_issues = []
    if runtime_index.get("version", 0) < 4 or runtime_index.get("strategy") != "sharded-global-hash":
        index_metadata_issues.append("web-index is not sharded-global-hash v4")
    if runtime_index.get("hashShardCount") != hash_shard_files:
        index_metadata_issues.append("hash shard count mismatch")
    if runtime_index.get("idShardCount") != id_shard_files:
        index_metadata_issues.append("ID shard count mismatch")

    report = {
        "version": 2,
        "generated_at": utc_now(),
        "inventory_entries": len(items),
        "unique_expected": len(expected),
        "manifest_entries": len(rows),
        "logical_duplicates_deduplicated": len(items) - len(groups),
        "missing": missing,
        "extra": extra,
        "missing_files": missing_files,
        "orphan_files": orphan_files,
        "duplicate_manifest_keys": duplicate_keys,
        "hash_index_mismatch": hash_index_mismatch,
        "id_index_mismatch": id_index_mismatch,
        "index_metadata_issues": index_metadata_issues,
        "integrity_issues": integrity_issues,
        "partial_allowed": args.allow_partial,
    }
    hard_failures = any((
        extra, missing_files, orphan_files, duplicate_keys,
        hash_index_mismatch, id_index_mismatch, index_metadata_issues, integrity_issues,
    )) or (bool(missing) and not args.allow_partial)
    report["status"] = "FAIL" if hard_failures else "PASS"
    atomic_json_write(args.report, report)
    print(json.dumps({
        "status": report["status"],
        "inventory_entries": len(items),
        "unique_expected": len(expected),
        "manifest_entries": len(rows),
        "missing": len(missing),
        "extra": len(extra),
        "missing_files": len(missing_files),
        "orphan_files": len(orphan_files),
        "hash_index_mismatch": len(hash_index_mismatch),
        "id_index_mismatch": len(id_index_mismatch),
        "integrity_issues": len(integrity_issues),
        "report": str(args.report),
    }, ensure_ascii=False, indent=2))
    return 1 if hard_failures else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
