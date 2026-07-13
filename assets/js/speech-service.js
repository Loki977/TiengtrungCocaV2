/* Modular speech system: MP3 -> future AI TTS -> browser fallback */
(function () {
  'use strict';

  class AudioPlayer {
    constructor() {
      this.current = null;
      this.cache = new Map();
      this.settings = { rate: 0.4, volume: 1, repeat: 1 };
    }
    setSettings(settings = {}) {
      this.settings = { ...this.settings, ...settings };
    }
    async load(src) {
      if (!src) return null;
      if (!this.cache.has(src)) {
        const audio = new Audio(src);
        audio.preload = 'metadata';
        this.cache.set(src, audio);
      }
      return this.cache.get(src);
    }
    async play(src, settings = {}) {
      const audio = await this.load(src);
      if (!audio) throw new Error('Missing audio source');
      this.stop();
      const options = { ...this.settings, ...settings };
      audio.currentTime = 0;
      audio.playbackRate = Number(options.rate ?? 0.4) || 0.4;
      audio.volume = Math.min(1, Math.max(0, Number(options.volume ?? 1)));
      this.current = audio;
      // Nhiều bài HSK4/5/6 đang khai báo file mp3 nhưng project chưa có assets/audio.
      // Nếu file 404 hoặc bị mobile chặn quá lâu, fallback nhanh sang giọng trình duyệt.
      await new Promise((resolve, reject) => {
        if (audio.readyState >= 2) return resolve();
        const timer = setTimeout(() => reject(new Error('Audio load timeout')), 1200);
        const done = () => { clearTimeout(timer); cleanup(); resolve(); };
        const fail = () => { clearTimeout(timer); cleanup(); reject(new Error('Audio unavailable')); };
        const cleanup = () => { audio.removeEventListener('canplay', done); audio.removeEventListener('loadedmetadata', done); audio.removeEventListener('error', fail); };
        audio.addEventListener('canplay', done, { once:true });
        audio.addEventListener('loadedmetadata', done, { once:true });
        audio.addEventListener('error', fail, { once:true });
        try { audio.load(); } catch (e) { fail(); }
      });
      await audio.play();
      return audio;
    }
    stop() {
      if (this.current) {
        this.current.pause();
        this.current.currentTime = 0;
      }
      this.current = null;
    }
  }

  class BrowserSpeechEngine {
    constructor() { this.voice = null; }
    supported() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; }
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
        setTimeout(finish, 800);
      });
    }
    selectVoice(voices, lang) {
      const normalized = String(lang || 'zh-CN').toLowerCase();
      return voices.find(v => String(v.lang).toLowerCase() === normalized)
        || voices.find(v => String(v.lang).toLowerCase().startsWith('zh'))
        || null;
    }
    async speak(text, options = {}) {
      if (!this.supported()) throw new Error('Browser Speech API unsupported');
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(String(text || ''));
      utterance.lang = options.lang || 'zh-CN';
      utterance.rate = Number(options.rate ?? 0.4) || 0.4;
      utterance.pitch = Number(options.pitch) || 1;
      utterance.volume = Math.min(1, Math.max(0, Number(options.volume ?? 1)));
      const voice = await this.getVoice(utterance.lang);
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
      return utterance;
    }
    stop() { if (this.supported()) window.speechSynthesis.cancel(); }
  }

  class TTSEngine {
    async synthesize() { return null; } // Future: OpenAI / Azure / Google / ElevenLabs
  }

  class SpeechService {
    constructor() {
      this.player = new AudioPlayer();
      this.browser = new BrowserSpeechEngine();
      this.ttsEngine = new TTSEngine();
      this.settings = { rate: 0.4, volume: 1, repeat: 1, lang: 'zh-CN' };
    }
    setSettings(settings = {}) {
      this.settings = { ...this.settings, ...settings };
      this.player.setSettings(this.settings);
    }
    async speak({ text = '', audioSrc = '', rate = 0.4, volume = 1, lang = 'zh-CN' } = {}) {
      const options = { ...this.settings, rate, volume, lang };
      this.stop();
      if (audioSrc) {
        try { return await this.player.play(audioSrc, options); } catch (_) {}
      }
      const aiAudioSrc = await this.ttsEngine.synthesize(text, options).catch?.(() => null);
      if (aiAudioSrc) {
        try { return await this.player.play(aiAudioSrc, options); } catch (_) {}
      }
      return this.browser.speak(text, options);
    }
    stop() {
      this.player.stop();
      this.browser.stop();
    }
    preload(src) { return this.player.load(src); }
  }

  window.CCSpeech = window.CCSpeech || new SpeechService();
  window.CCSpeechClasses = { SpeechService, AudioPlayer, TTSEngine, BrowserSpeechEngine };
})();
