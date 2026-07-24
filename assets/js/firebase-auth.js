import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  FacebookAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  deleteUser
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import "./home-fabs.js";
import {
  getVipState,
  isVipActive,
  applyVipState,
  renderVipAvatar,
  syncVipCard,
  openVipPurchaseModal,
  getVipStatusLabel
} from "./vip-user.js";

const FIREBASE_HOSTING_AUTH_DOMAIN = "tiengtrungcoca.firebaseapp.com";
const PRODUCTION_AUTH_PROXY_HOSTS = new Set(["tiengtrungcoca.vercel.app"]);
const currentHostname = window.location.hostname.toLowerCase();
const usesSameOriginAuthProxy = PRODUCTION_AUTH_PROXY_HOSTS.has(currentHostname);

const firebaseConfig = {
  apiKey: "AIzaSyDoTP-Rw5Jb-wYJPbmwiTLwkcjIpdM_bLA",
  // Production dùng reverse proxy /__/auth/* trên cùng origin để redirect
  // không phụ thuộc third-party storage. Localhost vẫn dùng Firebase Hosting.
  authDomain: usesSameOriginAuthProxy ? currentHostname : FIREBASE_HOSTING_AUTH_DOMAIN,
  projectId: "tiengtrungcoca",
  storageBucket: "tiengtrungcoca.firebasestorage.app",
  messagingSenderId: "216281367513",
  appId: "1:216281367513:web:97cfffea1f595c997b8fc8",
  measurementId: "G-S8ZM43HKX1"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
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
  placementStats: {
    status: "not_started",
    attempts: 0,
    completedAttempts: 0,
    activeAttemptId: "",
    latestAttemptId: "",
    estimatedHskLevel: null,
    estimatedRange: [],
    confidence: "",
    skillEstimates: {},
    completedAt: "",
    methodologyVersion: ""
  },
  coinHistory: [],
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
let authStatus = "loading";
let authStep = "initializing";
let cachedDisplayUser = null;
let latestVipVerification = { uid: null, verified: false, checkedAt: 0, state: getVipState({}) };
let persistenceInitializationError = null;
let redirectCheckComplete = false;
let completedUid = null;
let completingUid = null;
let completingUserPromise = null;
let resolveAuthReady;
const authReadyPromise = new Promise((resolve) => {
  resolveAuthReady = resolve;
});
const authInitializationPromise = initializeAuthentication();

window.authReady = authReadyPromise;
window.CCAuthState = Object.freeze({
  ready: authReadyPromise,
  get status() { return authStatus; },
  get user() { return currentUser; }
});

async function initializeAuthentication() {
  try {
    await setPersistence(auth, browserLocalPersistence);
    console.info("[firebase-auth] Local persistence ready", {
      authDomain: firebaseConfig.authDomain,
      sameOriginProxy: usesSameOriginAuthProxy
    });
  } catch (error) {
    persistenceInitializationError = error;
    logAuthError(error, { flow: "initialization", step: "set-persistence" });
  }
  return { persistenceError: persistenceInitializationError };
}

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
  normalized.challengeStats = normalized.challengeStats && typeof normalized.challengeStats === "object" && !Array.isArray(normalized.challengeStats) ? normalized.challengeStats : structuredCloneSafe(DEFAULT_STATS.challengeStats);
  normalized.placementStats = normalized.placementStats && typeof normalized.placementStats === "object" && !Array.isArray(normalized.placementStats)
    ? deepMerge(DEFAULT_STATS.placementStats, normalized.placementStats)
    : structuredCloneSafe(DEFAULT_STATS.placementStats);
  normalized.coinHistory = Array.isArray(normalized.coinHistory) ? normalized.coinHistory.slice(0, 80) : [];
  // VIP là trường đặc quyền do Super Admin quản lý. Không tự thêm giá trị mặc định
  // vào stats của user thường, nếu không mọi lần lưu tiến độ sẽ chạm trường bảo vệ.
  if (Object.prototype.hasOwnProperty.call(raw || {}, "isVip")) normalized.isVip = raw.isVip === true;
  else delete normalized.isVip;
  if (Object.prototype.hasOwnProperty.call(raw || {}, "vipUntil")) normalized.vipUntil = raw.vipUntil;
  else delete normalized.vipUntil;
  if (Object.prototype.hasOwnProperty.call(raw || {}, "vipPlan")) normalized.vipPlan = raw.vipPlan ?? null;
  else delete normalized.vipPlan;
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


const PROGRESS_STATS_FIELDS = new Set([
  "xp", "coins", "totalCoinsEarned",
  "unlockedLessons", "writingCompleted", "challengeStats", "coinHistory",
  "checkInStreak", "lastCheckInDate", "streak",
  "completedLessons", "completedLessonIds",
  "currentLevel", "currentLesson", "courses", "tasks", "history",
  "dailyGoal", "todayXp", "weeklyLessons", "lastXp", "studyHours",
  "levelPercent", "xpToNext", "createdAt", "updatedAt"
]);

function progressStatsForWrite(stats = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(stats || {})) {
    if (PROGRESS_STATS_FIELDS.has(key) && value !== undefined) clean[key] = value;
  }
  return clean;
}

function applyCanonicalVipFields(stats = {}, remoteStats = {}) {
  const next = { ...stats };
  for (const key of ["isVip", "vipUntil", "vipPlan"]) delete next[key];
  for (const key of ["isVip", "vipUntil", "vipPlan"]) {
    if (Object.prototype.hasOwnProperty.call(remoteStats || {}, key)) next[key] = remoteStats[key];
  }
  return normalizeStats(next);
}

function getVerifiedVipPresentationStats(stats = currentStats) {
  const user = auth.currentUser;
  const verified = Boolean(user?.uid
    && latestVipVerification.verified
    && latestVipVerification.uid === user.uid
    && latestVipVerification.state?.active);
  if (verified) return stats;
  return { ...stats, isVip: false, vipUntil: null, vipPlan: null };
}

async function refreshVipAccessFromServer({ syncUi = true } = {}) {
  const user = auth.currentUser;
  if (!user?.uid) {
    latestVipVerification = { uid: null, verified: true, checkedAt: Date.now(), state: getVipState({}) };
    return { user: null, stats: getCurrentStats(), state: latestVipVerification.state, verified: true, reason: "signed-out" };
  }

  try {
    const snap = await getDocFromServer(userStatsDocRef(user.uid));
    const remoteStats = snap.exists() ? snap.data() : {};
    currentStats = applyCanonicalVipFields(currentStats, remoteStats);
    const state = getVipState(remoteStats);
    latestVipVerification = { uid: user.uid, verified: true, checkedAt: Date.now(), state };
    if (syncUi) syncStatsUI(currentStats);
    return { user, stats: getCurrentStats(), state, verified: true, reason: state.active ? "active" : state.expired ? "expired" : "inactive" };
  } catch (error) {
    latestVipVerification = { uid: user.uid, verified: false, checkedAt: Date.now(), state: getVipState({}), error };
    if (syncUi) syncStatsUI(currentStats);
    return { user, stats: getCurrentStats(), state: latestVipVerification.state, verified: false, reason: "unavailable", error };
  }
}

async function getFreshVipAccess(options = {}) {
  await authReadyPromise;
  return refreshVipAccessFromServer(options);
}

function publicUserData(user) {
  return {
    uid: user.uid,
    displayName: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || ""
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

function getAuthErrorHost() {
  return document.querySelector("#authPage .auth-panel.active")
    || document.querySelector("#loginModal .modal-auth-panel.active")
    || document.querySelector("#loginModal .modal")
    || null;
}

function clearPreviousAuthError() {
  document.getElementById("ccAuthError")?.remove();
}

function showAuthError(errorOrMessage) {
  const message = typeof errorOrMessage === "string"
    ? errorOrMessage
    : getFriendlyAuthError(errorOrMessage);
  clearPreviousAuthError();
  const host = getAuthErrorHost();
  if (host) {
    const errorBox = document.createElement("p");
    errorBox.id = "ccAuthError";
    errorBox.setAttribute("role", "alert");
    errorBox.style.cssText = "margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#fff1f0;color:#b42318;font-size:13px;font-weight:600;line-height:1.45;";
    errorBox.textContent = message;
    host.appendChild(errorBox);
  }
  showToast(message, "error");
}

function logAuthError(error, context = {}) {
  const pending = readPendingGoogleLoginState();
  console.error("[firebase-auth] Google/Auth error", {
    code: error?.code || "unknown",
    message: error?.message || String(error || "Unknown auth error"),
    origin: window.location.origin,
    authDomain: firebaseConfig.authDomain,
    sameOriginAuthProxy: usesSameOriginAuthProxy,
    pathname: window.location.pathname,
    flow: context.flow || "unknown",
    step: context.step || authStatus,
    redirectPending: Boolean(pending)
  });
}

function dispatchAuthError(error, context = {}) {
  window.dispatchEvent(new CustomEvent("cc-auth-error", {
    detail: {
      code: error?.code || "unknown",
      message: getFriendlyAuthError(error),
      flow: context.flow || "unknown",
      step: context.step || authStatus
    }
  }));
}

function setAuthStatus(nextStatus) {
  authStep = nextStatus;
  authStatus = nextStatus === "authenticated"
    ? "authenticated"
    : ["unauthenticated", "signed-out"].includes(nextStatus)
      ? "unauthenticated"
      : "loading";
  document.documentElement.dataset.authState = authStatus;
  renderAuthDebugPanel();
}

function renderAuthDebugPanel(extra = {}) {
  const enabled = new URLSearchParams(window.location.search).get("authDebug") === "1";
  document.getElementById("ccAuthDebug")?.remove();
  if (!enabled) return;
  const pending = readPendingGoogleLoginState();
  const panel = document.createElement("pre");
  panel.id = "ccAuthDebug";
  panel.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:100000;max-width:min(430px,calc(100vw - 16px));max-height:42vh;overflow:auto;margin:0;padding:10px;border-radius:10px;background:rgba(20,20,20,.94);color:#d6ffd6;font:11px/1.45 Consolas,monospace;white-space:pre-wrap;";
  panel.textContent = JSON.stringify({
    origin: window.location.origin,
    userAgent: (navigator.userAgent || "").slice(0, 140),
    redirectLogin: shouldUseRedirectLogin(),
    authStatus,
    redirectPending: Boolean(pending),
    redirectResult: extra.redirectResult || "unknown",
    currentUid: currentUser?.uid || null,
    step: extra.step || authStep
  }, null, 2);
  document.body.appendChild(panel);
}

function getFriendlyAuthError(error) {
  const code = error?.code || "";
  const map = {
    "auth/invalid-email": "Email không hợp lệ.",
    "auth/user-disabled": "Tài khoản này đã bị vô hiệu hóa.",
    "auth/user-not-found": "Không tìm thấy tài khoản với email này.",
    "auth/wrong-password": "Mật khẩu không đúng.",
    "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
    "auth/requires-recent-login": "Vui lòng đăng nhập lại để xác nhận thao tác này.",
    "auth/email-already-in-use": "Email này đã được đăng ký.",
    "auth/weak-password": "Mật khẩu cần ít nhất 6 ký tự.",
    "auth/popup-closed-by-user": "Bạn đã đóng cửa sổ đăng nhập.",
    "auth/popup-blocked": "Trình duyệt đang chặn popup đăng nhập.",
    "auth/unauthorized-domain": "Domain hiện tại chưa được thêm vào Firebase Authorized domains.",
    "auth/operation-not-allowed": "Phương thức đăng nhập này chưa được bật trong Firebase Console.",
    "auth/operation-not-supported-in-this-environment": "Trình duyệt hiện tại không hỗ trợ phương thức đăng nhập này.",
    "auth/network-request-failed": "Kết nối mạng không ổn định. Vui lòng thử lại.",
    "auth/account-exists-with-different-credential": "Email này đã được đăng ký bằng Google hoặc Email. Hãy đăng nhập bằng phương thức cũ trước.",
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
  const inlineStatus = document.getElementById("authInitializingStatus");
  if (inlineStatus) {
    inlineStatus.textContent = message;
    if (!cachedDisplayUser && !currentUser) document.getElementById("authInitializing")?.removeAttribute("hidden");
    return;
  }
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

const GOOGLE_OAUTH_PENDING_KEY = "cc_google_oauth_pending";
const GOOGLE_OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;

function getPostLoginUrl() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("return") || params.get("next") || params.get("redirect");
  if (next) {
    try {
      const url = new URL(next, window.location.origin);
      if (url.origin === window.location.origin) return url.href;
    } catch (_) {}
  }
  if (window.location.pathname.endsWith("/profile.html")) return "";
  return "";
}

function getDefaultProfileUrl() {
  return new URL("profile.html", window.location.href).href;
}

function getGoogleReturnUrl() {
  return getPostLoginUrl() || getDefaultProfileUrl();
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

function savePendingGoogleLoginState(returnUrl = getGoogleReturnUrl()) {
  const safeReturnUrl = getSafeRedirectUrl(returnUrl, getDefaultProfileUrl());
  const pendingState = {
    provider: "google",
    pending: true,
    startedAt: Date.now(),
    returnUrl: safeReturnUrl
  };
  try {
    sessionStorage.setItem(GOOGLE_OAUTH_PENDING_KEY, JSON.stringify(pendingState));
    return pendingState;
  } catch (error) {
    logAuthError(error, { flow: "redirect", step: "save-pending-state" });
    return null;
  }
}

function clearPendingGoogleLoginState() {
  try { sessionStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY); } catch (_) {}
}

function readPendingGoogleLoginState() {
  let parsed;
  try {
    parsed = JSON.parse(sessionStorage.getItem(GOOGLE_OAUTH_PENDING_KEY) || "null");
  } catch (_) {
    clearPendingGoogleLoginState();
    return null;
  }
  const startedAt = Number(parsed?.startedAt);
  const valid = parsed?.provider === "google"
    && parsed?.pending === true
    && Number.isFinite(startedAt)
    && Date.now() - startedAt >= 0
    && Date.now() - startedAt <= GOOGLE_OAUTH_PENDING_TTL_MS;
  if (!valid) {
    clearPendingGoogleLoginState();
    return null;
  }
  const returnUrl = getSafeRedirectUrl(parsed.returnUrl, "");
  if (!returnUrl) {
    clearPendingGoogleLoginState();
    return null;
  }
  return { ...parsed, returnUrl };
}

function navigateAfterGoogleLogin(returnUrl = "") {
  const target = getSafeRedirectUrl(returnUrl, getDefaultProfileUrl());
  clearPendingGoogleLoginState();
  if (target !== window.location.href) window.location.replace(target);
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

function isPlainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readValidCachedUser(uid) {
  const cachedUser = readCachedUser();
  return isPlainRecord(cachedUser) && cachedUser.uid === uid ? cachedUser : null;
}

function readValidCachedUserStats(uid) {
  const cachedStats = readCachedUserStats(uid);
  if (!isPlainRecord(cachedStats)) return null;
  const numericFields = ["xp", "coins", "streak", "completedLessons"];
  const hasValidNumbers = numericFields.every((key) => Number.isFinite(Number(cachedStats[key])));
  return hasValidNumbers && isPlainRecord(cachedStats.currentLesson) ? cachedStats : null;
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
  const existingPublicData = publicSnap.exists() ? publicSnap.data() : null;
  const legacyProgress = existingPublicData?.progress || null;
  const savedStats = statsSnap.exists() ? statsSnap.data() : {};
  // Không tự merge cc_local_progress vào tài khoản mới để tránh tài khoản vừa đăng nhập đã nhận dữ liệu rác/demo từ máy.
  // Legacy users vẫn được migrate từ users/{uid}.progress nếu từng có dữ liệu cũ trên chính tài khoản đó.
  const mergedStats = normalizeStats(deepMerge(legacyProgress || {}, savedStats || {}));
  const desiredPublicData = publicUserData(user);
  const writes = [];

  if (!publicSnap.exists()) {
    writes.push(setDoc(publicRef, {
      ...desiredPublicData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true }));
  } else {
    const changedProfileFields = {};
    for (const key of ["displayName", "email", "photoURL"]) {
      if ((existingPublicData?.[key] || "") !== desiredPublicData[key]) {
        changedProfileFields[key] = desiredPublicData[key];
      }
    }
    if (Object.keys(changedProfileFields).length) {
      writes.push(setDoc(publicRef, {
        ...changedProfileFields,
        updatedAt: serverTimestamp()
      }, { merge: true }));
    }
  }

  if (!statsSnap.exists()) {
    writes.push(setDoc(statsRef, {
      ...progressStatsForWrite(mergedStats),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true }));
  }

  if (writes.length) await Promise.all(writes);

  writeCachedUser(user);
  writeCachedUserStats(user.uid, mergedStats);
  return mergedStats;
}

function dispatchUserDataReady(user, stats, source) {
  window.dispatchEvent(new CustomEvent("cc-user-data-ready", {
    detail: { user, stats: structuredCloneSafe(stats), source }
  }));
}

async function completeGoogleLogin(user, context = {}) {
  if (!user?.uid) {
    const error = new Error("Firebase không trả về người dùng hợp lệ.");
    error.code = "auth/invalid-user";
    throw error;
  }

  currentUser = user;
  const source = context.source || "unknown";
  const loginWasAlreadyInProgress = authStep === "signing-in";
  const cachedUser = readValidCachedUser(user.uid);
  const cachedStats = readValidCachedUserStats(user.uid);
  const hasValidUidCache = Boolean(cachedUser && cachedStats);
  const pendingGoogleLogin = readPendingGoogleLoginState();
  const overlaySources = new Set(["popup", "redirect", "redirect-observer"]);
  const shouldShowFullPageLoading = overlaySources.has(source)
    || loginWasAlreadyInProgress
    || Boolean(pendingGoogleLogin)
    || !hasValidUidCache;

  setAuthStatus("loading-user-data");
  if (shouldShowFullPageLoading) showAuthLoading("Đang tải dữ liệu tài khoản...");

  currentStats = normalizeStats(cachedStats || DEFAULT_STATS);
  writeCachedUser(user);
  syncStatsUI(currentStats);

  try {
    const loadedStats = await ensureUserData(user);
    if (auth.currentUser?.uid !== user.uid) {
      try {
        localStorage.removeItem("cc_user");
        localStorage.removeItem(userStatsCacheKey(user.uid));
      } catch (_) {}
      return { user: null, stats: normalizeStats(DEFAULT_STATS), dataError: null, cancelled: true };
    }
    currentStats = loadedStats;
    // Quyền VIP luôn được xác minh lại trực tiếp từ Firestore server. Nếu mất mạng,
    // tiến độ vẫn có thể hiển thị từ cache nhưng mọi tính năng VIP sẽ fail-closed.
    await refreshVipAccessFromServer({ syncUi: false });
    setAuthStatus("authenticated");
    syncStatsUI(currentStats);
    dispatchUserDataReady(user, currentStats, source);
    return { user, stats: currentStats, dataError: null };
  } catch (error) {
    if (auth.currentUser?.uid !== user.uid) {
      return { user: null, stats: normalizeStats(DEFAULT_STATS), dataError: error, cancelled: true };
    }
    // Firestore lỗi không được làm mất phiên Firebase Auth.
    setAuthStatus("authenticated");
    currentStats = normalizeStats(readValidCachedUserStats(user.uid) || currentStats || DEFAULT_STATS);
    syncStatsUI(currentStats);
    logAuthError(error, { flow: source, step: "load-user-data" });
    dispatchAuthError(error, { flow: source, step: "load-user-data" });
    const code = error?.code ? ` (${error.code})` : "";
    showAuthError(`Đã đăng nhập nhưng chưa tải được dữ liệu tài khoản${code}. Vui lòng kiểm tra mạng rồi tải lại trang.`);
    return { user, stats: currentStats, dataError: error };
  } finally {
    if (shouldShowFullPageLoading) hideAuthLoading();
  }
}

async function completeGoogleLoginOnce(user, context = {}) {
  if (!user?.uid) return null;

  let completion;
  if (completingUid === user.uid && completingUserPromise) {
    completion = completingUserPromise;
  } else if (completedUid === user.uid) {
    completion = Promise.resolve({ user, stats: currentStats, dataError: null });
  } else {
    completingUid = user.uid;
    completingUserPromise = completeGoogleLogin(user, context);
    completion = completingUserPromise;
  }

  try {
    const result = await completion;
    completedUid = user.uid;
    if (context.navigate) {
      navigateAfterGoogleLogin(context.returnUrl || readPendingGoogleLoginState()?.returnUrl || getGoogleReturnUrl());
    }
    return result;
  } finally {
    if (completingUid === user.uid) {
      completingUid = null;
      completingUserPromise = null;
    }
  }
}

function shouldUseRedirectLogin() {
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
  const narrowViewport = window.matchMedia?.("(max-width: 900px)")?.matches;
  const touchDevice = Number(navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
  return Boolean(coarsePointer || (touchDevice && narrowViewport));
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

function createGoogleAuthError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function handleGoogleLoginError(error, context = {}) {
  setAuthStatus(currentUser ? "authenticated" : authReady ? "unauthenticated" : "loading");
  hideAuthLoading();
  logAuthError(error, context);
  dispatchAuthError(error, context);
  showAuthError(error);
  error.handled = true;
  return error;
}

async function startGoogleRedirect(returnUrl, source = "redirect") {
  if (!canUseRedirectAuth()) {
    throw createGoogleAuthError(
      "auth/web-storage-unsupported",
      "Trình duyệt không cho phép lưu trạng thái đăng nhập redirect."
    );
  }
  const pending = savePendingGoogleLoginState(returnUrl);
  if (!pending) {
    throw createGoogleAuthError(
      "auth/web-storage-unsupported",
      "Không thể lưu trạng thái đăng nhập Google trên trình duyệt này."
    );
  }
  setAuthStatus("signing-in");
  showAuthLoading("Đang chuyển tới Google...");
  renderAuthDebugPanel({ step: `start-${source}`, redirectResult: "pending" });
  return signInWithRedirect(auth, provider);
}

async function signInGoogle() {
  clearPreviousAuthError();
  const { persistenceError } = await authInitializationPromise;
  if (persistenceError) {
    showAuthError("Trình duyệt không lưu được phiên đăng nhập lâu dài. Hệ thống sẽ thử tiếp tục với chế độ mặc định.");
  }

  if (isDisallowedEmbeddedBrowser()) {
    const error = createGoogleAuthError(
      "auth/disallowed-useragent",
      "Google chặn đăng nhập trong trình duyệt nhúng."
    );
    throw handleGoogleLoginError(error, { flow: "google", step: "embedded-browser-check" });
  }

  const returnUrl = getGoogleReturnUrl();
  if (shouldUseRedirectLogin()) {
    try {
      return await startGoogleRedirect(returnUrl, "mobile-redirect");
    } catch (error) {
      throw handleGoogleLoginError(error, { flow: "redirect", step: "start-mobile-redirect" });
    }
  }

  setAuthStatus("signing-in");
  try {
    const result = await signInWithPopup(auth, provider);
    await completeGoogleLoginOnce(result.user, {
      source: "popup",
      navigate: true,
      returnUrl
    });
    return result;
  } catch (error) {
    const canFallbackToRedirect = [
      "auth/popup-blocked",
      "auth/operation-not-supported-in-this-environment"
    ].includes(error?.code);
    if (canFallbackToRedirect) {
      try {
        return await startGoogleRedirect(returnUrl, "popup-fallback");
      } catch (redirectError) {
        throw handleGoogleLoginError(redirectError, { flow: "redirect", step: "popup-fallback" });
      }
    }
    throw handleGoogleLoginError(error, { flow: "popup", step: "sign-in-popup" });
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
  const uid = auth.currentUser?.uid || readCachedUser()?.uid || "";
  await signOut(auth);
  clearPendingGoogleLoginState();
  try {
    localStorage.removeItem("cc_user");
    if (uid) localStorage.removeItem(userStatsCacheKey(uid));
  } catch (_) {}
}

async function reauthenticateForAccountDeletion(user) {
  const providerIds = user.providerData.map((entry) => entry.providerId);

  if (providerIds.includes("google.com")) {
    return reauthenticateWithPopup(user, provider);
  }

  if (providerIds.includes("facebook.com")) {
    const facebookProvider = new FacebookAuthProvider();
    facebookProvider.addScope("email");
    return reauthenticateWithPopup(user, facebookProvider);
  }

  if (providerIds.includes("password")) {
    const password = window.prompt("Nhập mật khẩu để xác nhận xóa tài khoản:");
    if (!password) {
      const error = new Error("reauthentication_cancelled");
      error.code = "auth/requires-recent-login";
      throw error;
    }
    return reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  }

  const error = new Error("unsupported_account_provider");
  error.code = "auth/operation-not-supported-in-this-environment";
  throw error;
}

function clearDeletedAccountCache(uid) {
  try {
    localStorage.removeItem("cc_user");
    localStorage.removeItem(userStatsCacheKey(uid));
  } catch (_) {}
}

async function deleteCurrentAccount() {
  const user = auth.currentUser;
  if (!user) {
    showToast("Vui lòng đăng nhập trước khi xóa tài khoản.", "error");
    return;
  }

  const confirmation = window.prompt("Thao tác này không thể hoàn tác. Nhập XÓA để tiếp tục:");
  if (!["XÓA", "XOA"].includes(String(confirmation || "").trim().toUpperCase())) return;

  const deleteButton = document.getElementById("deleteAccountBtn");
  if (deleteButton?.disabled) return;
  if (deleteButton) deleteButton.disabled = true;

  try {
    showToast("Đang xác nhận và xóa tài khoản...");
    await reauthenticateForAccountDeletion(user);
    await Promise.all([
      deleteDoc(userStatsDocRef(user.uid)),
      deleteDoc(userDocRef(user.uid))
    ]);
    await deleteUser(user);
    clearDeletedAccountCache(user.uid);
    showToast("Tài khoản và dữ liệu học đã được xóa.");
    window.location.replace("index.html");
  } catch (error) {
    console.error("[firebase-auth] Không thể xóa tài khoản", error);
    showToast(getFriendlyAuthError(error), "error");
  } finally {
    if (deleteButton) deleteButton.disabled = false;
  }
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
    ...progressStatsForWrite(currentStats),
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
  const totals = { hsk1: 15, hsk2: 15, hsk3: 20, hsk4: 20, hsk5: 36, hsk6: 40 };
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
    transaction.set(ref, { ...progressStatsForWrite(updatedStats), updatedAt: serverTimestamp() }, { merge: true });
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
  const mobileNavInner = document.querySelector(".mobile-nav__inner");
  const loginBtn = document.getElementById("loginBtn") || document.getElementById("headerLoginBtn");
  const loginBtnMobile = document.getElementById("loginBtnMobile") || document.getElementById("mobileLoginBtn");
  let userBox = document.getElementById("firebaseUserBox");
  let mobileProfileLink = document.getElementById("firebaseMobileProfileLink");
  if (mobileNavInner && !mobileProfileLink) {
    mobileProfileLink = document.createElement("a");
    mobileProfileLink.id = "firebaseMobileProfileLink";
    mobileProfileLink.className = "mobile-profile-link";
    mobileProfileLink.href = "profile.html";
    const divider = mobileNavInner.querySelector(".mobile-nav__divider");
    mobileNavInner.insertBefore(mobileProfileLink, divider || loginBtnMobile || null);
  }
  if (mobileProfileLink) {
    mobileProfileLink.innerHTML = user ? "<span aria-hidden=\"true\">👤</span><span>Trang cá nhân</span>" : "<span aria-hidden=\"true\">👤</span><span>Đăng nhập / Profile</span>";
    mobileProfileLink.setAttribute("aria-label", user ? "Mở trang cá nhân" : "Mở trang đăng nhập và Profile");
  }
  if (user && headerActions) {
    if (!userBox) {
      userBox = document.createElement("a");
      userBox.id = "firebaseUserBox";
      userBox.href = "profile.html";
      userBox.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0;color:var(--charcoal,#2d2d2d);font-size:13px;font-weight:700;text-decoration:none;";
      headerActions.insertBefore(userBox, loginBtn || headerActions.firstChild);
    }
    const name = user.displayName || user.email || "Tài khoản";
    userBox.replaceChildren();
    const avatar = document.createElement("span");
    renderVipAvatar(avatar, user, stats, { size: "header" });
    const nameLabel = document.createElement("span");
    nameLabel.style.cssText = "max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    nameLabel.textContent = name;
    userBox.append(avatar, nameLabel);
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
  const data = isLoggedIn ? stats : normalizeStats(DEFAULT_STATS);
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
  const initializingPage = document.getElementById("authInitializing");
  if (!authPage || !profilePage) return;
  const avatarShell = document.querySelector(".profile-avatar");
  const profileInfoCard = document.querySelector(".profile-hero__info");
  if (authStatus === "loading" && !user) {
    authPage.style.display = "none";
    profilePage.classList.remove("show");
    if (initializingPage) initializingPage.hidden = false;
    return;
  }
  if (!user) {
    if (initializingPage) initializingPage.hidden = true;
    authPage.style.display = "flex";
    profilePage.classList.remove("show");
    applyVipState(avatarShell, {});
    syncVipCard(profileInfoCard, {});
    return;
  }
  if (initializingPage) initializingPage.hidden = true;
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
    heroAvatar.replaceChildren();
    const photoURL = typeof user.photoURL === "string" ? user.photoURL.trim() : "";
    if (photoURL) {
      const image = document.createElement("img");
      image.alt = "";
      image.style.cssText = "width:100%;height:100%;border-radius:50%;object-fit:cover;";
      image.addEventListener("error", () => { heroAvatar.textContent = "👤"; }, { once: true });
      image.src = photoURL;
      heroAvatar.appendChild(image);
    } else {
      heroAvatar.textContent = "👤";
    }
  }
  applyVipState(avatarShell, stats);
  syncVipCard(profileInfoCard, stats);
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
  if (isVipActive(stats) && window.CCSpiritPet?.render) window.CCSpiritPet.render(stats);
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

function dispatchAuthStateChanged(source = "observer") {
  window.dispatchEvent(new CustomEvent("cc-auth-state-changed", {
    detail: { user: currentUser, authStatus, source }
  }));
}

function finalizeInitialAuthState() {
  if (authReady) return;
  authReady = true;
  const detail = { user: currentUser, stats: getCurrentStats(), authStatus };
  resolveAuthReady?.(detail);
  resolveAuthReady = null;
  dispatchAuthStateChanged("initialization");
  dispatchAuthReady();
}

function clearSignedOutCache() {
  const cachedUser = readCachedUser();
  try {
    localStorage.removeItem("cc_user");
    if (cachedUser?.uid) localStorage.removeItem(userStatsCacheKey(cachedUser.uid));
  } catch (_) {}
}

function handleConfirmedSignedOut(source = "observer") {
  currentUser = null;
  completedUid = null;
  completingUid = null;
  completingUserPromise = null;
  currentStats = normalizeStats(DEFAULT_STATS);
  latestVipVerification = { uid: null, verified: true, checkedAt: Date.now(), state: getVipState({}) };
  setAuthStatus("unauthenticated");
  clearSignedOutCache();
  cachedDisplayUser = null;
  hideAuthLoading();
  syncStatsUI(currentStats);
  dispatchAuthStateChanged(source);
}

function syncVipProfileFeatures(user, vipStats) {
  const active = Boolean(user && isVipActive(vipStats));
  document.body.dataset.vipVerifiedActive = active ? "true" : "false";

  const petCard = document.getElementById("spiritPetCard");
  if (petCard) {
    petCard.hidden = !active;
    petCard.setAttribute("aria-hidden", active ? "false" : "true");
  }

  const backgroundToggle = document.getElementById("profileBgToggle");
  const backgroundOptions = document.getElementById("profileBgOptions");
  const backgroundStatus = document.getElementById("profileBgStatus");
  const backgroundRow = backgroundToggle?.closest(".setting-row");
  [backgroundRow, backgroundOptions, backgroundStatus].forEach((element) => element?.classList.toggle("is-vip-locked", !active));

  if (!active) {
    document.body.classList.remove("profile-bg-enabled");
    if (backgroundToggle) backgroundToggle.checked = false;
    const label = document.getElementById("profileBgLabel");
    if (label) label.textContent = "VIP";
    if (backgroundStatus) backgroundStatus.textContent = "👑 Ảnh nền hồ sơ là quyền lợi VIP. Bấm vào khu vực này để xem gói nâng cấp.";
  }
}

function syncStatsUI(stats) {
  const vipPresentationStats = getVerifiedVipPresentationStats(stats);
  const presentationUser = currentUser || (authStatus === "loading" ? cachedDisplayUser : null);
  updateHeaderUser(presentationUser, vipPresentationStats);
  syncHomeCounters(stats, Boolean(presentationUser));
  syncProfile(presentationUser, vipPresentationStats);
  syncVipProfileFeatures(currentUser, vipPresentationStats);
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
    try { await signInGoogle(); closeModal(); } catch (error) { if (!error?.handled) showAuthError(error); }
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
    try { await signInGoogle(); } catch (error) { if (!error?.handled) showAuthError(error); }
  };

  window.doLogout = async () => {
    try { await logout(); showToast("Đã đăng xuất."); } catch (error) { console.error(error); showToast(getFriendlyAuthError(error), "error"); }
  };

  window.deleteAccount = deleteCurrentAccount;

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

window.sharedFirebase = { app, auth, db };

window.CCFirebase = {
  auth,
  db,
  signInGoogle,
  completeGoogleLogin,
  completeGoogleLoginOnce,
  signInEmail,
  registerEmail,
  resetPassword,
  logout,
  deleteCurrentAccount,
  isDisallowedEmbeddedBrowser,
  shouldUseRedirectLogin,
  isEmbeddedFrame,
  canUseRedirectAuth,
  showOpenInBrowserHelp,
  showRedirectStorageHelp,
  showToast,
  showAuthError,
  readPendingGoogleLoginState,
  clearPendingGoogleLoginState,
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
  getFreshVipAccess,
  getUserData,
  saveUserData,
  vip: Object.freeze({
    getState: getVipState,
    getStatusLabel: getVipStatusLabel,
    isActive: isVipActive,
    isVerifiedActive: () => Boolean(latestVipVerification.verified && latestVipVerification.state?.active),
    getVerification: () => ({ ...latestVipVerification }),
    refresh: getFreshVipAccess,
    openPurchase: openVipPurchaseModal,
    applyAvatar: applyVipState,
    renderAvatar: renderVipAvatar,
    syncCard: syncVipCard
  }),
  isAuthReady: () => authReady,
  authInitialization: authInitializationPromise,
  authReady: authReadyPromise,
  getAuthStatus: () => authStatus,
  DEFAULT_STATS: structuredCloneSafe(DEFAULT_STATS)
};

bindAuthControls();
currentUser = null;
const cachedUserCandidate = readCachedUser();
const cachedStatsCandidate = readValidCachedUserStats(cachedUserCandidate?.uid);
cachedDisplayUser = cachedStatsCandidate ? readValidCachedUser(cachedUserCandidate?.uid) : null;
currentStats = normalizeStats(cachedDisplayUser ? cachedStatsCandidate : DEFAULT_STATS);
syncStatsUI(currentStats);
window.dispatchEvent(new Event("firebase-ready"));

let latestObservedUser = null;
let resolveFirstAuthState;
const firstAuthStatePromise = new Promise((resolve) => { resolveFirstAuthState = resolve; });
let firstAuthStateObserved = false;
const signedInObserverWaiters = new Set();

function waitForObservedUser(timeoutMs = 3000) {
  if (latestObservedUser?.uid) return Promise.resolve(latestObservedUser);
  return new Promise((resolve) => {
    const finish = (user = null) => {
      clearTimeout(timer);
      signedInObserverWaiters.delete(finish);
      resolve(user);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    signedInObserverWaiters.add(finish);
  });
}

function registerAuthObserver() {
  return onAuthStateChanged(auth, async (user) => {
    latestObservedUser = user;
    window.dispatchEvent(new CustomEvent("cc-placement-auth-observed", { detail: { user } }));
    if (!firstAuthStateObserved) {
      firstAuthStateObserved = true;
      resolveFirstAuthState(user);
    }
    if (user?.uid) {
      signedInObserverWaiters.forEach((resolve) => resolve(user));
      try {
        await completeGoogleLoginOnce(user, { source: "observer", navigate: false });
        dispatchAuthStateChanged("observer");
      } catch (error) {
        handleGoogleLoginError(error, { flow: "observer", step: "complete-user" });
      }
      return;
    }
    if (!redirectCheckComplete) {
      setAuthStatus("checking-redirect");
      return;
    }
    handleConfirmedSignedOut("observer");
  }, (error) => {
    handleGoogleLoginError(error, { flow: "observer", step: "auth-state-listener" });
  });
}

async function initializeAuthFlow() {
  setAuthStatus("initializing");
  const { persistenceError } = await authInitializationPromise;
  if (persistenceError) {
    dispatchAuthError(persistenceError, { flow: "initialization", step: "set-persistence" });
    showAuthError("Trình duyệt không lưu được phiên đăng nhập lâu dài. Hệ thống đang dùng persistence mặc định.");
  }

  const pending = readPendingGoogleLoginState();
  if (pending) showAuthLoading("Đang khôi phục đăng nhập Google...");
  setAuthStatus("checking-redirect");
  registerAuthObserver();

  let redirectResult = null;
  let redirectError = null;
  try {
    redirectResult = await getRedirectResult(auth);
    renderAuthDebugPanel({
      step: "redirect-result",
      redirectResult: redirectResult?.user ? "user" : "null"
    });
    if (redirectResult?.user) {
      console.info("[firebase-auth] Redirect result restored", {
        uid: redirectResult.user.uid,
        provider: redirectResult.providerId || "unknown"
      });
    }
  } catch (error) {
    redirectError = error;
    handleGoogleLoginError(error, { flow: "redirect", step: "get-redirect-result" });
  }

  const firstObservedUser = await firstAuthStatePromise;
  redirectCheckComplete = true;
  let restoredUser = redirectResult?.user || firstObservedUser || auth.currentUser || latestObservedUser;

  // Một số trình duyệt trả redirect result null nhưng observer vẫn khôi phục user.
  if (!restoredUser && pending && !redirectError) {
    restoredUser = await waitForObservedUser();
  }

  if (restoredUser?.uid) {
    await completeGoogleLoginOnce(restoredUser, {
      source: redirectResult?.user ? "redirect" : pending ? "redirect-observer" : "observer",
      navigate: Boolean(pending),
      returnUrl: pending?.returnUrl || ""
    });
  } else {
    if (pending && !redirectError) {
      const error = createGoogleAuthError(
        "auth/redirect-result-missing",
        "Google chưa trả về phiên đăng nhập hợp lệ. Vui lòng thử lại và kiểm tra cấu hình tên miền."
      );
      logAuthError(error, { flow: "redirect", step: "no-user-after-redirect" });
      dispatchAuthError(error, { flow: "redirect", step: "no-user-after-redirect" });
      showAuthError(error);
    }
    clearPendingGoogleLoginState();
    handleConfirmedSignedOut("initialization");
  }

  finalizeInitialAuthState();
}

initializeAuthFlow().catch((error) => {
  redirectCheckComplete = true;
  handleGoogleLoginError(error, { flow: "initialization", step: "initialize-auth-flow" });
  if (!currentUser) handleConfirmedSignedOut("initialization-error");
  finalizeInitialAuthState();
});
