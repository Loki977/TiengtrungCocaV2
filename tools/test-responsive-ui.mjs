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
  'hsk1-radicals-intro.html',
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

assert.match(
  read('hsk.html'),
  /assets\/js\/hsk\.js\?v=(?:[4-9]|\d{2,})/,
  'HSK must invalidate the pre-radicals course script cache'
);

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
assert.match(quickMenuCss, /@media \(min-width:\s*769px\)[\s\S]*\.quick-card:not\(\.is-active\) \.quick-card__body\s*\{[^}]*gap:\s*0/s, 'hidden desktop card rows must not leave a vertical gap above the visible titles');
assert.match(quickMenuCss, /@media \(min-width:\s*769px\)[\s\S]*\.quick-card:not\(\.is-active\) \.quick-card__cta\s*\{[^}]*min-height:\s*0/s, 'hidden desktop card actions must not shift the visible titles');
assert.match(quickMenuCss, /@media \(max-width:\s*768px\)[\s\S]*\.quick-card:not\(\.is-active\) \.quick-card__body\s*\{[^}]*min-height:\s*calc\(3 \* 1\.08em\)/s, 'mobile quick-card labels must reserve equal height so their icons stay aligned');
assert.match(quickMenuCss, /@media \(max-width:\s*768px\)[\s\S]*\.quick-card:not\(\.is-active\) \.quick-card__description,[\s\S]*\.quick-card:not\(\.is-active\) \.quick-card__cta\s*\{[^}]*display:\s*none/s, 'hidden mobile quick-card rows must not shift the visible icon and title');
assert.match(indexHtml, /assets\/css\/quick-menu\.css\?v=(?:[6-9]|\d{2,})/, 'Home must invalidate the pre-alignment quick-menu stylesheet');

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
assert.match(
  shellCss,
  /@media \(max-width:\s*899px\)[\s\S]*body\.cc-shell-ready > header\[data-cc-legacy-shell-header\]\s*\{[^}]*position:\s*relative\s*!important/s,
  'mobile website brand headers must scroll with the document'
);
assert.match(
  shellCss,
  /\.cc-shell-mobile-toggle\s*\{[^}]*position:\s*fixed/s,
  'only the mobile hamburger menu control must stay fixed'
);

const auth = read('assets/js/firebase-auth.js');
const homeProgress = read('assets/js/home-progress.js');
const learningResume = read('assets/js/learning-resume.js');
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
assert.match(learningResume, /await firebase\.authReady/, 'last learning activity must wait for the resolved account before saving');
assert.match(learningResume, /saveUserStats\(\{ currentLesson: activity \}\)/, 'last learning activity must use the shared progress store');
assert.match(auth, /currentStats = normalizeStats\(readLocalProgress\(\) \|\| DEFAULT_STATS\)/, 'signed-out sessions must restore their own local learning progress');
assert.match(read('assets/js/lesson-render.js'), /kind:\s*'course'[\s\S]*href:\s*`hsk\.html\?level=/, 'course lessons must publish a resumable real progress record');
assert.match(read('lesson-page.js'), /kind:\s*"writing"[\s\S]*href:\s*`lesson\.html\?level=/, 'writing lessons must publish a resumable real progress record');
assert.match(homeProgress, /Number\(activity\.updatedAt\) > 0/, 'Home must reject the legacy placeholder as recent progress');
assert.match(homeProgress, /getSafeLearningHref/, 'Home must validate the saved resume destination');
assert.match(homeProgress, /hsk\.html\?level=\$\{level\}&lesson=1/, 'Home course cards must open the course instead of the writing lesson');

const hud = read('assets/js/learning-hud.js');
const hudCss = read('assets/css/learning-hud.css');
assert.match(hud, /visibilitychange/);
assert.match(hud, /pagehide/);
assert.match(hud, /cc:learning-answer/);
assert.match(hud, /cc:learning-reward/);
assert.match(hud, /cc:learning-progress/);
assert.match(hud, /formatDuration/);
assert.match(hud, /function setValue/, 'HUD updates must avoid self-triggering MutationObserver loops');
assert.match(hud, /data-hud-toggle-time/, 'mobile HUD must expose its live time in the compact clock control');
assert.match(hud, /cc-learning-hud__toggle-icon[\s\S]*iconMarkup\.time/, 'mobile HUD must use a clock icon');
assert.match(hud, /pointerdown/, 'mobile HUD must support drag positioning');
assert.match(hud, /cc_learning_hud_position_v1/, 'mobile HUD must remember the chosen position');
assert.match(hud, /clampHudPosition/, 'mobile HUD must stay inside the visible viewport');
assert.doesNotMatch(hud, /querySelector\('\[data-hud-value="(?:time|xp|combo|account|lesson|progress)"\]'\)\.textContent\s*=/);
assert.match(hudCss, /width:\s*min\(196px/, 'desktop learning controls must be about 15% narrower');
assert.match(hudCss, /min-height:\s*43px/, 'desktop learning control buttons must be about 15% shorter');
assert.match(hudCss, /html\.dark-mode[\s\S]*--cc-hud-surface:\s*rgba\(10,\s*18,\s*33/, 'learning controls must use a true dark surface');
assert.match(hudCss, /@media \(max-width:\s*767px\)[\s\S]*\.cc-learning-hud\s*\{[^}]*position:\s*fixed/s, 'mobile learning controls must follow the viewport while scrolling');
assert.match(hudCss, /\.cc-learning-hud__head\s*\{[^}]*touch-action:\s*none/s, 'mobile HUD drag handle must own touch movement');
assert.match(hudCss, /@media \(max-width:\s*767px\)[\s\S]*\.cc-learning-hud__grid\s*\{[^}]*display:\s*none/s, 'mobile HUD must start collapsed');
assert.match(hudCss, /\.cc-learning-hud\.is-expanded \.cc-learning-hud__grid\s*\{[^}]*display:\s*grid/s, 'expanded mobile HUD must show all session information');
assert.match(hudCss, /\.cc-learning-hud\.is-expanded \.cc-learning-hud__toggle\s*\{[^}]*width:\s*44px/s, 'expanded mobile HUD must keep a compact close control');
assert.match(quickMenuCss, /@media \(max-width:\s*768px\)[\s\S]*font-size:\s*clamp\(\.82rem,\s*3\.6vw,\s*1rem\)/, 'Home quick-card titles must be larger on mobile');

assert.doesNotMatch(read('package.json'), /theme-preferences\.js/);
assert.ok(fs.existsSync(path.join(root, 'assets/css/responsive.css')), 'referenced responsive.css must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/images/brand/site-logo.webp')), 'website logo asset must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/images/brand/favicon-orange.png')), 'orange favicon asset must exist');
assert.match(read('assets/js/lesson-render.js'), /class="detail-back-btn"[\s\S]*<svg/, 'course lesson back control must use the large writing-style arrow');
const radicalsHtml = read('hsk1-radicals-intro.html');
const radicalsJs = read('assets/js/radicals-intro.js');
assert.match(radicalsHtml, /data-foundation-lesson-label="Bộ thủ"/, 'radicals lesson must identify itself to the shared learning HUD');
assert.match(read('hsk1-pinyin-intro.html'), /data-foundation-lesson-label="Pinyin"/, 'Pinyin must keep its shared learning HUD integration');
assert.match(radicalsHtml, /Nét → bộ kiện → chữ Hán → bộ thủ/, 'radicals lesson must teach the core construction hierarchy');
assert.match(radicalsHtml, /id="writingCanvas"/, 'radicals lesson must include a touch-friendly writing pad');
assert.equal((radicalsHtml.match(/class="radical-practice-question"/g) || []).length, 6, 'radicals lesson must include six final checks');
assert.match(radicalsJs, /hsk1-radicals-intro/, 'radicals completion must use a dedicated foundation progress key');
assert.match(radicalsJs, /pointerdown/, 'radicals writing pad must support pointer input');
assert.match(radicalsJs, /cc:learning-progress/, 'radicals lesson must report section progress to the shared HUD');
assert.doesNotMatch(read('flashcard.html'), /class="cc-page-brand"/, 'Flashcard branding must stay in the shared page header');
assert.match(read('flashcard.html'), /@media \(max-width:\s*640px\)[\s\S]*\.fc-page \.deck-selector[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'Flashcard HSK levels must use a stable two-column mobile grid');
assert.match(read('flashcard.html'), /@media \(max-width:\s*640px\)[\s\S]*\.fc-page\s*\{[\s\S]*padding-top:\s*0/, 'Flashcard mobile layout must not count the website header twice');
assert.doesNotMatch(read('vocabulary.html'), /class="cc-page-brand"/, 'Tàng Thư Các branding must stay in the shared page header');
const archiveHtml = read('vocabulary.html');
const archiveJs = read('assets/js/tang-thu-cac.js');
const archiveCss = read('assets/css/tang-thu-cac.css');
assert.equal((archiveHtml.match(/data-archive-tab=/g) || []).length, 4, 'Tàng Thư Các must expose four primary cards');
assert.match(archiveHtml, /data-archive-tab="idioms"[\s\S]*data-archive-tab="radicals"/, 'the Radicals card must sit beside Idioms');
assert.match(archiveHtml, /data-radicals-category="common"[\s\S]*?60 bộ thường gặp/, 'radicals must open with a 60-item common group');
assert.match(archiveHtml, /data-radicals-category="other"[\s\S]*?154 bộ còn lại/, 'radicals must expose the remaining 154 items');
assert.match(archiveHtml, /id="radicalsPagination"/, 'radicals must expose responsive pagination');
assert.match(archiveJs, /radicals:\s*"assets\/data\/tang-thu-cac\/radicals\.json(?:\?v=\d+)?"/, 'radicals must load from the dedicated library data file');
assert.match(archiveJs, /item\.variants[\s\S]*item\.examples/, 'radical search must include variants and example characters');
assert.match(archiveJs, /updateRadicalPageSize/, 'radical page size must adapt to the rendered width');
assert.match(archiveJs, /\$\{escapeHtml\(item\.number\)\}\. Bộ/, 'radical cards must use a plain numbered Vietnamese title');
assert.doesNotMatch(archiveJs, /radical-library-card__number/, 'radical cards must not render hash-prefixed identifiers');
assert.match(archiveCss, /\.radicals-library-grid\s*\{[\s\S]*grid-template-columns:/, 'radicals must use a responsive card grid');
assert.match(archiveCss, /repeat\(var\(--radical-columns/, 'radical columns must come from the responsive page-size calculation');
assert.match(archiveCss, /html\.dark-mode \.radicals-library-section/, 'radicals must include an explicit dark theme');
assert.match(archiveCss, /html\.dark-mode \.archive-masthead/, 'Tàng Thư Các landing must include an explicit dark theme');
assert.match(archiveCss, /html\.dark-mode \.library-list-card/, 'Tàng Thư Các content cards must include an explicit dark theme');
assert.match(archiveHtml, /preload="none"[\s\S]*data-src="assets\/videos\/tang-thu-cac\.mp4"/, 'decorative archive video must not compete with the initial page load');
assert.doesNotMatch(archiveHtml, /archive-video-frame__seal/, 'archive video must not render decorative seal overlays');
assert.doesNotMatch(archiveCss, /\.archive-video-frame::(?:before|after)/, 'archive video frame must not render decorative corner marks');
assert.match(archiveHtml, /assets\/css\/tang-thu-cac\.css\?v=(?:[7-9]|\d{2,})/, 'archive page must invalidate the pre-cleanup video frame stylesheet');
assert.doesNotMatch(archiveHtml, /\nloadDictionary\(\);\n/, 'dictionary payload must not load before the dictionary tab is selected');
assert.match(archiveJs, /tab === "dictionary"[\s\S]*ensureDictionaryLoaded/, 'dictionary payload must load on demand from the dictionary tab');
assert.match(read('hsk-writing.html'), /cc-site-brand__logo/, 'Writing must use the shared website logo');
assert.match(shellCss, /main\.page > header\.topbar\[data-cc-legacy-shell-header\][\s\S]*position:\s*sticky\s*!important/, 'Writing website branding must stay visible while scrolling');
assert.match(read('assets/css/dark-mode.css'), /html\.dark-mode \.fc-page[\s\S]*linear-gradient\(145deg,\s*#080e1b/, 'Flashcard must use the shared dark canvas');
assert.match(read('assets/css/dark-mode.css'), /html\.dark-mode \.fc-card__front[\s\S]*rgba\(24,\s*37,\s*61/, 'Flashcard faces must stay readable in dark mode');
assert.match(read('assets/css/hsk-hero-scene.css'), /padding-top:\s*calc\(var\(--header-h/, 'course hero characters must start below the website brand');
assert.match(read('assets/css/quick-menu.css'), /\.quick-menu\s*\{[\s\S]*padding-top:\s*clamp\(118px/, 'Home quick cards must sit lower below the header');
assert.match(read('assets/css/quick-menu.css'), /@media \(max-width:\s*768px\)[\s\S]*\.quick-menu\s*\{[\s\S]*padding-top:\s*96px/, 'Home quick cards must also clear the mobile brand header');
assert.match(read('index.html'), /id="homeTrailerVideo"[\s\S]*preload="none"[\s\S]*trailer\.mp4\?v=3/, 'Home trailer must avoid eager metadata loading and use the optimized asset');
assert.match(read('assets/js/home-trailer.js'), /video\.play\(\)\.then\(revealTrailer\)/, 'Home trailer must stay hidden until playback actually starts');
assert.doesNotMatch(read('assets/css/home-trailer.css'), /backdrop-filter:\s*blur\(3px\)/, 'Home trailer must avoid an expensive full-screen blur');
assert.match(read('challenge.html'), /challenge-brand cc-site-brand/, 'Challenge must use the shared website brand');
assert.match(read('challenge.html'), /id="levelGrid" role="group" aria-label="Chọn cấp độ HSK"/, 'Challenge level selector must expose an accessible group');
assert.match(read('assets/js/challenge.js'), /aria-pressed/, 'Challenge level buttons must expose their selected state');
assert.match(read('assets/css/dark-mode.css'), /html\.dark-mode \.level-btn[\s\S]*background:\s*#101b2e/, 'Challenge level buttons must keep readable dark surfaces');
assert.match(read('assets/css/dark-mode.css'), /html\.dark-mode \.level-btn\.active[\s\S]*border-color:\s*#ff8b55/, 'Challenge selected level must stay visible in dark mode');
assert.match(read('ThiThu.html'), /cc-site-brand__logo/, 'Placement test entry must use the shared website logo');
assert.match(read('ThiThu.html'), /id="levelCards"[\s\S]*role="group"/, 'Mock exam entry must expose the six-level card selector as an accessible group');
assert.match(read('assets/js/thi-thu/app.js'), /for \(let levelNumber = 1; levelNumber <= 6;/, 'Mock exam level selector must render HSK 1 through HSK 6');
assert.match(read('assets/css/thi-thu.css'), /@media \(max-width:\s*480px\)[\s\S]*\.level-card-grid\s*\{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/, 'Mock exam level cards must remain readable without horizontal overflow on mobile');
assert.match(read('profile.html'), /background-attachment:\s*fixed\s*!important/, 'Profile desktop background must size against the viewport');

console.log('responsive UI integration tests passed');
