from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


STATUSES = {"pending", "approved", "rejected", "needs_regenerate"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line.strip():
            payload = json.loads(line)
            if isinstance(payload, dict):
                rows.append(payload)
    return rows


def atomic_jsonl_write(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        for row in rows:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")
    os.replace(temporary, path)


def configure_review_log(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handler = logging.FileHandler(path, encoding="utf-8")
    formatter = logging.Formatter("%(asctime)sZ %(levelname)s %(message)s", "%Y-%m-%dT%H:%M:%S")
    formatter.converter = __import__("time").gmtime
    handler.setFormatter(formatter)
    logging.basicConfig(level=logging.INFO, handlers=[handler])


def find_review(rows: list[dict[str, Any]], identifier: str) -> dict[str, Any]:
    for row in rows:
        if identifier in {str(row.get("id") or ""), str(row.get("audioCacheKey") or "")}:
            return row
    raise ValueError(f"Review entry not found: {identifier}")


def set_status(row: dict[str, Any], status: str, reviewer: str, note: str) -> None:
    if status not in STATUSES:
        raise ValueError(f"Unsupported review status: {status}")
    row["review_status"] = status
    row["status"] = status  # Backward-compatible alias used by the existing queue.
    row["reviewer"] = reviewer
    row["review_note"] = note
    row["updated_at"] = utc_now()


def manifest_entry(path: Path, identifier: str) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    for entry in payload.get("items", []):
        identifiers = {str(entry.get("id") or ""), str(entry.get("audioCacheKey") or "")}
        identifiers.update(str(value) for value in entry.get("referenceIds", []))
        if identifier in identifiers:
            return entry
    raise ValueError(f"Manifest entry not found: {identifier}")


def queue_regeneration(failed: Path, entry: dict[str, Any]) -> None:
    failed.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "id": entry.get("id"), "text": entry.get("input"), "hanzi": entry.get("input"),
        "pinyin": entry.get("pinyin", ""), "category": entry.get("category"),
        "profile": entry.get("profile"), "voice": entry.get("voice"),
        "voice_version": entry.get("voiceVersion"), "rate": entry.get("rate"),
        "volume": entry.get("volume"), "pitch": entry.get("pitch"),
        "language": entry.get("language") or entry.get("locale") or "zh-CN",
        "error": "native review requested regeneration", "error_type": "NativeReview",
        "retry_count": 0, "retryable": True, "timestamp": utc_now(),
        "reference_ids": entry.get("referenceIds") or [entry.get("id")],
    }
    with failed.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(payload, ensure_ascii=False) + "\n")


def regenerate(args: argparse.Namespace, row: dict[str, Any]) -> int:
    entry = manifest_entry(args.manifest, str(row.get("audioCacheKey") or row.get("id")))
    queue_regeneration(args.failed, entry)
    command = [
        sys.executable, str(args.generator), "--retry-failed", "--failed", str(args.failed),
        "--manifest", str(args.manifest), "--output", str(args.output), "--review", str(args.review),
        "--logs", str(args.logs), "--overwrite", "--voice", str(entry.get("voice") or "zh-CN-XiaoxiaoNeural"),
        f"--rate={entry.get('rate') or '-18%'}", str("--volume=" + str(entry.get("volume") or "+0%")),
        str("--pitch=" + str(entry.get("pitch") or "+0Hz")),
    ]
    result = subprocess.run(command, check=False)
    logging.info("action=regenerate id=%s exit_code=%s", row.get("id"), result.returncode)
    return result.returncode


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Review or regenerate Mandarin audio without editing JSON manually.")
    parser.add_argument("--review", type=Path, default=root / "assets/audio/learning/pronunciation_review.jsonl")
    parser.add_argument("--manifest", type=Path, default=root / "assets/audio/learning/manifest.json")
    parser.add_argument("--failed", type=Path, default=root / "assets/audio/learning/failed.jsonl")
    parser.add_argument("--output", type=Path, default=root / "assets/audio/learning")
    parser.add_argument("--logs", type=Path, default=root / "assets/audio/learning/logs")
    parser.add_argument("--generator", type=Path, default=root / "generate_audio.py")
    parser.add_argument("--id")
    parser.add_argument("--reviewer", default="manual-review")
    parser.add_argument("--note", default="")
    parser.add_argument("--list", nargs="?", const="pending", choices=["all", *sorted(STATUSES)])
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--approve", action="store_true")
    actions.add_argument("--reject", action="store_true")
    actions.add_argument("--needs-regenerate", action="store_true")
    actions.add_argument("--regenerate", action="store_true")
    args = parser.parse_args()
    for name in ("review", "manifest", "failed", "output", "logs", "generator"):
        value = getattr(args, name)
        if not value.is_absolute():
            setattr(args, name, (root / value).resolve())
    return args


def main() -> int:
    args = parse_args()
    configure_review_log(args.logs / "review.log")
    rows = read_jsonl(args.review)
    if args.list:
        selected = rows if args.list == "all" else [
            row for row in rows if (row.get("review_status") or row.get("status") or "pending") == args.list
        ]
        print(json.dumps(selected, ensure_ascii=False, indent=2))
        return 0
    action = next((name for name in ("approve", "reject", "needs_regenerate", "regenerate") if getattr(args, name)), None)
    if not action or not args.id:
        raise ValueError("Use --list, or provide --id with one review action")
    row = find_review(rows, args.id)
    status = {"approve": "approved", "reject": "rejected", "needs_regenerate": "needs_regenerate", "regenerate": "needs_regenerate"}[action]
    set_status(row, status, args.reviewer, args.note)
    atomic_jsonl_write(args.review, rows)
    logging.info("action=%s id=%s status=%s reviewer=%s", action, args.id, status, args.reviewer)
    if action == "regenerate":
        result = regenerate(args, row)
        if result == 0:
            rows = read_jsonl(args.review)
            refreshed = find_review(rows, args.id)
            set_status(refreshed, "pending", args.reviewer, "regenerated; awaiting native review")
            atomic_jsonl_write(args.review, rows)
        return result
    print(f"{args.id}: {status}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001 - CLI should provide one clear failure
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
