const DEFAULT_PROGRESS = {
  streak: 0,
  xp: 0,
  currentLevel: "HSK 1",
  completedLessons: 0,
  weeklyLessons: 0,
  lastXp: 0,
  dailyGoal: 250,
  todayXp: 0,
  levelPercent: 0,
  xpToNext: 1000,
  currentLesson: {
    level: "hsk1",
    lesson: 1,
    title: "Bài 1: Bắt đầu học HSK 1",
    meta: "Từ vựng · bắt đầu học · ~10 phút",
    progress: 0,
    next: "Bài 2: Tiếp tục học"
  },
  tasks: {
    flashcard: { done: 0, total: 10 },
    listening: { done: 0, total: 1 },
    writing: { done: 0, total: 5 },
    speaking: { done: 0, total: 3 }
  },
  courses: { hsk1: 0, hsk2: 0, hsk3: 0, hsk4: 0, hsk5: 0, hsk6: 0 }
};

function deepMerge(base, extra = {}) {
  const output = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && output[key] && typeof output[key] === "object" && !Array.isArray(output[key])) {
      output[key] = deepMerge(output[key], value);
    } else if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

const $ = (selector) => document.querySelector(selector);
const $all = (selector) => [...document.querySelectorAll(selector)];

function setText(selector, value) {
  $all(selector).forEach((el) => { el.textContent = value; });
}

function setHtml(selector, html) {
  $all(selector).forEach((el) => { el.innerHTML = html; });
}

function setWidth(selector, percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  $all(selector).forEach((el) => { el.style.width = `${safePercent}%`; });
}

function normalizeProgress(rawProgress) {
  const progress = deepMerge(DEFAULT_PROGRESS, rawProgress || {});
  progress.currentLevel = progress.currentLevel || progress.level || "HSK 1";
  progress.levelPercent = Math.min(100, Math.max(0, Number(progress.levelPercent ?? Math.round(((Number(progress.xp) || 0) % 1000) / 10))));
  progress.xpToNext = Number(progress.xpToNext ?? (1000 - ((Number(progress.xp) || 0) % 1000))) || 1000;
  progress.tasks = deepMerge(DEFAULT_PROGRESS.tasks, progress.tasks || {});
  progress.courses = deepMerge(DEFAULT_PROGRESS.courses, progress.courses || {});
  progress.currentLesson = deepMerge(DEFAULT_PROGRESS.currentLesson, progress.currentLesson || {});
  return progress;
}

function renderTasks(tasks) {
  const taskMap = {
    flashcardTask: tasks.flashcard,
    listeningTask: tasks.listening,
    writingTask: tasks.writing,
    speakingTask: tasks.speaking
  };
  Object.entries(taskMap).forEach(([key, task]) => {
    setText(`[data-progress="${key}"]`, `${Number(task.done) || 0}/${Number(task.total) || 0}`);
    const taskEl = $(`[data-progress="${key}"]`)?.closest(".goal-task");
    if (!taskEl) return;
    const done = Number(task.done) >= Number(task.total);
    taskEl.classList.toggle("completed", done);
    const icon = taskEl.querySelector(".goal-task__check, .goal-task__circle");
    if (icon) {
      icon.className = done ? "goal-task__check" : "goal-task__circle";
      icon.textContent = done ? "✓" : "○";
    }
  });
}

function renderCourses(courses) {
  Object.entries(courses).forEach(([level, percent]) => {
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    const card = $(`[data-course="${level}"]`);
    const ribbon = $(`[data-course-ribbon="${level}"]`);
    const button = $(`[data-course-button="${level}"]`);
    setWidth(`[data-course-progress="${level}"]`, safePercent);
    setText(`[data-course-percent="${level}"]`, `${safePercent}%`);
    if (!card) return;
    card.classList.remove("course-card--completed", "course-card--active", "course-card--locked");
    if (safePercent >= 100) {
      card.classList.add("course-card--completed");
      if (ribbon) ribbon.textContent = "✓ Hoàn thành";
      if (button) { button.textContent = "Ôn tập"; button.disabled = false; }
    } else if (safePercent > 0 || level === "hsk1") {
      if (safePercent > 0) card.classList.add("course-card--active");
      if (ribbon) ribbon.textContent = safePercent > 0 ? "▶ Đang học" : "Bắt đầu";
      if (button) { button.textContent = safePercent > 0 ? "Tiếp tục" : "Bắt đầu"; button.disabled = false; }
    } else {
      card.classList.add("course-card--locked");
      if (ribbon) ribbon.textContent = "Chưa học";
      if (button) { button.textContent = "🔒 Chưa mở khóa"; button.disabled = true; }
    }
    if (button) button.onclick = () => { if (!button.disabled) location.href = `lesson.html?level=${level}&lesson=1`; };
  });
}

function renderProgress(rawProgress) {
  const progress = normalizeProgress(rawProgress);
  const lesson = progress.currentLesson;
  const lessonPercent = Math.max(0, Math.min(100, Number(lesson.progress) || 0));
  const dailyGoal = Number(progress.dailyGoal) || 250;
  const todayXp = Number(progress.todayXp) || 0;
  const ringValue = Math.max(0, Math.min(314, Math.round((todayXp / dailyGoal) * 314)));

  setText('[data-progress="streak"]', progress.streak);
  setText('[data-progress="xp"]', Number(progress.xp || 0).toLocaleString("vi-VN"));
  setText('[data-progress="level"]', progress.currentLevel);
  setText('[data-progress="completedLessons"]', progress.completedLessons);
  setText('[data-progress="weeklyLessons"]', `+${progress.weeklyLessons || 0} bài tuần này`);
  setText('[data-progress="lastXp"]', `+${progress.lastXp || 0}`);
  setText('[data-progress="xpToNext"]', `Cần ${progress.xpToNext || 1000} XP để lên cấp`);
  setWidth('[data-progress-style="levelPercent"]', progress.levelPercent);
  setText('[data-progress="currentLessonLevel"]', String(lesson.level || "hsk1").toUpperCase());
  setText('[data-progress="currentLessonTitle"]', lesson.title);
  setText('[data-progress="currentLessonMeta"]', lesson.meta);
  setWidth('[data-progress-style="currentLessonProgress"]', lessonPercent);
  setText('[data-progress="currentLessonProgressLabel"]', `${lessonPercent}%`);
  setHtml('[data-progress="nextLesson"]', `<span>🎧</span> ${lesson.next || "Bài tiếp theo"}`);
  setText('[data-progress="todayXp"]', todayXp);
  setText('[data-progress="dailyGoal"]', `/ ${dailyGoal} XP`);
  $all('[data-progress-ring="dailyGoal"]').forEach((circle) => circle.setAttribute("stroke-dasharray", `${ringValue} 314`));
  renderTasks(progress.tasks);
  renderCourses(progress.courses);
  const continueBtn = $("#continueLearningBtn");
  if (continueBtn) continueBtn.onclick = () => { location.href = `lesson.html?level=${lesson.level || "hsk1"}&lesson=${lesson.lesson || 1}`; };
}

function initHomeProgress() {
  const firebase = window.CCFirebase;
  // Render từ cache/stats hiện tại ngay cả khi Firebase Auth còn đang khôi phục session.
  // Việc này tránh nhấp nháy Đăng nhập / 0 XP trong 1-2 giây khi chuyển trang/tab.
  renderProgress(firebase?.getCurrentStats?.() || DEFAULT_PROGRESS);
}

window.addEventListener("cc:user-stats", (event) => renderProgress(event.detail?.stats || DEFAULT_PROGRESS));
window.addEventListener("cc:auth-ready", (event) => renderProgress(event.detail?.stats || DEFAULT_PROGRESS));
window.addEventListener("firebase-ready", initHomeProgress);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHomeProgress);
} else {
  initHomeProgress();
}
