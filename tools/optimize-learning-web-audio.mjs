import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO_ROOT = path.join(ROOT, 'assets', 'audio', 'learning');
const MANIFEST_PATH = path.join(AUDIO_ROOT, 'manifest.json');
const WEB_INDEX_PATH = path.join(AUDIO_ROOT, 'web-index.json');
const STAGE_ROOT = path.join(AUDIO_ROOT, '.mp3-stage');
const BITRATE_BY_PROFILE = Object.freeze({ vocabulary: '32k', 'writing-sentence': '48k', 'lesson-passage': '48k' });

function parseArgs(argv) {
  const result = { ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg', ffprobe: process.env.FFPROBE_PATH || 'ffprobe', commit: false, concurrency: 4 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--commit') result.commit = true;
    else if (value === '--ffmpeg') result.ffmpeg = argv[++index];
    else if (value === '--ffprobe') result.ffprobe = argv[++index];
    else if (value === '--concurrency') result.concurrency = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!Number.isInteger(result.concurrency) || result.concurrency < 1 || result.concurrency > 8) throw new Error('--concurrency must be an integer between 1 and 8');
  return result;
}

function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${path.basename(binary)} exited ${code}: ${stderr.trim()}`)));
  });
}

async function sha256(file) {
  const content = await fs.readFile(file);
  return createHash('sha256').update(content).digest('hex');
}

async function probe(ffprobe, file) {
  const { stdout } = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=codec_name,sample_rate,channels,bit_rate', '-of', 'json', file]);
  const payload = JSON.parse(stdout);
  const stream = (payload.streams || []).find((item) => item.codec_name === 'mp3');
  if (!stream || Number(stream.sample_rate) !== 24000 || Number(stream.channels) !== 1) throw new Error(`Invalid MP3 format: ${file}`);
  return { duration: Number(payload.format?.duration || 0), bitrate: Number(stream.bit_rate || payload.format?.bit_rate || 0), codec: stream.codec_name };
}

async function atomicJson(file, payload) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, file);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  const entries = Array.isArray(manifest.items) ? manifest.items : [];
  if (!entries.length) throw new Error('Learning audio manifest has no items');
  await fs.rm(STAGE_ROOT, { recursive: true, force: true });
  await fs.mkdir(STAGE_ROOT, { recursive: true });

  const canonicalByWavSha = new Map();
  const work = [];
  for (const entry of entries) {
    if (entry.qcStatus !== 'automated-pass') throw new Error(`Refusing non-QC audio: ${entry.id}`);
    const bitrate = BITRATE_BY_PROFILE[entry.profile];
    if (!bitrate) throw new Error(`Unsupported profile for ${entry.id}: ${entry.profile}`);
    const wavSource = entry.path ? path.join(ROOT, entry.path) : '';
    const source = wavSource && await fs.stat(wavSource).then((stat) => stat.isFile()).catch(() => false)
      ? wavSource
      : path.join(ROOT, entry.webPath);
    const wavHash = await sha256(source);
    const canonical = canonicalByWavSha.get(wavHash);
    if (canonical) {
      entry._canonical = canonical;
      continue;
    }
    canonicalByWavSha.set(wavHash, entry);
    entry._canonical = entry;
    work.push({ entry, source, destination: path.join(STAGE_ROOT, path.basename(entry.webPath)), bitrate });
  }

  let cursor = 0;
  const errors = [];
  async function worker() {
    while (true) {
      const current = work[cursor++];
      if (!current) return;
      try {
        await run(args.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', current.source, '-map_metadata', '-1', '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', current.bitrate, current.destination]);
        const metadata = await probe(args.ffprobe, current.destination);
        if (!metadata.duration) throw new Error(`Zero duration: ${current.destination}`);
      } catch (error) {
        errors.push({ id: current.entry.id, error: String(error.message || error) });
      }
    }
  }
  await Promise.all(Array.from({ length: args.concurrency }, worker));
  if (errors.length) throw new Error(`Staging failed for ${errors.length} file(s): ${JSON.stringify(errors.slice(0, 10))}`);

  const staged = new Map();
  for (const item of work) staged.set(item.entry, item.destination);
  for (const entry of entries) {
    const canonical = entry._canonical;
    const source = staged.get(canonical);
    const metadata = await probe(args.ffprobe, source);
    entry.webPath = `assets/audio/learning/web/${path.basename(source)}`;
    entry.webFile = path.basename(source);
    entry.webSha256 = await sha256(source);
    entry.web_file_size = (await fs.stat(source)).size;
    entry.webFileSize = entry.web_file_size;
    entry.web_codec = metadata.codec;
    entry.web_bitrate = metadata.bitrate;
    entry._canonical = undefined;
  }
  const summary = { total: entries.length, uniqueWav: work.length, reusedBySha256: entries.length - work.length, stagedAt: STAGE_ROOT, commit: args.commit };
  if (!args.commit) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  const webRoot = path.join(AUDIO_ROOT, 'web');
  for (const item of work) {
    const destination = path.join(webRoot, path.basename(item.destination));
    await fs.rm(destination, { force: true });
    await fs.rename(item.destination, destination);
  }
  manifest.generatedAt = new Date().toISOString();
  manifest.webAudioFormat = 'mp3-mono-24000-v2';
  manifest.webBitratePolicy = { vocabulary: '32k', 'writing-sentence': '48k', 'lesson-passage': '48k' };
  const index = JSON.parse(await fs.readFile(WEB_INDEX_PATH, 'utf8'));
  index.generatedAt = manifest.generatedAt;
  index.assetVersion = createHash('sha256')
    .update(entries.map((entry) => `${entry.audioKey || entry.audioCacheKey}:${entry.webSha256}`).join('\n'))
    .digest('hex')
    .slice(0, 12);
  await atomicJson(MANIFEST_PATH, manifest);
  await atomicJson(WEB_INDEX_PATH, index);
  await fs.rm(STAGE_ROOT, { recursive: true, force: true });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
