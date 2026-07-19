from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

import generate_audio as audio
import review_audio


def args(**overrides):
    values = {
        "voice": audio.DEFAULT_VOICE,
        "voice_version": "v1",
        "rate": None,
        "volume": "+0%",
        "pitch": "+0Hz",
    }
    values.update(overrides)
    return argparse.Namespace(**values)


class CacheKeyTests(unittest.TestCase):
    def item(self, identifier, hanzi, pinyin, meaning="", profile="vocabulary"):
        return audio.AudioItem(identifier, hanzi, pinyin, meaning, profile, profile, {})

    def test_exact_duplicates_share_one_group(self):
        items = [self.item("a", "你好", "nǐ hǎo"), self.item("b", "你好", "nǐ hǎo")]
        groups = audio.build_groups(items, args())
        self.assertEqual(len(groups), 1)
        self.assertEqual(len(groups[0].items), 2)

    def test_meaning_does_not_change_pronunciation(self):
        items = [self.item("a", "行", "xíng", "được"), self.item("b", "行", "xíng", "đi")]
        self.assertEqual(len(audio.build_groups(items, args())), 1)

    def test_global_key_does_not_depend_on_pinyin(self):
        items = [self.item("a", "行", "xíng"), self.item("b", "行", "háng")]
        self.assertEqual(len(audio.build_groups(items, args())), 1)

    def test_rate_but_not_page_or_profile_is_part_of_cache_key(self):
        word = self.item("a", "学习", "xuéxí")
        sentence = self.item("b", "学习", "xuéxí", profile="writing-sentence")
        self.assertEqual(len(audio.build_groups([word, sentence], args())), 2)
        self.assertEqual(len(audio.build_groups([word, sentence], args(rate="-10%"))), 1)
        default_key = audio.make_cache_key(word, args(), "-18%")
        changed_key = audio.make_cache_key(word, args(rate="-15%"), "-15%")
        self.assertNotEqual(default_key, changed_key)

    def test_unicode_whitespace_and_punctuation_are_normalized_before_hash(self):
        left = self.item("course-hsk1-1", "你好， 世界！", "nǐ hǎo")
        right = self.item("flashcard-hsk6-999", "  你好,世界!  ", "")
        self.assertEqual(len(audio.build_groups([left, right], args())), 1)

    def test_corrupt_wav_is_rejected_by_analysis(self):
        deps = audio.discover_dependencies()
        with tempfile.TemporaryDirectory() as temporary:
            broken = Path(temporary) / "broken.wav"
            broken.write_bytes(b"not a wav")
            with self.assertRaises(Exception):
                audio.analyze_wav(broken, "vocabulary", deps, True)

    def test_checkpoint_default_is_ten(self):
        parsed = audio.parse_args(["--input", "inventory.json"])
        self.assertEqual(parsed.checkpoint_every, 10)
        self.assertTrue(parsed.resume)
        self.assertEqual(parsed.web_index.as_posix(), "assets/audio/learning/generation-web-index.json")

    def test_retry_classifier_separates_transient_and_input_errors(self):
        self.assertTrue(audio.is_retryable_error(TimeoutError("timed out")))
        self.assertTrue(audio.is_retryable_error(RuntimeError("HTTP 429 rate limit")))
        self.assertTrue(audio.is_retryable_error(audio.QualityError("corrupt generated audio")))
        self.assertFalse(audio.is_retryable_error(audio.InputDataError("empty text")))
        self.assertFalse(audio.is_retryable_error(RuntimeError("FFmpeg configuration is invalid")))

    def test_retry_failed_loads_without_inventory(self):
        with tempfile.TemporaryDirectory() as temporary:
            failed = Path(temporary) / "failed.jsonl"
            failed.write_text(json.dumps({
                "id": "failed-1", "text": "你好", "pinyin": "nǐ hǎo",
                "profile": "writing-sentence", "category": "writing-sentence",
            }, ensure_ascii=False) + "\n", encoding="utf-8")
            items = audio.load_failed_items(failed)
            self.assertEqual(len(items), 1)
            self.assertEqual(items[0].hanzi, "你好")
            self.assertEqual(items[0].profile, "writing-sentence")

    def test_retry_failed_accepts_mixed_profile_default_rates(self):
        with tempfile.TemporaryDirectory() as temporary:
            failed = Path(temporary) / "failed.jsonl"
            rows = [
                {"id": "a", "text": "爱", "profile": "vocabulary", "rate": "-18%", "voice": audio.DEFAULT_VOICE},
                {"id": "b", "text": "你好。", "profile": "writing-sentence", "rate": "-12%", "voice": audio.DEFAULT_VOICE},
            ]
            failed.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
            namespace = args(rate="-1%")
            audio.apply_failed_settings(namespace, failed)
            self.assertIsNone(namespace.rate)

    def test_review_status_is_backward_compatible(self):
        row = {"id": "audio-1", "status": "pending"}
        review_audio.set_status(row, "approved", "tester", "listened")
        self.assertEqual(row["status"], "approved")
        self.assertEqual(row["review_status"], "approved")

    def test_failed_queue_contains_production_retry_fields(self):
        with tempfile.TemporaryDirectory() as temporary:
            failed = Path(temporary) / "failed.jsonl"
            namespace = args(failed=failed, concurrency=1)
            item = self.item("failure-1", "你好", "nǐ hǎo", profile="writing-sentence")
            group = audio.build_groups([item], namespace)[0]
            generator = audio.AudioGenerator(namespace, Path(temporary), None, None)
            with self.assertLogs("audio.error", level="ERROR"):
                asyncio.run(generator.write_error(group, TimeoutError("network timeout"), 2))
            row = audio.read_jsonl(failed)[0]
            for field in ("id", "text", "profile", "voice", "language", "error", "retry_count", "timestamp"):
                self.assertIn(field, row)
            self.assertEqual(row["retry_count"], 2)
            self.assertTrue(row["retryable"])

    def test_resume_recovers_valid_files_missing_from_checkpoint(self):
        deps = audio.discover_dependencies()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / "assets/audio/learning"
            (output / "cache").mkdir(parents=True)
            (output / "web").mkdir(parents=True)
            namespace = args(
                output=output, manifest=output / "manifest.json",
                cache_index=output / "audio-cache-index.json", web_index=output / "web-index.json",
                overwrite=False, resume=True, pitch_analysis=False, clean_invalid=False,
                verify_only=False, check_integrity=False, stats=False, report_only=False,
            )
            item = self.item("resume-1", "你好", "nǐ hǎo")
            group = audio.build_groups([item], namespace)[0]
            wav = output / "cache" / f"{group.cache_key}.wav"
            web = output / "web" / f"{group.cache_key}.mp3"
            samples = deps.numpy.sin(2 * deps.numpy.pi * 180 * deps.numpy.arange(int(audio.SAMPLE_RATE * 0.6)) / audio.SAMPLE_RATE) * 0.14
            deps.soundfile.write(str(wav), samples, audio.SAMPLE_RATE, subtype="PCM_16", format="WAV")
            subprocess.run([deps.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav), "-b:a", "64k", str(web)], check=True)
            store = audio.ManifestStore(namespace, root, deps)
            recovered = store.recover_valid(group)
            self.assertIsNotNone(recovered)
            self.assertEqual(recovered["source"], "checkpoint-recovery")
            asyncio.run(store.checkpoint())
            self.assertEqual(len(audio.manifest_entries(namespace.manifest)), 1)


if __name__ == "__main__":
    unittest.main()
