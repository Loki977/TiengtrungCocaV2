const GUEST_KEY = 'thi-thu:guest-id:v2';

function randomId(prefix) {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

export function getOwnerId(user) {
  if (user?.uid) return user.uid;
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) {
    id = randomId('guest');
    localStorage.setItem(GUEST_KEY, id);
  }
  return id;
}

export function createAttemptId() {
  return randomId('attempt');
}

export class AttemptStore {
  constructor({ ownerId, examId, attemptId, mode }) {
    this.ownerId = ownerId;
    this.examId = examId;
    this.attemptId = attemptId;
    this.mode = mode;
    this.key = `thi-thu:attempt:${ownerId}:${examId}:${mode}:${attemptId}`;
    this.latestKey = `thi-thu:latest:${ownerId}:${examId}:${mode}`;
    this.tabId = randomId('tab');
    this.channel = 'BroadcastChannel' in window ? new BroadcastChannel(`thi-thu:${attemptId}`) : null;
    this.conflict = false;
    this.channel?.addEventListener('message', event => {
      if (event.data?.tabId === this.tabId) return;
      if (event.data?.type === 'active') this.conflict = true;
      if (event.data?.type === 'hello') this.channel?.postMessage({ type: 'active', tabId: this.tabId });
    });
    this.channel?.postMessage({ type: 'hello', tabId: this.tabId });
  }

  save(state) {
    if (this.conflict) throw new Error('Lượt thi này đang mở ở tab khác.');
    const payload = { ...state, ownerId: this.ownerId, examId: this.examId, attemptId: this.attemptId, mode: this.mode, savedAt: Date.now() };
    localStorage.setItem(this.key, JSON.stringify(payload));
    localStorage.setItem(this.latestKey, this.attemptId);
  }

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || 'null');
    } catch {
      return null;
    }
  }

  complete(result) {
    localStorage.setItem(`${this.key}:result`, JSON.stringify({ ...result, submittedAt: Date.now() }));
    localStorage.removeItem(this.key);
    if (localStorage.getItem(this.latestKey) === this.attemptId) localStorage.removeItem(this.latestKey);
    this.channel?.postMessage({ type: 'complete', tabId: this.tabId });
  }

  updateCompleted(result) {
    localStorage.setItem(`${this.key}:result`, JSON.stringify({ ...result, submittedAt: result.submittedAt || Date.now() }));
  }

  static latest({ ownerId, examId, mode }) {
    const latestKey = `thi-thu:latest:${ownerId}:${examId}:${mode}`;
    const attemptId = localStorage.getItem(latestKey);
    if (!attemptId) return null;
    try {
      return JSON.parse(localStorage.getItem(`thi-thu:attempt:${ownerId}:${examId}:${mode}:${attemptId}`) || 'null');
    } catch {
      return null;
    }
  }

  static listCompleted({ ownerId }) {
    const prefix = `thi-thu:attempt:${ownerId}:`;
    const results = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix) || !key.endsWith(':result')) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        if (value?.attemptId && value?.examId) results.push({ ...value, localStorageKey: key });
      } catch {
        // Bỏ qua bản ghi local hỏng; không làm gián đoạn danh sách đề.
      }
    }
    return results.sort((a, b) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0));
  }

  static deleteCompleted({ ownerId, examId, attemptId, mode = 'official' }) {
    const exactKey = `thi-thu:attempt:${ownerId}:${examId}:${mode}:${attemptId}:result`;
    if (localStorage.getItem(exactKey) !== null) {
      localStorage.removeItem(exactKey);
      return true;
    }
    const match = AttemptStore.listCompleted({ ownerId })
      .find(item => item.examId === examId && item.attemptId === attemptId);
    if (!match?.localStorageKey) return false;
    localStorage.removeItem(match.localStorageKey);
    return true;
  }

  close() {
    this.channel?.close();
  }
}
