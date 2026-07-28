export class ExamAudioController {
  constructor(audio, onStateChange) {
    this.audio = audio;
    this.onStateChange = onStateChange;
    this.questionId = null;
    this.playCount = 0;
    this.repeatCount = 1;
    this.mode = 'official';
    this.counts = new Map();
    this.audio.addEventListener('playing', () => this.onStateChange({ playing: true, playCount: this.playCount }));
    this.audio.addEventListener('pause', () => this.onStateChange({ playing: false, playCount: this.playCount }));
    this.audio.addEventListener('ended', () => this.handleEnded());
  }

  setQuestion(question, mode) {
    if (this.questionId === question.id) return false;
    this.stop();
    this.questionId = question.id;
    this.mode = mode;
    this.playCount = Number(this.counts.get(question.id) || 0);
    this.repeatCount = Math.max(1, Number(question.repeatCount || 1));
    this.audio.src = question.audioPath || '';
    this.audio.preload = 'metadata';
    this.audio.controls = false;
    this.onStateChange({
      playing: false,
      playCount: this.playCount,
      available: Boolean(question.audioPath),
      ended: mode === 'official' && this.playCount >= this.repeatCount,
    });
    return true;
  }

  async play() {
    if (!this.audio.src) return;
    if (this.mode === 'official' && this.playCount >= this.repeatCount) {
      throw new Error('Audio đã phát đủ số lần quy định.');
    }
    if (this.audio.paused) {
      if (this.audio.ended || this.audio.currentTime >= this.audio.duration - 0.2) this.audio.currentTime = 0;
      this.playCount += 1;
      this.counts.set(this.questionId, this.playCount);
      await this.audio.play();
    }
  }

  async handleEnded() {
    if (this.mode === 'official' && this.playCount < this.repeatCount) {
      this.audio.currentTime = 0;
      this.playCount += 1;
      this.counts.set(this.questionId, this.playCount);
      await this.audio.play().catch(() => {});
      return;
    }
    this.onStateChange({ playing: false, playCount: this.playCount, ended: true });
  }

  stop() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.questionId = null;
  }

  setCounts(counts = {}) {
    this.counts = new Map(Object.entries(counts).map(([id, count]) => [id, Number(count || 0)]));
  }

  getCounts() {
    return Object.fromEntries(this.counts);
  }

  canPlay() {
    return this.mode !== 'official' || this.playCount < this.repeatCount;
  }
}
