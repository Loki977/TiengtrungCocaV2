import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  AUDIO_KEY_VERSION,
  DEFAULT_AUDIO_VOICE,
  PROFILE_RATES,
  createAudioKey,
  createIdShardKey
} from './audio-key.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO_ROOT = path.join(ROOT, 'assets', 'audio', 'learning');
const WEB_ROOT = path.join(AUDIO_ROOT, 'web');
const INVENTORY_PATH = path.join(ROOT, 'assets', 'data', 'audio', 'learning-audio-inventory.json');
const MANIFEST_PATH = path.join(AUDIO_ROOT, 'manifest.json');
const WEB_INDEX_PATH = path.join(AUDIO_ROOT, 'web-index.json');
const FORBIDDEN_CATEGORIES = new Set([
  'dictionary-word',
  'tang-grammar-example',
  'course-example',
  'course-grammar-example',
  'tang-idiom-example'
]);

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function sha256(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

function resolveWebPath(relative) {
  const resolved = path.resolve(ROOT, String(relative || ''));
  if (path.dirname(resolved) !== path.resolve(WEB_ROOT) || path.extname(resolved).toLowerCase() !== '.mp3') {
    throw new Error(`Path escapes assets/audio/learning/web: ${relative}`);
  }
  return resolved;
}

async function readShardDirectory(directory) {
  const result = {};
  const files = (await fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^[0-9a-f]{2}\.json$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of files) {
    const payload = await readJson(path.join(directory, entry.name));
    Object.assign(result, payload.items || {});
  }
  return { items: result, files: files.length };
}

async function main() {
  const requireNoUnreferenced = process.argv.includes('--require-no-unreferenced');
  const [inventory, manifest, runtimeIndex] = await Promise.all([
    readJson(INVENTORY_PATH),
    readJson(MANIFEST_PATH),
    readJson(WEB_INDEX_PATH)
  ]);
  const [hashShards, idShards] = await Promise.all([
    readShardDirectory(path.join(AUDIO_ROOT, 'index', 'hash')),
    readShardDirectory(path.join(AUDIO_ROOT, 'index', 'id'))
  ]);
  const errors = [];
  const manifestItems = Array.isArray(manifest.items) ? manifest.items : [];
  const inventoryItems = Array.isArray(inventory.items) ? inventory.items : [];
  const manifestByKey = new Map();
  const referencedPaths = new Set();
  const fileChecks = new Map();

  if (runtimeIndex.version < 4 || runtimeIndex.strategy !== 'sharded-global-hash') {
    errors.push({ index: 'web-index.json', error: 'runtime index is not sharded global-hash v4' });
  }
  if (runtimeIndex.keyVersion !== AUDIO_KEY_VERSION || manifest.keyVersion !== AUDIO_KEY_VERSION) {
    errors.push({ index: 'keyVersion', error: 'audio normalization/key version mismatch' });
  }

  for (const entry of manifestItems) {
    const key = String(entry.audioKey || entry.audioCacheKey || '');
    if (!key) {
      errors.push({ id: entry.id, error: 'manifest entry has no audioKey' });
      continue;
    }
    if (manifestByKey.has(key)) {
      errors.push({ audioKey: key, error: 'duplicate manifest audioKey' });
      continue;
    }
    manifestByKey.set(key, entry);
    const expectedKey = createAudioKey(entry.input, entry.voice || manifest.voice || DEFAULT_AUDIO_VOICE, entry.rate);
    if (expectedKey !== key) errors.push({ id: entry.id, audioKey: key, error: 'global hash does not match normalizedText + voice + rate' });
    if (hashShards.items[key] !== entry.webPath) errors.push({ id: entry.id, audioKey: key, error: 'hash shard path mismatch' });

    try {
      const file = resolveWebPath(entry.webPath);
      referencedPaths.add(entry.webPath);
      if (!fileChecks.has(entry.webPath)) {
        const stat = await fs.stat(file);
        const actualHash = await sha256(file);
        fileChecks.set(entry.webPath, { size: stat.size, sha256: actualHash });
      }
      const checked = fileChecks.get(entry.webPath);
      if (checked.size < 128) throw new Error('MP3 is empty');
      if (entry.webFileSize && checked.size !== entry.webFileSize) throw new Error('MP3 file size mismatch');
      if (entry.webSha256 !== checked.sha256) throw new Error('MP3 SHA-256 mismatch');
      if (entry.qcStatus !== 'automated-pass') throw new Error('MP3 is not QC-approved');
    } catch (error) {
      errors.push({ id: entry.id, path: entry.webPath, error: String(error.message || error) });
    }
  }

  for (const item of inventoryItems) {
    const rate = String(item.rate || PROFILE_RATES[item.profile] || '');
    const key = createAudioKey(item.hanzi, item.voice || manifest.voice || DEFAULT_AUDIO_VOICE, rate);
    if (!manifestByKey.has(key)) errors.push({ id: item.id, error: 'inventory global key missing from manifest' });
    const idHash = createIdShardKey(item.id);
    if (!idHash || idShards.items[item.id] !== key) errors.push({ id: item.id, error: 'ID shard mapping mismatch' });
    if (FORBIDDEN_CATEGORIES.has(item.category)) errors.push({ id: item.id, category: item.category, error: 'browser-only/unneeded category leaked into static inventory' });
  }

  if (Object.keys(hashShards.items).length !== manifestByKey.size) {
    errors.push({ index: 'hash shards', error: `expected ${manifestByKey.size} keys, found ${Object.keys(hashShards.items).length}` });
  }
  if (Object.keys(idShards.items).length !== inventoryItems.length) {
    errors.push({ index: 'ID shards', error: `expected ${inventoryItems.length} IDs, found ${Object.keys(idShards.items).length}` });
  }
  if (runtimeIndex.hashShardCount !== hashShards.files || runtimeIndex.idShardCount !== idShards.files) {
    errors.push({ index: 'shard counts', error: 'web-index shard count mismatch' });
  }

  const physicalPaths = (await fs.readdir(WEB_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp3'))
    .map((entry) => `assets/audio/learning/web/${entry.name}`);
  const unreferenced = physicalPaths.filter((relative) => !referencedPaths.has(relative)).sort();
  const missingReferenced = [...referencedPaths].filter((relative) => !physicalPaths.includes(relative)).sort();
  if (missingReferenced.length) errors.push({ files: missingReferenced.slice(0, 20), error: `${missingReferenced.length} referenced MP3 files are missing` });
  if (requireNoUnreferenced && unreferenced.length) errors.push({ files: unreferenced.slice(0, 20), error: `${unreferenced.length} unreferenced MP3 files remain` });

  const result = {
    status: errors.length ? 'FAIL' : 'PASS',
    keyVersion: runtimeIndex.keyVersion,
    inventoryReferences: inventoryItems.length,
    manifestAudioKeys: manifestByKey.size,
    uniqueReferencedMp3: referencedPaths.size,
    physicalMp3: physicalPaths.length,
    unreferencedMp3: unreferenced.length,
    hashShardFiles: hashShards.files,
    idShardFiles: idShards.files,
    brokenReferences: errors.length,
    samples: errors.slice(0, 20)
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = errors.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
