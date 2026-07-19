import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AUDIO_KEY_VERSION, DEFAULT_AUDIO_VOICE, PROFILE_RATES, audioKeyMaterial } from './audio-key.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(ROOT, 'assets', 'data', 'audio', 'learning-audio-inventory.json');
const LEVELS = ['hsk1', 'hsk2', 'hsk3', 'hsk4', 'hsk5', 'hsk6'];

function parseArgs(argv) {
  const result = { output: DEFAULT_OUTPUT, check: false, summaryOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--check') result.check = true;
    else if (value === '--summary-only') result.summaryOnly = true;
    else if (value === '--output') result.output = path.resolve(ROOT, argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  return result;
}

function normalizeText(value) {
  return String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

function normalizePinyin(value) {
  return normalizeText(value).toLocaleLowerCase('zh-CN');
}

function makeId(...parts) {
  return parts
    .map((part) => String(part ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('-');
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function createLocalFetch() {
  return async (resource) => {
    const value = typeof resource === 'string' ? resource : resource?.url;
    if (!value || /^[a-z]+:/i.test(value)) throw new Error(`Inventory fetch only accepts project-relative files: ${value}`);
    const file = path.resolve(ROOT, value.replace(/^\/+/, ''));
    if (!file.startsWith(`${ROOT}${path.sep}`)) throw new Error(`Inventory fetch escaped project root: ${value}`);
    try {
      const body = await fs.readFile(file, 'utf8');
      return { ok: true, status: 200, statusText: 'OK', json: async () => JSON.parse(body), text: async () => body };
    } catch (error) {
      if (error?.code === 'ENOENT') return { ok: false, status: 404, statusText: 'Not Found' };
      throw error;
    }
  };
}

function addItem(items, item) {
  const hanzi = normalizeText(item.hanzi);
  if (!hanzi) return;
  items.push({
    id: item.id,
    category: item.category,
    profile: item.profile,
    hanzi,
    pinyin: normalizePinyin(item.pinyin),
    meaning: normalizeText(item.meaning),
    source: item.source
  });
}

async function collectFlashcards(items) {
  let rows = 0;
  for (const level of LEVELS) {
    const relative = `assets/data/${level}.json`;
    const records = await readJson(path.join(ROOT, relative));
    records.forEach((record, index) => {
      rows += 1;
      addItem(items, {
        id: makeId('flashcard', level, record.id || String(index + 1).padStart(5, '0')),
        category: 'flashcard-vocabulary',
        profile: 'vocabulary',
        hanzi: record.hanzi || record.chinese || record.word,
        pinyin: record.pinyin,
        meaning: record.meaning_vi || record.meaning || record.vietnamese || record.vi,
        source: { area: 'flashcard', level, file: relative, index }
      });
    });
  }
  return rows;
}

async function collectWriting(items) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createLocalFetch();
  try {
    const engineUrl = `${pathToFileURL(path.join(ROOT, 'lesson-engine.js')).href}?audioInventory=${Date.now()}`;
    const configUrl = pathToFileURL(path.join(ROOT, 'lesson-config.js')).href;
    const [{ generateLessons }, { getLessonConfig }] = await Promise.all([import(engineUrl), import(configUrl)]);
    let vocabularyRows = 0;
    let sentenceRows = 0;
    for (const level of LEVELS) {
      const lessons = await generateLessons(level, getLessonConfig(level));
      lessons.forEach((lesson) => {
        lesson.vocabularies.forEach((entry, index) => {
          vocabularyRows += 1;
          addItem(items, {
            id: makeId('writing', level, `lesson-${lesson.lessonId}`, 'word', entry.id || index + 1),
            category: 'writing-vocabulary',
            profile: 'vocabulary',
            hanzi: entry.chinese,
            pinyin: entry.pinyin,
            meaning: entry.vietnamese,
            source: { area: 'writing', level, lessonId: lesson.lessonId, kind: 'vocabulary', index }
          });
        });
        lesson.sentences.forEach((entry, index) => {
          sentenceRows += 1;
          addItem(items, {
            id: makeId('writing', level, `lesson-${lesson.lessonId}`, 'sentence', index + 1),
            category: 'writing-sentence',
            profile: 'writing-sentence',
            hanzi: entry.chinese,
            pinyin: entry.pinyin,
            meaning: entry.vietnamese,
            source: { area: 'writing', level, lessonId: lesson.lessonId, kind: 'sentence', index }
          });
        });
      });
    }
    return { vocabularyRows, sentenceRows };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function collectCourseReadings(items) {
  let rows = 0;
  for (const level of LEVELS) {
    const directory = path.join(ROOT, 'assets', 'giaotrinhhsk', level);
    const names = (await fs.readdir(directory))
      .filter((name) => /^lesson-\d+\.json$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const name of names) {
      const relative = `assets/giaotrinhhsk/${level}/${name}`;
      const lesson = await readJson(path.join(ROOT, relative));
      (lesson.lessonText || []).forEach((line, index) => {
        rows += 1;
        addItem(items, {
          id: makeId('course', level, name.replace(/\.json$/i, ''), 'line', index + 1),
          category: 'course-lesson-text',
          profile: 'lesson-passage',
          hanzi: line.chinese || line.content || line.text,
          pinyin: line.pinyin,
          meaning: line.vietnamese || line.translation,
          source: { area: 'course', level, file: relative, lessonId: lesson.lessonId, index }
        });
      });
      // Only primary vocabulary/collocation buttons require static audio.
      // Vocabulary examples are intentionally browser-speech fallback content.
      for (const [section, category] of [['vocabulary', 'course-vocabulary'], ['extendedVocabulary', 'course-extended-vocabulary']]) {
        (lesson[section] || []).forEach((entry, index) => {
          addItem(items, {
            id: makeId('course', level, name.replace(/\.json$/i, ''), section, index + 1, entry.id || ''),
            category,
            profile: 'vocabulary',
            hanzi: entry.hanzi || entry.chinese || entry.word,
            pinyin: entry.pinyin,
            meaning: entry.meaning || entry.vietnamese || entry.translation,
            source: { area: 'course', level, file: relative, section, index, kind: 'word' }
          });
        });
      }
    }
  }
  return rows;
}

async function collectChallengeAndIdioms(items) {
  const counters = { challenge: 0, idioms: 0 };
  for (const level of LEVELS) {
    const relative = `assets/data/translation-challenge/${level}.json`;
    const rows = await readJson(path.join(ROOT, relative));
    rows.forEach((row, index) => {
      counters.challenge += 1;
      addItem(items, {
        id: makeId('challenge', level, row.id || index + 1), category: 'translation-challenge', profile: 'writing-sentence',
        hanzi: row.chinese || row.hanzi, pinyin: row.pinyin, meaning: row.vietnamese || row.translation,
        source: { area: 'translation-challenge', level, file: relative, index }
      });
    });
  }
  const relative = 'assets/data/tang-thu-cac/idioms.json';
  const payload = await readJson(path.join(ROOT, relative));
  const rows = payload.items || payload;
  rows.forEach((row, index) => {
    counters.idioms += 1;
    addItem(items, {
      id: makeId('tang', 'idiom', row.id || index + 1),
      category: 'tang-idiom',
      profile: 'vocabulary',
      hanzi: row.hanzi,
      pinyin: row.pinyin,
      meaning: row.meaning,
      source: { area: 'tang-thu-cac', file: relative, index, kind: 'idiom' }
    });
  });
  return counters;
}

function countUnique(items) {
  const pronunciation = new Set();
  const byProfile = {};
  for (const item of items) {
    const rate = PROFILE_RATES[item.profile];
    const key = audioKeyMaterial(item.hanzi, DEFAULT_AUDIO_VOICE, rate);
    pronunciation.add(key);
    byProfile[item.profile] ||= new Set();
    byProfile[item.profile].add(key);
  }
  return {
    pronunciations: pronunciation.size,
    byProfile: Object.fromEntries(Object.entries(byProfile).map(([key, value]) => [key, value.size]))
  };
}

function comparable(payload) {
  return JSON.stringify({
    version: payload.version,
    voice: payload.voice,
    keyVersion: payload.keyVersion,
    ratesByProfile: payload.ratesByProfile,
    scope: payload.scope,
    items: payload.items
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const items = [];
  const flashcardRows = await collectFlashcards(items);
  const writing = await collectWriting(items);
  const courseRows = await collectCourseReadings(items);
  const extras = await collectChallengeAndIdioms(items);
  const unique = countUnique(items);
  const payload = {
    version: 3,
    generatedAt: new Date().toISOString(),
    locale: 'zh-CN',
    voice: DEFAULT_AUDIO_VOICE,
    keyVersion: AUDIO_KEY_VERSION,
    ratesByProfile: PROFILE_RATES,
    scope: {
      flashcardWords: flashcardRows,
      flashcardExamples: 0,
      writingWords: writing.vocabularyRows,
      writingSentences: writing.sentenceRows,
      courseLessonText: courseRows,
      translationChallenge: extras.challenge,
      dictionaryWords: 0,
      grammarExamples: 0,
      vocabularyExamples: 0,
      tangThuCacEntries: extras.idioms,
      logicalEntries: items.length,
      uniquePronunciations: unique.pronunciations,
      uniqueByProfile: unique.byProfile
    },
    items
  };

  console.log(JSON.stringify(payload.scope, null, 2));
  if (args.summaryOnly) return;
  if (args.check) {
    const existing = await readJson(args.output);
    if (comparable(existing) !== comparable(payload)) throw new Error(`Inventory is stale: ${path.relative(ROOT, args.output)}`);
    console.log(`Inventory is current: ${path.relative(ROOT, args.output)}`);
    return;
  }
  await fs.mkdir(path.dirname(args.output), { recursive: true });
  const temporary = `${args.output}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, args.output);
  console.log(`Wrote ${path.relative(ROOT, args.output)}`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
