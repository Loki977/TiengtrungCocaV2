import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_AUDIO_VOICE,
  PROFILE_RATES,
  createAudioKey
} from './audio-key.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = ['hsk1', 'hsk2', 'hsk3', 'hsk4', 'hsk5', 'hsk6'];
const AUDIO_ROOT = path.join(ROOT, 'assets', 'audio', 'learning');

async function readJson(relative) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relative), 'utf8'));
}

async function fileExists(relative) {
  return fs.stat(path.join(ROOT, relative)).then((stat) => stat.isFile() && stat.size >= 128).catch(() => false);
}

function summarize(rows) {
  const missingRows = rows.filter((row) => !row.mapped);
  return {
    references: rows.length,
    mapped: rows.length - missingRows.length,
    missing: missingRows.length,
    samples: missingRows.slice(0, 20).map(({ id, text, profile }) => ({ id, text, profile }))
  };
}

async function main() {
  const [inventory, manifest, speechSource, courseRenderer, dictionaryPage, librarySource] = await Promise.all([
    readJson('assets/data/audio/learning-audio-inventory.json'),
    readJson('assets/audio/learning/manifest.json'),
    fs.readFile(path.join(ROOT, 'assets', 'js', 'speech-service.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'assets', 'js', 'lesson-render.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'vocabulary.html'), 'utf8'),
    fs.readFile(path.join(ROOT, 'assets', 'js', 'tang-thu-cac.js'), 'utf8')
  ]);
  const manifestByKey = new Map((manifest.items || []).map((entry) => [entry.audioKey || entry.audioCacheKey, entry]));
  const pathStatus = new Map();
  const hasAudioFile = (relative) => {
    if (!pathStatus.has(relative)) pathStatus.set(relative, fileExists(relative));
    return pathStatus.get(relative);
  };
  const rows = [];
  for (const item of inventory.items || []) {
    const rate = item.rate || PROFILE_RATES[item.profile] || '';
    const key = createAudioKey(item.hanzi, item.voice || manifest.voice || DEFAULT_AUDIO_VOICE, rate);
    const entry = manifestByKey.get(key);
    rows.push({
      id: item.id,
      area: item.source?.area || item.category,
      level: item.source?.level || '',
      category: item.category,
      profile: item.profile,
      text: item.hanzi,
      key,
      mapped: Boolean(entry && await hasAudioFile(entry.webPath))
    });
  }

  const courseLevels = {};
  for (const level of LEVELS) {
    courseLevels[level] = summarize(rows.filter((row) => row.area === 'course' && row.level === level));
  }
  const courseReadings = rows.filter((row) => row.category === 'course-lesson-text');
  const areas = {
    flashcard: summarize(rows.filter((row) => row.area === 'flashcard')),
    writing: summarize(rows.filter((row) => row.area === 'writing')),
    course: summarize(rows.filter((row) => row.area === 'course')),
    translationChallenge: summarize(rows.filter((row) => row.area === 'translation-challenge')),
    idioms: summarize(rows.filter((row) => row.category === 'tang-idiom'))
  };

  const browserOnlyInventory = {
    dictionary: rows.filter((row) => row.area === 'dictionary' || row.category === 'dictionary-word').length,
    grammar: rows.filter((row) => row.category.includes('grammar')).length,
    vocabularyExamples: rows.filter((row) => row.category === 'course-example' || row.category === 'tang-idiom-example').length
  };
  const policies = {
    lazyManifest: !speechSource.includes('this.staticAudio.load()'),
    shardedLookup: speechSource.includes('sharded-global-hash') && speechSource.includes('loadShard('),
    runtimeRootCacheVersioned: speechSource.includes("rootUrl.searchParams.set('schema'") && speechSource.includes("cache: 'no-cache'"),
    oneActiveAudioPlayer: speechSource.includes('this.player.stop()') && speechSource.includes("audio.removeAttribute('src')"),
    oneNextPreloadMaximum: speechSource.includes('this.preloadAudio') && !speechSource.includes('preloadPool'),
    browserFallbackDefault: speechSource.includes('allowBrowserFallback = true'),
    dictionaryBrowserSpeechOnly: /browserOnly:\s*true/.test(dictionaryPage),
    grammarBrowserSpeechOnly: /browserOnly:\s*type\s*===\s*["']grammar["']/.test(librarySource),
    hsk6VocabularyExampleAudioHidden: courseRenderer.includes("allowExampleAudio = getLessonLevelKey(lesson) !== 'hsk6'"),
    readingUsesFullContentLookup: courseRenderer.includes('data-audio-lookup='),
    duplicateListenerGuard: courseRenderer.includes('boundRoots.has(root)')
  };
  const policyFailures = Object.entries(policies).filter(([, value]) => !value).map(([name]) => name);
  const missing = rows.filter((row) => !row.mapped);
  const report = {
    generatedAt: new Date().toISOString(),
    status: missing.length || policyFailures.length || Object.values(browserOnlyInventory).some(Boolean) ? 'FAIL' : 'PASS',
    totals: summarize(rows),
    areas,
    courseLevels,
    courseReadings: {
      ...summarize(courseReadings),
      remainingMissingAudio: courseReadings.filter((row) => !row.mapped).length
    },
    browserSpeechOnly: {
      dictionary: { staticInventoryEntries: browserOnlyInventory.dictionary, strategy: 'speechSynthesis' },
      grammar: { staticInventoryEntries: browserOnlyInventory.grammar, strategy: 'speechSynthesis' }
    },
    excludedStaticAudio: {
      vocabularyExampleEntries: browserOnlyInventory.vocabularyExamples
    },
    policies,
    policyFailures
  };
  await fs.writeFile(path.join(AUDIO_ROOT, 'coverage-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
