# Shared learning audio

This pipeline creates static Mandarin audio only for controls that need a local file:

- Flashcard headwords (never flashcard examples).
- Luyện viết vocabulary and lesson sentences.
- Khóa học primary/extended vocabulary and every `lessonText` line.
- Translation challenge prompts and idiom headwords.

Dictionary and grammar controls always use browser `speechSynthesis`. Vocabulary examples are not inventory entries. The current inventory contains 17,190 logical references, 7,427 global keys and 7,246 physical MP3 files after binary deduplication.

## Global key

The SHA-256 key contains only:

```text
normalizedText + U+001F + voice + U+001F + generationRate
```

It never contains a page, lesson, module, logical ID, pinyin or meaning. Text is normalized to Unicode NFC; whitespace and common punctuation-width/quote variants are canonicalized before hashing.

Default voice and rates:

- Voice: `zh-CN-XiaoxiaoNeural`
- `vocabulary`: `-18%`
- `writing-sentence`: `-12%`
- `lesson-passage`: `-8%`

## Build

Build the inventory from the real project data:

```powershell
node tools/build-learning-audio-inventory.mjs --output assets/data/audio/learning-audio-inventory.json
```

Dry-run the runtime migration, then write the compact manifest and lookup shards:

```powershell
node tools/build-learning-audio-runtime.mjs
node tools/build-learning-audio-runtime.mjs --write
```

The migration stops before writing if any required global key lacks a valid local MP3. Pruning is a separate operation and accepts only a verified plan:

```powershell
node tools/build-learning-audio-runtime.mjs --apply-prune
```

## Generate missing audio

Python runtime:

```text
E:\TiengtrungCocaV2\.venv\Scripts\python.exe
```

Verify dependencies:

```powershell
E:\TiengtrungCocaV2\.venv\Scripts\python.exe -c "import edge_tts, soundfile, numpy, tqdm; print('audio dependencies OK')"
ffmpeg -version
```

Dry-run without TTS or manifest writes:

```powershell
E:\TiengtrungCocaV2\.venv\Scripts\python.exe generate_audio.py `
  --input assets/data/audio/learning-audio-inventory.json `
  --limit 5 `
  --dry-run
```

Generate only missing global keys:

```powershell
E:\TiengtrungCocaV2\.venv\Scripts\python.exe generate_audio.py `
  --input assets/data/audio/learning-audio-inventory.json `
  --missing-only `
  --concurrency 3 `
  --retries 4
```

The generator reuses an existing verified MP3 even after the large WAV cache has been finalized and removed. It never runs in the browser.

## Runtime

The website does not load a full audio index at startup. On the first relevant click it loads:

1. the small `web-index.json` root;
2. one hash shard from `index/hash/`;
3. the selected MP3 only.

The unified fallback order is:

```text
shared local MP3 -> IndexedDB browser cache -> speechSynthesis
```

Dictionary and grammar skip static lookup completely. One `Audio` instance can be active at a time; a new request stops and releases the old one. At most one next-audio metadata preload is retained.

## Verify

```powershell
npm run check:audio-inventory
npm run check:audio-static
npm run audit:audio-coverage
E:\TiengtrungCocaV2\.venv\Scripts\python.exe check_audio_inventory.py
```

These checks cover inventory freshness, global hashes, O(1) hash/ID shards, MP3 existence, size, SHA-256, unreferenced files and feature coverage.

## Outputs

```text
assets/audio/learning/
├── web/                           # production MP3, generated and Git-ignored
├── manifest.json                  # generated QC/global-key manifest
├── web-index.json                 # small runtime root
├── index/hash/                    # lazy O(1) global-hash shards
├── index/id/                      # lazy O(1) logical-ID shards
├── pronunciation_review.jsonl     # native review queue
├── failed.jsonl                   # retry queue
└── logs/                          # local generator logs
```

The web MP3 directory and heavy generator metadata are excluded from Git. `.vercelignore` keeps generator-only metadata out of deployment while leaving the runtime root, shards and production MP3 available to the local Vercel deployment workflow.
