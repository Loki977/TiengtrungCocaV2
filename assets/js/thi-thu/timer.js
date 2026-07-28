export class SectionTimer {
  constructor({ onTick, onExpire }) {
    this.onTick = onTick;
    this.onExpire = onExpire;
    this.interval = null;
    this.deadline = 0;
  }

  start({ durationSeconds, deadline }) {
    this.stop();
    this.deadline = Number(deadline || (Date.now() + durationSeconds * 1000));
    this.interval = window.setInterval(() => this.tick(), 250);
    this.tick();
    return this.deadline;
  }

  tick() {
    const remaining = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
    this.onTick(remaining);
    if (remaining <= 0) {
      this.stop();
      this.onExpire();
    }
  }

  stop() {
    if (this.interval) window.clearInterval(this.interval);
    this.interval = null;
  }
}
