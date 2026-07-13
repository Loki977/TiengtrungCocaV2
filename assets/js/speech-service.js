/* Shared Chinese audio service: existing audio -> local cache -> AI cache -> browser voice. */
(function () {
  'use strict';

  const API_TIMEOUT_MS = 22_000;
  const AUDIO_CACHE_LIMIT = 48;
  const MODE_SETTINGS = Object.freeze({
    vocabulary: { rate: 0.78 },
    example: { rate: 0.84 },
    sentence: { rate: 0.84 },
    answer: { rate: 0.84 },
    passage: { rate: 0.88 }
  });

  function normalizeText(value) {
    return String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getLookupKey(text, mode) {
    return `${mode}:${normalizeText(text).toLowerCase()}`;
  }

  class IndexedAudioCache {
    constructor() {
      this.databasePromise = null;
    }

    open() {
      if (!('indexedDB' in window)) return Promise.resolve(null);
      if (this.databasePromise) return this.databasePromise;
      this.databasePromise = new Promise((resolve) => {
        const request = indexedDB.open('cc-audio-cache', 1);
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

    async get(lookupKey) {
      const db = await this.open();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(['lookup', 'audio'], 'readonly');
        const lookupRequest = tx.objectStore('lookup').get(lookupKey);
        lookupRequest.onerror = () => resolve(null);
        lookupRequest.onsuccess = () => {
          const lookup = lookupRequest.result;
          if (!lookup?.cacheKey) return resolve(null);
          const audioRequest = tx.objectStore('audio').get(lookup.cacheKey);
          audioRequest.onerror = () => resolve(null);
          audioRequest.onsuccess = () => resolve(audioRequest.result?.blob || null);
        };
      });
    }

    async set(lookupKey, cacheKey, blob) {
      const db = await this.open();
      if (!db || !cacheKey || !(blob instanceof Blob)) return;
      const now = Date.now();
      await new Promise((resolve) => {
        const tx = db.transaction(['lookup', 'audio'], 'readwrite');
        tx.objectStore('audio').put({ cacheKey, blob, savedAt: now });
        tx.objectStore('lookup').put({ lookupKey, cacheKey, savedAt: now });
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      });
      this.prune(db);
    }

    async prune(db) {
      if (!db) return;
      const records = await new Promise((resolve) => {
        const request = db.transaction('audio', 'readonly').objectStore('audio').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
      if (records.length <= AUDIO_CACHE_LIMIT) return;
      const stale = records.sort((a, b) => a.savedAt - b.savedAt).slice(0, records.length - AUDIO_CACHE_LIMIT);
      await new Promise((resolve) => {
        const tx = db.transaction('audio', 'readwrite');
        stale.forEach((item) => tx.objectStore('audio').delete(item.cacheKey));
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      });
    }
  }

  class AudioPlayer {
    constructor() {
      this.current = null;
      this.currentFinish = null;
      this.objectUrl = '';
    }

    stop() {
      if (this.current) {
        this.current.pause();
        this.current.currentTime = 0;
      }
      this.currentFinish?.();
      this.currentFinish = null;
      this.current = null;
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = '';
    }

    async play(source, settings = {}) {
      this.stop();
      const src = source instanceof Blob ? (this.objectUrl = URL.createObjectURL(source)) : source;
      if (!src) throw new Error('Missing audio source');
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.playbackRate = Number(settings.rate ?? 1) || 1;
      audio.volume = Math.min(1, Math.max(0, Number(settings.volume ?? 1)));
      this.current = audio;

      return new Promise(async (resolve, reject) => {
        let settled = false;
        let timer;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          if (this.current === audio) {
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
        try {
          await audio.play();
          const duration = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
          timer = window.setTimeout(() => finish(new Error('Audio playback timed out')), Math.min(180_000, Math.max(8_000, duration + 8_000)));
        } catch (error) {
          finish(error);
        }
      });
    }
  }

  class BrowserSpeechEngine {
    constructor() {
      this.currentFinish = null;
    }

    supported() {
      return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    }

    async getVoice(lang = 'zh-CN') {
      if (!this.supported()) return null;
      const voices = window.speechSynthesis.getVoices();
      if (voices.length) return this.selectVoice(voices, lang);
      return new Promise((resolve) => {
        const finish = () => {
          window.speechSynthesis.removeEventListener('voiceschanged', finish);
          resolve(this.selectVoice(window.speechSynthesis.getVoices(), lang));
        };
        window.speechSynthesis.addEventListener('voiceschanged', finish);
        window.setTimeout(finish, 900);
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
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = settings.lang || 'zh-CN';
      utterance.rate = Number(settings.rate ?? 0.84) || 0.84;
      utterance.pitch = Number(settings.pitch ?? 0.94) || 0.94;
      utterance.volume = Math.min(1, Math.max(0, Number(settings.volume ?? 1)));
      const voice = await this.getVoice(utterance.lang);
      if (voice) utterance.voice = voice;

      return new Promise((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => finish(new Error('Speech playback timed out')), Math.min(60_000, Math.max(8_000, text.length * 900)));
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
      if (this.supported()) window.speechSynthesis.cancel();
      this.currentFinish?.();
      this.currentFinish = null;
    }
  }

  class SpeechService {
    constructor() {
      this.player = new AudioPlayer();
      this.browser = new BrowserSpeechEngine();
      this.cache = new IndexedAudioCache();
      this.pendingRequests = new Map();
      this.requestId = 0;
      this.didNotifyFallback = false;
    }

    get isSpeaking() {
      return Boolean(this.player.current || this.browser.currentFinish);
    }

    stop() {
      this.requestId += 1;
      this.player.stop();
      this.browser.stop();
    }

    async speak({ text = '', mode = 'sentence', audioUrl = '', audioSrc = '', rate, pitch = 0.94, volume = 1, lang = 'zh-CN' } = {}) {
      const cleanText = normalizeText(text);
      if (!cleanText) return;
      const requestId = this.requestId + 1;
      this.stop();
      const settings = { ...MODE_SETTINGS[mode], rate: rate ?? MODE_SETTINGS[mode]?.rate ?? 0.84, pitch, volume, lang };
      const directAudio = audioUrl || audioSrc;
      if (directAudio) {
        try { return await this.player.play(directAudio, settings); } catch (_) { return this.speakWithBrowser(cleanText, settings); }
      }

      const lookupKey = getLookupKey(cleanText, mode);
      try {
        const localAudio = await this.cache.get(lookupKey);
        if (requestId !== this.requestId) return;
        if (localAudio) return await this.player.play(localAudio, settings);

        const generated = await this.fetchGeneratedAudio(cleanText, mode, lookupKey);
        if (requestId !== this.requestId) return;
        if (generated?.blob) return await this.player.play(generated.blob, settings);
        if (generated?.audioUrl) return await this.player.play(generated.audioUrl, settings);
      } catch (_) {
        // Browser speech is the required non-blocking fallback for every AI/cache failure.
      }
      if (requestId !== this.requestId) return;
      return this.speakWithBrowser(cleanText, settings);
    }

    async fetchGeneratedAudio(text, mode, lookupKey) {
      const pendingKey = `${lookupKey}`;
      if (!this.pendingRequests.has(pendingKey)) {
        const request = this.requestGeneratedAudio(text, mode, lookupKey).finally(() => this.pendingRequests.delete(pendingKey));
        this.pendingRequests.set(pendingKey, request);
      }
      return this.pendingRequests.get(pendingKey);
    }

    async requestGeneratedAudio(text, mode, lookupKey) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      try {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, mode }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error('TTS API unavailable');
        const payload = await response.json();
        if (!payload?.audioUrl || !payload?.cacheKey) throw new Error('Invalid TTS response');
        const audioResponse = await fetch(payload.audioUrl, { signal: controller.signal });
        if (!audioResponse.ok) throw new Error('Cached audio unavailable');
        const blob = await audioResponse.blob();
        if (!blob.size || !/^audio\//i.test(blob.type || 'audio/wav')) throw new Error('Invalid cached audio');
        await this.cache.set(lookupKey, payload.cacheKey, blob);
        return { blob };
      } finally {
        clearTimeout(timeout);
      }
    }

    async speakWithBrowser(text, settings) {
      if (!this.didNotifyFallback) {
        this.didNotifyFallback = true;
        window.CCFirebase?.showToast?.('AI tạm thời không khả dụng, đang dùng giọng đọc trên thiết bị.', 'info');
      }
      try {
        await this.browser.speak(text, settings);
      } catch (_) {
        // Both providers failed; resolve so callers never leave controls locked.
      }
    }

    preload() { return Promise.resolve(); }
    setSettings() {}
  }

  const service = window.CCAudio || new SpeechService();
  window.CCAudio = service;
  window.CCSpeech = service;
  window.CCSpeechClasses = { SpeechService, AudioPlayer, BrowserSpeechEngine, IndexedAudioCache };
})();
