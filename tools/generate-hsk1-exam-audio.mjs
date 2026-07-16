import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_ATTEMPTS = 4;
const USE_SAPI_FALLBACK = process.argv.includes('--sapi-fallback');
const FORCE_REBUILD = process.argv.includes('--force');
const EXAM_FILES = Object.freeze({
  '01': 'hsk1-h10901.json',
  '02': 'hsk1-h10902.json',
  '03': 'hsk1-h11003.json',
  '04': 'hsk1-h11004.json',
  '05': 'hsk1-h11005.json'
});

function selectedExamNumbers() {
  if (process.argv.includes('--all')) return Object.keys(EXAM_FILES);
  const index = process.argv.indexOf('--exam');
  const value = index >= 0 ? String(process.argv[index + 1] || '').padStart(2, '0') : '01';
  if (!EXAM_FILES[value]) throw new Error(`Unknown exam number: ${value}. Use 01-05.`);
  return [value];
}

async function loadEnvFile(filePath) {
  let source = '';
  try { source = await fs.readFile(filePath, 'utf8'); } catch { return; }
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value.replace(/\\n/g, '\n');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function isValidWav(filePath) {
  try {
    const handle = await fs.open(filePath, 'r');
    const header = Buffer.alloc(12);
    await handle.read(header, 0, 12, 0);
    await handle.close();
    return header.subarray(0, 4).toString('ascii') === 'RIFF'
      && header.subarray(8, 12).toString('ascii') === 'WAVE';
  } catch {
    return false;
  }
}

async function invokeLocalHandler(handler, body) {
  return new Promise((resolve, reject) => {
    const req = {
      method: 'POST', body, headers: { host: 'localhost:3000', 'x-forwarded-for': '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' }
    };
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.statusCode = code; return this; },
      json(payload) {
        if (this.statusCode >= 400) {
          const error = new Error(payload?.error?.message || `TTS HTTP ${this.statusCode}`);
          error.status = this.statusCode;
          error.code = payload?.error?.code || 'tts_error';
          reject(error);
        } else resolve(payload);
      },
      end() { resolve(null); }
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function requestTts(handler, transcript) {
  const endpoint = process.env.TTS_ENDPOINT;
  if (!endpoint) return invokeLocalHandler(handler, { text: transcript, mode: 'sentence' });
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: transcript, mode: 'sentence' })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `TTS HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload?.error?.code || 'tts_error';
    throw error;
  }
  return payload;
}

async function generateWithSapi(transcript, outputPath) {
  const command = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    "$s.SelectVoice('Microsoft Huihui Desktop')",
    '$s.Rate = -2',
    '$s.Volume = 100',
    '$s.SetOutputToWaveFile($env:CC_TTS_OUT)',
    '$s.Speak($env:CC_TTS_TEXT)',
    '$s.Dispose()'
  ].join('; ');
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      env: { ...process.env, CC_TTS_TEXT: transcript.replace(/\s*\n\s*/g, ' '), CC_TTS_OUT: outputPath },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(stderr.trim() || `SAPI exited with ${code}`)));
  });
  if (!await isValidWav(outputPath)) throw new Error('SAPI did not create a valid WAV file.');
}

async function generateOne(handler, question) {
  const outputPath = path.resolve(ROOT, question.audio.replace(/^\.\//, ''));
  if (!FORCE_REBUILD && await isValidWav(outputPath)) {
    console.log(`[skip] ${question.id} -> ${path.relative(ROOT, outputPath)}`);
    return 'skipped';
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  if (USE_SAPI_FALLBACK) {
    await generateWithSapi(question.transcript, outputPath);
    console.log(`[ok] ${question.id} sapi -> ${path.relative(ROOT, outputPath)}`);
    return 'created';
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await requestTts(handler, question.transcript);
      if (!result?.audioUrl) throw new Error('TTS response has no audioUrl.');
      const audioResponse = await fetch(result.audioUrl);
      if (!audioResponse.ok) throw new Error(`Audio download HTTP ${audioResponse.status}`);
      const buffer = Buffer.from(await audioResponse.arrayBuffer());
      if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
        throw new Error('Endpoint did not return a valid WAV file.');
      }
      await fs.writeFile(outputPath, buffer);
      console.log(`[ok] ${question.id} ${result.cached ? 'cache' : 'new'} -> ${path.relative(ROOT, outputPath)}`);
      return 'created';
    } catch (error) {
      lastError = error;
      const retryable = error.status === 429 || Number(error.status) >= 500 || /download|network|timeout/i.test(error.message);
      console.error(`[retry ${attempt}/${MAX_ATTEMPTS}] ${question.id}: ${error.code || ''} ${error.message}`.trim());
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await sleep(Math.min(8000, 750 * (2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

async function main() {
  await loadEnvFile(path.join(ROOT, '.env.local'));
  const require = createRequire(import.meta.url);
  const handler = require(path.join(ROOT, 'api', 'tts.js'));
  let created = 0;
  let skipped = 0;
  const failed = [];

  for (const examNumber of selectedExamNumbers()) {
    const examPath = path.join(ROOT, 'assets', 'data', 'thi-thu', 'exams', EXAM_FILES[examNumber]);
    const exam = JSON.parse(await fs.readFile(examPath, 'utf8'));
    const questions = exam.sections
      .find(section => section.id === 'listening')?.questions
      .filter(question => question.transcript && question.audio) || [];
    console.log(`[exam ${examNumber}] questions=${questions.length}`);
    for (const question of questions) {
      try {
        const status = await generateOne(handler, question);
        if (status === 'created') created += 1;
        else skipped += 1;
      } catch (error) {
        failed.push({ exam: examNumber, id: question.id, message: error.message });
        console.error(`[failed] exam=${examNumber} ${question.id}: ${error.message}`);
      }
    }
  }
  console.log(`[done] created=${created} skipped=${skipped} failed=${failed.length}`);
  if (failed.length) {
    for (const item of failed) console.error(`- exam=${item.exam} ${item.id}: ${item.message}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
