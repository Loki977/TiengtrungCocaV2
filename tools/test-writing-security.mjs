import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const rules = read('firestore.rules');
const writingApi = read('server/writing/api.mjs');
const adminApi = read('server/admin/api.mjs');
const cronApi = read('api/cron/grade-writing.js');
const indexes = JSON.parse(read('firestore.indexes.json'));

assert.match(rules, /match \/writingSubmissions\/\{submissionId\}/);
assert.match(rules, /resource\.data\.userId == request\.auth\.uid/);
assert.match(rules, /allow create, update, delete: if false/);
assert.match(rules, /match \/writingGradingCache\/\{hash\}[\s\S]*allow read, write: if false/);
assert.match(rules, /match \/writingRateLimits\/\{bucketId\}[\s\S]*allow read, write: if false/);

assert.match(writingApi, /verifyIdToken/);
assert.match(writingApi, /RATE_MAX_ATTEMPTS/);
assert.match(writingApi, /transaction\.create\(submissionRefs\[index\]/);
assert.match(writingApi, /gradingHash/);
assert.doesNotMatch(writingApi, /GEMINI_API_KEY/);

assert.match(adminApi, /requireRole\(actor, CMS_ROLES\)/);
assert.match(adminApi, /manualGradePatch/);
assert.match(adminApi, /refreshAttemptAggregate/);
assert.match(cronApi, /CRON_SECRET/);
assert.match(cronApi, /timingSafeEqual/);

assert.ok(indexes.indexes.some(index =>
  index.collectionGroup === 'writingSubmissions'
  && index.fields.some(field => field.fieldPath === 'status')
  && index.fields.some(field => field.fieldPath === 'retryAt')));

console.log('Writing security tests passed: ownership, backend-only writes, roles, rate limit, cron secret and index.');
