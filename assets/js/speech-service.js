/* Shared Chinese audio service: local shared MP3 -> browser cache -> speechSynthesis. */
(function () {
  'use strict';

  const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';
  const RUNTIME_INDEX_SCHEMA = 4;

  const MODE_SETTINGS = Object.freeze({
    vocabulary: { rate: 0.78 },
    example: { rate: 0.84 },
    sentence: { rate: 0.84 },
    answer: { rate: 0.84 },
    passage: { rate: 0.88 }
  });

  const MODE_AUDIO_PROFILES = Object.freeze({
    vocabulary: 'vocabulary',
    example: 'writing-sentence',
    sentence: 'writing-sentence',
    answer: 'writing-sentence',
    passage: 'lesson-passage'
  });

  const FALLBACK_RATES = Object.freeze({
    vocabulary: '-18%',
    'writing-sentence': '-12%',
    'lesson-passage': '-8%'
  });

  const PUNCTUATION_RULES = Object.freeze([
    [/[，､﹐]/g, ','],
    [/[。｡]/g, '.'],
    [/[！﹗]/g, '!'],
    [/[？﹖]/g, '?'],
    [/[：﹕]/g, ':'],
    [/[；﹔]/g, ';'],
    [/[“”„‟«»「」『』]/g, '"'],
    [/[‘’‚‛]/g, "'"],
    [/[（]/g, '('],
    [/[）]/g, ')'],
    [/[【〔［]/g, '['],
    [/[】〕］]/g, ']'],
    [/[｛]/g, '{'],
    [/[｝]/g, '}'],
    [/[—–−﹣]/g, '-'],
    [/…+/g, '...']
  ]);

  function normalizeText(value) {
    return String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeAudioText(value) {
    let text = String(value || '')
      .normalize('NFC')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[\u0000-\u001F\u007F\u00A0\u3000]/g, ' ');
    for (const [pattern, replacement] of PUNCTUATION_RULES) {
      text = text.replace(pattern, replacement);
    }
    return text
      .replace(/\s+/g, ' ')
      .replace(/\s*([,.;:!?()[\]{}"'])\s*/g, '$1')
      .trim();
  }

  async function sha256Hex(value) {
    if (!globalThis.crypto?.subtle || !globalThis.TextEncoder) return '';
    const bytes = new TextEncoder().encode(String(value || ''));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function createAudioKey(text, voice, rate) {
    const material = [
      normalizeAudioText(text),
      String(voice || DEFAULT_VOICE).trim(),
      String(rate || '').trim()
    ].join('\u001f');
    return sha256Hex(material);
  }

  class StaticAudioIndex {
    constructor(url = 'assets/audio/learning/web-index.json') {
      const rootUrl = new URL(url, document.baseURI);
      // The pre-shard runtime used the same filename. A schema query plus
      // revalidation prevents an old, force-cached v2 index from silently
      // disabling every local MP3 in an already-used browser profile.
      rootUrl.searchParams.set('schema', String(RUNTIME_INDEX_SCHEMA));
      this.url = rootUrl.href;
      this.config = null;
      this.loadPromise = null;
      this.shardPromises = new Map();
      this.resolveCache = new Map();
    }

    async load() {
      if (this.config) return this.config;
      if (this.loadPromise) return this.loadPromise;
      this.loadPromise = fetch(this.url, { cache: 'no-cache' })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          const valid = payload?.version >= RUNTIME_INDEX_SCHEMA && payload.strategy === 'sharded-global-hash';
          this.config = valid ? payload : {
            version: 0,
            assetVersion: '',
            voice: DEFAULT_VOICE,
            ratesByProfile: FALLBACK_RATES,
            hashShardBase: '',
            idShardBase: ''
          };
          return this.config;
        })
        .catch(() => {
          this.config = {
            version: 0,
            assetVersion: '',
            voice: DEFAULT_VOICE,
            ratesByProfile: FALLBACK_RATES,
            hashShardBase: '',
            idShardBase: ''
          };
          return this.config;
        })
        .finally(() => { this.loadPromise = null; });
      return this.loadPromise;
    }

    async loadShard(kind, hash, config) {
      const base = kind === 'id' ? config.idShardBase : config.hashShardBase;
      if (!base || !hash) return {};
      const prefix = hash.slice(0, 2);
      const cacheKey = `${kind}:${prefix}`;
      if (this.shardPromises.has(cacheKey)) return this.shardPromises.get(cacheKey);
      const url = new URL(`${String(base).replace(/\/+$/, '')}/${prefix}.json`, document.baseURI);
      if (config.assetVersion) url.searchParams.set('v', config.assetVersion);
      const promise = fetch(url.href, { cache: 'force-cache' })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => payload?.items && typeof payload.items === 'object' ? payload.items : {})
        .catch(() => ({}));
      this.shardPromises.set(cacheKey, promise);
      return promise;
    }

    async resolve({ text = '', profile = '', audioId = '', staticRate = '' } = {}) {
      const config = await this.load();
      const rate = String(staticRate || config.ratesByProfile?.[profile] || FALLBACK_RATES[profile] || '').trim();
      const voice = String(config.voice || DEFAULT_VOICE).trim() || DEFAULT_VOICE;
      const normalized = normalizeAudioText(text);
      let audioKey = normalized && rate ? await createAudioKey(normalized, voice, rate) : '';
      const requestKey = `${audioKey}\u001f${audioId}`;
      if (this.resolveCache.has(requestKey)) return this.resolveCache.get(requestKey);

      let relative = '';
      if (audioKey) {
        const shard = await this.loadShard('hash', audioKey, config);
        relative = shard[audioKey] || '';
      }
      if (!relative && audioId) {
        const idHash = await sha256Hex(String(audioId).trim());
        const idShard = await this.loadShard('id', idHash, config);
        const mappedKey = idShard[String(audioId)] || '';
        if (mappedKey) {
          audioKey = mappedKey;
          const hashShard = await this.loadShard('hash', audioKey, config);
          relative = hashShard[audioKey] || '';
        }
      }

      const audioUrl = relative ? new URL(relative, document.baseURI) : null;
      if (audioUrl && config.assetVersion) audioUrl.searchParams.set('v', config.assetVersion);
      const result = {
        cacheKey: audioKey,
        profile,
        rate,
        voice,
        url: audioUrl?.href || ''
      };
      this.resolveCache.set(requestKey, result);
      return result;
    }
  }

  class IndexedAudioCache {
    constructor() {
      this.databasePromise = null;
    }

    open() {
      if (!('indexedDB' in window)) return Promise.resolve(null);
      if (this.databasePromise) return this.databasePromise;
      this.databasePromise = new Promise((resolve) => {
        const request = indexedDB.open('cc-audio-cache', 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'cacheKey' });
          if (!db.objectStoreNames.contains('lookup')) db.createObjectStore('lookup', { keyPath: 'lookupKey' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      });
      return this.databasePromise;
    }

    async get(cacheKey) {
      if (!cacheKey) return null;
      const db = await this.open();
      if (!db) return null;
      return new Promise((resolve) => {
        const request = db.transaction('audio', 'readonly').objectStore('audio').get(cacheKey);
        request.onerror = () => resolve(null);
        request.onsuccess = () => resolve(request.result?.blob || null);
      });
    }

  }

  class AudioPlayer {
    constructor() {
      this.audio = new Audio();
      this.audio.preload = 'none';
      this.current = null;
      this.currentFinish = null;
      this.objectUrl = '';
    }

    release(audio) {
      if (!audio) return;
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch (_) {}
    }

    stop() {
      if (this.currentFinish) {
        this.currentFinish();
        return;
      }
      this.release(this.current);
      this.current = null;
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = '';
    }

    async play(source, settings = {}) {
      this.stop();
      const src = source instanceof Blob ? (this.objectUrl = URL.createObjectURL(source)) : String(source || '');
      if (!src) throw new Error('Missing audio source');
      const audio = this.audio;
      audio.preload = 'none';
      audio.src = src;
      audio.playbackRate = Math.min(1.5, Math.max(0.6, Number(settings.rate ?? 1) || 1));
      audio.volume = Math.min(1, Math.max(0, Number(settings.volume ?? 1)));
      this.current = audio;

      return new Promise(async (resolve, reject) => {
        let settled = false;
        let timer;
        const pauseWatchdog = () => clearTimeout(timer);
        const startWatchdog = () => {
          clearTimeout(timer);
          const duration = Number.isFinite(audio.duration) && audio.duration > 0
            ? (audio.duration * 1000) / audio.playbackRate
            : 360_000;
          timer = window.setTimeout(
            () => finish(new Error('Audio playback timed out')),
            Math.min(420_000, Math.max(12_000, duration + 10_000))
          );
        };
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          audio.removeEventListener('playing', startWatchdog);
          audio.removeEventListener('waiting', pauseWatchdog);
          audio.removeEventListener('stalled', pauseWatchdog);
          if (this.current === audio) {
            this.release(audio);
            this.current = null;
            this.currentFinish = null;
            if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = '';
          }
          error ? reject(error) : resolve();
        };
        const onEnded = () => finish();
        const onError = () => finish(new Error('Audio playback failed'));
        this.currentFinish = () => finish();
        audio.addEventListener('ended', onEnded, { once: true });
        audio.addEventListener('error', onError, { once: true });
        audio.addEventListener('playing', startWatchdog);
        audio.addEventListener('waiting', pauseWatchdog);
        audio.addEventListener('stalled', pauseWatchdog);
        try {
          await audio.play();
        } catch (error) {
          finish(error);
        }
      });
    }
  }

  class BrowserSpeechEngine {
    constructor() {
      this.currentFinish = null;
      this.requestId = 0;
    }

    supported() {
      return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    }

    async getVoice(lang = 'zh-CN') {
      if (!this.supported()) return null;
      const voices = window.speechSynthesis.getVoices();
      if (voices.length) return this.selectVoice(voices, lang);
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          window.speechSynthesis.removeEventListener('voiceschanged', finish);
          resolve(this.selectVoice(window.speechSynthesis.getVoices(), lang));
        };
        const timer = window.setTimeout(finish, 900);
        window.speechSynthesis.addEventListener('voiceschanged', finish);
      });
    }

    selectVoice(voices, lang) {
      const normalized = String(lang || 'zh-CN').toLowerCase();
      return voices.find((voice) => String(voice.lang).toLowerCase() === normalized)
        || voices.find((voice) => String(voice.lang).toLowerCase().startsWith('zh'))
        || null;
    }

    async speak(text, settings = {}) {
      if (!this.supported()) throw new Error('Browser Speech API unsupported');
      this.stop();
      const requestId = this.requestId;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = settings.lang || 'zh-CN';
      utterance.rate = Number(settings.rate ?? 0.84) || 0.84;
      utterance.pitch = Number(settings.pitch ?? 0.94) || 0.94;
      utterance.volume = Math.min(1, Math.max(0, Number(settings.volume ?? 1)));
      const voice = await this.getVoice(utterance.lang);
      if (requestId !== this.requestId) return;
      if (voice) utterance.voice = voice;

      return new Promise((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(
          () => finish(new Error('Speech playback timed out')),
          Math.min(360_000, Math.max(8_000, text.length * 550))
        );
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (this.currentFinish === finish) this.currentFinish = null;
          error ? reject(error) : resolve();
        };
        utterance.onend = () => finish();
        utterance.onerror = () => finish(new Error('Browser speech failed'));
        this.currentFinish = finish;
        try { window.speechSynthesis.speak(utterance); } catch (error) { finish(error); }
      });
    }

    stop() {
      this.requestId += 1;
      if (this.supported()) window.speechSynthesis.cancel();
      this.currentFinish?.();
      this.currentFinish = null;
    }
  }

  class SpeechService {
    constructor() {
      this.player = new AudioPlayer();
      this.browser = new BrowserSpeechEngine();
      this.staticAudio = new StaticAudioIndex();
      this.cache = new IndexedAudioCache();
      this.requestId = 0;
      this.lastPlayback = { source: 'idle', detail: '' };
    }

    get isSpeaking() {
      return Boolean(this.player.current || this.browser.currentFinish);
    }

    stop() {
      this.requestId += 1;
      this.player.stop();
      this.browser.stop();
    }

    markPlayback(source, detail = '') {
      this.lastPlayback = { source, detail: String(detail || '') };
      document.documentElement.dataset.ccAudioSource = source;
      if (detail) document.documentElement.dataset.ccAudioDetail = String(detail);
      else delete document.documentElement.dataset.ccAudioDetail;
    }

    async speak({
      text = '',
      lookupText = '',
      pinyin = '',
      audioId = '',
      mode = 'sentence',
      audioProfile = '',
      audioUrl = '',
      audioSrc = '',
      staticRate = '',
      rate,
      pitch = 0.94,
      volume = 1,
      lang = 'zh-CN',
      browserOnly = false,
      allowBrowserFallback = true,
      allowDirectSource = false
    } = {}) {
      const cleanText = normalizeText(text);
      const cleanLookupText = normalizeText(lookupText || cleanText);
      if (!cleanText && !(allowDirectSource && (audioSrc || audioUrl))) return;
      this.stop();
      const requestId = this.requestId;
      const browserRate = Number(rate ?? MODE_SETTINGS[mode]?.rate ?? 0.84) || 0.84;
      const browserSettings = { rate: browserRate, pitch, volume, lang };

      if (browserOnly) {
        this.markPlayback('speechSynthesis', 'browser-only');
        return this.speakWithBrowser(cleanText, browserSettings);
      }

      const profile = audioProfile || MODE_AUDIO_PROFILES[mode] || '';
      const directSource = allowDirectSource ? String(audioSrc || audioUrl || '') : '';
      let resolved = { cacheKey: '', url: '' };
      if (!directSource) {
        this.markPlayback('resolving-local', profile);
        resolved = await this.staticAudio.resolve({
          text: cleanLookupText,
          profile,
          audioId,
          staticRate: typeof staticRate === 'string' ? staticRate : ''
        });
        if (requestId !== this.requestId) return;
      }

      const localUrl = directSource || resolved.url;
      const playbackRate = Math.min(1.35, Math.max(0.7, browserRate / (MODE_SETTINGS[mode]?.rate || browserRate)));
      if (localUrl) {
        try {
          const absoluteUrl = new URL(localUrl, document.baseURI).href;
          this.markPlayback('local-mp3', new URL(absoluteUrl).pathname);
          await this.player.play(absoluteUrl, { rate: playbackRate, volume });
          if (requestId !== this.requestId) return;
          return;
        } catch (error) {
          if (requestId !== this.requestId) return;
          this.markPlayback('local-failed', error?.name || error?.message || 'playback-error');
          console.warn('[CCAudio] Local MP3 failed; checking browser cache', {
            profile,
            text: cleanLookupText,
            source: localUrl,
            error
          });
        }
      }

      const cachedBlob = await this.cache.get(resolved.cacheKey);
      if (requestId !== this.requestId) return;
      if (cachedBlob) {
        try {
          this.markPlayback('browser-cache', resolved.cacheKey);
          await this.player.play(cachedBlob, { rate: playbackRate, volume });
          return;
        } catch (error) {
          if (requestId !== this.requestId) return;
          console.warn('[CCAudio] Cached MP3 playback failed; using browser speech', { profile, text: cleanLookupText, error });
        }
      }

      if (!allowBrowserFallback) throw new Error('Local and cached audio are unavailable');
      this.markPlayback('speechSynthesis', localUrl ? 'local-playback-failed' : 'local-not-mapped');
      return this.speakWithBrowser(cleanText, browserSettings);
    }

    async speakWithBrowser(text, settings) {
      try {
        return await this.browser.speak(text, settings);
      } catch (error) {
        window.CCFirebase?.showToast?.('Không thể phát âm trên trình duyệt này.', 'warning');
        throw error;
      }
    }

    setSettings() {}
  }

  const service = window.CCAudio || new SpeechService();
  window.CCAudio = service;
  window.CCSpeech = service;
  window.CCSpeechClasses = {
    SpeechService,
    AudioPlayer,
    BrowserSpeechEngine,
    IndexedAudioCache,
    StaticAudioIndex,
    normalizeAudioText,
    createAudioKey
  };
})();
