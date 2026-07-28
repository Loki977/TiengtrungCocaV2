import assert from 'node:assert/strict';
import { AttemptStore } from '../assets/js/thi-thu/autosave.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

globalThis.localStorage = new MemoryStorage();

const ownerId = 'user-test';
const first = {
  examId:'hsk2-mock-001',
  attemptId:'attempt-old',
  mode:'official',
  submittedAt:100,
  objectiveEarned:140,
  finalMax:200,
  finalStatus:'passed',
};
const second = {
  examId:'hsk2-mock-001',
  attemptId:'attempt-new',
  mode:'practice',
  submittedAt:200,
  objectiveEarned:100,
  finalMax:200,
  finalStatus:'failed',
};
localStorage.setItem(`thi-thu:attempt:${ownerId}:${first.examId}:${first.mode}:${first.attemptId}:result`, JSON.stringify(first));
localStorage.setItem(`thi-thu:attempt:${ownerId}:${second.examId}:${second.mode}:${second.attemptId}:result`, JSON.stringify(second));
localStorage.setItem('unrelated', '{"keep":true}');

assert.deepEqual(
  AttemptStore.listCompleted({ ownerId }).map(item => item.attemptId),
  ['attempt-new', 'attempt-old'],
  'Kết quả phải được sắp xếp mới nhất trước.'
);
assert.equal(AttemptStore.deleteCompleted({ ownerId, ...second }), true, 'Phải xóa được đúng lượt đã chọn.');
assert.deepEqual(AttemptStore.listCompleted({ ownerId }).map(item => item.attemptId), ['attempt-old']);
assert.equal(localStorage.getItem('unrelated'), '{"keep":true}', 'Không được xóa dữ liệu localStorage ngoài phạm vi.');

console.log('Mock exam state tests passed.');
