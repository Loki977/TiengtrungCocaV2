import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const primaryPages = [
  'index.html',
  'profile.html',
  'hsk.html',
  'hsk-writing.html',
  'hsk1-writing-lessons.html',
  'lesson.html',
  'hsk1-pinyin-intro.html',
  'flashcard.html',
  'vocabulary.html',
  'challenge.html',
  'ThiThu.html',
  'hsk-placement.html',
  'hsk-placement-result.html'
];

for (const file of primaryPages) {
  const html = read(file);
  assert.match(html, /site-shell\.js/, `${file} must use the shared account shell`);
  assert.match(html, /app-shell\.css/, `${file} must load the shared account shell styles`);
}

const indexHtml = read('index.html');
assert.equal((indexHtml.match(/class="quick-card /g) || []).length, 4, 'Home must keep four quick cards');
assert.equal((indexHtml.match(/quick-card__description/g) || []).length, 4, 'every quick card needs a short description');
assert.equal((indexHtml.match(/quick-card__cta/g) || []).length, 4, 'every quick card needs a Start action');
assert.doesNotMatch(indexHtml, /assets\/images\/home\/h1\.png/, 'Home must not request the removed video poster');

const quickMenu = read('assets/js/quick-menu.js');
assert.match(quickMenu, /aria-expanded/);
assert.match(quickMenu, /event\.key (?:===|!==) ' '/, 'Space must operate a focused card');
assert.match(quickMenu, /event\.key === 'Escape'/, 'Escape must collapse the cards');

const shell = read('assets/js/site-shell.js');
const shellCss = read('assets/css/app-shell.css');
assert.match(shell, /data-cc-auth-required/);
assert.match(shell, /cc-shell-mobile-open/);
assert.match(shell, /toggleAttribute\('inert'/, 'the hidden mobile drawer must leave the focus order');
assert.match(shell, /removeDuplicateProfileSettings/, 'Profile settings must move into the shared shell');
assert.doesNotMatch(read('profile.html'), /discoverProfileBackgrounds\(\)\.then/, 'the removed Profile settings panel must not scan legacy backgrounds');
assert.match(shell, /new URL\(sheet\.href\)\.pathname === expectedPath/, 'the shell must not inject a duplicate versioned stylesheet');
assert.match(shellCss, /\.cc-shell \[hidden\]\s*\{[^}]*display:\s*none\s*!important/s, 'permission-gated shell items must stay hidden');
assert.match(shellCss, /\.cc-shell-mobile-toggle svg/, 'the mobile menu icon must inherit the shared SVG sizing');

const auth = read('assets/js/firebase-auth.js');
const rememberedBlock = auth.slice(
  auth.indexOf('function rememberAccount'),
  auth.indexOf('function removeRememberedAccount')
);
assert.match(auth, /browserLocalPersistence/);
assert.match(auth, /MAX_REMEMBERED_ACCOUNTS = 5/);
assert.match(auth, /directAnchor/, 'remembered accounts must be inserted relative to a direct modal child');
assert.match(rememberedBlock, /uid:/);
assert.match(rememberedBlock, /providerId:/);
assert.match(rememberedBlock, /lastUsedAt:/);
assert.doesNotMatch(rememberedBlock, /accessToken|refreshToken|credential|password\s*:/i);
assert.doesNotMatch(auth.slice(auth.indexOf('async function logout'), auth.indexOf('async function reauthenticateForAccountDeletion')), /REMEMBERED_ACCOUNTS_KEY/);

const hud = read('assets/js/learning-hud.js');
assert.match(hud, /visibilitychange/);
assert.match(hud, /pagehide/);
assert.match(hud, /cc:learning-answer/);
assert.match(hud, /cc:learning-reward/);
assert.match(hud, /cc:learning-progress/);
assert.match(hud, /formatDuration/);
assert.match(hud, /function setValue/, 'HUD updates must avoid self-triggering MutationObserver loops');
assert.doesNotMatch(hud, /querySelector\('\[data-hud-value="(?:time|xp|combo|account|lesson|progress)"\]'\)\.textContent\s*=/);

assert.doesNotMatch(read('package.json'), /theme-preferences\.js/);
assert.ok(fs.existsSync(path.join(root, 'assets/css/responsive.css')), 'referenced responsive.css must exist');

console.log('responsive UI integration tests passed');
