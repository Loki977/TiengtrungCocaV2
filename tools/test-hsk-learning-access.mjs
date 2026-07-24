import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const access = require('../assets/js/hsk-learning-access.js');

function storage(values = {}) {
  return { getItem: (key) => Object.hasOwn(values, key) ? JSON.stringify(values[key]) : null };
}

const noPlacement = storage();
assert.equal(access.resolveLessonAccess({ level: 'hsk1', lessonId: 1, storage: noPlacement }).allowed, true);
assert.equal(access.resolveLessonAccess({ level: 'hsk1', lessonId: 2, storage: noPlacement }).reason, 'previous_lesson');
assert.equal(access.resolveLessonAccess({ level: 'hsk1', lessonId: 4, storage: noPlacement }).reason, 'placement_required');
assert.equal(access.resolveLessonAccess({ level: 'hsk2', lessonId: 1, storage: noPlacement }).reason, 'placement_required');
assert.equal(access.getDisplayLevel({ currentLevel: 'HSK 6' }, noPlacement), 1);

const starterProgress = storage({ cc_local_progress: { completedLessonIds: { 'hsk1-1': true } } });
assert.equal(access.resolveLessonAccess({ level: 'hsk1', lessonId: 2, storage: starterProgress }).allowed, true);
assert.equal(access.resolveLessonAccess({ level: 'hsk1', lessonId: 3, storage: starterProgress }).allowed, false);
globalThis.CCFirebase = { getCurrentUser: () => ({ uid: 'signed-in-user' }) };
assert.equal(access.resolveLessonAccess({ level: 'hsk1', lessonId: 2, storage: starterProgress }).allowed, false, 'signed-in users must not inherit anonymous local lesson progress');
delete globalThis.CCFirebase;

const placedHsk3 = {
  placementStats: { status: 'completed', estimatedHskLevel: 3, completedAt: '2026-07-24T00:00:00.000Z' }
};
assert.equal(access.resolveLessonAccess({ level: 'hsk1', lessonId: 15, stats: placedHsk3, storage: noPlacement }).allowed, true);
assert.equal(access.resolveLessonAccess({ level: 'hsk3', lessonId: 20, stats: placedHsk3, storage: noPlacement }).allowed, true);
assert.equal(access.resolveLessonAccess({ level: 'hsk4', lessonId: 1, stats: placedHsk3, storage: noPlacement }).reason, 'previous_course');

const afterHsk3 = storage({ cc_local_progress: { completedLessonIds: { 'hsk3-20': true } } });
assert.equal(access.resolveLessonAccess({ level: 'hsk4', lessonId: 1, stats: placedHsk3, storage: afterHsk3 }).allowed, true);
assert.equal(access.resolveLessonAccess({ level: 'hsk4', lessonId: 2, stats: placedHsk3, storage: afterHsk3 }).reason, 'previous_lesson');

const freeMode = { courses: { hsk6: { guided: false } } };
assert.equal(access.resolveLessonAccess({ level: 'hsk6', lessonId: 40, settings: freeMode, storage: noPlacement }).allowed, true);

const localPlacement = storage({
  'cc:hsk-placement-local-result:v2': {
    result: { estimatedHskLevel: 4, completedAt: '2026-07-24T01:00:00.000Z' }
  }
});
assert.equal(access.getDisplayLevel({}, localPlacement), 4);

const hskSource = fs.readFileSync(new URL('../assets/js/hsk.js', import.meta.url), 'utf8');
const adminSource = fs.readFileSync(new URL('../assets/js/admin-super.js', import.meta.url), 'utf8');
const adminHtml = fs.readFileSync(new URL('../admin-super.html', import.meta.url), 'utf8');
assert.doesNotMatch(hskSource, /requireFreshVipAccess|unlockLessonWithCoins/, 'HSK learning access must not grant or require VIP/coin access');
assert.match(adminSource, /Khóa theo lộ trình/);
assert.match(adminSource, /data-course-guided/);
assert.doesNotMatch(adminHtml, /id="vipAllLessons"|id="coinsAllLessons"/);

console.log('HSK learning access checks passed.');
