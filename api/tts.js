const crypto = require('crypto');
const admin = require('firebase-admin');
const { put } = require('@vercel/blob');

const VALID_MODES = new Set(['vocabulary', 'example', 'sentence', 'passage', 'answer']);
const MAX_TEXT_LENGTH = 500;
const REQUEST_TIMEOUT_MS = 8_000;
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_DELAYS_MS = [0, 1_000, 2_500];
const GEMINI_MAX_RETRY_DELAY_MS = 5_000;
const FIRESTORE_TIMEOUT_MS = 8_000;
const GENERATION_LOCK_MS = 90_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 24;
const pendingRequests = new Map();
const rateLimits = new Map();

const ttsConfig = Object.freeze({
  model: process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview',
  voice: process.env.GEMINI_TTS_VOICE || 'Orus',
  voiceVersion: process.env.TTS_VOICE_VERSION || 'v1',
  sampleRate: 24000,
  channels: 1,
  sampleWidth: 2
});

class ApiError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function errorCodeForStatus(status, explicitCode = '') {
  if (explicitCode) return explicitCode;
  if (status === 400) return 'invalid_request';
  if (status === 405) return 'method_not_allowed';
  if (status === 429) return 'rate_limited';
  if (status === 502) return 'provider_error';
  if (status === 503) return 'service_unavailable';
  if (status === 504) return 'timeout';
  return 'internal_error';
}

function getAdmin() {
  if (admin.apps.length) return admin;

  const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new ApiError(503, 'Firebase TTS cache is not configured.', 'firebase_not_configured');

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  } catch (_) {
    throw new ApiError(503, 'TTS cache credentials are invalid.', 'firebase_credentials_invalid');
  }
  return admin;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createCacheKey(text, mode) {
  return crypto
    .createHash('sha256')
    .update([text, mode, ttsConfig.voice, ttsConfig.model, ttsConfig.voiceVersion].join('\n'))
    .digest('hex');
}

function getRequestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (!req.body || typeof req.body !== 'string') return {};
  try { return JSON.parse(req.body); } catch (_) { throw new ApiError(400, 'Invalid JSON body.'); }
}

function setCors(req, res) {
  const origin = String(req.headers.origin || '');
  const isAllowed = /^https:\/\/.*\.vercel\.app$/i.test(origin)
    || /^https:\/\/tiengtrungcoca\.firebaseapp\.com$/i.test(origin)
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  if (isAllowed) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function assertRateLimit(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const current = rateLimits.get(ip);
  const entry = current && now - current.startedAt < RATE_WINDOW_MS
    ? current
    : { startedAt: now, count: 0 };
  entry.count += 1;
  rateLimits.set(ip, entry);
  if (entry.count > RATE_LIMIT) throw new ApiError(429, 'Too many TTS requests.');
}

function shouldForceFallback(req) {
  if (process.env.TTS_FORCE_FALLBACK !== 'true') return false;
  const host = String(req.headers.host || '').toLowerCase();
  const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return process.env.VERCEL_ENV === 'development'
    || (process.env.NODE_ENV !== 'production' && isLocalHost);
}

function hasValidAudioUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

async function runFirestore(stage, operation) {
  let timeoutId;
  try {
    const result = await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new ApiError(503, 'TTS metadata cache timed out.', 'firestore_timeout')),
          FIRESTORE_TIMEOUT_MS
        );
      })
    ]);
    return result;
  } catch (error) {
    const code = error instanceof ApiError ? error.code : String(error?.code || 'firestore_error');
    const message = error instanceof ApiError ? error.message : String(error?.message || 'Firestore operation failed.');
    console.error(`[tts] ${stage}: ${code}: ${message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'TTS metadata cache is unavailable.', 'firestore_unavailable');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getReadyCache(db, cacheKey) {
  const snapshot = await runFirestore('firestore_read', () => db.collection('ttsCache').doc(cacheKey).get());
  const data = snapshot.data();
  if (!snapshot.exists || !hasValidAudioUrl(data?.audioUrl)) return null;
  return { ...data, cacheKey };
}

async function claimGeneration(db, cacheKey, metadata) {
  const ref = db.collection('ttsCache').doc(cacheKey);
  const generatorId = crypto.randomUUID();
  const now = Date.now();
  return runFirestore('firestore_transaction', () => db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data();
    if (snapshot.exists && hasValidAudioUrl(current?.audioUrl)) {
      return { state: 'ready', data: current };
    }
    if (snapshot.exists && current?.status === 'generating' && Number(current.generationExpiresAt || 0) > now) {
      return { state: 'waiting' };
    }

    transaction.set(ref, {
      ...metadata,
      status: 'generating',
      generatorId,
      generationExpiresAt: now + GENERATION_LOCK_MS,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: current?.createdAt || admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { state: 'generate', generatorId };
  }));
}

async function waitForCache(db, cacheKey) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const cached = await getReadyCache(db, cacheKey);
    if (cached) return cached;
  }
  throw new ApiError(503, 'Audio is being generated. Please try again.');
}

function toWavBuffer(pcmBuffer) {
  const { sampleRate, channels, sampleWidth } = ttsConfig;
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * sampleWidth;
  const blockAlign = channels * sampleWidth;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(sampleWidth * 8, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function isValidWav(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length > 44
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WAVE';
}

function getRetryDelayMs(payload) {
  const details = Array.isArray(payload?.error?.details) ? payload.error.details : [];
  const retryDelay = details.find((item) => String(item?.['@type'] || '').includes('RetryInfo'))?.retryDelay;
  const seconds = typeof retryDelay === 'string' && /^\d+(?:\.\d+)?s$/.test(retryDelay)
    ? Number.parseFloat(retryDelay)
    : NaN;
  return Number.isFinite(seconds) ? Math.min(Math.round(seconds * 1000), GEMINI_MAX_RETRY_DELAY_MS) : null;
}

function logGeminiFailure({ attempt, httpStatus = null, errorStatus = null, errorCode = null, retryDelay = null }) {
  console.error(`[tts] gemini_retry: ${JSON.stringify({
    attempt,
    httpStatus,
    errorStatus,
    errorCode,
    retryDelay,
    model: ttsConfig.model
  })}`);
}

function getGeminiErrorLog(attempt, httpStatus, payload) {
  const error = payload?.error || {};
  return {
    attempt,
    httpStatus,
    errorStatus: error.status || null,
    errorCode: `gemini_http_${httpStatus}`,
    retryDelay: getRetryDelayMs(payload),
    model: ttsConfig.model
  };
}

function isRetryableGeminiError(error) {
  return error?.code === 'gemini_network_error'
    || error?.code === 'gemini_timeout'
    || /^gemini_http_(429|500|502|503|504)$/.test(String(error?.code || ''));
}

function retryDelayForAttempt(attempt, error) {
  const preferredDelay = Number(error?.retryDelayMs);
  const baseDelay = Number.isFinite(preferredDelay)
    ? Math.min(preferredDelay, GEMINI_MAX_RETRY_DELAY_MS)
    : GEMINI_RETRY_DELAYS_MS[attempt - 1];
  return Math.min(baseDelay + Math.floor(Math.random() * 250), GEMINI_MAX_RETRY_DELAY_MS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestGeminiAttempt(text, mode, attempt) {
  if (!process.env.GEMINI_API_KEY) throw new ApiError(503, 'AI TTS is not configured.', 'gemini_not_configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const pace = mode === 'vocabulary' ? 'slower, clearly pronounce every syllable'
    : mode === 'passage' ? 'natural and fluent with pauses at punctuation'
      : 'slightly slower and clear';
  const prompt = [
    'Generate Mandarin Chinese speech audio only. Do not read instructions, pinyin, labels, or translations.',
    `Use a warm, natural mainland Mandarin male voice with accurate tones. Speak ${pace}.`,
    'TRANSCRIPT:',
    text
  ].join('\n');

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ttsConfig.model)}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: ttsConfig.voice }
            }
          }
        }
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`[tts] gemini_retry: ${JSON.stringify(getGeminiErrorLog(attempt, response.status, payload))}`);
      if (response.status === 429) {
        const error = new ApiError(429, 'Gemini TTS is temporarily rate-limited.', 'gemini_http_429');
        error.retryDelayMs = getRetryDelayMs(payload);
        throw error;
      }
      const status = response.status === 429 ? 429 : 502;
      const message = response.status === 429
        ? 'Gemini TTS đang tạm bị giới hạn lượt gọi.'
        : response.status >= 500
          ? 'Gemini TTS tạm thời không khả dụng.'
          : 'Gemini TTS không thể tạo âm thanh cho yêu cầu này.';
      const error = new ApiError(status, message, `gemini_http_${response.status}`);
      error.retryDelayMs = getRetryDelayMs(payload);
      throw error;
    }
    const encodedAudio = payload?.candidates?.[0]?.content?.parts
      ?.find((part) => part?.inlineData?.data)?.inlineData?.data;
    if (!encodedAudio) {
      logGeminiFailure({ attempt, httpStatus: response.status, errorStatus: 'NO_AUDIO', errorCode: 'gemini_no_audio' });
      throw new ApiError(502, 'Gemini returned no audio.', 'gemini_no_audio');
    }
    const pcm = Buffer.from(encodedAudio, 'base64');
    if (!pcm.length) throw new ApiError(502, 'AI returned invalid audio.');
    const wavBuffer = toWavBuffer(pcm);
    if (!isValidWav(wavBuffer)) throw new ApiError(502, 'AI returned invalid audio.');
    return wavBuffer;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      logGeminiFailure({ attempt, errorStatus: 'TIMEOUT', errorCode: 'gemini_timeout' });
      throw new ApiError(504, 'AI speech generation timed out.', 'gemini_timeout');
    }
    logGeminiFailure({ attempt, errorStatus: 'NETWORK_ERROR', errorCode: 'gemini_network_error' });
    throw new ApiError(502, 'AI speech service is unavailable.', 'gemini_network_error');
  } finally {
    clearTimeout(timeout);
  }
}

async function requestGeminiAudio(text, mode) {
  let lastError;
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await sleep(retryDelayForAttempt(attempt, lastError));
    try {
      return await requestGeminiAttempt(text, mode, attempt);
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error) || attempt === GEMINI_MAX_ATTEMPTS) throw error;
    }
  }
  throw lastError;
}

async function getOrCreateAudio(text, mode) {
  let db;
  try {
    const firebase = getAdmin();
    db = firebase.firestore();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const code = String(error?.code || 'firebase_admin_error');
    const message = String(error?.message || 'Firebase Admin initialization failed.');
    console.error(`[tts] firebase_admin: ${code}: ${message}`);
    throw new ApiError(503, 'Firebase TTS cache is unavailable.', 'firebase_admin_error');
  }
  const cacheKey = createCacheKey(text, mode);
  let existing;
  try {
    existing = await getReadyCache(db, cacheKey);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'TTS metadata cache is unavailable.', 'firestore_error');
  }
  if (existing) return {
    audioUrl: existing.audioUrl,
    cacheKey,
    cached: true,
    source: 'firestore',
    mimeType: existing.mimeType || 'audio/wav'
  };

  const blobPath = `tts-cache/zh-CN/${cacheKey}.wav`;
  const claim = await claimGeneration(db, cacheKey, {
    text,
    normalizedText: text,
    mode,
    voice: ttsConfig.voice,
    model: ttsConfig.model,
    voiceVersion: ttsConfig.voiceVersion,
    provider: 'gemini',
    blobPath,
    mimeType: 'audio/wav'
  });
  if (claim.state === 'ready') return {
    audioUrl: claim.data.audioUrl,
    cacheKey,
    cached: true,
    source: 'firestore',
    mimeType: claim.data.mimeType || 'audio/wav'
  };
  if (claim.state === 'waiting') {
    const cached = await waitForCache(db, cacheKey);
    return { audioUrl: cached.audioUrl, cacheKey, cached: true, source: 'firestore', mimeType: cached.mimeType || 'audio/wav' };
  }

  const ref = db.collection('ttsCache').doc(cacheKey);
  try {
    const cacheBeforeGeneration = await getReadyCache(db, cacheKey);
    if (cacheBeforeGeneration) {
      return {
        audioUrl: cacheBeforeGeneration.audioUrl,
        cacheKey,
        cached: true,
        source: 'firestore',
        mimeType: cacheBeforeGeneration.mimeType || 'audio/wav'
      };
    }
    const wavBuffer = await requestGeminiAudio(text, mode);
    if (!isValidWav(wavBuffer)) throw new ApiError(502, 'AI returned invalid audio.');
    const cacheBeforeUpload = await getReadyCache(db, cacheKey);
    if (cacheBeforeUpload) {
      return {
        audioUrl: cacheBeforeUpload.audioUrl,
        cacheKey,
        cached: true,
        source: 'firestore',
        mimeType: cacheBeforeUpload.mimeType || 'audio/wav'
      };
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new ApiError(503, 'Blob cache is not configured.', 'blob_not_configured');
    let blob;
    try {
      blob = await put(blobPath, wavBuffer, {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'audio/wav',
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
    } catch (_) {
      throw new ApiError(502, 'Blob upload failed.');
    }
    if (!hasValidAudioUrl(blob?.url)) throw new ApiError(502, 'Blob upload returned an invalid URL.');
    const audioUrl = blob.url;
    await runFirestore('firestore_write', () => ref.set({
      text,
      normalizedText: text,
      mode,
      voice: ttsConfig.voice,
      model: ttsConfig.model,
      voiceVersion: ttsConfig.voiceVersion,
      provider: 'gemini',
      blobPath,
      audioUrl,
      mimeType: 'audio/wav',
      status: 'ready',
      generationExpiresAt: admin.firestore.FieldValue.delete(),
      generatorId: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true }));
    return { audioUrl, cacheKey, cached: false, source: 'gemini', mimeType: 'audio/wav' };
  } catch (error) {
    const snapshot = await ref.get().catch(() => null);
    if (snapshot?.data()?.generatorId === claim.generatorId) await ref.delete().catch(() => {});
    throw error;
  }
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'Method not allowed.' } });

  let requestKey = '';
  let pendingRequest = null;
  try {
    assertRateLimit(req);
    const body = getRequestBody(req);
    const text = normalizeText(body.text);
    const mode = String(body.mode || 'sentence').toLowerCase();
    if (!text) throw new ApiError(400, 'Text is required.');
    if (text.length > MAX_TEXT_LENGTH) throw new ApiError(400, 'Text is too long.');
    if (!VALID_MODES.has(mode)) throw new ApiError(400, 'Invalid TTS mode.');
    if (shouldForceFallback(req)) throw new ApiError(503, 'AI TTS is disabled for local fallback testing.');

    requestKey = createCacheKey(text, mode);
    pendingRequest = pendingRequests.get(requestKey);
    if (!pendingRequest) {
      pendingRequest = getOrCreateAudio(text, mode);
      pendingRequests.set(requestKey, pendingRequest);
    }
    const result = await pendingRequest;
    return res.status(200).json(result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = errorCodeForStatus(status, error instanceof ApiError ? error.code : '');
    const message = error instanceof ApiError ? error.message : 'Unexpected TTS server error.';
    if (!code.startsWith('gemini_')) console.error(`[tts] ${code}: ${message}`);
    return res.status(status).json({
      error: {
        code,
        message
      }
    });
  } finally {
    if (requestKey && pendingRequests.get(requestKey) === pendingRequest) {
      pendingRequests.delete(requestKey);
    }
  }
};
