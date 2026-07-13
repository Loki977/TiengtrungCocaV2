import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDoTP-Rw5Jb-wYJPbmwiTLwkcjIpdM_bLA",
  // Dùng authDomain gốc của Firebase. Popup hoạt động ổn định hơn redirect
  // trên Safari/iOS và không phụ thuộc proxy cookie của nền tảng deploy.
  authDomain: "tiengtrungcoca.firebaseapp.com",
  projectId: "tiengtrungcoca",
  storageBucket: "tiengtrungcoca.firebasestorage.app",
  messagingSenderId: "216281367513",
  appId: "1:216281367513:web:97cfffea1f595c997b8fc8",
  measurementId: "G-S8ZM43HKX1"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const authPersistenceReady = setPersistence(auth, browserLocalPersistence)
  .then(() => null)
  .catch((error) => {
    console.warn("[firebase-auth] Không đặt được local persistence", error);
    return error;
  });
const db = getFirestore(app);
const ADMIN_EMAIL = 'nqthanhforwork@gmail.com';
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

window.firebaseAuth = auth;
window.firebaseDb = db;

const DEFAULT_STATS = {
  xp: 0,
  coins: 0,
  totalCoinsEarned: 0,
  unlockedLessons: {},
  writingCompleted: {},
  challengeStats: { attempts: 0, wins: 0, bestScore: 0, correctAnswers: 0, wrongAnswers: 0, rewardedSessions: {} },
  coinHistory: [],
  isVip: false,
  vipUntil: null,
  checkInStreak: 0,
  lastCheckInDate: "",
  streak: 0,
  completedLessons: 0,
  currentLevel: "HSK 1",
  dailyGoal: 250,
  todayXp: 0,
  weeklyLessons: 0,
  lastXp: 0,
  studyHours: 0,
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
  courses: { hsk1: 0, hsk2: 0, hsk3: 0, hsk4: 0, hsk5: 0, hsk6: 0 },
  tasks: {
    flashcard: { done: 0, total: 10 },
    listening: { done: 0, total: 1 },
    writing: { done: 0, total: 5 },
    speaking: { done: 0, total: 3 }
  },
  history: [],
  completedLessonIds: {}
};

const LOCAL_PROGRESS_KEY = "cc_local_progress";
function userStatsCacheKey(uid) { return `cc_stats_${uid}`; }
let currentUser = null;
let currentStats = structuredCloneSafe(DEFAULT_STATS);
let authReady = false;
let authStatus = "initializing";
let resolveAuthReady;
const authReadyPromise = new Promise((resolve) => {
  resolveAuthReady = resolve;
});

window.authReady = authReadyPromise;

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, extra = {}) {
  const output = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && output[key] && typeof output[key] === "object" && !Array.isArray(output[key])) {
      output[key] = deepMerge(output[key], value);
    } else if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

function normalizeStats(raw = {}) {
  const normalized = deepMerge(structuredCloneSafe(DEFAULT_STATS), raw || {});
  normalized.xp = Number(normalized.xp) || 0;
  normalized.coins = Math.max(0, Number(normalized.coins) || 0);
  normalized.totalCoinsEarned = Math.max(0, Number(normalized.totalCoinsEarned) || 0);
  normalized.unlockedLessons = normalized.unlockedLessons && typeof normalized.unlockedLessons === "object" && !Array.isArray(normalized.unlockedLessons) ? normalized.unlockedLessons : {};
  normalized.writingCompleted = normalized.writingCompleted && typeof normalized.writingCompleted === "object" && !Array.isArray(normalized.writingCompleted) ? normalized.writingCompleted : {};
  normalized.coinHistory = Array.isArray(normalized.coinHistory) ? normalized.coinHistory.slice(0, 80) : [];
  normalized.isVip = Boolean(normalized.isVip);
  normalized.checkInStreak = Number(normalized.checkInStreak) || 0;
  normalized.lastCheckInDate = normalized.lastCheckInDate || "";
  normalized.streak = Number(normalized.streak) || 0;
  normalized.completedLessons = Number(normalized.completedLessons) || 0;
  normalized.dailyGoal = Number(normalized.dailyGoal) || DEFAULT_STATS.dailyGoal;
  normalized.todayXp = Number(normalized.todayXp) || 0;
  normalized.weeklyLessons = Number(normalized.weeklyLessons) || 0;
  normalized.lastXp = Number(normalized.lastXp) || 0;
  normalized.studyHours = Number(normalized.studyHours) || 0;
  normalized.history = Array.isArray(normalized.history) ? normalized.history.slice(0, 50) : [];
  normalized.completedLessonIds = normalized.completedLessonIds && typeof normalized.completedLessonIds === "object" && !Array.isArray(normalized.completedLessonIds) ? normalized.completedLessonIds : {};
  normalized.courses = deepMerge(DEFAULT_STATS.courses, normalized.courses || {});
  normalized.tasks = deepMerge(DEFAULT_STATS.tasks, normalized.tasks || {});
  normalized.currentLesson = deepMerge(DEFAULT_STATS.currentLesson, normalized.currentLesson || {});
  normalized.levelPercent = Math.min(100, Math.max(0, Math.round((normalized.xp % 1000) / 10)));
  normalized.xpToNext = Math.max(0, 1000 - (normalized.xp % 1000 || 0));
  return normalized;
}

function publicUserData(user) {
  return {
    uid: user.uid,
    displayName: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || "",
    updatedAt: serverTimestamp()
  };
}

function userDocRef(uid) {
  return doc(db, "users", uid);
}

function userStatsDocRef(uid) {
  return doc(db, "users", uid, "private", "stats");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("vi-VN");
}

function getRankLabel(xp) {
  const value = Number(xp || 0);
  if (value >= 5000) return "Cấp Diamond";
  if (value >= 2500) return "Cấp Platinum";
  if (value >= 1000) return "Cấp Gold";
  if (value >= 300) return "Cấp Silver";
  return "Cấp Newbie";
}

function showToast(message, type = "info") {
  const oldToast = document.querySelector(".cc-toast, .toast");
  oldToast?.remove();
  const toast = document.createElement("div");
  toast.className = "cc-toast";
  toast.textContent = message;
  const bg = type === "error" ? "#b42318" : "#2d2d2d";
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;background:${bg};color:#fff;padding:12px 20px;border-radius:12px;font-family:Poppins,Arial,sans-serif;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:360px`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3800);
}

function getFriendlyAuthError(error) {
  const code = error?.code || "";
  const map = {
    "auth/invalid-email": "Email không hợp lệ.",
    "auth/user-disabled": "Tài khoản này đã bị vô hiệu hóa.",
    "auth/user-not-found": "Không tìm thấy tài khoản với email này.",
    "auth/wrong-password": "Mật khẩu không đúng.",
    "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
    "auth/email-already-in-use": "Email này đã được đăng ký.",
    "auth/weak-password": "Mật khẩu cần ít nhất 6 ký tự.",
    "auth/popup-closed-by-user": "Bạn đã đóng cửa sổ đăng nhập.",
    "auth/popup-blocked": "Trình duyệt đang chặn popup đăng nhập.",
    "auth/unauthorized-domain": "Domain hiện tại chưa được thêm vào Firebase Authorized domains.",
    "auth/operation-not-allowed": "Phương thức đăng nhập này chưa được bật trong Firebase Console.",
    "auth/web-storage-unsupported": "Trình duyệt hiện tại không hỗ trợ đăng nhập an toàn. Hãy mở bằng Chrome hoặc Safari.",
    "auth/cancelled-popup-request": "Yêu cầu đăng nhập trước đó đã bị hủy.",
    "auth/disallowed-useragent": "Google chặn trình duyệt nhúng. Hãy mở bằng Chrome hoặc Safari."
  };
  return map[code] || error?.message || "Có lỗi đăng nhập. Vui lòng thử lại.";
}

function closeModal() {
  document.getElementById("loginModal")?.classList.remove("open");
  document.body.style.overflow = "";
}


function showAuthLoading(message = "Đang xác thực tài khoản...") {
  let el = document.getElementById("ccAuthLoading");
  if (!el) {
    el = document.createElement("div");
    el.id = "ccAuthLoading";
    el.style.cssText = "position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(255,253,249,.86);backdrop-filter:blur(6px);";
    el.innerHTML = `<div id="ccAuthLoadingBox" style="background:#fff;border-radius:18px;padding:18px 22px;box-shadow:0 16px 45px rgba(0,0,0,.18);font-family:Poppins,Arial,sans-serif;font-weight:700;color:#2d2d2d;text-align:center;max-width:320px">🍊<br><span></span></div>`;
    document.body.appendChild(el);
  }
  const msg = el.querySelector("span");
  if (msg) msg.textContent = message;
}

function hideAuthLoading() {
  document.getElementById("ccAuthLoading")?.remove();
}

function getPostLoginUrl() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || params.get("redirect");
  if (next) {
    try {
      const url = new URL(next, window.location.origin);
      if (url.origin === window.location.origin) return url.href;
    } catch (_) {}
  }
  if (window.location.pathname.endsWith("/profile.html")) return "";
  return "";
}

function getSafeRedirectUrl(rawUrl, fallback = "") {
  if (!rawUrl) return fallback;
  try {
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin ? url.href : fallback;
  } catch (_) {
    return fallback;
  }
}

function redirectAfterLogin(forceUrl = "") {
  const postLoginUrl = getSafeRedirectUrl(forceUrl, "") || getPostLoginUrl();
  if (postLoginUrl && postLoginUrl !== window.location.href) window.location.replace(postLoginUrl);
}

function readLocalProgress() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || "null");
  } catch (_) {
    return null;
  }
}

function writeLocalProgress(stats) {
  localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(normalizeStats(stats)));
}

function readCachedUserStats(uid) {
  if (!uid) return null;
  try { return JSON.parse(localStorage.getItem(userStatsCacheKey(uid)) || "null"); } catch (_) { return null; }
}

function writeCachedUserStats(uid, stats) {
  if (!uid) return;
  try { localStorage.setItem(userStatsCacheKey(uid), JSON.stringify(normalizeStats(stats))); } catch (_) {}
}

function readCachedUser() {
  try { return JSON.parse(localStorage.getItem("cc_user") || "null"); } catch (_) { return null; }
}

function writeCachedUser(user) {
  if (!user?.uid) return;
  try {
    localStorage.setItem("cc_user", JSON.stringify({
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || ""
    }));
  } catch (_) {}
}

function mergeLocalIntoRemote(remoteStats) {
  const localStats = readLocalProgress();
  if (!localStats) return remoteStats;
  const local = normalizeStats(localStats);
  const remote = normalizeStats(remoteStats);
  const merged = normalizeStats(deepMerge(remote, {
    xp: Math.max(remote.xp, local.xp),
    streak: Math.max(remote.streak, local.streak),
    completedLessons: Math.max(remote.completedLessons, local.completedLessons),
    todayXp: Math.max(remote.todayXp, local.todayXp),
    weeklyLessons: Math.max(remote.weeklyLessons, local.weeklyLessons),
    lastXp: Math.max(remote.lastXp, local.lastXp),
    currentLesson: local.currentLesson?.progress > remote.currentLesson?.progress ? local.currentLesson : remote.currentLesson,
    courses: Object.fromEntries(Object.keys(DEFAULT_STATS.courses).map((key) => [key, Math.max(Number(remote.courses?.[key]) || 0, Number(local.courses?.[key]) || 0)])),
    tasks: deepMerge(remote.tasks, local.tasks || {}),
    history: [...(local.history || []), ...(remote.history || [])].slice(0, 50)
  }));
  return merged;
}

async function ensureUserData(user) {
  const publicRef = userDocRef(user.uid);
  const statsRef = userStatsDocRef(user.uid);
  const [publicSnap, statsSnap] = await Promise.all([getDoc(publicRef), getDoc(statsRef)]);
  const legacyProgress = publicSnap.exists() ? publicSnap.data()?.progress : null;
  const savedStats = statsSnap.exists() ? statsSnap.data() : {};
  // Không tự merge cc_local_progress vào tài khoản mới để tránh tài khoản vừa đăng nhập đã nhận dữ liệu rác/demo từ máy.
  // Legacy users vẫn được migrate từ users/{uid}.progress nếu từng có dữ liệu cũ trên chính tài khoản đó.
  const mergedStats = normalizeStats(deepMerge(legacyProgress || {}, savedStats || {}));

  await setDoc(publicRef, {
    ...publicUserData(user),
    ...(publicSnap.exists() ? {} : { createdAt: serverTimestamp() })
  }, { merge: true });

  await setDoc(statsRef, {
    ...mergedStats,
    updatedAt: serverTimestamp(),
    ...(statsSnap.exists() ? {} : { createdAt: serverTimestamp() })
  }, { merge: true });

  writeCachedUser(user);
  writeCachedUserStats(user.uid, mergedStats);
  return mergedStats;
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

function isEmbeddedFrame() {
  try {
    return window.top !== window.self;
  } catch (_) {
    return true;
  }
}

function hasUsableStorage(storageName) {
  try {
    const storage = window[storageName];
    const probeKey = "__cc_auth_storage_probe__";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return true;
  } catch (_) {
    return false;
  }
}

function canUseRedirectAuth() {
  return !isEmbeddedFrame()
    && hasUsableStorage("localStorage")
    && hasUsableStorage("sessionStorage");
}

function isDisallowedEmbeddedBrowser() {
  const ua = navigator.userAgent || "";
  const vendor = navigator.vendor || "";
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Zalo|TikTok|Bytedance|MicroMessenger|wv\)|; wv|WebView/i.test(ua)
    || (/CriOS|FxiOS|EdgiOS|Safari/i.test(ua) === false && /iPhone|iPad|iPod/i.test(ua))
    || (/Google Inc\./.test(vendor) === false && /Android/i.test(ua) && /Version\/\d/i.test(ua));
}

function showOpenInBrowserHelp() {
  showToast("Google chặn đăng nhập trong trình duyệt nhúng. Hãy bấm ⋯ rồi chọn Mở bằng Chrome/Safari.", "error");
}

function showRedirectStorageHelp() {
  showToast("Không thể đăng nhập Google trong khung giả lập hoặc trình duyệt chặn bộ nhớ. Hãy mở trang trực tiếp bằng Chrome/Safari và tắt chế độ ẩn danh.", "error");
}

async function signInGoogle() {
  if (isDisallowedEmbeddedBrowser()) {
    showOpenInBrowserHelp();
    const error = new Error("disallowed_useragent_webview");
    error.code = "auth/disallowed-useragent";
    error.handled = true;
    throw error;
  }
  const persistenceError = await authPersistenceReady;
  if (persistenceError) {
    const error = new Error("web_storage_unavailable");
    error.code = "auth/web-storage-unsupported";
    throw error;
  }

  // Popup được gọi trực tiếp từ thao tác bấm của người dùng. Cách này tránh
  // mất trạng thái đăng nhập do redirect/storage partition trên iOS và Android.
  try {
    const result = await signInWithPopup(auth, provider);
    redirectAfterLogin();
    return result;
  } catch (error) {
    // Chỉ dùng redirect như phương án dự phòng khi trình duyệt thực sự chặn popup.
    if (error?.code !== "auth/popup-blocked") throw error;
    if (!canUseRedirectAuth()) {
      showRedirectStorageHelp();
      error.handled = true;
      throw error;
    }
    showAuthLoading("Đang chuyển tới Google...");
    return signInWithRedirect(auth, provider);
  }
}

async function signInEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, String(email || "").trim(), password);
  redirectAfterLogin();
  return result;
}

async function registerEmail(email, password, displayName = "", dailyGoal = DEFAULT_STATS.dailyGoal) {
  const result = await createUserWithEmailAndPassword(auth, String(email || "").trim(), password);
  if (displayName) await updateProfile(result.user, { displayName });
  currentStats = normalizeStats({ ...DEFAULT_STATS, dailyGoal: Number(dailyGoal) || DEFAULT_STATS.dailyGoal });
  await ensureUserData(auth.currentUser);
  await saveUserStats({ dailyGoal: Number(dailyGoal) || DEFAULT_STATS.dailyGoal });
  redirectAfterLogin();
  return result;
}

async function resetPassword(email) {
  await sendPasswordResetEmail(auth, String(email || "").trim());
}

async function logout() {
  await signOut(auth);
}

async function saveUserStats(partial = {}) {
  const normalizedPartial = { ...partial };
  if (normalizedPartial.history && Array.isArray(normalizedPartial.history)) {
    normalizedPartial.history = normalizedPartial.history.slice(0, 50);
  }
  currentStats = normalizeStats(deepMerge(currentStats, normalizedPartial));
  if (!auth.currentUser) {
    writeLocalProgress(currentStats);
    syncStatsUI(currentStats);
    return currentStats;
  }
  writeCachedUserStats(auth.currentUser.uid, currentStats);
  await setDoc(userStatsDocRef(auth.currentUser.uid), {
    ...currentStats,
    updatedAt: serverTimestamp()
  }, { merge: true });
  syncStatsUI(currentStats);
  return currentStats;
}

function getCurrentStats() {
  return structuredCloneSafe(currentStats);
}

function getCurrentUser() {
  return currentUser;
}

function getCourseTotalLessons(level) {
  const totals = { hsk1: 15, hsk2: 15, hsk3: 20, hsk4: 10, hsk5: 10, hsk6: 40 };
  return totals[String(level || "hsk1").toLowerCase()] || 1;
}

async function completeLesson({ level = "hsk1", lessonId = 1, title = "", xp = 10, meta = "" } = {}) {
  const normalizedLevel = String(level || "hsk1").toLowerCase();
  const normalizedLessonId = Math.max(1, Number(lessonId) || 1);
  const reward = Math.max(0, Number(xp) || 10);
  const current = getCurrentStats();
  const completedLessonIds = { ...(current.completedLessonIds || {}) };
  const completedKey = `${normalizedLevel}-${normalizedLessonId}`;
  const isFirstCompletion = !completedLessonIds[completedKey];
  completedLessonIds[completedKey] = true;

  const courses = { ...(current.courses || {}) };
  const coursePercent = Math.min(100, Math.round((normalizedLessonId / getCourseTotalLessons(normalizedLevel)) * 100));
  courses[normalizedLevel] = Math.max(Number(courses[normalizedLevel]) || 0, coursePercent);

  const nextLessonId = normalizedLessonId + 1;
  const levelLabel = normalizedLevel.toUpperCase();
  const historyTitle = `Hoàn thành ${levelLabel} - Bài ${normalizedLessonId}`;
  const history = [
    {
      icon: "📘",
      title: historyTitle,
      meta: title || meta || "Bài học tiếng Trung",
      xp: isFirstCompletion ? reward : 0,
      coins: isFirstCompletion ? 10 : 0,
      date: new Date().toLocaleDateString("vi-VN")
    },
    ...((current.history || []).filter((item) => item?.title !== historyTitle))
  ].slice(0, 50);

  return saveUserStats({
    xp: Number(current.xp || 0) + (isFirstCompletion ? reward : 0),
    coins: Number(current.coins || 0) + (isFirstCompletion ? 10 : 0),
    totalCoinsEarned: Number(current.totalCoinsEarned || 0) + (isFirstCompletion ? 10 : 0),
    coinHistory: isFirstCompletion ? appendCoinHistory(current, { id: `lesson-${completedKey}`, reason: 'lesson-complete', amount: 10, meta: { level: normalizedLevel, lessonId: normalizedLessonId, title }, date: todayKey() }) : current.coinHistory,
    todayXp: Number(current.todayXp || 0) + (isFirstCompletion ? reward : 0),
    lastXp: isFirstCompletion ? reward : 0,
    weeklyLessons: Number(current.weeklyLessons || 0) + (isFirstCompletion ? 1 : 0),
    completedLessons: Object.keys(completedLessonIds).length,
    completedLessonIds,
    currentLevel: levelLabel.replace(/^HSK/i, "HSK"),
    currentLesson: {
      level: normalizedLevel,
      lesson: nextLessonId,
      title: `Bài ${nextLessonId}: Tiếp tục học`,
      meta: `${levelLabel} · bài tiếp theo`,
      progress: 0,
      next: `Bài ${nextLessonId + 1}: Tiếp tục học`
    },
    courses,
    history
  });
}


function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function appendCoinHistory(current, item) {
  return [item, ...((current.coinHistory || []).filter((x) => x?.id !== item.id))].slice(0, 80);
}

async function addCoins({ amount = 0, reason = 'coin-reward', id = '', meta = {} } = {}) {
  const reward = Math.max(0, Number(amount) || 0);
  if (!reward) return getCurrentStats();
  const current = getCurrentStats();
  const item = { id: id || `${reason}-${Date.now()}`, reason, amount: reward, meta, date: todayKey() };
  return saveUserStats({
    coins: Number(current.coins || 0) + reward,
    totalCoinsEarned: Number(current.totalCoinsEarned || 0) + reward,
    coinHistory: appendCoinHistory(current, item)
  });
}

async function completeTranslationChallenge({ sessionId = "", hsk = 1, score = 0, correct = 0, wrong = 0, won = false } = {}) {
  const current = getCurrentStats();
  const previous = current.challengeStats || {};
  const rewardedSessions = { ...(previous.rewardedSessions || {}) };
  const safeId = String(sessionId || `challenge-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
  const firstReward = Boolean(won && !rewardedSessions[safeId]);
  if (firstReward) rewardedSessions[safeId] = todayKey();
  const rewardXp = firstReward ? 30 : 0;
  const rewardCoins = firstReward ? 30 : 0;
  const history = firstReward ? [{
    icon: "⚡", title: `Vượt thử thách dịch HSK ${Math.min(6, Math.max(1, Number(hsk) || 1))}`,
    meta: `${score}/10 câu · 5 phút`, xp: rewardXp, coins: rewardCoins, date: new Date().toLocaleDateString("vi-VN")
  }, ...(current.history || [])].slice(0, 50) : current.history;
  const challengeStats = {
    attempts: Number(previous.attempts || 0) + 1,
    wins: Number(previous.wins || 0) + (won ? 1 : 0),
    bestScore: Math.max(Number(previous.bestScore || 0), Number(score || 0)),
    correctAnswers: Number(previous.correctAnswers || 0) + Number(correct || 0),
    wrongAnswers: Number(previous.wrongAnswers || 0) + Number(wrong || 0),
    lastPlayedAt: new Date().toISOString(),
    rewardedSessions: Object.fromEntries(Object.entries(rewardedSessions).slice(-100))
  };
  return saveUserStats({
    challengeStats, history,
    xp: Number(current.xp || 0) + rewardXp,
    todayXp: Number(current.todayXp || 0) + rewardXp,
    lastXp: rewardXp,
    coins: Number(current.coins || 0) + rewardCoins,
    totalCoinsEarned: Number(current.totalCoinsEarned || 0) + rewardCoins,
    coinHistory: rewardCoins ? appendCoinHistory(current, { id: `challenge-${safeId}`, reason: "translation-challenge", amount: rewardCoins, meta: { hsk, score }, date: todayKey() }) : current.coinHistory
  });
}

async function completeWriting({ level = 'hsk1', writingId = '', title = '' } = {}) {
  const current = getCurrentStats();
  const key = `${String(level || 'hsk1').toLowerCase()}-${writingId || todayKey()}`;
  const writingCompleted = { ...(current.writingCompleted || {}) };
  const first = !writingCompleted[key];
  writingCompleted[key] = true;
  const reward = first ? 3 : 0;
  const item = { id: `writing-${key}`, reason: 'writing-complete', amount: reward, meta: { level, writingId, title }, date: todayKey() };
  return saveUserStats({
    writingCompleted,
    coins: Number(current.coins || 0) + reward,
    totalCoinsEarned: Number(current.totalCoinsEarned || 0) + reward,
    coinHistory: reward ? appendCoinHistory(current, item) : current.coinHistory
  });
}

async function dailyCheckIn() {
  const current = getCurrentStats();
  const today = todayKey();
  if (current.lastCheckInDate === today) {
    showToast('Hôm nay bạn đã điểm danh rồi.');
    return current;
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
  const streak = current.lastCheckInDate === yesterdayKey ? Number(current.checkInStreak || 0) + 1 : 1;
  let reward = 5;
  if (streak % 30 === 0) reward += 50;
  else if (streak % 7 === 0) reward += 15;
  else if (streak % 3 === 0) reward += 5;
  const item = { id: `checkin-${today}`, reason: 'daily-check-in', amount: reward, meta: { streak }, date: today };
  return saveUserStats({
    coins: Number(current.coins || 0) + reward,
    totalCoinsEarned: Number(current.totalCoinsEarned || 0) + reward,
    lastCheckInDate: today,
    checkInStreak: streak,
    streak: Math.max(Number(current.streak || 0), streak),
    coinHistory: appendCoinHistory(current, item)
  });
}

async function unlockLessonWithCoins({ level = 'hsk1', lessonId = 1, coinCost = 0 } = {}) {
  if (!auth.currentUser) throw new Error('Vui lòng đăng nhập để mở bài bằng xu.');
  const normalizedLevel = String(level || 'hsk1').toLowerCase();
  const id = String(Number(lessonId) || 1);
  const cost = Math.max(0, Number(coinCost) || 0);
  let updatedStats = null;
  await runTransaction(db, async (transaction) => {
    const ref = userStatsDocRef(auth.currentUser.uid);
    const snap = await transaction.get(ref);
    const current = normalizeStats(snap.exists() ? snap.data() : currentStats);
    const opened = Array.isArray(current.unlockedLessons?.[normalizedLevel]) ? current.unlockedLessons[normalizedLevel].map(String) : [];
    if (opened.includes(id)) { updatedStats = current; return; }
    if (Number(current.coins || 0) < cost) throw new Error('Bạn chưa đủ xu.');
    const nextOpened = [...opened, id];
    const unlockedLessons = { ...(current.unlockedLessons || {}), [normalizedLevel]: nextOpened };
    const historyItem = { id: `unlock-${normalizedLevel}-${id}`, reason: 'unlock-lesson', amount: -cost, meta: { level: normalizedLevel, lessonId: id }, date: todayKey() };
    updatedStats = normalizeStats({
      ...current,
      coins: Math.max(0, Number(current.coins || 0) - cost),
      unlockedLessons,
      coinHistory: appendCoinHistory(current, historyItem)
    });
    transaction.set(ref, { ...updatedStats, updatedAt: serverTimestamp() }, { merge: true });
  });
  currentStats = normalizeStats(updatedStats || currentStats);
  writeCachedUserStats(auth.currentUser.uid, currentStats);
  syncStatsUI(currentStats);
  return currentStats;
}

async function migrateLocalProgressToCurrentUser() {
  if (!auth.currentUser) return getCurrentStats();
  const local = readLocalProgress();
  if (!local) return getCurrentStats();
  const merged = mergeLocalIntoRemote(currentStats);
  currentStats = normalizeStats(merged);
  localStorage.removeItem(LOCAL_PROGRESS_KEY);
  return saveUserStats(currentStats);
}

async function getUserData(key, fallback = null) {
  if (!auth.currentUser) return fallback;
  const snap = await getDoc(doc(db, "users", auth.currentUser.uid, "private", key));
  return snap.exists() ? snap.data() : fallback;
}

async function saveUserData(key, data) {
  if (!auth.currentUser) return false;
  await setDoc(doc(db, "users", auth.currentUser.uid, "private", key), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return true;
}

function setText(selector, value, root = document) {
  root.querySelectorAll(selector).forEach((el) => { el.textContent = value; });
}

function setValue(selector, value) {
  document.querySelectorAll(selector).forEach((el) => { el.value = value; });
}

function updateHeaderUser(user, stats) {
  const headerActions = document.querySelector(".header__actions");
  const loginBtn = document.getElementById("loginBtn") || document.getElementById("headerLoginBtn");
  const loginBtnMobile = document.getElementById("loginBtnMobile") || document.getElementById("mobileLoginBtn");
  let userBox = document.getElementById("firebaseUserBox");
  if (user && headerActions) {
    if (!userBox) {
      userBox = document.createElement("a");
      userBox.id = "firebaseUserBox";
      userBox.href = "profile.html";
      userBox.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0;color:var(--charcoal,#2d2d2d);font-size:13px;font-weight:700;text-decoration:none;";
      headerActions.insertBefore(userBox, loginBtn || headerActions.firstChild);
    }
    const name = user.displayName || user.email || "Tài khoản";
    userBox.innerHTML = `${user.photoURL ? `<img src="${user.photoURL}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">` : `<span style="width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--orange-xlight,#fff0df);">👤</span>`}<span style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>`;
    if (loginBtn) loginBtn.textContent = "Đăng xuất";
    if (loginBtnMobile) loginBtnMobile.textContent = "Đăng xuất";
  } else {
    userBox?.remove();
    if (loginBtn) loginBtn.textContent = "Đăng nhập";
    if (loginBtnMobile) loginBtnMobile.textContent = "Đăng nhập";
  }
  setText(".streak-badge__count", user ? stats.streak : 0);
}

function syncHomeCounters(stats, isLoggedIn) {
  const data = isLoggedIn ? stats : normalizeStats(readLocalProgress() || DEFAULT_STATS);
  setText('[data-progress="streak"]', data.streak);
  setText('[data-progress="xp"]', formatNumber(data.xp));
  setText('[data-progress="level"]', data.currentLevel || data.level || "HSK 1");
  setText('[data-progress="completedLessons"]', data.completedLessons);
}


function syncAdminProfileButton(user) {
  const old = document.getElementById("adminSuperProfileBtn");
  old?.remove();
  if (!user || user.email !== ADMIN_EMAIL) return;
  const host = document.querySelector(".profile-hero__badges") || document.querySelector(".profile-hero__info");
  if (!host) return;
  const link = document.createElement("a");
  link.id = "adminSuperProfileBtn";
  link.href = "admin-super.html";
  link.className = "admin-open-btn";
  link.innerHTML = "🛡️ Quản trị Admin";
  host.appendChild(link);
}

function syncProfile(user, stats) {
  const authPage = document.getElementById("authPage");
  const profilePage = document.getElementById("profilePage");
  if (!authPage || !profilePage) return;
  if (!user) {
    authPage.style.display = "flex";
    profilePage.classList.remove("show");
    return;
  }
  authPage.style.display = "none";
  profilePage.classList.add("show");
  const displayName = user.displayName || user.email || "Học viên";
  const email = user.email || "";
  const heroAvatar = document.getElementById("heroAvatar");
  setText("#heroName", displayName);
  setText("#heroMeta", email ? `${email} · UID: ${user.uid.slice(0, 8)}` : `UID: ${user.uid.slice(0, 8)}`);
  setValue("#settingName", displayName);
  setText("#settingEmailDisplay", email);
  if (heroAvatar) {
    heroAvatar.innerHTML = user.photoURL ? `<img src="${user.photoURL}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : "👤";
  }
  setText("#profileStatStreak", formatNumber(stats.streak));
  setText("#profileStatXp", formatNumber(stats.xp));
  setText("#profileStatLessons", formatNumber(stats.completedLessons));
  setText("#profileStatCoins", formatNumber(stats.coins));
  setText("#profileStatTotalCoins", formatNumber(stats.totalCoinsEarned));
  setText("#achievementLessons", formatNumber(stats.completedLessons));
  setText("#achievementXp", formatNumber(stats.xp));
  setText("#achievementStreak", formatNumber(stats.streak));
  setText("#achievementTotalCoins", formatNumber(stats.totalCoinsEarned));
  const levelLabel = stats.currentLevel || stats.level || "HSK 1";
  const rankLabel = getRankLabel(stats.xp);
  setText("#profileLevelBadge", `🏆 ${levelLabel}`);
  setText("#profileStreakBadge", `🔥 Streak ${formatNumber(stats.streak)}`);
  setText("#profileRankBadge", `⭐ ${rankLabel}`);
  setText("#profileLessonsBadge", `📚 ${formatNumber(stats.completedLessons)} bài học`);
  document.querySelectorAll('[data-progress="coins"], .js-user-coins').forEach((el) => { el.textContent = formatNumber(stats.coins || 0); });
  const xpLabel = document.querySelector(".profile-xp-label");
  if (xpLabel) xpLabel.innerHTML = `<span>${formatNumber(stats.xp)} XP</span><span>Còn ${formatNumber(stats.xpToNext)} XP để lên cấp tiếp theo</span>`;
  const xpFill = document.querySelector(".profile-xp-fill");
  if (xpFill) xpFill.style.width = `${stats.levelPercent}%`;
  if (window.CCSpiritPet?.render) window.CCSpiritPet.render(stats);
  renderProfileHistory(stats.history || []);
  syncAdminProfileButton(user);
}

function renderProfileHistory(history) {
  const historyList = document.getElementById("historyList");
  if (!historyList) return;
  if (!history.length) {
    historyList.innerHTML = `<div class="history-item"><div><strong>Chưa có lịch sử học</strong><div class="history-item__meta">Bắt đầu học để ghi nhận tiến độ theo tài khoản này.</div></div></div>`;
    return;
  }
  historyList.innerHTML = history.map((item) => `<div class="history-item"><div class="history-item__icon">${item.icon || "📘"}</div><div><h4>${item.title || "Hoạt động học"}</h4><div class="history-item__meta">${item.meta || ""}</div></div><div><div class="history-item__xp">+${Number(item.xp || 0)} XP</div><div class="history-item__date">${item.date || ""}</div></div></div>`).join("");
}

function dispatchAuthReady() {
  const detail = { user: currentUser, stats: getCurrentStats(), authReady, authStatus };
  window.dispatchEvent(new CustomEvent("cc:auth-ready", { detail }));
  window.dispatchEvent(new CustomEvent("cc:user-stats", { detail }));
}

function syncStatsUI(stats) {
  updateHeaderUser(currentUser, stats);
  syncHomeCounters(stats, Boolean(currentUser));
  syncProfile(currentUser, stats);
  dispatchAuthReady();
}

function readInput(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el?.value) return el.value;
  }
  return "";
}

function setFormBusy(form, busy) {
  form?.querySelectorAll("button,input,select").forEach((el) => { el.disabled = Boolean(busy); });
}

function bindAuthControls() {
  const loginBtn = document.getElementById("loginBtn") || document.getElementById("headerLoginBtn");
  const loginBtnMobile = document.getElementById("loginBtnMobile") || document.getElementById("mobileLoginBtn");
  const googleLogin = document.getElementById("googleLogin");

  async function loginOrLogout(event) {
    if (!auth.currentUser) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try { await logout(); showToast("Đã đăng xuất."); } catch (error) { showToast(getFriendlyAuthError(error), "error"); }
  }
  loginBtn?.addEventListener("click", loginOrLogout, true);
  loginBtnMobile?.addEventListener("click", loginOrLogout, true);

  googleLogin?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    try { await signInGoogle(); closeModal(); } catch (error) { console.error(error); if (!error?.handled) showToast(getFriendlyAuthError(error), "error"); }
  }, true);

  document.getElementById("loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const form = event.currentTarget;
    setFormBusy(form, true);
    try {
      await signInEmail(readInput("emailInput", "loginEmail"), readInput("passwordInput", "loginPwd", "loginPassword"));
      closeModal();
    } catch (error) {
      console.error(error);
      showToast(getFriendlyAuthError(error), "error");
    } finally { setFormBusy(form, false); }
  }, true);

  document.getElementById("loginFormPage")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const form = event.currentTarget;
    setFormBusy(form, true);
    try {
      await signInEmail(readInput("loginEmail", "emailInput"), readInput("loginPwd", "loginPassword", "passwordInput"));
      showToast("Đăng nhập thành công.");
    } catch (error) {
      console.error(error);
      showToast(getFriendlyAuthError(error), "error");
    } finally { setFormBusy(form, false); }
  }, true);

  document.getElementById("registerFormPage")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const form = event.currentTarget;
    const dailyGoal = form.querySelector('input[name="regGoal"]:checked, input[name="goal"]:checked')?.value || readInput("dailyGoal") || DEFAULT_STATS.dailyGoal;
    setFormBusy(form, true);
    try {
      await registerEmail(readInput("regEmail"), readInput("regPwd", "regPassword"), readInput("regName"), dailyGoal);
      showToast("Đăng ký thành công.");
    } catch (error) {
      console.error(error);
      showToast(getFriendlyAuthError(error), "error");
    } finally { setFormBusy(form, false); }
  }, true);

  window.oauthLogin = async (providerName) => {
    if (providerName !== "google") {
      showToast("Hiện chỉ bật đăng nhập Google.", "error");
      return;
    }
    try { await signInGoogle(); } catch (error) { console.error(error); if (!error?.handled) showToast(getFriendlyAuthError(error), "error"); }
  };

  window.doLogout = async () => {
    try { await logout(); showToast("Đã đăng xuất."); } catch (error) { console.error(error); showToast(getFriendlyAuthError(error), "error"); }
  };

  window.saveName = async () => {
    if (!auth.currentUser) return showToast("Vui lòng đăng nhập trước.", "error");
    const newName = document.getElementById("settingName")?.value?.trim();
    if (!newName) return showToast("Tên hiển thị không được để trống.", "error");
    try {
      await updateProfile(auth.currentUser, { displayName: newName });
      await setDoc(userDocRef(auth.currentUser.uid), { displayName: newName, updatedAt: serverTimestamp() }, { merge: true });
      currentUser = auth.currentUser;
      syncStatsUI(currentStats);
      showToast("Đã lưu tên hiển thị.");
    } catch (error) { console.error(error); showToast(getFriendlyAuthError(error), "error"); }
  };

  window.resetPassword = async () => {
    const email = readInput("loginEmail", "emailInput");
    if (!email) return showToast("Nhập email trước khi đặt lại mật khẩu.", "error");
    try { await resetPassword(email); showToast("Đã gửi email đặt lại mật khẩu."); } catch (error) { console.error(error); showToast(getFriendlyAuthError(error), "error"); }
  };
}

window.CCFirebase = {
  auth,
  db,
  signInGoogle,
  signInEmail,
  registerEmail,
  resetPassword,
  logout,
  isDisallowedEmbeddedBrowser,
  isEmbeddedFrame,
  canUseRedirectAuth,
  showOpenInBrowserHelp,
  showRedirectStorageHelp,
  showToast,
  ensureUserData,
  saveUserStats,
  completeLesson,
  completeTranslationChallenge,
  addCoins,
  completeWriting,
  dailyCheckIn,
  unlockLessonWithCoins,
  migrateLocalProgressToCurrentUser,
  getCurrentStats,
  getCurrentUser,
  getUserData,
  saveUserData,
  isAuthReady: () => authReady,
  authReady: authReadyPromise,
  getAuthStatus: () => authStatus,
  DEFAULT_STATS: structuredCloneSafe(DEFAULT_STATS)
};

bindAuthControls();
const bootCachedUser = readCachedUser();
if (bootCachedUser?.uid) {
  currentUser = bootCachedUser;
  currentStats = normalizeStats(readCachedUserStats(bootCachedUser.uid) || DEFAULT_STATS);
  syncStatsUI(currentStats);
} else {
  currentStats = normalizeStats(readLocalProgress() || DEFAULT_STATS);
  syncStatsUI(currentStats);
}
window.dispatchEvent(new Event("firebase-ready"));

getRedirectResult(auth)
  .then((result) => {
    if (result?.user) console.info("[firebase-auth] Google redirect completed", result.user.uid);
  })
  .catch((error) => {
    console.error("[firebase-auth] Google redirect failed", error);
    authStatus = "redirect-error";
    hideAuthLoading();
    showToast(getFriendlyAuthError(error), "error");
  });

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  authReady = true;
  authStatus = user ? "signed-in-loading-data" : "signed-out";

  if (!user) {
    currentStats = normalizeStats(readLocalProgress() || DEFAULT_STATS);
    localStorage.removeItem("cc_user");
    hideAuthLoading();
    syncStatsUI(currentStats);
    resolveAuthReady?.({ user: null, stats: currentStats, authStatus });
    return;
  }

  // Có user là đăng nhập đã thành công: render ngay bằng cache để mobile không bị quay lại màn hình login.
  const cachedStats = readCachedUserStats(user.uid);
  currentStats = normalizeStats(cachedStats || DEFAULT_STATS);
  writeCachedUser(user);
  syncStatsUI(currentStats);

  try {
    currentStats = await ensureUserData(user);
    authStatus = "signed-in";
    syncStatsUI(currentStats);
  } catch (error) {
    console.error("[firebase-auth] Không tải được dữ liệu người dùng", error);
    authStatus = "signed-in-data-error";
    currentStats = normalizeStats(readCachedUserStats(user.uid) || currentStats || DEFAULT_STATS);
    syncStatsUI(currentStats);
    const code = error?.code ? ` (${error.code})` : "";
    showToast(`Không tải được dữ liệu người dùng từ Firebase${code}. Kiểm tra Firestore Rules / mạng.`, "error");
  } finally {
    hideAuthLoading();
    resolveAuthReady?.({ user: currentUser, stats: currentStats, authStatus });
  }
});
