from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import html
import json
import logging
import math
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


MIN_PYTHON = (3, 11)
LOCALE = "zh-CN"
DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
PROVIDER = "microsoft-edge-neural"
MODEL = "Edge Read Aloud neural TTS"
FORMAT_VERSION = "wav-pcm16-24000-mono-v1"
NORMALIZATION_VERSION = "nfc-space-punctuation-voice-rate-v1"
SAMPLE_RATE = 24_000
TARGET_RMS_DBFS = -20.0
PEAK_LIMIT = 0.94
PROFILE_SETTINGS = {
    "vocabulary": {"rate": "-18%", "web_bitrate": "32k", "min_duration": 0.31, "max_duration": 9.0},
    "writing-sentence": {"rate": "-12%", "web_bitrate": "48k", "min_duration": 0.35, "max_duration": 35.0},
    # Long HSK5/HSK6 lesson passages reach about 700 Han characters and can legitimately exceed 150 seconds.
    "lesson-passage": {"rate": "-8%", "web_bitrate": "48k", "min_duration": 0.35, "max_duration": 360.0},
}
KNOWN_POLYPHONIC = set("行长重得还乐觉看数相便难为着只差调种好都要藏朝传处倒当发分更给教结空量露落没蒙漂强少熟说似宿为系鲜应载中转")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(value or ""))).strip()


def normalize_pinyin(value: Any) -> str:
    return normalize_text(value).lower()


PUNCTUATION_TRANSLATION = str.maketrans({
    "，": ",", "､": ",", "﹐": ",",
    "。": ".", "｡": ".",
    "！": "!", "﹗": "!",
    "？": "?", "﹖": "?",
    "：": ":", "﹕": ":",
    "；": ";", "﹔": ";",
    "“": '"', "”": '"', "„": '"', "‟": '"', "«": '"', "»": '"',
    "「": '"', "」": '"', "『": '"', "』": '"',
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "（": "(", "）": ")",
    "【": "[", "〔": "[", "［": "[",
    "】": "]", "〕": "]", "］": "]",
    "｛": "{", "｝": "}",
    "—": "-", "–": "-", "−": "-", "﹣": "-",
})


def normalize_audio_key_text(value: Any) -> str:
    text = unicodedata.normalize("NFC", str(value or ""))
    text = re.sub(r"<[^>]*>", " ", text)
    text = re.sub(r"[\x00-\x1f\x7f\u00a0\u3000]", " ", text)
    text = re.sub(r"…+", "...", text).translate(PUNCTUATION_TRANSLATION)
    text = re.sub(r"\s+", " ", text)
    return re.sub(r"""\s*([,.;:!?()[\]{}"'])\s*""", r"\1", text).strip()


def safe_id(value: Any) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(value or "").strip()).strip(".-_")
    return cleaned[:160]


def stable_id(hanzi: str, pinyin: str, profile: str) -> str:
    digest = hashlib.sha256(f"{profile}\n{hanzi}\n{pinyin}".encode("utf-8")).hexdigest()[:12]
    return f"audio_{digest}"


def canonical_json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def project_relative(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def atomic_json_write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_jsonl_write(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        for row in rows:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")
    os.replace(temporary, path)


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(payload, ensure_ascii=False) + "\n")


def configure_logging(log_dir: Path) -> None:
    """Configure append-only production logs without changing console output."""
    log_dir.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter("%(asctime)sZ %(levelname)s %(name)s %(message)s", "%Y-%m-%dT%H:%M:%S")
    formatter.converter = time.gmtime
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    if not any(getattr(handler, "baseFilename", "") == str((log_dir / "generator.log").resolve()) for handler in root_logger.handlers):
        handler = logging.FileHandler(log_dir / "generator.log", encoding="utf-8")
        handler.setFormatter(formatter)
        root_logger.addHandler(handler)
    for name, filename in (("audio.error", "error.log"), ("audio.retry", "retry.log")):
        logger = logging.getLogger(name)
        logger.setLevel(logging.INFO)
        logger.propagate = False
        if not logger.handlers:
            handler = logging.FileHandler(log_dir / filename, encoding="utf-8")
            handler.setFormatter(formatter)
            logger.addHandler(handler)


def ffprobe_metadata(path: Path, deps: "Dependencies") -> dict[str, Any]:
    if not deps.ffprobe:
        raise RuntimeError("ffprobe is required for audio metadata validation")
    process = subprocess.run(
        [deps.ffprobe, "-v", "error", "-select_streams", "a:0", "-show_entries",
         "stream=codec_name,sample_rate,channels,bit_rate,duration:format=duration,bit_rate,size",
         "-of", "json", str(path)],
        capture_output=True, text=True, encoding="utf-8", errors="replace", check=False,
    )
    if process.returncode:
        raise QualityError(f"ffprobe cannot read {path.name}: {process.stderr.strip()[-500:]}")
    payload = json.loads(process.stdout or "{}")
    streams = payload.get("streams") or []
    if not streams:
        raise QualityError(f"No audio stream in {path.name}")
    stream = streams[0]
    container = payload.get("format") or {}
    duration = float(stream.get("duration") or container.get("duration") or 0)
    bitrate = int(float(stream.get("bit_rate") or container.get("bit_rate") or 0))
    return {
        "duration": round(duration, 3),
        "file_size": int(path.stat().st_size),
        "sample_rate": int(stream.get("sample_rate") or 0),
        "channels": int(stream.get("channels") or 0),
        "codec": str(stream.get("codec_name") or ""),
        "bitrate": bitrate,
    }


def ffmpeg_decode_check(path: Path, deps: "Dependencies") -> None:
    if not path.is_file() or path.stat().st_size <= 0:
        raise QualityError(f"Audio is missing or empty: {path}")
    process = subprocess.run(
        [deps.ffmpeg, "-hide_banner", "-loglevel", "error", "-v", "error", "-i", str(path), "-f", "null", "-"],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace", check=False,
    )
    if process.returncode:
        raise QualityError(f"FFmpeg decode failed for {path.name}: {process.stderr.strip()[-500:]}")


def validate_audio_pair(wav: Path, web: Path, profile: str, deps: "Dependencies", pitch_analysis: bool) -> dict[str, Any]:
    """Decode and inspect both deliverables before they can enter the manifest."""
    for path in (wav, web):
        ffmpeg_decode_check(path, deps)
    wav_metrics = analyze_wav(wav, profile, deps, pitch_analysis)
    if wav_metrics["issues"]:
        raise QualityError(f"Automated WAV QC failed: {', '.join(wav_metrics['issues'])}")
    web_metadata = ffprobe_metadata(web, deps)
    if web_metadata["duration"] <= 0.3 or web_metadata["codec"] not in {"mp3", "mp3float"}:
        raise QualityError("Web MP3 metadata is invalid")
    return {"wav": wav_metrics, "web": web_metadata}


@dataclass(frozen=True)
class AudioItem:
    id: str
    hanzi: str
    pinyin: str = ""
    meaning: str = ""
    category: str = "vocabulary"
    profile: str = "vocabulary"
    source: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class WorkGroup:
    cache_key: str
    rate: str
    items: tuple[AudioItem, ...]

    @property
    def representative(self) -> AudioItem:
        return self.items[0]


@dataclass
class Dependencies:
    edge_tts: Any
    soundfile: Any
    numpy: Any
    ffmpeg: str
    ffprobe: str | None


@dataclass
class Stats:
    input_entries: int = 0
    unique_pronunciations: int = 0
    generated: int = 0
    reused: int = 0
    resumed: int = 0
    batch_duplicates: int = 0
    failed: int = 0
    retried: int = 0
    qc_pass: int = 0
    qc_fail: int = 0
    tts_requests: int = 0
    tts_requests_avoided: int = 0
    elapsed_seconds: float = 0.0


class QualityError(RuntimeError):
    pass


class InputDataError(ValueError):
    """An item/configuration error that retrying cannot repair."""


def is_retryable_error(error: Exception) -> bool:
    """Retry transient provider/network failures and generated-file QC failures only."""
    if isinstance(error, InputDataError):
        return False
    if isinstance(error, (asyncio.TimeoutError, TimeoutError, ConnectionError, PermissionError, QualityError)):
        return True
    message = f"{type(error).__name__}: {error}".lower()
    transient_markers = (
        "timeout", "timed out", "network", "connection", "reset by peer",
        "rate limit", "too many requests", "429", "502", "503", "504",
        "temporarily unavailable", "service unavailable", "api unavailable",
        "no audio received", "server disconnected",
    )
    return any(marker in message for marker in transient_markers)


def profile_rate(profile: str, override: str | None) -> str:
    return override or str(PROFILE_SETTINGS[profile]["rate"])


def profile_web_bitrate(profile: str, override: str | None) -> str:
    return override or str(PROFILE_SETTINGS[profile]["web_bitrate"])


def make_cache_material(item: AudioItem, args: argparse.Namespace, rate: str) -> dict[str, Any]:
    return {
        "normalizedText": normalize_audio_key_text(item.hanzi),
        "voice": str(args.voice or DEFAULT_VOICE).strip(),
        "rate": str(rate or "").strip(),
    }


def make_cache_key(item: AudioItem, args: argparse.Namespace, rate: str) -> str:
    material = make_cache_material(item, args, rate)
    value = "\x1f".join((material["normalizedText"], material["voice"], material["rate"]))
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def make_lookup_key(profile: str, hanzi: str, pinyin: str) -> str:
    return "\x1f".join((profile, normalize_text(hanzi), normalize_pinyin(pinyin)))


def parse_item(raw: dict[str, Any], index: int) -> AudioItem:
    hanzi = normalize_text(raw.get("hanzi") or raw.get("chinese") or raw.get("word") or raw.get("input"))
    pinyin = normalize_pinyin(raw.get("pinyin"))
    profile = normalize_text(raw.get("profile") or "vocabulary")
    if not hanzi:
        raise InputDataError(f"Entry {index + 1} is missing hanzi/chinese/word/input")
    if profile not in PROFILE_SETTINGS:
        raise InputDataError(f"Entry {index + 1} has unsupported profile: {profile}")
    identifier = safe_id(raw.get("id")) or stable_id(hanzi, pinyin, profile)
    return AudioItem(
        id=identifier,
        hanzi=hanzi,
        pinyin=pinyin,
        meaning=normalize_text(raw.get("meaning") or raw.get("vietnamese") or raw.get("meaning_vi")),
        category=normalize_text(raw.get("category") or profile),
        profile=profile,
        source=raw.get("source") if isinstance(raw.get("source"), dict) else {},
    )


def load_input(path: Path) -> list[AudioItem]:
    if not path.is_file():
        raise FileNotFoundError(f"Input does not exist: {path}")
    suffix = path.suffix.lower()
    if suffix == ".json":
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        rows = payload.get("items") if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            raise ValueError("JSON input must be an array or an object containing an items array")
    elif suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            rows = list(csv.DictReader(stream))
    else:
        raise ValueError("Input must use .json or .csv")
    return [parse_item(row, index) for index, row in enumerate(rows) if isinstance(row, dict)]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip():
            continue
        payload = json.loads(line)
        if isinstance(payload, dict):
            rows.append(payload)
    return rows


def read_retry_ids(path: Path) -> set[str]:
    return {str(row["id"]) for row in read_jsonl(path) if row.get("id")}


def load_failed_items(path: Path) -> list[AudioItem]:
    """Load the latest failure for each ID without scanning the full inventory."""
    latest: dict[str, dict[str, Any]] = {}
    for row in read_jsonl(path):
        identifier = str(row.get("id") or "")
        if identifier:
            latest[identifier] = row
    items: list[AudioItem] = []
    for index, row in enumerate(latest.values()):
        text = row.get("text") or row.get("hanzi") or row.get("input")
        reference_ids = row.get("reference_ids") if isinstance(row.get("reference_ids"), list) else [row.get("id")]
        for offset, identifier in enumerate(reference_ids):
            items.append(parse_item({
                "id": identifier or row.get("id"), "hanzi": text, "pinyin": row.get("pinyin", ""),
                "profile": row.get("profile", "vocabulary"), "category": row.get("category") or row.get("profile"),
            }, index + offset))
    return items


def apply_failed_settings(args: argparse.Namespace, path: Path) -> None:
    """Preserve the original cache identity when retrying a failed-only queue."""
    rows = read_jsonl(path)
    for field, argument_name in (
        ("voice", "voice"), ("voice_version", "voice_version"),
        ("volume", "volume"), ("pitch", "pitch"),
    ):
        values = {str(row[field]) for row in rows if row.get(field) not in (None, "")}
        if len(values) > 1:
            raise InputDataError(f"failed.jsonl contains multiple {field} values; split the queue before retrying")
        if values:
            setattr(args, argument_name, next(iter(values)))
    rates = {str(row["rate"]) for row in rows if row.get("rate")}
    if len(rates) == 1:
        args.rate = next(iter(rates))
    elif len(rates) > 1:
        uses_profile_defaults = all(
            row.get("profile") in PROFILE_SETTINGS
            and str(row.get("rate")) == str(PROFILE_SETTINGS[str(row["profile"])]["rate"])
            for row in rows if row.get("rate")
        )
        if not uses_profile_defaults:
            raise InputDataError("failed.jsonl contains multiple custom rate values; split the queue before retrying")
        args.rate = None
    languages = {str(row.get("language")) for row in rows if row.get("language")}
    if languages and languages != {LOCALE}:
        raise InputDataError(f"failed.jsonl language must be {LOCALE}")


def build_groups(items: Iterable[AudioItem], args: argparse.Namespace) -> list[WorkGroup]:
    grouped: dict[str, list[AudioItem]] = {}
    rates: dict[str, str] = {}
    for item in items:
        rate = profile_rate(item.profile, args.rate)
        key = make_cache_key(item, args, rate)
        grouped.setdefault(key, []).append(item)
        rates[key] = rate
    return [WorkGroup(key, rates[key], tuple(values)) for key, values in grouped.items()]


def discover_dependencies(ffmpeg_override: str | None = None, ffprobe_override: str | None = None) -> Dependencies:
    if sys.version_info < MIN_PYTHON:
        raise RuntimeError(f"Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+ is required")
    try:
        import edge_tts  # type: ignore
        import numpy  # type: ignore
        import soundfile  # type: ignore
    except ImportError as error:
        raise RuntimeError(
            "Missing Python dependency. Activate .venv then run: "
            "pip install edge-tts==7.2.8 soundfile==0.14.0 numpy==2.5.1 tqdm==4.69.0"
        ) from error
    ffmpeg = ffmpeg_override or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("FFmpeg is not available in PATH. Install FFmpeg and verify with: ffmpeg -version")
    return Dependencies(edge_tts=edge_tts, soundfile=soundfile, numpy=numpy, ffmpeg=ffmpeg, ffprobe=ffprobe_override or shutil.which("ffprobe"))


def analyze_wav(path: Path, profile: str, deps: Dependencies, pitch_analysis: bool) -> dict[str, Any]:
    sf = deps.soundfile
    np = deps.numpy
    info = sf.info(str(path))
    data, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
    issues: list[str] = []
    if data.size == 0:
        issues.append("empty")
        mono = np.zeros(1, dtype=np.float32)
    else:
        mono = data[:, 0]
    if not np.isfinite(mono).all():
        issues.append("non-finite")
    duration = float(len(mono) / max(1, sample_rate))
    rms = float(np.sqrt(np.mean(np.square(mono, dtype=np.float64)))) if len(mono) else 0.0
    peak = float(np.max(np.abs(mono))) if len(mono) else 0.0
    rms_dbfs = 20 * math.log10(max(rms, 1e-9))
    peak_dbfs = 20 * math.log10(max(peak, 1e-9))
    clipping_ratio = float(np.mean(np.abs(mono) >= 0.999))
    silence_ratio = float(np.mean(np.abs(mono) < 10 ** (-45 / 20)))
    settings = PROFILE_SETTINGS[profile]
    if sample_rate != SAMPLE_RATE:
        issues.append("sample-rate")
    if info.channels != 1:
        issues.append("channels")
    if info.subtype != "PCM_16":
        issues.append("bit-depth")
    if duration < float(settings["min_duration"]) or duration > float(settings["max_duration"]):
        issues.append("duration")
    if rms_dbfs < -28 or rms_dbfs > -13:
        issues.append("loudness")
    if peak > 0.999 or clipping_ratio > 0.0005:
        issues.append("clipping")
    if silence_ratio > 0.78:
        issues.append("silence")
    pitch = estimate_pitch(mono, sample_rate, np) if pitch_analysis else None
    return {
        "duration": round(duration, 3),
        "sampleRate": int(sample_rate),
        "channels": int(info.channels),
        "bitsPerSample": 16 if info.subtype == "PCM_16" else None,
        "rmsDbfs": round(rms_dbfs, 2),
        "peakDbfs": round(peak_dbfs, 2),
        "clippingRatio": round(clipping_ratio, 6),
        "silenceRatio": round(silence_ratio, 4),
        "pitchHz": pitch or {"start": None, "middle": None, "end": None, "frames": 0},
        "issues": issues,
    }


def estimate_pitch(samples: Any, sample_rate: int, np: Any) -> dict[str, Any] | None:
    frame_size = int(sample_rate * 0.045)
    hop = int(sample_rate * 0.020)
    min_lag = int(sample_rate / 380)
    max_lag = int(sample_rate / 75)
    values: list[float] = []
    for start in range(0, max(0, len(samples) - frame_size), hop):
        frame = samples[start : start + frame_size].astype(np.float64)
        if float(np.sqrt(np.mean(frame * frame))) < 0.01:
            continue
        frame -= np.mean(frame)
        correlation = np.correlate(frame, frame, mode="full")[frame_size - 1 :]
        segment = correlation[min_lag : min(max_lag + 1, len(correlation))]
        if not len(segment):
            continue
        offset = int(np.argmax(segment))
        lag = min_lag + offset
        confidence = float(segment[offset] / max(correlation[0], 1e-12))
        if confidence >= 0.30 and lag:
            values.append(sample_rate / lag)
    if len(values) < 6:
        return None
    third = max(1, len(values) // 3)
    return {
        "start": round(sum(values[:third]) / len(values[:third]), 1),
        "middle": round(sum(values[third:-third] or values) / len(values[third:-third] or values), 1),
        "end": round(sum(values[-third:]) / len(values[-third:]), 1),
        "frames": len(values),
    }


def normalize_wav(source: Path, target: Path, deps: Dependencies) -> None:
    sf = deps.soundfile
    np = deps.numpy
    data, sample_rate = sf.read(str(source), dtype="float32", always_2d=True)
    if sample_rate != SAMPLE_RATE or data.shape[1] != 1 or not data.size:
        raise QualityError("FFmpeg output is not 24 kHz mono audio")
    mono = data[:, 0]
    active = np.flatnonzero(np.abs(mono) >= 10 ** (-45 / 20))
    if len(active):
        padding = int(sample_rate * 0.12)
        first = max(0, int(active[0]) - padding)
        last = min(len(mono), int(active[-1]) + padding + 1)
        mono = mono[first:last]
    rms = float(np.sqrt(np.mean(np.square(mono, dtype=np.float64))))
    peak = float(np.max(np.abs(mono)))
    target_rms = 10 ** (TARGET_RMS_DBFS / 20)
    gain = min(target_rms / max(rms, 1e-9), PEAK_LIMIT / max(peak, 1e-9))
    normalized = np.clip(mono * gain, -1.0, 1.0)
    sf.write(str(target), normalized, sample_rate, subtype="PCM_16", format="WAV")


async def run_process(*command: str) -> None:
    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    if process.returncode:
        detail = (stderr or stdout).decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"Command failed ({process.returncode}): {detail[-1200:]}")


def build_manifest_entry(
    group: WorkGroup,
    args: argparse.Namespace,
    root: Path,
    wav: Path,
    web: Path,
    validation: dict[str, Any],
    *,
    source: str,
    created_at: str | None = None,
) -> dict[str, Any]:
    item = group.representative
    metrics = validation["wav"]
    web_metadata = validation["web"]
    needs_review = (len(item.hanzi) == 1 and item.hanzi in KNOWN_POLYPHONIC) or not item.pinyin
    wav_size = int(wav.stat().st_size)
    web_size = int(web.stat().st_size)
    return {
        "id": item.id,
        "category": item.category,
        "profile": item.profile,
        "label": item.hanzi,
        "input": item.hanzi,
        "pinyin": item.pinyin,
        "file": wav.name,
        "source": source,
        "path": project_relative(wav, root),
        "webFile": web.name,
        "webPath": project_relative(web, root),
        "locale": LOCALE,
        "language": LOCALE,
        "provider": PROVIDER,
        "model": MODEL,
        "voice": args.voice,
        "voiceVersion": args.voice_version,
        "rate": group.rate,
        "volume": args.volume,
        "pitch": args.pitch,
        "audioFormatVersion": FORMAT_VERSION,
        "normalizationVersion": NORMALIZATION_VERSION,
        "audioCacheKey": group.cache_key,
        "reused": source != "static-build",
        "referenceCount": len(group.items),
        "referenceIds": [entry.id for entry in group.items],
        "referenceCategories": sorted({entry.category for entry in group.items}),
        "qcStatus": "automated-pass",
        "qc": {"automated": True, "nativeReview": "pending", "metrics": metrics, "issues": []},
        "pronunciationReview": "required" if needs_review else "sample",
        "sha256": sha256_file(wav),
        "webSha256": sha256_file(web),
        "duration": metrics["duration"],
        "file_size": wav_size,
        "fileSize": wav_size,
        "web_file_size": web_size,
        "webFileSize": web_size,
        "sample_rate": metrics["sampleRate"],
        "sampleRate": metrics["sampleRate"],
        "channels": metrics["channels"],
        "codec": "pcm_s16le",
        "bitrate": SAMPLE_RATE * metrics["channels"] * 16,
        "web_codec": web_metadata["codec"],
        "web_bitrate": web_metadata["bitrate"],
        "created_at": created_at or utc_now(),
    }


class ManifestStore:
    def __init__(self, args: argparse.Namespace, root: Path, deps: Dependencies | None) -> None:
        self.args = args
        self.root = root
        self.deps = deps
        self.path = args.manifest
        self.cache_index_path = args.cache_index
        self.web_index_path = args.web_index
        self.items: dict[str, dict[str, Any]] = {}
        self.backed_up = False
        self.dirty = False
        self.lock = asyncio.Lock()
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        rows = payload.get("items", []) if isinstance(payload, dict) else []
        if not isinstance(rows, list):
            raise ValueError(f"Manifest items must be an array: {self.path}")
        for entry in rows:
            if isinstance(entry, dict) and entry.get("audioCacheKey"):
                self.items[str(entry["audioCacheKey"])] = entry

    def get_valid(self, group: WorkGroup) -> dict[str, Any] | None:
        entry = self.items.get(group.cache_key)
        if not entry or self.args.overwrite:
            return None
        try:
            web = (self.root / entry["webPath"]).resolve()
            if not web.is_file() or web.stat().st_size < 128:
                self._clean_invalid(web)
                return None
            web_hash = sha256_file(web)
            if entry.get("webSha256") and web_hash != entry["webSha256"]:
                self._clean_invalid(web)
                return None
            wav_relative = str(entry.get("path") or "")
            wav = (self.root / wav_relative).resolve() if wav_relative else None
            # Finalized projects intentionally discard the large WAV cache. A
            # verified MP3 remains a valid reusable result and must not trigger
            # a new online TTS request.
            if not wav or not wav.is_file():
                return entry if entry.get("qcStatus") == "automated-pass" else None
            if wav.stat().st_size < 128:
                self._clean_invalid(wav)
                return None
            wav_hash = sha256_file(wav)
            if entry.get("sha256") and wav_hash != entry["sha256"]:
                self._clean_invalid(wav)
                return None
            if self.deps:
                validation = validate_audio_pair(wav, web, group.representative.profile, self.deps, self.args.pitch_analysis)
                metrics = validation["wav"]
                web_metadata = validation["web"]
                expected = {
                    "duration": metrics["duration"], "file_size": wav.stat().st_size,
                    "sample_rate": metrics["sampleRate"], "channels": metrics["channels"],
                    "codec": "pcm_s16le", "bitrate": SAMPLE_RATE * metrics["channels"] * 16,
                    "web_file_size": web.stat().st_size, "web_codec": web_metadata["codec"],
                    "web_bitrate": web_metadata["bitrate"], "webSha256": web_hash,
                }
                if not self._metadata_matches(entry, expected):
                    self._clean_invalid(wav, web)
                    return None
                # Legacy manifests are enriched in place; this preserves old cache files.
                if any(key not in entry for key in expected) or "created_at" not in entry or "referenceCategories" not in entry:
                    upgraded = build_manifest_entry(
                        group, self.args, self.root, wav, web, validation,
                        source=str(entry.get("source") or "cache-upgrade"),
                        created_at=str(entry.get("created_at") or entry.get("generatedAt") or utc_now()),
                    )
                    self.items[group.cache_key] = upgraded
                    self.dirty = True
                    entry = upgraded
            return entry
        except (OSError, KeyError, ValueError, QualityError, RuntimeError, json.JSONDecodeError):
            return None

    @staticmethod
    def _metadata_matches(entry: dict[str, Any], expected: dict[str, Any]) -> bool:
        for key, value in expected.items():
            if key not in entry:
                continue
            current = entry.get(key)
            if key == "duration":
                if abs(float(current or 0) - float(value)) > 0.03:
                    return False
            elif current != value:
                return False
        return True

    def _clean_invalid(self, *paths: Path) -> None:
        read_only = any(getattr(self.args, name, False) for name in ("verify_only", "check_integrity", "stats", "report_only"))
        if read_only and not getattr(self.args, "clean_invalid", False):
            return
        output = self.args.output.resolve()
        for path in paths:
            resolved = path.resolve()
            if resolved.is_file() and resolved.is_relative_to(output) and resolved.parent.name in {"cache", "web"}:
                resolved.unlink(missing_ok=True)

    def recover_valid(self, group: WorkGroup) -> dict[str, Any] | None:
        """Recover completed files written after the most recent manifest checkpoint."""
        if not getattr(self.args, "resume", True) or self.args.overwrite or not self.deps:
            return None
        wav = (self.args.output / "cache" / f"{group.cache_key}.wav").resolve()
        web = (self.args.output / "web" / f"{group.cache_key}.mp3").resolve()
        if not wav.is_file() or not web.is_file():
            return None
        try:
            validation = validate_audio_pair(wav, web, group.representative.profile, self.deps, self.args.pitch_analysis)
            entry = build_manifest_entry(group, self.args, self.root, wav, web, validation, source="checkpoint-recovery")
            self.items[group.cache_key] = entry
            self.dirty = True
            return entry
        except (OSError, ValueError, QualityError, RuntimeError, json.JSONDecodeError):
            self._clean_invalid(wav, web)
            return None

    async def put(self, entry: dict[str, Any]) -> None:
        async with self.lock:
            self.items[str(entry["audioCacheKey"])] = entry
            self.dirty = True

    async def checkpoint(self, force: bool = False) -> None:
        async with self.lock:
            if not self.dirty and not force:
                return
            if self.path.exists() and not self.backed_up:
                shutil.copy2(self.path, self.path.with_name(f"{self.path.name}.bak"))
                self.backed_up = True
            ordered = sorted(self.items.values(), key=lambda entry: (entry.get("profile", ""), entry.get("input", ""), entry.get("pinyin", ""), entry.get("id", "")))
            manifest = {
                "version": 2,
                "generatedAt": utc_now(),
                "locale": LOCALE,
                "provider": PROVIDER,
                "model": MODEL,
                "voice": self.args.voice,
                "voiceVersion": self.args.voice_version,
                "audioFormatVersion": FORMAT_VERSION,
                "normalizationVersion": NORMALIZATION_VERSION,
                "items": ordered,
            }
            cache_index = {
                "version": 2,
                "generatedAt": manifest["generatedAt"],
                "items": {entry["audioCacheKey"]: {
                    "input": entry["input"], "pinyin": entry.get("pinyin", ""), "profile": entry["profile"],
                    "path": entry["path"], "webPath": entry["webPath"], "sha256": entry["sha256"],
                    "webSha256": entry.get("webSha256"), "duration": entry.get("duration"),
                    "file_size": entry.get("file_size"), "web_file_size": entry.get("web_file_size"),
                    "sample_rate": entry.get("sample_rate"), "channels": entry.get("channels"),
                    "codec": entry.get("codec"), "bitrate": entry.get("bitrate"),
                    "provider": entry.get("provider"), "model": entry.get("model"), "voice": entry.get("voice"),
                    "created_at": entry.get("created_at"),
                    "referenceCount": entry.get("referenceCount", 1),
                } for entry in ordered},
            }
            by_key: dict[str, str] = {}
            text_candidates: dict[str, set[str]] = {}
            for entry in ordered:
                exact = make_lookup_key(entry["profile"], entry["input"], entry.get("pinyin", ""))
                by_key[exact] = entry["webPath"]
                text_key = "\x1f".join((entry["profile"], normalize_text(entry["input"])))
                text_candidates.setdefault(text_key, set()).add(entry["webPath"])
            by_text = {key: next(iter(paths)) for key, paths in text_candidates.items() if len(paths) == 1}
            web_index = {
                "version": 2,
                "generatedAt": manifest["generatedAt"],
                "locale": LOCALE,
                "byKey": by_key,
                "byText": by_text,
            }
            atomic_json_write(self.path, manifest)
            atomic_json_write(self.cache_index_path, cache_index)
            atomic_json_write(self.web_index_path, web_index)
            self.dirty = False

    async def checkpoint_with_retry(self, force: bool = False, attempts: int = 6) -> None:
        """Retry transient Windows file locks around atomic manifest/index replacement."""
        for attempt in range(1, attempts + 1):
            try:
                await self.checkpoint(force=force)
                return
            except PermissionError:
                if attempt >= attempts:
                    raise
                delay = min(3.0, 0.2 * (2 ** (attempt - 1))) + random.uniform(0.05, 0.2)
                logging.getLogger("audio.retry").warning(
                    "manifest checkpoint locked attempt=%s/%s wait=%.2fs", attempt, attempts, delay,
                )
                await asyncio.sleep(delay)


class AudioGenerator:
    def __init__(self, args: argparse.Namespace, root: Path, deps: Dependencies, store: ManifestStore) -> None:
        self.args = args
        self.root = root
        self.deps = deps
        self.store = store
        self.stats = Stats()
        self.semaphore = asyncio.Semaphore(args.concurrency)
        self.cache_locks: dict[str, asyncio.Lock] = {}
        self.progress_lock = asyncio.Lock()
        self.error_lock = asyncio.Lock()
        self.completed_since_checkpoint = 0
        self.successful_ids: set[str] = set()

    async def process(self, group: WorkGroup, index: int, total: int) -> None:
        lock = self.cache_locks.setdefault(group.cache_key, asyncio.Lock())
        async with lock:
            existing = self.store.get_valid(group)
            if existing:
                self.stats.reused += 1
                self.stats.tts_requests_avoided += len(group.items)
                self.successful_ids.update(item.id for item in group.items)
                await self.report(index, total, "REUSE", group.representative.hanzi, existing["webPath"])
                return
            recovered = self.store.recover_valid(group)
            if recovered:
                self.stats.resumed += 1
                self.stats.tts_requests_avoided += len(group.items)
                self.successful_ids.update(item.id for item in group.items)
                await self.report(index, total, "RESUME", group.representative.hanzi, recovered["webPath"])
                return
            async with self.semaphore:
                await self.generate_with_retry(group, index, total)

    async def generate_with_retry(self, group: WorkGroup, index: int, total: int) -> None:
        item = group.representative
        last_error: Exception | None = None
        attempts_used = 0
        for attempt in range(1, self.args.retries + 1):
            attempts_used = attempt
            if attempt > 1:
                delay = self.args.retry_base_delay * (2 ** (attempt - 2)) + random.uniform(0.1, 0.8)
                self.stats.retried += 1
                logging.getLogger("audio.retry").info(
                    "id=%s profile=%s attempt=%s/%s wait=%.2fs", item.id, item.profile, attempt, self.args.retries, delay,
                )
                await self.report(index, total, "RETRY", item.hanzi, f"attempt {attempt}/{self.args.retries}, wait {delay:.1f}s")
                await asyncio.sleep(delay)
            try:
                entry = await self.generate_once(group)
                await self.store.put(entry)
                self.stats.generated += 1
                self.stats.qc_pass += 1
                self.stats.tts_requests_avoided += max(0, len(group.items) - 1)
                self.successful_ids.update(entry.id for entry in group.items)
                self.completed_since_checkpoint += 1
                await self.report(index, total, "OK", item.hanzi, entry["webPath"])
                if self.completed_since_checkpoint >= self.args.checkpoint_every:
                    await self.store.checkpoint_with_retry()
                    self.completed_since_checkpoint = 0
                return
            except Exception as error:  # noqa: BLE001 - every item must fail independently
                last_error = error
                if isinstance(error, QualityError):
                    self.stats.qc_fail += 1
                if not is_retryable_error(error):
                    break
        self.stats.failed += 1
        await self.write_error(group, last_error or RuntimeError("Unknown generation error"), max(0, attempts_used - 1))
        await self.report(index, total, "FAIL", item.hanzi, str(last_error))

    async def generate_once(self, group: WorkGroup) -> dict[str, Any]:
        item = group.representative
        self.stats.tts_requests += 1
        cache_dir = self.args.output / "cache"
        web_dir = self.args.output / "web"
        temp_dir = self.args.output / ".tmp"
        for directory in (cache_dir, web_dir, temp_dir):
            directory.mkdir(parents=True, exist_ok=True)
        final_wav = cache_dir / f"{group.cache_key}.wav"
        final_web = web_dir / f"{group.cache_key}.mp3"
        with tempfile.TemporaryDirectory(prefix="cc-audio-", dir=temp_dir) as temporary:
            work = Path(temporary)
            source_mp3 = work / "source.mp3"
            decoded_wav = work / "decoded.wav"
            normalized_wav = work / "normalized.wav"
            web_mp3 = work / "web.mp3"
            communicate = self.deps.edge_tts.Communicate(
                item.hanzi,
                self.args.voice,
                rate=group.rate,
                volume=self.args.volume,
                pitch=self.args.pitch,
            )
            await communicate.save(str(source_mp3))
            if not source_mp3.is_file() or source_mp3.stat().st_size < 128:
                raise RuntimeError("Edge-TTS returned an empty MP3")
            try:
                await run_process(
                    self.deps.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source_mp3),
                    "-ac", "1", "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le", str(decoded_wav),
                )
            except RuntimeError as error:
                raise QualityError(f"TTS audio decode failed: {error}") from error
            normalize_wav(decoded_wav, normalized_wav, self.deps)
            metrics = analyze_wav(normalized_wav, item.profile, self.deps, self.args.pitch_analysis)
            if metrics["issues"]:
                raise QualityError(f"Automated QC failed: {', '.join(metrics['issues'])}")
            try:
                await run_process(
                    self.deps.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(normalized_wav),
                    "-c:a", "libmp3lame", "-b:a", profile_web_bitrate(item.profile, self.args.web_bitrate), str(web_mp3),
                )
            except RuntimeError as error:
                raise QualityError(f"Web MP3 encoding failed: {error}") from error
            if not web_mp3.is_file() or web_mp3.stat().st_size < 128:
                raise QualityError("Web MP3 encoding failed")
            validation = validate_audio_pair(normalized_wav, web_mp3, item.profile, self.deps, self.args.pitch_analysis)
            os.replace(normalized_wav, final_wav)
            os.replace(web_mp3, final_web)
        return build_manifest_entry(group, self.args, self.root, final_wav, final_web, validation, source="static-build")

    async def write_error(self, group: WorkGroup, error: Exception, retry_count: int) -> None:
        item = group.representative
        payload = {
            "id": item.id,
            "text": item.hanzi,
            "hanzi": item.hanzi,
            "pinyin": item.pinyin,
            "category": item.category,
            "profile": item.profile,
            "voice": self.args.voice,
            "voice_version": self.args.voice_version,
            "language": LOCALE,
            "rate": group.rate,
            "volume": self.args.volume,
            "pitch": self.args.pitch,
            "error": str(error),
            "error_type": type(error).__name__,
            "retry_count": retry_count,
            "retryable": is_retryable_error(error),
            "reference_ids": [entry.id for entry in group.items],
            "timestamp": utc_now(),
        }
        async with self.error_lock:
            append_jsonl(self.args.failed, payload)
            logging.getLogger("audio.error").error(
                "id=%s profile=%s retry_count=%s error=%s", item.id, item.profile, retry_count, error,
            )

    async def report(self, index: int, total: int, status: str, hanzi: str, detail: str) -> None:
        async with self.progress_lock:
            print(f"[{index:04d}/{total:04d}] {status:<6} {hanzi} -> {detail}", flush=True)
            logging.info("progress=%s/%s status=%s text=%s detail=%s", index, total, status, hanzi, detail)


def write_review_file(path: Path, entries: Iterable[dict[str, Any]]) -> None:
    existing = {}
    for row in read_jsonl(path):
        key = str(row.get("audioCacheKey") or row.get("id") or "")
        if key:
            existing[key] = row
    rows = []
    for entry in entries:
        if entry.get("pronunciationReview") == "required":
            key = str(entry.get("audioCacheKey") or entry.get("id"))
            previous = existing.get(key, {})
            review_status = previous.get("review_status") or previous.get("status") or "pending"
            if review_status not in {"pending", "approved", "rejected", "needs_regenerate"}:
                review_status = "pending"
            rows.append({
                "id": entry.get("id"), "input": entry.get("input"), "pinyin": entry.get("pinyin"),
                "path": entry.get("webPath"), "reason": "polyphonic-or-missing-pinyin", "status": "pending",
                "audioCacheKey": entry.get("audioCacheKey"), "profile": entry.get("profile"),
                "voice": entry.get("voice"), "language": entry.get("language") or entry.get("locale") or LOCALE,
                "rate": entry.get("rate"), "volume": entry.get("volume"), "pitch": entry.get("pitch"),
                "voice_version": entry.get("voiceVersion"),
                "review_status": review_status,
                "status": review_status,
                "updated_at": previous.get("updated_at") or utc_now(),
            })
    atomic_jsonl_write(path, rows)


def clear_resolved_failures(path: Path, successful_ids: set[str]) -> None:
    if not path.is_file() or not successful_ids:
        return
    remaining = [row for row in read_jsonl(path) if str(row.get("id") or "") not in successful_ids]
    atomic_jsonl_write(path, remaining)


def category_type(category: str, profile: str) -> str:
    category = category.lower()
    profile = profile.lower()
    if "flashcard" in category:
        return "Flashcard"
    if "writing" in category or profile == "writing-sentence":
        return "Writing"
    if profile == "lesson-passage" or "passage" in category:
        return "Passage"
    return "Lesson"


def entry_types(entry: dict[str, Any]) -> set[str]:
    categories = entry.get("referenceCategories")
    if not isinstance(categories, list) or not categories:
        categories = [str(entry.get("category") or "")]
    profile = str(entry.get("profile") or "")
    return {category_type(str(category), profile) for category in categories}


def build_audio_report(args: argparse.Namespace, entries: Iterable[dict[str, Any]], stats: Stats) -> dict[str, Any]:
    rows = list(entries)
    by_type: Counter[str] = Counter()
    for entry in rows:
        by_type.update(entry_types(entry))
    failed = read_jsonl(args.failed)
    pending_review = [
        row for row in read_jsonl(args.review)
        if (row.get("review_status") or row.get("status") or "pending") in {"pending", "needs_regenerate"}
    ]
    duration = round(sum(float(entry.get("duration") or 0) for entry in rows), 3)
    total_size = sum(int(entry.get("file_size") or 0) + int(entry.get("web_file_size") or 0) for entry in rows)
    processed = stats.generated + stats.reused + stats.resumed + stats.failed
    return {
        "version": 1,
        "generated_at": utc_now(),
        "total_audio": len(rows),
        "created_new": stats.generated,
        "used_cache": stats.reused,
        "resumed": stats.resumed,
        "retried": stats.retried,
        "failed": stats.failed,
        "elapsed_seconds": round(stats.elapsed_seconds, 3),
        "audio_duration_seconds": duration,
        "storage_bytes": total_size,
        "average_audio_per_second": round(processed / max(stats.elapsed_seconds, 0.001), 3),
        "by_type": {name: by_type.get(name, 0) for name in ("Flashcard", "Writing", "Lesson", "Passage")},
        "failed_audio": failed,
        "pending_native_review": pending_review,
    }


def write_audio_reports(args: argparse.Namespace, entries: Iterable[dict[str, Any]], stats: Stats) -> dict[str, Any]:
    report = build_audio_report(args, entries, stats)
    atomic_json_write(args.report_json, report)
    rows = "".join(
        f"<tr><th>{html.escape(str(key))}</th><td>{html.escape(str(value))}</td></tr>"
        for key, value in (
            ("Tổng audio", report["total_audio"]), ("Tạo mới", report["created_new"]),
            ("Dùng cache", report["used_cache"]), ("Resume", report["resumed"]),
            ("Retry", report["retried"]), ("Thất bại", report["failed"]),
            ("Thời gian chạy (giây)", report["elapsed_seconds"]),
            ("Thời lượng audio (giây)", report["audio_duration_seconds"]),
            ("Dung lượng (byte)", report["storage_bytes"]),
            ("Tốc độ trung bình (audio/giây)", report["average_audio_per_second"]),
        )
    )
    types = "".join(f"<li>{html.escape(name)}: {count}</li>" for name, count in report["by_type"].items())
    failures = "".join(
        f"<li><code>{html.escape(str(row.get('id', '')))}</code>: {html.escape(str(row.get('error', '')))}</li>"
        for row in report["failed_audio"]
    ) or "<li>Không có</li>"
    pending = "".join(
        f"<li><code>{html.escape(str(row.get('id', '')))}</code>: {html.escape(str(row.get('input', '')))}</li>"
        for row in report["pending_native_review"]
    ) or "<li>Không có</li>"
    document = f"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Audio Generator Report</title><style>body{{font:16px system-ui;max-width:960px;margin:40px auto;padding:0 20px;color:#222}}table{{border-collapse:collapse;width:100%}}th,td{{padding:10px;border-bottom:1px solid #ddd;text-align:left}}code{{word-break:break-all}}</style></head>
<body><h1>Audio Generator Report</h1><p>{html.escape(report['generated_at'])}</p><table>{rows}</table>
<h2>Theo loại</h2><ul>{types}</ul><h2>Audio lỗi</h2><ul>{failures}</ul>
<h2>Chờ native review</h2><ul>{pending}</ul></body></html>"""
    args.report_html.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.report_html.with_name(f".{args.report_html.name}.{os.getpid()}.tmp")
    temporary.write_text(document, encoding="utf-8")
    os.replace(temporary, args.report_html)
    return report


async def run(args: argparse.Namespace, root: Path, items: list[AudioItem]) -> Stats:
    dependencies = discover_dependencies(args.ffmpeg, args.ffprobe)
    store = ManifestStore(args, root, dependencies)
    groups = build_groups(items, args)
    generator = AudioGenerator(args, root, dependencies, store)
    generator.stats.input_entries = len(items)
    generator.stats.unique_pronunciations = len(groups)
    generator.stats.batch_duplicates = len(items) - len(groups)
    started = time.monotonic()
    try:
        tasks = [asyncio.create_task(generator.process(group, index, len(groups))) for index, group in enumerate(groups, 1)]
        await asyncio.gather(*tasks)
    finally:
        # Always persist the last partial batch on Ctrl+C/cancellation.
        await asyncio.shield(store.checkpoint_with_retry())
        clear_resolved_failures(args.failed, generator.successful_ids)
        write_review_file(args.review, store.items.values())
    elapsed = time.monotonic() - started
    stats = generator.stats
    stats.elapsed_seconds = elapsed
    write_audio_reports(args, store.items.values(), stats)
    print("\nSummary")
    print(f"Input entries:          {stats.input_entries}")
    print(f"Unique pronunciations:  {stats.unique_pronunciations}")
    print(f"Generated:              {stats.generated}")
    print(f"Reused:                 {stats.reused}")
    print(f"Resumed:                {stats.resumed}")
    print(f"Retried:                {stats.retried}")
    print(f"Batch duplicates:       {stats.batch_duplicates}")
    print(f"QC pass:                {stats.qc_pass}")
    print(f"QC fail attempts:       {stats.qc_fail}")
    print(f"Failed:                 {stats.failed}")
    print(f"TTS requests:           {stats.tts_requests}")
    print(f"TTS requests avoided:   {stats.tts_requests_avoided}")
    print(f"Elapsed seconds:        {elapsed:.1f}")
    print(f"Manifest:               {args.manifest}")
    print(f"Failed queue:           {args.failed}")
    print(f"JSON report:            {args.report_json}")
    print(f"HTML report:            {args.report_html}")
    return stats


def dry_run(args: argparse.Namespace, items: list[AudioItem]) -> None:
    groups = build_groups(items, args)
    existing: dict[str, Any] = {}
    if args.manifest.exists():
        payload = json.loads(args.manifest.read_text(encoding="utf-8"))
        existing = {str(entry.get("audioCacheKey")): entry for entry in payload.get("items", []) if entry.get("audioCacheKey")}
    for index, group in enumerate(groups, 1):
        entry = existing.get(group.cache_key)
        status = "SKIP" if entry else "CREATE"
        target = entry.get("webPath") if entry else f"{args.output.as_posix()}/web/{group.cache_key}.mp3"
        print(f"[{index:04d}/{len(groups):04d}] {status:<6} {group.representative.hanzi} -> {target}")
    print(json.dumps({
        "inputEntries": len(items),
        "uniquePronunciations": len(groups),
        "duplicatesAvoided": len(items) - len(groups),
        "ttsCalls": sum(1 for group in groups if group.cache_key not in existing),
    }, ensure_ascii=False, indent=2))


def manifest_entries(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    rows = payload.get("items", []) if isinstance(payload, dict) else []
    if not isinstance(rows, list):
        raise ValueError(f"Manifest items must be an array: {path}")
    return [row for row in rows if isinstance(row, dict)]


def verify_manifest_integrity(args: argparse.Namespace, root: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Perform a full hash, metadata and FFmpeg decode audit of the current manifest."""
    deps = discover_dependencies()
    valid: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    required_metadata = (
        "sha256", "webSha256", "duration", "file_size", "sample_rate", "channels",
        "codec", "bitrate", "provider", "model", "voice", "profile", "created_at",
    )
    for entry in manifest_entries(args.manifest):
        key = str(entry.get("audioCacheKey") or entry.get("id") or "unknown")
        entry_issues: list[str] = []
        invalid_file = False
        try:
            profile = str(entry.get("profile") or "")
            if profile not in PROFILE_SETTINGS:
                raise InputDataError(f"unsupported profile: {profile}")
            wav = (root / str(entry["path"])).resolve()
            web = (root / str(entry["webPath"])).resolve()
            if not wav.is_file() or not web.is_file():
                raise QualityError("missing WAV or MP3")
            validation = validate_audio_pair(wav, web, profile, deps, args.pitch_analysis)
            expected = {
                "sha256": sha256_file(wav), "webSha256": sha256_file(web),
                "duration": validation["wav"]["duration"], "file_size": wav.stat().st_size,
                "sample_rate": validation["wav"]["sampleRate"], "channels": validation["wav"]["channels"],
                "codec": "pcm_s16le", "bitrate": SAMPLE_RATE * validation["wav"]["channels"] * 16,
                "web_file_size": web.stat().st_size, "web_codec": validation["web"]["codec"],
                "web_bitrate": validation["web"]["bitrate"],
            }
            missing = [field for field in required_metadata if field not in entry]
            if missing:
                entry_issues.append(f"missing metadata: {', '.join(missing)}")
            if not ManifestStore._metadata_matches(entry, expected):
                entry_issues.append("hash or metadata mismatch")
                invalid_file = True
            if entry.get("provider") != PROVIDER or entry.get("model") != MODEL:
                entry_issues.append("provider or model mismatch")
                invalid_file = True
        except Exception as error:  # noqa: BLE001 - audit every entry independently
            entry_issues.append(str(error))
            invalid_file = True
        if entry_issues:
            issues.append({"id": entry.get("id"), "audioCacheKey": key, "invalid_file": invalid_file, "issues": entry_issues})
        else:
            valid.append(entry)
    if args.clean_invalid and issues:
        # Missing legacy metadata is repairable by a normal resume run and must not delete valid cache files.
        invalid_keys = {row["audioCacheKey"] for row in issues if row.get("invalid_file")}
        if invalid_keys:
            for entry in manifest_entries(args.manifest):
                if str(entry.get("audioCacheKey")) not in invalid_keys:
                    continue
                for field in ("path", "webPath"):
                    candidate = (root / str(entry.get(field) or "")).resolve()
                    if candidate.is_file() and candidate.is_relative_to(args.output.resolve()) and candidate.parent.name in {"cache", "web"}:
                        candidate.unlink(missing_ok=True)
            store = ManifestStore(args, root, deps)
            store.items = {key: entry for key, entry in store.items.items() if key not in invalid_keys}
            store.dirty = True
            asyncio.run(store.checkpoint_with_retry())
    return valid, issues


def print_stats(args: argparse.Namespace) -> dict[str, Any]:
    stats = Stats()
    report = build_audio_report(args, manifest_entries(args.manifest), stats)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return report


def rebuild_manifest(args: argparse.Namespace, root: Path, items: list[AudioItem]) -> tuple[int, int]:
    """Reconstruct manifest/index files from deterministic cache filenames, without TTS."""
    deps = discover_dependencies()
    try:
        store = ManifestStore(args, root, deps)
    except (ValueError, json.JSONDecodeError):
        backup = args.manifest.with_name(f"{args.manifest.name}.corrupt.{int(time.time())}.bak")
        if args.manifest.is_file():
            os.replace(args.manifest, backup)
        store = ManifestStore(args, root, deps)
    store.items = {}
    store.dirty = True
    recovered = 0
    missing = 0
    for group in build_groups(items, args):
        entry = store.recover_valid(group)
        if entry:
            recovered += 1
        else:
            missing += 1
    asyncio.run(store.checkpoint_with_retry(force=True))
    write_review_file(args.review, store.items.values())
    stats = Stats(resumed=recovered, unique_pronunciations=recovered + missing)
    write_audio_reports(args, store.items.values(), stats)
    print(f"Manifest rebuilt: recovered={recovered} missing={missing}")
    return recovered, missing


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate cached static Mandarin audio with Edge-TTS.")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path, default=Path("assets/audio/learning"))
    parser.add_argument("--manifest", type=Path, default=Path("assets/audio/learning/manifest.json"))
    parser.add_argument("--cache-index", type=Path, default=Path("assets/audio/learning/audio-cache-index.json"))
    parser.add_argument(
        "--web-index",
        type=Path,
        default=Path("assets/audio/learning/generation-web-index.json"),
        help="Generator-only diagnostic index. The browser runtime index is built separately by build-learning-audio-runtime.mjs.",
    )
    parser.add_argument("--failed", "--errors", dest="failed", type=Path, default=Path("assets/audio/learning/failed.jsonl"))
    parser.add_argument("--review", type=Path, default=Path("assets/audio/learning/pronunciation_review.jsonl"))
    parser.add_argument("--report-json", type=Path, default=Path("assets/audio/learning/audio-report.json"))
    parser.add_argument("--report-html", type=Path, default=Path("assets/audio/learning/audio-report.html"))
    parser.add_argument("--logs", type=Path, default=Path("assets/audio/learning/logs"))
    parser.add_argument("--voice", default=DEFAULT_VOICE)
    parser.add_argument("--voice-version", default="v1")
    parser.add_argument("--rate", default=None, help="Override every profile, for example --rate=-20%%")
    parser.add_argument("--volume", default="+0%")
    parser.add_argument("--pitch", default="+0Hz")
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--retry-base-delay", type=float, default=2.0)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--start-index", type=int, default=0)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--resume", action="store_true", default=True, help="Resume from manifest/checkpoint and recover completed orphan files (default).")
    parser.add_argument("--missing-only", action="store_true", help="Generate only cache keys absent from the current manifest; run full integrity afterward.")
    parser.add_argument("--retry-failed", action="store_true", help="Retry only entries in failed.jsonl; does not scan inventory.")
    parser.add_argument("--retry-errors", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--checkpoint-every", type=int, default=10)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--rebuild-manifest", action="store_true")
    parser.add_argument("--report", dest="report_only", action="store_true")
    parser.add_argument("--clean-invalid", action="store_true")
    parser.add_argument("--check-integrity", action="store_true")
    parser.add_argument("--stats", action="store_true")
    parser.add_argument("--web-bitrate", default=None, help="Override profile bitrate; defaults to 32k vocabulary / 48k sentence or passage.")
    parser.add_argument("--ffmpeg", help="Path to ffmpeg executable; defaults to PATH.")
    parser.add_argument("--ffprobe", help="Path to ffprobe executable; defaults to PATH.")
    parser.add_argument("--no-pitch-analysis", dest="pitch_analysis", action="store_false")
    parser.set_defaults(pitch_analysis=True)
    args = parser.parse_args(argv)
    if not 1 <= args.concurrency <= 20:
        parser.error("--concurrency must be between 1 and 20")
    if args.concurrency > 10:
        logging.warning("Concurrency above 10 can trigger Edge-TTS throttling")
    if not 1 <= args.retries <= 8:
        parser.error("--retries must be between 1 and 8")
    if args.retry_base_delay < 0 or args.checkpoint_every < 1:
        parser.error("--retry-base-delay must be >= 0 and --checkpoint-every must be >= 1")
    if args.start_index < 0 or (args.limit is not None and args.limit < 1):
        parser.error("--start-index must be >= 0 and --limit must be >= 1")
    return args


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")
    args = parse_args(sys.argv[1:])
    root = Path(__file__).resolve().parent
    for name in (
        "input", "output", "manifest", "cache_index", "web_index", "failed", "review", "retry_errors",
        "report_json", "report_html", "logs",
    ):
        value = getattr(args, name, None)
        if isinstance(value, Path) and not value.is_absolute():
            setattr(args, name, (root / value).resolve())
    configure_logging(args.logs)
    logging.info("Audio generator started args=%s", " ".join(sys.argv[1:]))

    if args.stats:
        print_stats(args)
        return 0
    if args.report_only:
        report = write_audio_reports(args, manifest_entries(args.manifest), Stats())
        print(f"Reports written for {report['total_audio']} audio")
        return 0
    if args.verify_only or args.check_integrity:
        valid, issues = verify_manifest_integrity(args, root)
        print(json.dumps({"valid": len(valid), "invalid": len(issues), "issues": issues}, ensure_ascii=False, indent=2))
        return 1 if issues else 0

    if args.retry_failed:
        apply_failed_settings(args, args.failed)
        items = load_failed_items(args.failed)
        if not items:
            print(f"No failed entries to retry: {args.failed}")
            return 0
    else:
        if not args.input:
            raise InputDataError("--input is required unless using --retry-failed, --verify-only, --report or --stats")
        items = load_input(args.input)
    if args.retry_errors:
        retry_ids = read_retry_ids(args.retry_errors)
        items = [item for item in items if item.id in retry_ids]
    if args.missing_only:
        existing_keys = {
            str(entry.get("audioCacheKey")) for entry in manifest_entries(args.manifest)
            if entry.get("audioCacheKey")
        }
        items = [
            item for item in items
            if make_cache_key(item, args, profile_rate(item.profile, args.rate)) not in existing_keys
        ]
        if not items:
            print("No manifest-missing audio remains.")
            return 0
    if args.rebuild_manifest:
        rebuild_manifest(args, root, items)
        return 0
    items = items[args.start_index :]
    if args.limit is not None:
        items = items[: args.limit]
    if not items:
        raise InputDataError("No input entries remain after filtering")
    if args.dry_run:
        dry_run(args, items)
        return 0
    stats = asyncio.run(run(args, root, items))
    return 1 if stats.failed else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted. Completed entries were checkpointed when possible.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as error:  # noqa: BLE001
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
