const { chromium } = require('playwright');

const BASE_URL = process.env.HSK_TEST_URL || 'http://127.0.0.1:8765/hsk.html';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function advanceToSection(page, sectionName, maxSteps = 40) {
  for (let step = 0; step < maxSteps; step += 1) {
    const section = await page.locator('[data-learning-section]').getAttribute('data-learning-section');
    if (section === sectionName) return step;
    const next = page.locator('[data-flow-action="next"]');
    check(await next.count(), `Không tìm thấy nút tiếp khi đang ở section ${section}.`);
    await next.click();
    await page.waitForSelector('[data-learning-section]');
  }
  throw new Error(`Không tới được section ${sectionName} sau ${maxSteps} bước.`);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const pageErrors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('https://www.gstatic.com/firebasejs/**', route => route.abort());
  await page.addInitScript(() => {
    window.__spoken = [];
    window.CCFirebase = {
      db: {},
      getCurrentStats: () => null,
      getCurrentUser: () => null
    };
    const FakeUtterance = class {
      constructor(text = '') {
        this.text = text;
        this.lang = '';
        this.rate = 1;
        this.pitch = 1;
        this.volume = 1;
      }
    };
    const fakeSpeechSynthesis = {
      cancel() {},
      addEventListener() {},
      removeEventListener() {},
      getVoices() { return [{ lang: 'zh-CN', name: 'Test Chinese' }]; },
      speak(utterance) {
        window.__spoken.push(utterance.text);
        setTimeout(() => utterance.onend?.(), 0);
      }
    };
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: fakeSpeechSynthesis });
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('.hsk-tab[data-tab="4"]').click();
  await page.waitForSelector('.lesson-item[data-detail="20"]');
  check(await page.locator('.lesson-item').count() === 20, 'Danh sách HSK4 không có đúng 20 bài.');

  await page.locator('.lesson-item[data-detail="1"]').click();
  await page.waitForSelector('[data-learning-section="vocabulary"]');
  check((await page.locator('.gt-vocab-example').count()) > 0, 'HSK4 không hiển thị ví dụ mở rộng trên thẻ từ vựng.');
  const progressKeyBefore = await page.evaluate(() => Object.keys(localStorage).find(key => key.includes('lesson-progress-hsk4-1')) || '');
  await advanceToSection(page, 'lessonText');

  const tokenCount = await page.locator('.gt-reading-token').count();
  check(tokenCount > 150, `Bài đọc chỉ có ${tokenCount} cụm tra cứu.`);
  const renderedChinese = await page.locator('.gt-reading-chinese').innerText();
  const sourceChinese = await page.evaluate(() => window.__currentLessonData.lessonText[0].chinese);
  const annotation = page.locator('[data-reading-annotation]');
  const annotationText = await annotation.innerText();
  check(sourceChinese.includes(renderedChinese), 'Nội dung chính của bài đọc bị thay đổi.');
  check(annotationText && sourceChinese.includes(annotationText.split('\n')[0]), 'Thiếu phần chú thích của bài đọc.');
  check(await annotation.evaluate(element => getComputedStyle(element).fontStyle) === 'italic', 'Chú thích chưa dùng chữ nghiêng.');

  const firstToken = page.locator('.gt-reading-token').first();
  await firstToken.click();
  const lookup = page.locator('[data-reading-lookup]');
  check(await lookup.isVisible(), 'Popover tra cứu desktop không hiển thị.');
  check(Boolean(await lookup.locator('[data-reading-lookup-word]').innerText()), 'Popover thiếu từ/cụm từ.');
  check(Boolean(await lookup.locator('[data-reading-lookup-pinyin]').innerText()), 'Popover thiếu pinyin.');
  check(Boolean(await lookup.locator('[data-reading-lookup-meaning]').innerText()), 'Popover thiếu nghĩa tiếng Việt.');

  const desktopRect = await lookup.boundingBox();
  check(desktopRect && desktopRect.x >= 0 && desktopRect.y >= 0 && desktopRect.x + desktopRect.width <= 1280, 'Popover desktop vượt khung nhìn.');
  await lookup.locator('.gt-reading-lookup-speak').click();
  check((await page.evaluate(() => window.__spoken.length)) > 0, 'Nút TTS của từ/cụm từ không gọi speechSynthesis.');
  await page.locator('.gt-section-title').click();
  check(await lookup.isHidden(), 'Popover không đóng khi bấm ra ngoài.');

  await page.locator('.gt-reading-listen').click();
  check((await page.evaluate(() => window.__spoken.some(text => text.length > 300))), 'Nút nghe toàn bài không đọc bài khóa.');
  const progressKeyAfter = await page.evaluate(() => Object.keys(localStorage).find(key => key.includes('lesson-progress-hsk4-1')) || '');
  check(progressKeyBefore === '' || progressKeyBefore === progressKeyAfter, 'Khóa lưu tiến độ HSK4 bị thay đổi.');
  check(Boolean(progressKeyAfter), 'Tiến độ HSK4 không được lưu vào localStorage.');

  await page.screenshot({ path: 'tmp/hsk4-desktop.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await firstToken.click();
  check(await lookup.isVisible(), 'Bottom sheet tra cứu mobile không hiển thị.');
  const mobileStyle = await lookup.evaluate(element => getComputedStyle(element).position);
  const mobileRect = await lookup.boundingBox();
  check(mobileStyle === 'fixed', 'Bảng tra cứu mobile không dùng fixed bottom sheet.');
  check(mobileRect && mobileRect.x >= -1 && mobileRect.x + mobileRect.width <= 391 && mobileRect.y + mobileRect.height <= 845, 'Bottom sheet mobile vượt khung nhìn.');
  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  check(noHorizontalOverflow, 'Trang HSK4 bị tràn ngang ở viewport mobile.');
  await page.screenshot({ path: 'tmp/hsk4-mobile.png', fullPage: false });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.backToLessonList());
  await page.locator('.lesson-item[data-detail="20"]').click();
  await page.waitForSelector('.gt-hero');
  check((await page.locator('.gt-hero h2').innerText()).includes('Phong cảnh trên đường'), 'HSK4 bài 20 không mở đúng nội dung.');

  await page.evaluate(() => window.backToLessonList());
  await page.locator('.hsk-tab[data-tab="1"]').click();
  await page.locator('.lesson-item[data-detail="1"]').click();
  await page.waitForSelector('[data-learning-section]');
  await advanceToSection(page, 'lessonText');
  check((await page.locator('.gt-interactive-dialogue').count()) > 0, 'Renderer hội thoại tương tác HSK1 không hoạt động.');
  check((await page.locator('.gt-reading-token').count()) > 0, 'HSK1 chưa được áp dụng tra từ trong hội thoại.');

  check(pageErrors.length === 0, `Có lỗi JavaScript trong trang: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({
    ok: true,
    hsk4Lessons: 20,
    lesson1LookupTokens: tokenCount,
    desktopPopover: true,
    mobileBottomSheet: true,
    ttsCalls: await page.evaluate(() => window.__spoken.length),
    progressKey: progressKeyAfter,
    lesson20Opened: true,
    interactiveHsk1Renderer: true,
    horizontalOverflow: false,
    pageErrors
  }, null, 2));

  await context.close();
  await browser.close();
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
