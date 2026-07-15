const { chromium } = require('playwright');

const BASE_URL = process.env.HSK_TEST_URL || 'http://127.0.0.1:8765/hsk.html';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function advanceToSection(page, sectionName, maxSteps = 80) {
  for (let step = 0; step < maxSteps; step += 1) {
    const current = await page.locator('[data-learning-section]').getAttribute('data-learning-section');
    if (current === sectionName) return;
    const next = page.locator('[data-flow-action="next"]');
    check(await next.count(), `Không có nút tiếp ở section ${current}.`);
    await next.click();
    await page.waitForSelector('[data-learning-section]');
  }
  throw new Error(`Không tới được section ${sectionName}.`);
}

async function openLevelLesson(page, level, lessonId = 1) {
  if (await page.locator('.detail-back-btn').count()) {
    await page.evaluate(() => window.backToLessonList());
  }
  await page.locator(`.hsk-tab[data-tab="${level}"]`).click();
  await page.locator(`.lesson-item[data-detail="${lessonId}"]`).click();
  await page.waitForSelector('[data-learning-section]');
}

async function checkLookup(page, expectedText = '') {
  const token = page.locator('.gt-reading-token').first();
  check(await token.count(), 'Không có token tra cứu.');
  await token.click();
  const lookup = page.locator('[data-reading-lookup]');
  check(await lookup.isVisible(), 'Bảng tra từ không hiển thị.');
  check(Boolean(await lookup.locator('[data-reading-lookup-word]').innerText()), 'Bảng tra từ thiếu từ.');
  check(Boolean(await lookup.locator('[data-reading-lookup-pinyin]').innerText()), 'Bảng tra từ thiếu pinyin.');
  check(Boolean(await lookup.locator('[data-reading-lookup-meaning]').innerText()), 'Bảng tra từ thiếu nghĩa.');
  if (expectedText) {
    const source = await page.evaluate(() => window.__currentLessonData.lessonText.map(line => line.chinese).join(''));
    check(source.includes(expectedText), `Nội dung nguồn không chứa “${expectedText}”.`);
  }
  return lookup;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('https://www.gstatic.com/firebasejs/**', route => route.abort());
  await page.addInitScript(() => {
    window.__spoken = [];
    window.CCFirebase = { db: {}, getCurrentStats: () => null, getCurrentUser: () => null };
    const FakeUtterance = class {
      constructor(text = '') { this.text = text; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; }
    };
    const fakeSpeechSynthesis = {
      cancel() {}, addEventListener() {}, removeEventListener() {},
      getVoices() { return [{ lang: 'zh-CN', name: 'Test Chinese' }]; },
      speak(utterance) { window.__spoken.push(utterance.text); setTimeout(() => utterance.onend?.(), 0); }
    };
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: fakeSpeechSynthesis });
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const listCounts = {};
  for (const [level, expected] of [[1, 15], [2, 15], [3, 20], [4, 20], [6, 40]]) {
    await page.locator(`.hsk-tab[data-tab="${level}"]`).click();
    await page.waitForSelector(`.lesson-item[data-detail="${expected}"]`);
    listCounts[`hsk${level}`] = await page.locator('.lesson-item').count();
    check(listCounts[`hsk${level}`] === expected, `HSK${level} không có đúng ${expected} bài.`);
  }

  const dialogueChecks = {};
  for (const level of [1, 2]) {
    await openLevelLesson(page, level);
    const data = await page.evaluate(() => ({
      lines: window.__currentLessonData.lessonText.length,
      extended: window.__currentLessonData.extendedVocabulary.length,
      sections: window.__currentLessonData.learningPath.sections
    }));
    check(data.lines === (level === 1 ? 10 : 12), `HSK${level} sai số lượt thoại.`);
    check(data.extended === 3, `HSK${level} không có đúng 3 từ mở rộng.`);
    check(data.sections[1] === 'extendedVocabulary', `HSK${level} không đặt từ mở rộng trước hội thoại.`);
    await advanceToSection(page, 'lessonText');
    check((await page.locator('.gt-interactive-dialogue').count()) === 5, `HSK${level} trang đầu không có 5 câu thoại tương tác.`);
    check((await page.locator('.gt-dialogue-heading b').first().innerText()).length > 0, `HSK${level} mất tên người nói.`);
    check((await page.locator('.gt-interactive-dialogue .gt-pinyin').count()) === 5, `HSK${level} mất pinyin.`);
    check((await page.locator('.gt-dialogue-translation').count()) === 5, `HSK${level} mất bản dịch.`);
    check((await page.locator('.gt-reading-token').count()) > 20, `HSK${level} có quá ít token tra từ.`);
    const lookup = await checkLookup(page);
    await lookup.locator('.gt-reading-lookup-speak').click();
    await page.locator('.gt-dialogue-listen').first().click();
    dialogueChecks[`hsk${level}`] = {
      lines: data.lines,
      firstPageInteractiveLines: await page.locator('.gt-interactive-dialogue').count(),
      tokens: await page.locator('.gt-reading-token').count()
    };
  }

  const readingChecks = {};
  for (const level of [3, 4, 6]) {
    await openLevelLesson(page, level);
    const data = await page.evaluate(() => ({
      hanzi: window.__currentLessonData.meta.hanziCount,
      title: window.__currentLessonData.lessonText[0].title,
      source: window.__currentLessonData.meta.referenceSources?.[0]?.url || '',
      extended: window.__currentLessonData.extendedVocabulary.length
    }));
    await advanceToSection(page, 'lessonText');
    const tokenCount = await page.locator('.gt-reading-token').count();
    check(tokenCount > 120, `HSK${level} có quá ít token tra cứu (${tokenCount}).`);
    const rendered = await page.locator('.gt-reading-chinese').innerText();
    const sourceText = await page.evaluate(() => window.__currentLessonData.lessonText[0].chinese);
    check(rendered === sourceText, `HSK${level} hiển thị sai chuỗi bài đọc.`);
    await checkLookup(page);
    await page.locator('.gt-reading-listen').click();
    if (level === 6) {
      check(data.source.startsWith('https://'), 'HSK6 không có nguồn tham khảo HTTPS.');
      check(data.extended === 6, 'HSK6 không giữ riêng 6 từ mở rộng.');
    }
    readingChecks[`hsk${level}`] = { hanzi: data.hanzi, title: data.title, tokens: tokenCount, source: data.source };
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLookup = await checkLookup(page);
  const mobileRect = await mobileLookup.boundingBox();
  check(mobileRect && mobileRect.x >= -1 && mobileRect.x + mobileRect.width <= 391, 'Bottom sheet tra từ vượt ngang mobile.');
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  check(noOverflow, 'Trang bị tràn ngang trên mobile.');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.backToLessonList());
  await page.locator('.hsk-tab[data-tab="6"]').click();
  await page.locator('.lesson-item[data-detail="40"]').click();
  await page.waitForSelector('.gt-hero h2');
  check((await page.locator('.gt-hero h2').innerText()).includes('đi xa hơn'), 'HSK6 bài 40 không mở đúng nội dung mới.');

  check(pageErrors.length === 0, `Có lỗi JavaScript: ${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({
    ok: true,
    listCounts,
    dialogueChecks,
    readingChecks,
    mobileBottomSheet: true,
    horizontalOverflow: false,
    ttsCalls: await page.evaluate(() => window.__spoken.length),
    lesson40Opened: true,
    pageErrors
  }, null, 2));

  await context.close();
  await browser.close();
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
