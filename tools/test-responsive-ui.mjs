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

for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.html'))) {
  assert.match(read(file), /assets\/images\/brand\/favicon-orange\.png/, `${file} must use the orange favicon`);
}

const indexHtml = read('index.html');
assert.equal((indexHtml.match(/class="quick-card /g) || []).length, 4, 'Home must keep four quick cards');
assert.equal((indexHtml.match(/quick-card__description/g) || []).length, 4, 'every quick card needs a short description');
assert.equal((indexHtml.match(/quick-card__cta/g) || []).length, 4, 'every quick card needs a Start action');
assert.doesNotMatch(indexHtml, /assets\/images\/home\/h1\.png/, 'Home must not request the removed video poster');

const quickMenu = read('assets/js/quick-menu.js');
const quickMenuCss = read('assets/css/quick-menu.css');
assert.match(quickMenu, /aria-expanded/);
assert.match(quickMenu, /event\.key (?:===|!==) ' '/, 'Space must operate a focused card');
assert.match(quickMenu, /event\.key === 'Escape'/, 'Escape must collapse the cards');
assert.match(quickMenuCss, /white-space:\s*nowrap/, 'expanded Home card titles must remain visually stable');

const shell = read('assets/js/site-shell.js');
const shellCss = read('assets/css/app-shell.css');
assert.match(shell, /data-cc-auth-required/);
assert.match(shell, /cc-shell-mobile-open/);
assert.match(shell, /toggleAttribute\('inert'/, 'the hidden mobile drawer must leave the focus order');
assert.match(shell, /removeDuplicateProfileSettings/, 'Profile settings must move into the shared shell');
assert.match(shell, /pointerenter/, 'desktop shell must expand when hovered');
assert.match(shell, /pointerleave/, 'desktop shell must collapse after hover');
assert.match(shellCss, /\.cc-shell:hover/, 'desktop hover must have a CSS fallback');
assert.match(shellCss, /body\.cc-shell-ready > \[data-cc-legacy-shell-header\][\s\S]*display:\s*block\s*!important/, 'desktop page headers must remain visible beside the shell');
assert.match(shell, /site-logo\.webp/, 'shared shell must use the website logo');
assert.match(shell, /favicon-orange\.png/, 'shared shell must install the orange favicon');
assert.match(shell, /cc-site-brand/, 'legacy page branding must be normalized by the shared shell');
assert.match(shellCss, /\.cc-site-brand__mark/, 'all page headers must share one brand mark style');
assert.match(shellCss, /header\[data-cc-legacy-shell-header\][\s\S]*\.header__actions[\s\S]*display:\s*none\s*!important/, 'legacy header navigation and account actions must stay hidden');
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
const hudCss = read('assets/css/learning-hud.css');
assert.match(hud, /visibilitychange/);
assert.match(hud, /pagehide/);
assert.match(hud, /cc:learning-answer/);
assert.match(hud, /cc:learning-reward/);
assert.match(hud, /cc:learning-progress/);
assert.match(hud, /formatDuration/);
assert.match(hud, /function setValue/, 'HUD updates must avoid self-triggering MutationObserver loops');
assert.doesNotMatch(hud, /querySelector\('\[data-hud-value="(?:time|xp|combo|account|lesson|progress)"\]'\)\.textContent\s*=/);
assert.match(hudCss, /width:\s*min\(196px/, 'desktop learning controls must be about 15% narrower');
assert.match(hudCss, /min-height:\s*43px/, 'desktop learning control buttons must be about 15% shorter');
assert.match(hudCss, /html\.dark-mode[\s\S]*--cc-hud-surface:\s*rgba\(10,\s*18,\s*33/, 'learning controls must use a true dark surface');
assert.match(hudCss, /body:has\(> header\[data-cc-legacy-shell-header\]\) \.cc-learning-hud\s*\{[^}]*top:\s*146px/s, 'mobile learning controls must clear the fixed website brand');

assert.doesNotMatch(read('package.json'), /theme-preferences\.js/);
assert.ok(fs.existsSync(path.join(root, 'assets/css/responsive.css')), 'referenced responsive.css must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/images/brand/site-logo.webp')), 'website logo asset must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/images/brand/favicon-orange.png')), 'orange favicon asset must exist');
assert.match(read('assets/js/lesson-render.js'), /class="detail-back-btn"[\s\S]*<svg/, 'course lesson back control must use the large writing-style arrow');
assert.doesNotMatch(read('flashcard.html'), /class="cc-page-brand"/, 'Flashcard branding must stay in the shared page header');
assert.doesNotMatch(read('vocabulary.html'), /class="cc-page-brand"/, 'Tàng Thư Các branding must stay in the shared page header');
assert.match(read('hsk-writing.html'), /cc-site-brand__logo/, 'Writing must use the shared website logo');
assert.match(shellCss, /main\.page > header\.topbar\[data-cc-legacy-shell-header\][\s\S]*position:\s*sticky\s*!important/, 'Writing website branding must stay visible while scrolling');
assert.match(read('assets/css/dark-mode.css'), /html\.dark-mode \.fc-page[\s\S]*linear-gradient\(145deg,\s*#080e1b/, 'Flashcard must use the shared dark canvas');
assert.match(read('assets/css/dark-mode.css'), /html\.dark-mode \.fc-card__front[\s\S]*rgba\(24,\s*37,\s*61/, 'Flashcard faces must stay readable in dark mode');
assert.match(read('assets/css/hsk-hero-scene.css'), /padding-top:\s*calc\(var\(--header-h/, 'course hero characters must start below the website brand');
assert.match(read('assets/css/quick-menu.css'), /\.quick-menu\s*\{[\s\S]*padding-top:\s*clamp\(118px/, 'Home quick cards must sit lower below the header');
assert.match(read('assets/css/quick-menu.css'), /@media \(max-width:\s*768px\)[\s\S]*\.quick-menu\s*\{[\s\S]*padding-top:\s*96px/, 'Home quick cards must also clear the mobile brand header');
assert.match(read('challenge.html'), /challenge-brand cc-site-brand/, 'Challenge must use the shared website brand');
assert.match(read('ThiThu.html'), /cc-site-brand__logo/, 'Placement test entry must use the shared website logo');
assert.match(read('profile.html'), /background-attachment:\s*fixed\s*!important/, 'Profile desktop background must size against the viewport');

console.log('responsive UI integration tests passed');
