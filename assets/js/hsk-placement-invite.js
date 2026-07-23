import { getLocalPlacementStatus } from './hsk-placement-runtime.js';

const PROMPT_SEEN_KEY = 'cc:hsk-placement-course-prompt-seen:v2';
const COURSE_SELECTOR = 'a[href="hsk.html"], a[href="./hsk.html"], [data-course-button]';

let pendingCourseUrl = 'hsk.html';
let lastFocusedElement = null;

function hasSeenCoursePrompt() {
  if (getLocalPlacementStatus().status !== 'not_started') return true;
  const placementStatus = window.CCFirebase?.getCurrentStats?.()?.placementStats?.status;
  if (placementStatus && placementStatus !== 'not_started') return true;
  try {
    return localStorage.getItem(getPromptSeenKey()) === '1';
  } catch {
    return false;
  }
}

function rememberCoursePrompt() {
  try {
    localStorage.setItem(getPromptSeenKey(), '1');
  } catch {
    // Điều hướng vẫn hoạt động nếu trình duyệt chặn localStorage.
  }
}

function getPromptSeenKey() {
  let uid = window.CCFirebase?.getCurrentUser?.()?.uid || '';
  if (!uid) {
    try {
      uid = JSON.parse(localStorage.getItem('cc_user') || 'null')?.uid || '';
    } catch {
      uid = '';
    }
  }
  return `${PROMPT_SEEN_KEY}:${uid || 'guest'}`;
}

function resolveCourseUrl(entry) {
  if (entry.matches('a[href]')) return entry.href;
  const level = String(entry.dataset.courseButton || 'hsk1').toLowerCase();
  return `lesson.html?level=${encodeURIComponent(level)}&lesson=1`;
}

function navigate(url) {
  window.location.assign(url);
}

function createPrompt() {
  const backdrop = document.createElement('div');
  backdrop.className = 'placement-course-prompt';
  backdrop.hidden = true;
  backdrop.setAttribute('aria-hidden', 'true');

  const dialog = document.createElement('section');
  dialog.className = 'placement-course-prompt__dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'placementCoursePromptTitle');
  dialog.setAttribute('aria-describedby', 'placementCoursePromptDescription');

  dialog.innerHTML = `
    <button class="placement-course-prompt__close" type="button" aria-label="Bỏ qua và vào khóa học">×</button>
    <img class="placement-course-prompt__seal" src="assets/images/hsk-placement/seal.svg" alt="" width="68" height="68" />
    <span class="placement-course-prompt__eyebrow">Gợi ý dành cho người mới</span>
    <h2 id="placementCoursePromptTitle">Bạn đã biết trình độ HSK của mình chưa?</h2>
    <p id="placementCoursePromptDescription">Làm nhanh một bài kiểm tra như bài tập trong khóa học để chọn đúng cấp độ bắt đầu.</p>
    <div class="placement-course-prompt__benefits" aria-label="Ưu điểm bài kiểm tra">
      <span>Không cần đăng nhập lại</span>
      <span>Chuyển câu tức thì</span>
      <span>Khoảng 12–18 phút</span>
    </div>
    <div class="placement-course-prompt__actions">
      <a class="btn btn--primary btn--lg" href="hsk-placement.html">Kiểm tra trình độ</a>
      <button class="btn btn--outline btn--lg" type="button" data-placement-skip>Không cần, vào khóa học</button>
    </div>
  `;

  const skip = () => {
    rememberCoursePrompt();
    closePrompt();
    navigate(pendingCourseUrl);
  };

  dialog.querySelector('[data-placement-skip]').addEventListener('click', skip);
  dialog.querySelector('.placement-course-prompt__close').addEventListener('click', skip);
  dialog.querySelector('a[href="hsk-placement.html"]').addEventListener('click', rememberCoursePrompt);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) skip();
  });

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  return backdrop;
}

function getPrompt() {
  return document.querySelector('.placement-course-prompt') || createPrompt();
}

function openPrompt(courseUrl) {
  pendingCourseUrl = courseUrl || 'hsk.html';
  lastFocusedElement = document.activeElement;
  const prompt = getPrompt();
  prompt.hidden = false;
  prompt.setAttribute('aria-hidden', 'false');
  document.body.classList.add('placement-course-prompt-open');
  requestAnimationFrame(() => {
    prompt.classList.add('is-visible');
    prompt.querySelector('a[href="hsk-placement.html"]')?.focus();
  });
}

function closePrompt() {
  const prompt = document.querySelector('.placement-course-prompt');
  if (!prompt) return;
  prompt.classList.remove('is-visible');
  prompt.hidden = true;
  prompt.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('placement-course-prompt-open');
  lastFocusedElement?.focus?.();
}

document.addEventListener('click', (event) => {
  const courseEntry = event.target.closest(COURSE_SELECTOR);
  if (!courseEntry || hasSeenCoursePrompt()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openPrompt(resolveCourseUrl(courseEntry));
}, true);

document.addEventListener('keydown', (event) => {
  const prompt = document.querySelector('.placement-course-prompt.is-visible');
  if (!prompt) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    rememberCoursePrompt();
    closePrompt();
    navigate(pendingCourseUrl);
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...prompt.querySelectorAll('a[href], button:not([disabled])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

document.querySelectorAll('[data-placement-direct]').forEach((link) => {
  link.addEventListener('click', rememberCoursePrompt);
});
