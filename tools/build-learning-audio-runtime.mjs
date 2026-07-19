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
  createIdShardKey,
  normalizeAudioText
} from './audio-key.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO_ROOT = path.join(ROOT, 'assets', 'audio', 'learning');
const WEB_ROOT = path.join(AUDIO_ROOT, 'web');
const INDEX_ROOT = path.join(AUDIO_ROOT, 'index');
const HASH_SHARDS = path.join(INDEX_ROOT, 'hash');
const ID_SHARDS = path.join(INDEX_ROOT, 'id');
const INVENTORY_PATH = path.join(ROOT, 'assets', 'data', 'audio', 'learning-audio-inventory.json');
const MANIFEST_PATH = path.join(AUDIO_ROOT, 'manifest.json');
const WEB_INDEX_PATH = path.join(AUDIO_ROOT, 'web-index.json');
const DEFAULT_PLAN = path.join(ROOT, 'reports', 'audio-runtime-prune-plan.json');

function parseArgs(argv) {
  const args = { write: false, applyPrune: false, plan: DEFAULT_PLAN };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--write') args.write = true;
    else if (value === '--apply-prune') args.applyPrune = true;
    else if (value === '--plan') args.plan = path.resolve(ROOT, argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (args.write && args.applyPrune) throw new Error('Run --write and --apply-prune as separate verified steps.');
  return args;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function atomicJson(file, payload, pretty = true) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(payload, null, pretty ? 2 : 0)}\n`, 'utf8');
  await fs.rename(temporary, file);
}

function resolveWebPath(relative) {
  const resolved = path.resolve(ROOT, String(relative || ''));
  const expectedParent = path.resolve(WEB_ROOT);
  if (path.dirname(resolved) !== expectedParent || path.extname(resolved).toLowerCase() !== '.mp3') {
    throw new Error(`Refusing audio path outside learning/web: ${relative}`);
  }
  return resolved;
}

async function sha256(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function clearJsonFiles(directory) {
  await fs.mkdir(directory, { recursive: true });
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) await fs.unlink(path.join(directory, entry.name));
  }
}

function addShard(shards, prefix, key, value) {
  if (!shards.has(prefix)) shards.set(prefix, {});
  shards.get(prefix)[key] = value;
}

async function buildState() {
  const [inventory, manifest] = await Promise.all([readJson(INVENTORY_PATH), readJson(MANIFEST_PATH)]);
  const inventoryItems = Array.isArray(inventory.items) ? inventory.items : [];
  const manifestItems = Array.isArray(manifest.items) ? manifest.items : [];
  const voice = String(manifest.voice || inventory.voice || DEFAULT_AUDIO_VOICE).trim() || DEFAULT_AUDIO_VOICE;
  const referencesByKey = new Map();

  for (const item of inventoryItems) {
    const rate = String(item.rate || PROFILE_RATES[item.profile] || '').trim();
    if (!rate) throw new Error(`Unsupported inventory profile for ${item.id}: ${item.profile}`);
    const audioKey = createAudioKey(item.hanzi, item.voice || voice, rate);
    if (!referencesByKey.has(audioKey)) referencesByKey.set(audioKey, []);
    referencesByKey.get(audioKey).push({ ...item, rate, voice: item.voice || voice });
  }

  const candidatesByKey = new Map();
  for (const entry of manifestItems) {
    const input = entry.input || entry.label || '';
    const rate = String(entry.rate || PROFILE_RATES[entry.profile] || '').trim();
    const entryVoice = String(entry.voice || voice).trim() || voice;
    const relative = String(entry.webPath || '');
    if (!input || !rate || !relative) continue;
    const audioKey = createAudioKey(input, entryVoice, rate);
    if (!candidatesByKey.has(audioKey)) candidatesByKey.set(audioKey, []);
    candidatesByKey.get(audioKey).push({ ...entry, input, rate, voice: entryVoice, audioKey, webPath: relative });
  }

  const fileMetadata = new Map();
  async function inspectCandidate(entry) {
    if (fileMetadata.has(entry.webPath)) return fileMetadata.get(entry.webPath);
    try {
      const file = resolveWebPath(entry.webPath);
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size < 128) throw new Error('missing or empty MP3');
      const actualSha256 = await sha256(file);
      if (entry.webSha256 && entry.webSha256 !== actualSha256) throw new Error('MP3 SHA-256 mismatch');
      const metadata = { ok: true, sha256: actualSha256, size: stat.size, path: entry.webPath };
      fileMetadata.set(entry.webPath, metadata);
      return metadata;
    } catch (error) {
      const metadata = { ok: false, error: String(error.message || error), path: entry.webPath };
      fileMetadata.set(entry.webPath, metadata);
      return metadata;
    }
  }

  const selectedByKey = new Map();
  const requiredCandidatePaths = new Set();
  const brokenCandidates = [];
  const missing = [];
  for (const [audioKey, references] of referencesByKey) {
    const candidates = (candidatesByKey.get(audioKey) || []).slice().sort((a, b) => a.webPath.localeCompare(b.webPath));
    const valid = [];
    for (const candidate of candidates) {
      const metadata = await inspectCandidate(candidate);
      if (metadata.ok) {
        requiredCandidatePaths.add(candidate.webPath);
        valid.push({ ...candidate, metadata });
      } else {
        brokenCandidates.push({ audioKey, id: candidate.id, path: candidate.webPath, error: metadata.error });
      }
    }
    if (!valid.length) {
      missing.push({ audioKey, id: references[0]?.id, text: references[0]?.hanzi, profile: references[0]?.profile });
      continue;
    }
    selectedByKey.set(audioKey, valid[0]);
  }
  if (missing.length) {
    throw new Error(`Missing local MP3 for ${missing.length} global key(s): ${JSON.stringify(missing.slice(0, 10))}`);
  }

  const selectedBySha = new Map();
  for (const [audioKey, candidate] of selectedByKey) {
    const group = selectedBySha.get(candidate.metadata.sha256) || [];
    group.push({ audioKey, candidate });
    selectedBySha.set(candidate.metadata.sha256, group);
  }

  const canonicalByKey = new Map();
  for (const group of selectedBySha.values()) {
    const canonical = group.slice().sort((a, b) => a.candidate.webPath.localeCompare(b.candidate.webPath))[0].candidate;
    for (const { audioKey } of group) canonicalByKey.set(audioKey, canonical);
  }

  const finalPaths = new Set([...canonicalByKey.values()].map((entry) => entry.webPath));
  const preShaPaths = new Set([...selectedByKey.values()].map((entry) => entry.webPath));
  const physicalFiles = (await fs.readdir(WEB_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp3'))
    .map((entry) => `assets/audio/learning/web/${entry.name}`)
    .sort();
  const physicalSet = new Set(physicalFiles);
  const globalDuplicatePaths = [...requiredCandidatePaths].filter((relative) => !preShaPaths.has(relative)).sort();
  const exactDuplicatePaths = [...preShaPaths].filter((relative) => !finalPaths.has(relative)).sort();
  const unusedPaths = physicalFiles.filter((relative) => !requiredCandidatePaths.has(relative)).sort();
  const deletePaths = physicalFiles.filter((relative) => !finalPaths.has(relative)).sort();

  let retainedBytes = 0;
  for (const relative of finalPaths) retainedBytes += (await fs.stat(resolveWebPath(relative))).size;
  let removableBytes = 0;
  for (const relative of deletePaths) removableBytes += (await fs.stat(resolveWebPath(relative))).size;

  const compactItems = [...referencesByKey.entries()].map(([audioKey, references]) => {
    const canonical = canonicalByKey.get(audioKey);
    const profiles = [...new Set(references.map((item) => item.profile))].sort();
    const categories = [...new Set(references.map((item) => item.category))].sort();
    return {
      id: references[0].id,
      audioKey,
      audioCacheKey: audioKey,
      input: normalizeAudioText(references[0].hanzi),
      profile: profiles[0],
      profiles,
      voice: references[0].voice,
      rate: references[0].rate,
      webPath: canonical.webPath,
      webSha256: canonical.metadata.sha256,
      webFileSize: canonical.metadata.size,
      referenceCount: references.length,
      referenceCategories: categories,
      qcStatus: 'automated-pass'
    };
  }).sort((a, b) => a.audioKey.localeCompare(b.audioKey));

  const hashShards = new Map();
  for (const entry of compactItems) addShard(hashShards, entry.audioKey.slice(0, 2), entry.audioKey, entry.webPath);
  const idShards = new Map();
  const idKeys = new Map();
  for (const [audioKey, references] of referencesByKey) {
    for (const reference of references) {
      if (idKeys.has(reference.id)) {
        throw new Error(`Duplicate logical audio ID in inventory: ${reference.id}`);
      }
      idKeys.set(reference.id, audioKey);
      const idHash = createIdShardKey(reference.id);
      addShard(idShards, idHash.slice(0, 2), reference.id, audioKey);
    }
  }

  const summary = {
    inventoryReferences: inventoryItems.length,
    globalAudioKeys: referencesByKey.size,
    manifestCandidates: manifestItems.length,
    candidatePathsForRequiredAudio: requiredCandidatePaths.size,
    retainedFiles: finalPaths.size,
    physicalFilesBefore: physicalSet.size,
    filesToRemove: deletePaths.length,
    duplicateGlobalKeyFiles: globalDuplicatePaths.length,
    duplicateBinaryFiles: exactDuplicatePaths.length,
    unusedFiles: unusedPaths.length,
    brokenCandidates: brokenCandidates.length,
    missingGlobalKeys: missing.length,
    retainedBytes,
    removableBytes
  };

  return {
    voice,
    inventory,
    compactItems,
    hashShards,
    idShards,
    finalPaths,
    summary,
    plan: {
      version: 1,
      generatedAt: new Date().toISOString(),
      webRoot: path.relative(ROOT, WEB_ROOT).replaceAll(path.sep, '/'),
      summary,
      keepPaths: [...finalPaths].sort(),
      deletePaths,
      reasons: {
        duplicateGlobalKeyPaths: globalDuplicatePaths,
        duplicateBinaryPaths: exactDuplicatePaths,
        unusedPaths
      }
    }
  };
}

async function writeRuntime(state, planPath) {
  const generatedAt = new Date().toISOString();
  const assetVersion = createHash('sha256')
    .update(state.compactItems.map((entry) => `${entry.audioKey}:${entry.webSha256}`).join('\n'))
    .digest('hex')
    .slice(0, 12);

  await Promise.all([clearJsonFiles(HASH_SHARDS), clearJsonFiles(ID_SHARDS)]);
  await Promise.all([
    ...[...state.hashShards].map(([prefix, items]) => atomicJson(path.join(HASH_SHARDS, `${prefix}.json`), { version: 4, items }, false)),
    ...[...state.idShards].map(([prefix, items]) => atomicJson(path.join(ID_SHARDS, `${prefix}.json`), { version: 4, items }, false))
  ]);

  const runtimeIndex = {
    version: 4,
    assetVersion,
    generatedAt,
    locale: 'zh-CN',
    strategy: 'sharded-global-hash',
    keyVersion: AUDIO_KEY_VERSION,
    keyFields: ['normalizedText', 'voice', 'rate'],
    voice: state.voice,
    ratesByProfile: PROFILE_RATES,
    hashShardBase: 'assets/audio/learning/index/hash',
    idShardBase: 'assets/audio/learning/index/id',
    hashShardCount: state.hashShards.size,
    idShardCount: state.idShards.size,
    audioKeys: state.compactItems.length,
    logicalReferences: state.summary.inventoryReferences
  };
  const compactManifest = {
    version: 3,
    generatedAt,
    locale: 'zh-CN',
    provider: 'microsoft-edge-neural',
    voice: state.voice,
    keyVersion: AUDIO_KEY_VERSION,
    items: state.compactItems
  };

  await atomicJson(MANIFEST_PATH, compactManifest);
  await atomicJson(WEB_INDEX_PATH, runtimeIndex);
  await atomicJson(planPath, state.plan);
}

async function applyPrune(state, planPath) {
  const plan = await readJson(planPath);
  const expectedKeep = [...state.finalPaths].sort();
  const plannedKeep = Array.isArray(plan.keepPaths) ? plan.keepPaths.slice().sort() : [];
  if (JSON.stringify(expectedKeep) !== JSON.stringify(plannedKeep)) {
    throw new Error('Prune plan no longer matches the verified manifest. Rebuild the plan first.');
  }
  const deletePaths = Array.isArray(plan.deletePaths) ? plan.deletePaths : [];
  for (const relative of deletePaths) {
    if (state.finalPaths.has(relative)) throw new Error(`Refusing to delete referenced audio: ${relative}`);
    await fs.unlink(resolveWebPath(relative)).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  const remaining = (await fs.readdir(WEB_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp3'))
    .map((entry) => `assets/audio/learning/web/${entry.name}`)
    .sort();
  if (JSON.stringify(remaining) !== JSON.stringify(expectedKeep)) {
    throw new Error(`Post-prune file set mismatch: expected ${expectedKeep.length}, found ${remaining.length}`);
  }
  return { ...plan.summary, removedFiles: deletePaths.length, remainingFiles: remaining.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = await buildState();
  if (args.write) {
    await writeRuntime(state, args.plan);
    console.log(JSON.stringify({ mode: 'write', ...state.summary, plan: path.relative(ROOT, args.plan) }, null, 2));
    return;
  }
  if (args.applyPrune) {
    const result = await applyPrune(state, args.plan);
    console.log(JSON.stringify({ mode: 'apply-prune', ...result }, null, 2));
    return;
  }
  console.log(JSON.stringify({ mode: 'dry-run', ...state.summary, plan: path.relative(ROOT, args.plan) }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
