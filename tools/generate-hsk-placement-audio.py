#!/usr/bin/env python3
"""Generate MP3 files with Microsoft Azure Speech REST API.

Required environment variables:
  AZURE_SPEECH_KEY
  AZURE_SPEECH_REGION   (example: southeastasia)

The script uses only Python's standard library and the exact voice
zh-CN-XiaoxiaoNeural. Existing files are skipped unless --force is used.
"""
from __future__ import annotations
import argparse
import html
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "server" / "hsk-placement" / "data" / "audio-manifest.json"
OUTPUT_DIR = ROOT / "assets" / "audio" / "hsk-placement"


def ssml(text: str, voice: str, rate: str) -> str:
    safe = html.escape(text, quote=False)
    return (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">'
        f'<voice name="{voice}"><prosody rate="{rate}">{safe}</prosody></voice></speak>'
    )


def synthesize(endpoint: str, key: str, payload: str) -> bytes:
    req = urllib.request.Request(endpoint, data=payload.encode("utf-8"), method="POST")
    req.add_header("Ocp-Apim-Subscription-Key", key)
    req.add_header("Content-Type", "application/ssml+xml")
    req.add_header("X-Microsoft-OutputFormat", "audio-24khz-48kbitrate-mono-mp3")
    req.add_header("User-Agent", "tiengtrungcoca-hsk-placement/1.0")
    with urllib.request.urlopen(req, timeout=45) as response:
        return response.read()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Overwrite existing MP3 files")
    parser.add_argument("--limit", type=int, default=0, help="Generate only the first N files")
    args = parser.parse_args()

    key = os.getenv("AZURE_SPEECH_KEY", "").strip()
    region = os.getenv("AZURE_SPEECH_REGION", "").strip()
    if not key or not region:
        print("Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION.", file=sys.stderr)
        return 2

    entries = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if args.limit > 0:
        entries = entries[: args.limit]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    endpoint = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"

    generated = skipped = failed = 0
    for index, entry in enumerate(entries, 1):
        target = OUTPUT_DIR / entry["output"]
        if target.exists() and not args.force:
            skipped += 1
            print(f"[{index}/{len(entries)}] skip {target.name}")
            continue
        try:
            audio = synthesize(endpoint, key, ssml(entry["text"], entry["voice"], entry["rate"]))
            if len(audio) < 500:
                raise RuntimeError("Azure returned an unexpectedly small audio file")
            target.write_bytes(audio)
            generated += 1
            print(f"[{index}/{len(entries)}] wrote {target.name} ({len(audio)} bytes)")
            time.sleep(0.12)
        except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError) as exc:
            failed += 1
            print(f"[{index}/{len(entries)}] failed {target.name}: {exc}", file=sys.stderr)

    print(f"Done: generated={generated}, skipped={skipped}, failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
