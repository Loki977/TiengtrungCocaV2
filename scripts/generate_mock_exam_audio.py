#!/usr/bin/env python3
"""Generate and verify static mock-exam MP3 files with Edge TTS.

Concurrency is capped at four, every item retries four times, completed files
are resumed, and a checkpoint plus a SHA-256 manifest is written incrementally.
Dialogue segments preserve female/male voices and are concatenated by FFmpeg.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import edge_tts


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "assets/data/mock-tests"
AUDIO_ROOT = ROOT / "assets/audio/mock-tests"
MANIFEST_PATH = AUDIO_ROOT / "audio-manifest.json"
CHECKPOINT_PATH = AUDIO_ROOT / ".generation-checkpoint.json"
CONCURRENCY = 4
RETRIES = 4

ALIASES = {
    "xiaoxiaonature": "zh-CN-XiaoxiaoNeural",
    "XiaoxiaoNatural": "zh-CN-XiaoxiaoNeural",
    "zh-CN-XiaoxiaoNatural": "zh-CN-XiaoxiaoNeural",
}

VI_SECTIONS = {
    1: "phần Nghe và phần Đọc",
    2: "phần Nghe và phần Đọc",
    3: "phần Nghe, phần Đọc và phần Viết",
    4: "phần Nghe, phần Đọc và phần Viết",
    5: "phần Nghe, phần Đọc và phần Viết",
    6: "phần Nghe, phần Đọc và phần Viết",
}
ZH_SECTIONS = {
    1: "听力和阅读",
    2: "听力和阅读",
    3: "听力、阅读和书写",
    4: "听力、阅读和书写",
    5: "听力、阅读和书写",
    6: "听力、阅读和书写",
}
ZH_DURATION = {1: "约四十分钟", 2: "约五十五分钟", 3: "约九十分钟", 4: "约一百零五分钟", 5: "约一百二十五分钟", 6: "约一百四十分钟"}


def rel_to_path(relative: str) -> Path:
    return ROOT / relative.removeprefix("./").replace("/", str(Path("/")))


def probe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return round(float(result.stdout.strip()), 3)


def valid_audio(path: Path) -> bool:
    try:
        return path.is_file() and path.stat().st_size > 1024 and probe_duration(path) >= 0.45
    except (OSError, ValueError, subprocess.CalledProcessError):
        return False


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def build_intro_tasks() -> list[dict]:
    tasks = []
    for level in range(1, 7):
        duration = json.loads((DATA_ROOT / "standards/hsk-2.0-current.json").read_text(encoding="utf-8"))["levels"][str(level)]["officialTotalDurationMinutes"]
        vi_segments = [
            {
                "voice": "vi-VN-HoaiMyNeural",
                "rate": "-8%",
                "pitch": "+4Hz",
                "text": "Chào mừng bạn đến với kỳ thi thử",
            },
            {"voice": "en-US-JennyNeural", "rate": "-8%", "pitch": "+1Hz", "text": "H S K"},
            {
                "voice": "vi-VN-HoaiMyNeural",
                "rate": "-7%",
                "pitch": "+3Hz",
                "text": (
                    f"cấp {level} của Tiếng Trung Cô Ca. Bài thi gồm {VI_SECTIONS[level]} với tổng thời gian làm bài là "
                    f"{duration} phút. Mỗi phần được tính giờ riêng. Sau khi chuyển sang phần tiếp theo, bạn sẽ không thể "
                    "quay lại phần trước."
                ),
            },
            {
                "voice": "vi-VN-HoaiMyNeural",
                "rate": "-6%",
                "pitch": "+2Hz",
                "text": (
                    "Trong phần Nghe, âm thanh sẽ được phát tự động theo đúng số lần quy định. "
                    "Hãy kiểm tra tai nghe và âm lượng trước khi bắt đầu. Câu trả lời sẽ được tự động lưu, "
                    "và bài thi sẽ tự nộp khi hết giờ."
                ),
            },
            {
                "voice": "vi-VN-HoaiMyNeural",
                "rate": "-8%",
                "pitch": "+5Hz",
                "text": (
                    "Hãy giữ bình tĩnh, đọc kỹ yêu cầu và phân bổ thời gian hợp lý. "
                    "Chúc bạn hoàn thành bài thi thật tốt và đạt kết quả cao!"
                ),
            },
        ]
        zh_segments = [{
            "voice": "zh-CN-XiaoxiaoNeural",
            "rate": "-5%",
            "text": (
                f"欢迎参加 Tiếng Trung Cô Ca 的 HSK {level} 级模拟考试。本次考试包括{ZH_SECTIONS[level]}，"
                f"考试总时间为{ZH_DURATION[level]}。每个部分单独计时。进入下一个部分以后，不能返回上一个部分继续答题。"
                "听力材料将按照考试规定自动播放。考试开始以前，请检查耳机和音量。系统会自动保存你的答案，"
                "考试时间结束以后将自动交卷。请认真阅读题目，合理安排时间，保持冷静。祝你顺利完成考试，取得好成绩！"
            ),
        }]
        tasks.extend([
            {"path": f"./assets/audio/mock-tests/intros/hsk{level}/intro-vi.mp3", "segments": vi_segments, "kind": "intro_vi", "level": level},
            {"path": f"./assets/audio/mock-tests/intros/hsk{level}/intro-zh.mp3", "segments": zh_segments, "kind": "intro_zh", "level": level},
        ])
    tasks.append({
        "path": "./assets/audio/mock-tests/shared/sound-test.mp3",
        "segments": [{
            "voice": "vi-VN-HoaiMyNeural",
            "rate": "-8%",
            "pitch": "+4Hz",
            "text": "Âm thanh đang hoạt động tốt. Chúc bạn làm bài thuận lợi!",
        }],
        "kind": "sound_test",
    })
    return tasks


def collect_tasks() -> list[dict]:
    tasks_by_path = {}
    for exam_path in sorted((DATA_ROOT / "exams").glob("hsk*/*.json")):
        exam = json.loads(exam_path.read_text(encoding="utf-8"))
        for section in exam["sections"]:
            for part in section["parts"]:
                for question in part["questions"]:
                    if not question.get("audioPath"):
                        continue
                    task = {
                        "path": question["audioPath"],
                        "segments": question.get("audioSegments") or [{
                            "voice": "zh-CN-XiaoxiaoNeural",
                            "rate": "-5%",
                            "text": question["audioText"],
                        }],
                        "kind": "question",
                        "examIds": [exam["id"]],
                        "questionIds": [question["id"]],
                    }
                    existing = tasks_by_path.get(task["path"])
                    if existing:
                        existing["examIds"].append(exam["id"])
                        existing["questionIds"].append(question["id"])
                    else:
                        tasks_by_path[task["path"]] = task
    for task in build_intro_tasks():
        tasks_by_path[task["path"]] = task
    return list(tasks_by_path.values())


async def synthesize_segment(segment: dict, output: Path) -> None:
    voice = ALIASES.get(segment["voice"], segment["voice"])
    communicate = edge_tts.Communicate(
        segment["text"],
        voice=voice,
        rate=segment.get("rate", "-5%"),
        volume=segment.get("volume", "+0%"),
        pitch=segment.get("pitch", "+0Hz"),
    )
    await asyncio.wait_for(communicate.save(str(output)), timeout=75)


def normalize_audio(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-i", str(source),
        "-ac", "1", "-ar", "24000", "-b:a", "56k", "-codec:a", "libmp3lame", str(target),
    ], check=True)


def join_segments_seamlessly(segment_files: list[Path], temp_dir: Path) -> Path:
    """Trim TTS padding and join voice changes with a very short crossfade."""
    prepared = []
    for index, source in enumerate(segment_files):
        target = temp_dir / f"prepared-{index:02d}.wav"
        subprocess.run([
            "ffmpeg", "-y", "-v", "error", "-i", str(source),
            "-af",
            "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-48dB:"
            "stop_periods=-1:stop_duration=0.04:stop_threshold=-48dB",
            "-ac", "1", "-ar", "24000", "-codec:a", "pcm_s16le", str(target),
        ], check=True)
        prepared.append(target)

    if len(prepared) == 1:
        return prepared[0]

    command = ["ffmpeg", "-y", "-v", "error"]
    for source in prepared:
        command.extend(["-i", str(source)])
    filters = []
    previous = "[0:a]"
    for index in range(1, len(prepared)):
        output = f"[joined{index}]"
        filters.append(f"{previous}[{index}:a]acrossfade=d=0.045:c1=tri:c2=tri{output}")
        previous = output
    target = temp_dir / "joined.wav"
    command.extend([
        "-filter_complex", ";".join(filters),
        "-map", previous,
        "-ac", "1", "-ar", "24000", "-codec:a", "pcm_s16le", str(target),
    ])
    subprocess.run(command, check=True)
    return target


async def generate_task(task: dict, semaphore: asyncio.Semaphore, verify_only: bool, force: bool = False) -> dict:
    target = rel_to_path(task["path"])
    if valid_audio(target) and not force:
        return manifest_entry(task, target, "resumed")
    if verify_only:
        raise RuntimeError(f"Thiếu hoặc lỗi audio: {task['path']}")

    async with semaphore:
        last_error = None
        for attempt in range(1, RETRIES + 1):
            temp_dir = Path(tempfile.mkdtemp(prefix="mock-audio-"))
            try:
                segment_files = []
                for index, segment in enumerate(task["segments"]):
                    segment_file = temp_dir / f"segment-{index:02d}.mp3"
                    await synthesize_segment(segment, segment_file)
                    if not segment_file.is_file() or segment_file.stat().st_size <= 1024:
                        raise RuntimeError("Edge TTS tạo file rỗng.")
                    segment_files.append(segment_file)

                source = join_segments_seamlessly(segment_files, temp_dir)
                normalize_audio(source, target)
                if not valid_audio(target):
                    raise RuntimeError("Audio sau chuẩn hóa không hợp lệ.")
                return manifest_entry(task, target, f"generated_attempt_{attempt}")
            except Exception as error:  # noqa: BLE001 - retries intentionally cover network and ffmpeg failures.
                last_error = error
                if target.exists():
                    target.unlink()
                if attempt < RETRIES:
                    await asyncio.sleep(min(8, 2 ** (attempt - 1)))
            finally:
                shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError(f"Không tạo được {task['path']} sau {RETRIES} lần: {last_error}")


def manifest_entry(task: dict, target: Path, status: str) -> dict:
    segments = [
        {
            "text": segment["text"],
            "voice": ALIASES.get(segment["voice"], segment["voice"]),
            "rate": segment.get("rate", "-5%"),
            "volume": segment.get("volume", "+0%"),
            "pitch": segment.get("pitch", "+0Hz"),
        }
        for segment in task["segments"]
    ]
    return {
        "path": task["path"],
        "kind": task["kind"],
        "segments": segments,
        "text": " ".join(segment["text"] for segment in segments),
        "voices": sorted({segment["voice"] for segment in segments}),
        "rate": sorted({segment["rate"] for segment in segments}),
        "volume": sorted({segment["volume"] for segment in segments}),
        "pitch": sorted({segment["pitch"] for segment in segments}),
        "sha256": sha256_file(target),
        "bytes": target.stat().st_size,
        "duration": probe_duration(target),
        "sampleRate": 24000,
        "channels": 1,
        "bitrateKbps": 56,
        "status": status,
        **({"examIds": sorted(set(task["examIds"])), "questionIds": task["questionIds"]} if task.get("examIds") else {}),
        **({"level": task["level"]} if task.get("level") else {}),
    }


async def run(verify_only: bool, prune: bool, force_vietnamese: bool) -> None:
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("Cần cài FFmpeg và FFprobe.")
    tasks = collect_tasks()
    AUDIO_ROOT.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "total": len(tasks),
        "completed": 0,
        "failed": [],
        "verifyOnly": verify_only,
        "forceVietnamese": force_vietnamese,
    }
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def wrapped(task: dict) -> dict:
        try:
            force = force_vietnamese and not verify_only and task["kind"] in {"intro_vi", "sound_test"}
            entry = await generate_task(task, semaphore, verify_only, force)
            checkpoint["completed"] += 1
            CHECKPOINT_PATH.write_text(json.dumps(checkpoint, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            if checkpoint["completed"] % 20 == 0 or checkpoint["completed"] == checkpoint["total"]:
                print(f"Audio {checkpoint['completed']}/{checkpoint['total']}")
            return entry
        except Exception as error:  # noqa: BLE001
            checkpoint["failed"].append({"path": task["path"], "error": str(error)})
            CHECKPOINT_PATH.write_text(json.dumps(checkpoint, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            raise

    entries = await asyncio.gather(*(wrapped(task) for task in tasks))
    entries.sort(key=lambda item: item["path"])
    total_bytes = sum(item["bytes"] for item in entries)
    manifest = {
        "version": 1,
        "generator": "edge-tts + ffmpeg",
        "concurrency": CONCURRENCY,
        "retries": RETRIES,
        "encoding": {"format": "mp3", "sampleRate": 24000, "channels": 1, "bitrateKbps": 56},
        "fileCount": len(entries),
        "totalBytes": total_bytes,
        "items": entries,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if prune:
        referenced = {rel_to_path(item["path"]).resolve() for item in entries}
        removed = 0
        for audio_file in AUDIO_ROOT.rglob("*.mp3"):
            if audio_file.resolve() not in referenced:
                audio_file.unlink()
                removed += 1
        print(f"Pruned {removed} unreferenced MP3 files.")
    print(f"Verified {len(entries)} MP3 files ({total_bytes / 1024 / 1024:.2f} MiB).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--prune", action="store_true")
    parser.add_argument(
        "--force-vietnamese",
        action="store_true",
        help="Regenerate the six Vietnamese introductions and the sound-test audio.",
    )
    arguments = parser.parse_args()
    asyncio.run(run(arguments.verify_only, arguments.prune, arguments.force_vietnamese))
