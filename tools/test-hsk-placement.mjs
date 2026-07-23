import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createThetaGrid,
  createPrior,
  updatePosterior,
  summarizePosterior,
  scoreResponse,
  chooseNextItem,
  shouldStop,
  buildResult
} from '../server/hsk-placement/engine.mjs';
import { placementItemRepository } from '../server/hsk-placement/item-repository.mjs';
import { handlePlacementRequest, placementInternals } from '../server/hsk-placement/api.mjs';
import ttsHandler from '../api/tts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = placementItemRepository.getConfig();
const items = placementItemRepository.getAll();

assert.equal(items.length, 90, 'question bank must keep all 90 items');
assert.equal(new Set(items.map((item) => item.id)).size, 90, 'question IDs must be unique');
assert.equal(items.filter((item) => item.audio).length, 24, 'listening bank must keep 24 audio prompts');
assert.equal(typeof ttsHandler.getOrCreateAudio, 'function', 'trusted TTS fallback must be reusable server-side');
for (let level = 1; level <= 6; level += 1) {
  assert.equal(items.filter((item) => item.hskLevel === level).length, 15, `HSK ${level} must have 15 items`);
}

const attempt = placementInternals.createAttempt('test-user');
const publicPayload = placementInternals.currentResponse(attempt);
const serializedQuestion = JSON.stringify(publicPayload.question);
for (const privateField of ['correct', 'acceptedAnswers', 'explanation', 'transcript', 'difficulty', 'discrimination']) {
  assert.equal(serializedQuestion.includes(`"${privateField}"`), false, `${privateField} leaked to client`);
}
assert.equal(publicPayload.question.hskLevelHidden, true);

const choice = items.find((item) => item.type === 'choice');
const order = items.find((item) => item.type === 'order');
const input = items.find((item) => item.type === 'input');
assert.equal(scoreResponse(choice, choice.correct), true);
assert.equal(scoreResponse(order, order.correct), true);
assert.equal(scoreResponse(order, [...order.correct].reverse()), false);
assert.equal(scoreResponse(input, ` ${input.correct}。`), true);

const grid = createThetaGrid(config);
let posterior = createPrior(grid);
const easy = items.find((item) => item.hskLevel === 1 && item.type === 'choice');
const before = summarizePosterior(posterior, grid, config).mean;
posterior = updatePosterior(posterior, grid, easy, true);
assert.ok(summarizePosterior(posterior, grid, config).mean > before);

const simulated = { grid, posterior: createPrior(grid), answers: [], usedItemIds: [] };
while (!shouldStop(simulated, config)) {
  const item = chooseNextItem(items, simulated, config, () => 0.42);
  assert.ok(item, 'adaptive engine ran out of items');
  simulated.usedItemIds.push(item.id);
  const isCorrect = item.hskLevel <= 4;
  simulated.posterior = updatePosterior(simulated.posterior, grid, item, isCorrect);
  simulated.answers.push({ ...item, isCorrect });
}
const result = buildResult(simulated, config);
assert.ok(result.estimatedHskLevel >= 3 && result.estimatedHskLevel <= 5);
assert.ok(result.answered >= config.minItems && result.answered <= config.maxItems);

const audioManifest = JSON.parse(fs.readFileSync(path.join(root, 'server/hsk-placement/data/audio-manifest.json'), 'utf8'));
assert.equal(audioManifest.length, 24);
for (const entry of audioManifest) {
  const audioPath = path.join(root, 'assets/audio/hsk-placement', entry.output);
  assert.ok(fs.existsSync(audioPath), `missing audio ${entry.output}`);
  assert.ok(fs.statSync(audioPath).size > 500, `invalid audio ${entry.output}`);
}

const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
assert.match(rules, /match \/private\/hskPlacement[\s\S]*allow read, write: if false;/);
assert.match(rules, /match \/hskPlacementAttempts\/\{attemptId\}[\s\S]*allow read, write: if false;/);
assert.match(rules, /docId != 'hskPlacement'/);
assert.doesNotMatch(rules, /'challengeStats', 'placementStats', 'coinHistory'/, 'clients must not write placement results');

const firebaseAuthSource = fs.readFileSync(path.join(root, 'assets/js/firebase-auth.js'), 'utf8');
assert.match(firebaseAuthSource, /placementStats:\s*\{[\s\S]*status:\s*"not_started"/);
assert.doesNotMatch(firebaseAuthSource, /"challengeStats", "placementStats", "coinHistory"/, 'shared auth must treat placement results as read-only');

const placementApiSource = fs.readFileSync(path.join(root, 'server/hsk-placement/api.mjs'), 'utf8');
assert.match(placementApiSource, /function placementStatsWrite\(/);
assert.match(placementApiSource, /placementStatsWrite\(previousPlacement,/);
assert.match(placementApiSource, /async function completeLocalAttempt\(/);
assert.doesNotMatch(placementApiSource, /isVip|vipUntil|vipPlan/i, 'placement must not depend on VIP');

const placementHtml = fs.readFileSync(path.join(root, 'hsk-placement.html'), 'utf8');
assert.doesNotMatch(placementHtml, /id="authScreen"/, 'the exercise must not wait on a login screen');
assert.doesNotMatch(placementHtml, /firebase-auth\.js/, 'the exercise page must not load Firebase auth');

const placementRuntimeSource = fs.readFileSync(path.join(root, 'assets/js/hsk-placement-runtime.js'), 'utf8');
assert.match(placementRuntimeSource, /export const placementBankReady = loadPlacementBank\(\)/);
assert.match(placementRuntimeSource, /itemOrder:\s*shuffledIds\(bank\.items\)/, 'each local attempt must randomize its bank');
assert.match(placementRuntimeSource, /export async function answerLocalPlacement\(/);

const placementPageSource = fs.readFileSync(path.join(root, 'assets/js/hsk-placement.js'), 'utf8');
assert.match(placementPageSource, /answerLocalPlacement\(/);
assert.match(placementPageSource, /void playAudio\(\{ automatic: true \}\)/, 'listening questions should autoplay');
assert.doesNotMatch(placementPageSource, /placementApi\(['"]answer['"]/, 'answering must stay local');

const placementClientSource = fs.readFileSync(path.join(root, 'assets/js/hsk-placement-client.js'), 'utf8');
assert.match(placementClientSource, /assets\/audio\/hsk-placement/);
assert.doesNotMatch(placementClientSource, /placementApi\(['"]audio['"]/, 'static audio must not wait on an API call');

const placementInviteSource = fs.readFileSync(path.join(root, 'assets/js/hsk-placement-invite.js'), 'utf8');
assert.match(placementInviteSource, /\[data-course-button\]/, 'course buttons must trigger the placement prompt');
assert.match(placementInviteSource, /stopImmediatePropagation\(\)/, 'the prompt must intercept course navigation');
assert.match(placementInviteSource, /\}, true\);/, 'the prompt listener must run during capture');

const placementResultSource = fs.readFileSync(path.join(root, 'assets/js/hsk-placement-result.js'), 'utf8');
assert.match(placementResultSource, /getLocalPlacementResult\(/, 'results must render before auth hydration');
assert.match(placementResultSource, /placementApi\(['"]complete['"]/, 'completed local attempts must sync once');

let responseStatus = 0;
let responseBody = null;
const mockResponse = {
  setHeader() {},
  status(value) { responseStatus = value; return this; },
  json(value) { responseBody = value; return value; },
  end() {}
};
await handlePlacementRequest('status', { method: 'GET', headers: {}, query: {} }, mockResponse);
assert.equal(responseStatus, 401);
assert.equal(responseBody.error.code, 'auth_required');

console.log('hsk placement integration tests passed');
