import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import { getFirestore, collection, query, orderBy, limit, onSnapshot, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
import { getLessonContent, normalizeWritingLessonContent } from '../../lesson-engine.js';
import { getLessonConfig } from '../../lesson-config.js';

const sharedFirebase = window.CCFirebase;
if (!sharedFirebase?.auth || !sharedFirebase?.db) {
  throw new Error('Firebase Auth chưa được khởi tạo. Kiểm tra thứ tự script firebase-auth.js trước admin-super.js.');
}

const auth = sharedFirebase.auth;
const db = sharedFirebase.db || getFirestore(auth.app);
const IS_LOCAL_CMS = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
const ADMIN_API_URL = IS_LOCAL_CMS ? 'https://tiengtrungcoca.vercel.app/api/admin' : '/api/admin';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = {
  feedbacks: [],
  users: [],
  logs: [],
  collectionRows: [],
  authUsers: [],
  session: { role: 'user', cms: false, viewUsers: false, viewAnalytics: false, manageUsers: false, manageRoles: false, manageSensitiveFields: false },
  usersPager: { currentToken: '', nextToken: '', previousTokens: [], page: 1, search: '' },
  authPager: { currentToken: '', nextToken: '', previousTokens: [], page: 1, search: '' },
  logsPager: { cursor: null, previousCursors: [], page: 1, hasMore: false },
  unsubscribers: [],
  inFlight: new Map(),
  learningSettings: null,
  cmsLessonData: null,
  cmsOriginalData: null,
  cmsIndex: [],
  cmsSaving: false,
  cmsEditorBaseline: {},
  writingCmsData: null,
  writingCmsStatic: null,
  writingCmsSaving: false
};
const WRITING_VOCAB_TARGETS = { hsk1: 10, hsk2: 20, hsk3: 30, hsk4: 40, hsk5: 40, hsk6: 50 };
const ACCESS_TYPES = Object.freeze(['free', 'guided', 'vip', 'coins']);
const ACCESS_LABELS = Object.freeze({ free:'Miễn phí', guided:'Theo lộ trình', vip:'VIP', coins:'Xu' });
const COURSE_TOTALS = { hsk1: 15, hsk2: 15, hsk3: 20, hsk4: 20, hsk5: 36, hsk6: 40 };

const BOOTSTRAP_ADMIN_EMAILS = new Set(['nqthanhforwork@gmail.com']);
const CMS_ROLES = new Set(['super_admin', 'admin', 'editor']);

async function callAdminApi(action, data = {}){
  const user = auth.currentUser;
  if (!user) throw new Error('Vui lòng đăng nhập.');
  const token = await user.getIdToken();
  const response = await fetch(ADMIN_API_URL, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
    body:JSON.stringify({ action, data })
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || `Admin API lỗi HTTP ${response.status}`);
    error.code = payload.code || `http_${response.status}`;
    throw error;
  }
  return { data:payload };
}

const callListAuthUsers = data => callAdminApi('adminListUsers', data);
const callSetDisabled = data => callAdminApi('adminSetUserDisabled', data);
const callDeleteAuthUser = data => callAdminApi('adminDeleteUser', data);
const callBootstrap = data => callAdminApi('adminBootstrap', data);
const callGetSession = data => callAdminApi('adminGetSession', data);
const callGetDashboard = data => callAdminApi('adminGetDashboard', data);
const callSetUserRole = data => callAdminApi('adminSetUserRole', data);
const callUpdateUserData = data => callAdminApi('adminUpdateUserData', data);
const callListAccessLogs = data => callAdminApi('adminListAccessLogs', data);
const callMigrateVisitCounters = data => callAdminApi('adminMigrateVisitCounters', data);

function toast(msg, type=''){ const el=$('#toast'); el.textContent=msg; el.classList.toggle('error', type === 'error'); el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2600); }
function fmt(t){ try{ return t?.toDate ? t.toDate().toLocaleString('vi-VN') : (t ? new Date(t).toLocaleString('vi-VN') : ''); }catch{return '';} }
function n(v){ return Number(v || 0).toLocaleString('vi-VN'); }
function safeText(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function structuredCloneSafe(value){ return JSON.parse(JSON.stringify(value)); }
function downloadJson(name, data){ const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}); const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
function backendMessage(text, ok=false){ const el=$('#backendNotice'); if(!el) return; el.className = ok ? 'notice ok' : 'notice'; el.innerHTML = text; }
function hasCapability(name){ return state.session?.[name] === true; }
function isAdminUser(user){ return Boolean(user && state.session?.cms); }
async function compatibleSession(user){
  const email = String(user.email || '').toLowerCase();
  const isBootstrap = BOOTSTRAP_ADMIN_EMAILS.has(email);
  const token = isBootstrap ? null : await user.getIdTokenResult();
  const claimedRole = String(token?.claims?.role || '').toLowerCase();
  const role = isBootstrap ? 'super_admin' : claimedRole;
  if (!CMS_ROLES.has(role)) return null;
  const isAdmin = role === 'super_admin' || role === 'admin';
  const isSuperAdmin = role === 'super_admin';
  return {
    role,
    cms:true,
    viewUsers:isAdmin,
    viewAnalytics:isAdmin,
    manageUsers:isSuperAdmin,
    manageRoles:isSuperAdmin,
    manageSensitiveFields:isSuperAdmin,
    backendAvailable:false,
    email,
    uid:user.uid
  };
}
function syncAdminVipAvatar(user, stats = sharedFirebase.getCurrentStats?.() || {}){
  const shell = $('#adminAvatarShell');
  if (!shell || !user) return;
  sharedFirebase.vip?.renderAvatar?.(shell, user, stats, {
    size: 'sm',
    fallback: (user.displayName || user.email || 'A').trim().slice(0, 1).toUpperCase() || 'A'
  });
}
function requireAdmin(){
  const user = auth.currentUser;
  if (!user || !hasCapability('cms')) throw new Error('Tài khoản hiện tại không có quyền chỉnh sửa CMS.');
  return user;
}
function requireSuperAdmin(){
  const user = auth.currentUser;
  if (!user || state.session?.role !== 'super_admin') throw new Error('Chỉ Super Admin được thực hiện thao tác này.');
  return user;
}
function cleanupListeners(){
  state.unsubscribers.splice(0).forEach(unsubscribe => {
    try { unsubscribe?.(); } catch (_) {}
  });
}
async function runSingle(key, task){
  if (state.inFlight.has(key)) return state.inFlight.get(key);
  const promise = Promise.resolve().then(task).finally(() => state.inFlight.delete(key));
  state.inFlight.set(key, promise);
  return promise;
}
function debounce(fn, delay=350){
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
function setCmsStatus(text, type=''){
  const el = $('#cmsStatus');
  if (!el) return;
  el.textContent = text;
  el.className = `save-status ${type}`.trim();
}
function setButtonBusy(btn, busy, label){
  if (!btn) return;
  if (label) {
    if (!btn.dataset.idleText) btn.dataset.idleText = btn.textContent;
    btn.textContent = busy ? label : btn.dataset.idleText;
  }
  btn.disabled = Boolean(busy);
}
function stripUndefined(value){
  if (Array.isArray(value)) return value.map(stripUndefined).filter(v => v !== undefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    Object.entries(value).forEach(([key, item]) => {
      const clean = stripUndefined(item);
      if (clean !== undefined) out[key] = clean;
    });
    return out;
  }
  return value === undefined ? undefined : value;
}

$('#loginBtn').onclick = async () => { try{ await sharedFirebase.signInGoogle(); }catch(e){ $('#loginMsg').textContent = e?.message || 'Không đăng nhập được.'; } };
$('#logoutBtn').onclick = () => sharedFirebase.logout();

onAuthStateChanged(auth, async user => {
  cleanupListeners();
  if(!user){
    state.session = { role:'user', cms:false, viewUsers:false, viewAnalytics:false, manageUsers:false, manageRoles:false, manageSensitiveFields:false };
    $('#loginScreen').classList.remove('hidden');
    $('#app').classList.add('hidden');
    return;
  }
  $('#loginMsg').textContent = 'Đang xác minh quyền quản trị…';
  let compatibilityMode = false;
  const localSession = IS_LOCAL_CMS ? await compatibleSession(user).catch(() => null) : null;
  if (localSession) {
    compatibilityMode = true;
    state.session = localSession;
  } else try {
      const bootstrap = await callBootstrap({});
      if (bootstrap.data?.refreshToken) await user.getIdToken(true);
      const session = await callGetSession({});
      state.session = { ...(session.data || state.session), backendAvailable:true };
    } catch (error) {
    let fallback = null;
    try { fallback = await compatibleSession(user); } catch (tokenError) {
      console.error('[admin-super] Không đọc được Firebase ID token', tokenError);
    }
    if (!fallback) {
      console.error('[admin-super] Không xác minh được quyền quản trị', error);
      $('#loginMsg').textContent = 'Tài khoản không có quyền truy cập CMS.';
      $('#loginScreen').classList.remove('hidden');
      $('#app').classList.add('hidden');
      return;
    }
    compatibilityMode = true;
    state.session = fallback;
    console.warn('[admin-super] Admin backend chưa sẵn sàng; mở CMS ở chế độ tương thích.', error?.code || error?.message);
  }
  $('#adminEmail').textContent = user.email;
  $('#adminRole').textContent = String(state.session.role || 'user').replace('_', ' ');
  syncAdminVipAvatar(user);
  $('#loginScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  bootOnce();
  applyRoleUI();
  if (compatibilityMode) {
    backendMessage('ℹ️ CMS local đang dùng Vercel Admin API cho Người dùng, Phân quyền và Thống kê. Nếu API chưa được deploy, từng bảng sẽ hiển thị lỗi kết nối rõ ràng.');
  }
});
window.addEventListener('cc:user-stats', event => {
  if (event.detail?.user?.uid === auth.currentUser?.uid && state.session?.cms) syncAdminVipAvatar(event.detail.user, event.detail?.stats || {});
});

let booted = false;
function bootOnce(){
  if(!booted) {
    booted = true;
    bindUI();
    renderLessonTotals();
  }
  if (state.session?.backendAvailable !== false) checkBackend();
  if (hasCapability('viewUsers')) loadUsers();
  if (hasCapability('viewAnalytics')) {
    loadDashboard();
    loadLogs();
    listenVisitCounter();
    listenFeedbacks();
  }
  if (hasCapability('cms')) {
    loadLearningSettings();
    initCms();
    initWritingCms();
  }
}
function applyRoleUI(){
  const role = state.session?.role || 'user';
  const hiddenTabs = new Set();
  if (!hasCapability('viewUsers')) hiddenTabs.add('users');
  if (!hasCapability('viewAnalytics')) {
    hiddenTabs.add('dashboard');
    hiddenTabs.add('feedback');
    hiddenTabs.add('logs');
    hiddenTabs.add('database');
  }
  if (!hasCapability('manageRoles') && !hasCapability('viewUsers')) hiddenTabs.add('auth');
  $$('.nav-item').forEach(button => button.classList.toggle('hidden', hiddenTabs.has(button.dataset.tab)));
  $('#migrateVisits')?.classList.toggle('hidden', role !== 'super_admin');
  if (hiddenTabs.has($('.nav-item.active')?.dataset.tab)) switchTab('learning');
}
function bindUI(){
  $$('.nav-item').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
  $('#refreshAll').onclick = () => {
    if (hasCapability('viewUsers')) loadUsers({ reset:true });
    if (hasCapability('viewAnalytics')) { loadDashboard(); loadLogs({ reset:true }); }
    toast('Đã làm mới');
  };
  $('#feedbackSearch').oninput = renderFeedbacks; $('#feedbackStatus').onchange = renderFeedbacks;
  $('#userSearch').oninput = debounce(() => loadUsers({ reset:true, search:$('#userSearch').value }));
  $('#userSort').onchange = renderUsers;
  $('#exportUsers').onclick = () => downloadJson('users-page.json', state.users);
  $('#usersPrev').onclick = () => loadUsersPage(-1);
  $('#usersNext').onclick = () => loadUsersPage(1);
  $('#authSearch').oninput = debounce(() => loadAuthUsers({ reset:true, search:$('#authSearch').value }));
  $('#loadAuthUsers').onclick = () => loadAuthUsers({ reset:true, search:$('#authSearch').value });
  $('#authPrev').onclick = () => loadAuthUsersPage(-1);
  $('#authNext').onclick = () => loadAuthUsersPage(1);
  $('#logSearch').oninput = renderLogs; $('#exportLogs').onclick = () => downloadJson('access-logs.json', state.logs);
  $('#logsPrev').onclick = () => loadLogsPage(-1);
  $('#logsNext').onclick = () => loadLogsPage(1);
  $('#migrateVisits').onclick = migrateVisitCounters;
  $('#loadCollection').onclick = loadCollection; $('#exportCollection').onclick = () => downloadJson(`${$('#collectionSelect').value}.json`, state.collectionRows);
  bindLearningControls();
  bindCmsControls();
  bindWritingCmsControls();
}
function switchTab(tab){
  const target = $(`.nav-item[data-tab="${tab}"]`);
  if (!target || target.classList.contains('hidden')) return;
  $$('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
  $$('.tab-panel').forEach(x => x.classList.add('hidden'));
  $(`#tab-${tab}`)?.classList.remove('hidden');
  $('#pageTitle').textContent = {dashboard:'Tổng quan',feedback:'Góp ý người dùng',users:'Quản lý người dùng',auth:'Phân quyền',learning:'Quản lý khóa học',writing:'CMS Luyện viết',content:'Quản lý nội dung',logs:'Thống kê truy cập',database:'Cài đặt dữ liệu'}[tab] || 'Admin';
}
function renderLessonTotals(){ $('#lessonTotals').innerHTML = Object.entries(COURSE_TOTALS).map(([k,v]) => `<div><b>${k.toUpperCase()}</b><p>${v} bài học</p></div>`).join(''); }
async function checkBackend(){
  try {
    const session = await callGetSession({});
    state.session = session.data || state.session;
    backendMessage(`✅ Vercel Admin API đang hoạt động. Quyền hiện tại: <b>${safeText(state.session.role)}</b>.`, true);
  } catch(e) {
    backendMessage(`⚠️ Không gọi được Vercel Admin API: ${safeText(e?.message || 'unknown error')}`);
  }
}

function listenFeedbacks(){
  const q = query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'), limit(150));
  const unsubscribe = onSnapshot(q, snap => {
    state.feedbacks = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    $('#statFeedback').textContent = n(state.feedbacks.length);
    $('#statNew').textContent = n(state.feedbacks.filter(x => (x.status || 'new') === 'new').length);
    renderFeedbacks();
  }, err => { $('#feedbackList').innerHTML = `<div class="muted">Không đọc được feedbacks: ${safeText(err.message)}</div>`; });
  state.unsubscribers.push(unsubscribe);
}
function renderFeedbacks(){
  const key = $('#feedbackSearch').value.toLowerCase().trim();
  const st = $('#feedbackStatus').value;
  const arr = state.feedbacks.filter(f => (!st || (f.status || 'new') === st) && (!key || [f.displayName, f.email, f.title, f.message, f.type, f.page].join(' ').toLowerCase().includes(key)));
  $('#feedbackList').innerHTML = arr.map(f => `
    <div class="card">
      <div class="row">
        <div class="meta"><div class="avatar cc-user-avatar${getUserVip(state.users.find(u => u.id === f.uid) || f) ? ' is-vip' : ''}">${f.photoURL ? `<img src="${safeText(f.photoURL)}" alt="">` : safeText((f.displayName || f.email || '?').slice(0,1))}</div><div><div class="name">${safeText(f.displayName || 'Ẩn danh')} <span class="pill ${safeText(f.status || 'new')}">${safeText(f.status || 'new')}</span></div><div class="email">${safeText(f.email || '')}</div><div class="time">${fmt(f.createdAt)} · ${safeText(f.type || 'Other')}</div></div></div>
        <div class="actions"><button class="btn small warn" data-read="${f.id}">Đã đọc</button><button class="btn small ok" data-done="${f.id}">Đã xử lý</button><button class="btn small danger" data-del="${f.id}">Xóa</button></div>
      </div>
      ${f.title ? `<b>${safeText(f.title)}</b>` : ''}<div class="content-text">${safeText(f.message || '')}</div><div class="page-url">${safeText(f.page || '')}</div>
    </div>`).join('') || '<div class="muted">Không có dữ liệu.</div>';
  $$('[data-read]').forEach(b => b.onclick = () => updateDoc(doc(db,'feedbacks',b.dataset.read), {status:'read', updatedAt:serverTimestamp()}));
  $$('[data-done]').forEach(b => b.onclick = () => updateDoc(doc(db,'feedbacks',b.dataset.done), {status:'done', updatedAt:serverTimestamp()}));
  $$('[data-del]').forEach(b => b.onclick = async () => { if(confirm('Xóa feedback này?')) await deleteDoc(doc(db,'feedbacks',b.dataset.del)); });
}

function mergeAdminUser(user){
  return { ...(user.public || {}), ...user, id:user.uid || user.id, stats:user.stats || {} };
}
function setUsersPagerUI(pager, prefix, count){
  $(`#${prefix}Prev`).disabled = pager.previousTokens.length === 0;
  $(`#${prefix}Next`).disabled = !pager.nextToken || Boolean(pager.search);
  $(`#${prefix}PageStatus`).textContent = pager.search
    ? `${count} kết quả tìm kiếm`
    : `Trang ${pager.page} · ${count} tài khoản`;
}
async function loadUsers({ reset=false, search } = {}){
  if (!hasCapability('viewUsers')) return;
  const pager = state.usersPager;
  if (reset) Object.assign(pager, { currentToken:'', nextToken:'', previousTokens:[], page:1 });
  pager.search = String(search ?? pager.search ?? '').trim();
  $('#usersTable').innerHTML = '<div class="table-state">Đang tải người dùng…</div>';
  try {
    await runSingle('load-users', async () => {
      const response = await callListAuthUsers({
        maxResults:25,
        pageToken:pager.search ? '' : pager.currentToken,
        search:pager.search
      });
      state.users = (response.data?.users || []).map(mergeAdminUser);
      pager.nextToken = response.data?.pageToken || '';
      updateDashboardStats();
      renderUsers();
      renderFeedbacks();
      setUsersPagerUI(pager, 'users', state.users.length);
    });
  } catch(e) {
    $('#usersTable').innerHTML = `<div class="table-state error">Không tải được người dùng: ${safeText(e.message)}</div>`;
    setUsersPagerUI(pager, 'users', 0);
  }
}
function loadUsersPage(direction){
  const pager = state.usersPager;
  if (direction > 0 && pager.nextToken) {
    pager.previousTokens.push(pager.currentToken);
    pager.currentToken = pager.nextToken;
    pager.page += 1;
  } else if (direction < 0 && pager.previousTokens.length) {
    pager.currentToken = pager.previousTokens.pop();
    pager.page = Math.max(1, pager.page - 1);
  } else return;
  loadUsers();
}
function getUserXp(u){ return Number(u.stats?.xp ?? u.xp ?? 0); }
function getUserCoins(u){ return Number(u.stats?.coins ?? u.coins ?? 0); }
function getUserVipState(u){ return sharedFirebase.vip?.getState?.(u) || { active:false, enabled:false, permanent:false, expired:false, daysRemaining:0 }; }
function getUserVip(u){ return Boolean(getUserVipState(u).active); }
function getUserVipLabel(u){ return sharedFirebase.vip?.getStatusLabel?.(u) || 'Không VIP'; }
function getUserLevel(u){ return u.stats?.currentLevel || u.currentLevel || u.level || 'HSK 1'; }
function getPetLevel(u){ return Number(u.stats?.petLevel ?? u.petLevel ?? Math.min(10, Math.max(1, Math.floor(getUserXp(u) / 1000) + 1))); }
function getCompletedCount(u){ const ids = u.stats?.completedLessonIds || u.completedLessonIds || {}; if(Array.isArray(ids)) return ids.length; if(ids && typeof ids === 'object') return Object.keys(ids).length; return Number(u.stats?.completedLessons || u.completedLessons || 0); }
function updateDashboardStats(){
  $('#statXp').textContent = n(state.users.reduce((s,u)=>s+getUserXp(u),0));
  $('#statLessons').textContent = n(state.users.reduce((s,u)=>s+getCompletedCount(u),0));
}
function renderUsers(){
  const sort = $('#userSort').value;
  let arr = [...state.users];
  arr = arr.sort((a,b) => sort === 'email' ? String(a.email||'').localeCompare(String(b.email||'')) : sort === 'newest' ? String(b.updatedAt?.seconds||0).localeCompare(String(a.updatedAt?.seconds||0)) : getUserXp(b)-getUserXp(a));
  if (!arr.length) {
    $('#usersTable').innerHTML = '<div class="table-state">Không có tài khoản phù hợp.</div>';
    return;
  }
  const sensitiveActions = hasCapability('manageSensitiveFields');
  $('#usersTable').innerHTML = `<table><thead><tr><th>Người dùng</th><th>Quyền / Auth</th><th>XP / Cấp</th><th>Xu / VIP</th><th>Tiến độ</th><th class="right">Thao tác</th></tr></thead><tbody>${arr.map(u => {
    const vipState = getUserVipState(u);
    const vipClass = vipState.active ? 'done' : (vipState.expired || vipState.invalidExpiry ? 'new' : '');
    const actions = sensitiveActions && u.id !== auth.currentUser?.uid
      ? `<button class="btn small primary" data-max="${u.id}">Max tất cả</button> <button class="btn small ok" data-unlock="${u.id}">Mở khóa</button> <button class="btn small ok" data-vip-manage="${u.id}">Quản lý VIP</button> <button class="btn small" data-coins="${u.id}">± Xu</button> <button class="btn small danger" data-reset="${u.id}">Reset</button>`
      : '<span class="muted">Chỉ Super Admin</span>';
    return `<tr><td><b>${safeText(u.displayName || u.name || 'Học viên')}</b><div class="email">${safeText(u.email || '')}</div><div class="muted">${safeText(u.id)}</div></td><td><span class="pill">${safeText(u.role || 'user')}</span><br>${u.disabled ? '<span class="pill new">Đã khóa</span>' : '<span class="pill done">Hoạt động</span>'}</td><td>XP: <b>${n(getUserXp(u))}</b><br>Cấp: ${safeText(getUserLevel(u))}<br>Pet: ${getPetLevel(u)}/10</td><td>Xu: <b>${n(getUserCoins(u))}</b><br><span class="pill ${vipClass}">${safeText(getUserVipLabel(u))}</span><br><span class="muted">Bài đã mở: ${safeText(JSON.stringify(u.stats?.unlockedLessons || {})).slice(0,90)}</span></td><td>Hoàn thành: ${getCompletedCount(u)}<br>Mở tất cả: ${(u.stats?.unlockedAll || u.unlockedAll) ? 'có' : 'không'}<br>${fmt(u.updatedAt || u.stats?.updatedAt)}</td><td class="right">${actions}</td></tr>`;
  }).join('')}</tbody></table>`;
  $$('[data-max]').forEach(b => b.onclick = () => maxUser(b.dataset.max));
  $$('[data-unlock]').forEach(b => b.onclick = () => unlockUser(b.dataset.unlock));
  $$('[data-vip-manage]').forEach(b => b.onclick = () => openVipManager(b.dataset.vipManage));
  $$('[data-coins]').forEach(b => b.onclick = () => adjustUserCoins(b.dataset.coins));
  $$('[data-reset]').forEach(b => b.onclick = () => resetUser(b.dataset.reset));
}
async function updateSensitiveUser(uid, action, data = {}){
  requireSuperAdmin();
  return runSingle(`sensitive:${uid}:${action}`, () => callUpdateUserData({ uid, action, ...data }));
}

const VIP_ADMIN_PLANS = Object.freeze({
  lifetime: { label:'VIP vĩnh viễn', days:null },
  '30d': { label:'30 ngày', days:30 },
  '90d': { label:'90 ngày', days:90 },
  '365d': { label:'365 ngày', days:365 },
  custom: { label:'Ngày tùy chọn', days:'custom' },
  off: { label:'Tắt VIP', days:0 }
});

function ensureVipManagerModal(){
  let modal = $('#adminVipModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'adminVipModal';
  modal.className = 'admin-vip-modal hidden';
  modal.innerHTML = `<div class="admin-vip-modal__backdrop" data-vip-close></div><section class="admin-vip-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="adminVipTitle"><button class="admin-vip-modal__close" type="button" data-vip-close aria-label="Đóng">×</button><h2 id="adminVipTitle">Quản lý VIP</h2><p class="muted" id="adminVipUser"></p><div class="admin-vip-current" id="adminVipCurrent"></div><label>Gói VIP<select class="input full" id="adminVipPlan"><option value="lifetime">VIP vĩnh viễn</option><option value="30d">30 ngày</option><option value="90d">90 ngày</option><option value="365d">365 ngày</option><option value="custom">Ngày tùy chọn</option><option value="off">Tắt VIP</option></select></label><label id="adminVipCustomWrap" class="hidden">Ngày hết hạn<input class="input full" id="adminVipCustomDate" type="date"></label><p class="muted">“Gia hạn” cộng thêm số ngày từ hạn hiện tại; nếu đã hết hạn thì tính từ hôm nay.</p><div class="admin-vip-actions"><button class="btn danger" id="adminVipRevoke" type="button">Tắt VIP</button><button class="btn" id="adminVipExtend" type="button">Gia hạn</button><button class="btn primary" id="adminVipApply" type="button">Áp dụng</button></div></section>`;
  document.body.appendChild(modal);
  [...modal.querySelectorAll('[data-vip-close]')].forEach(button => button.addEventListener('click', closeVipManager));
  $('#adminVipPlan').addEventListener('change', syncVipManagerControls);
  $('#adminVipApply').addEventListener('click', () => saveVipManager(false));
  $('#adminVipExtend').addEventListener('click', () => saveVipManager(true));
  $('#adminVipRevoke').addEventListener('click', () => revokeVipManager());
  return modal;
}
function closeVipManager(){ $('#adminVipModal')?.classList.add('hidden'); document.body.classList.remove('admin-modal-open'); }
function syncVipManagerControls(){
  const plan = $('#adminVipPlan')?.value;
  $('#adminVipCustomWrap')?.classList.toggle('hidden', plan !== 'custom');
  if ($('#adminVipExtend')) $('#adminVipExtend').disabled = !['30d','90d','365d'].includes(plan);
  if ($('#adminVipApply')) $('#adminVipApply').textContent = plan === 'off' ? 'Tắt VIP' : 'Áp dụng';
}
function openVipManager(uid){
  const user = state.users.find(item => item.id === uid);
  if (!user) return toast('Không tìm thấy user', 'error');
  const modal = ensureVipManagerModal();
  modal.dataset.uid = uid;
  $('#adminVipUser').textContent = `${user.displayName || 'Học viên'} · ${user.email || uid}`;
  $('#adminVipCurrent').textContent = `Trạng thái hiện tại: ${getUserVipLabel(user)}`;
  const currentPlan = String(user.stats?.vipPlan || '30d');
  $('#adminVipPlan').value = Object.hasOwn(VIP_ADMIN_PLANS, currentPlan) ? currentPlan : (getUserVipState(user).permanent ? 'lifetime' : '30d');
  const expiry = getUserVipState(user).expiresDate;
  $('#adminVipCustomDate').value = expiry ? expiry.toISOString().slice(0,10) : new Date(Date.now() + 30 * 86400000).toISOString().slice(0,10);
  syncVipManagerControls();
  modal.classList.remove('hidden');
  document.body.classList.add('admin-modal-open');
}
function dateAtLocalEnd(dateText){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText || '')) return null;
  const date = new Date(`${dateText}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}
async function writeCanonicalVip(uid, { isVip, vipUntil, vipPlan }){
  await updateSensitiveUser(uid, 'vip', {
    isVip:isVip === true,
    vipUntilMillis:vipUntil,
    vipPlan:vipPlan ?? null
  });
}
async function saveVipManager(extend){
  const modal = $('#adminVipModal');
  const uid = modal?.dataset.uid;
  const planId = $('#adminVipPlan')?.value;
  const plan = VIP_ADMIN_PLANS[planId];
  const user = state.users.find(item => item.id === uid);
  if (!uid || !plan || !user) return;
  try {
    if (planId === 'off') return await revokeVipManager();
    let vipUntil = null;
    if (plan.days === 'custom') {
      const customDate = dateAtLocalEnd($('#adminVipCustomDate')?.value);
      if (!customDate || customDate.getTime() <= Date.now()) return toast('Ngày hết hạn phải ở tương lai', 'error');
      vipUntil = customDate.getTime();
    } else if (Number.isFinite(plan.days)) {
      const current = getUserVipState(user);
      const base = extend && current.active && !current.permanent && current.expiresDate
        ? current.expiresDate.getTime()
        : Date.now();
      vipUntil = base + plan.days * 86400000;
    }
    await writeCanonicalVip(uid, { isVip:true, vipUntil, vipPlan:planId });
    toast(extend ? `Đã gia hạn ${plan.label}` : `Đã cấp ${plan.label}`);
    closeVipManager();
    await loadUsers();
  } catch (error) {
    console.error('[admin-vip] Không cập nhật được VIP', error);
    toast(error?.message || 'Không cập nhật được VIP', 'error');
  }
}
async function revokeVipManager(){
  const uid = $('#adminVipModal')?.dataset.uid;
  if (!uid) return;
  try {
    await writeCanonicalVip(uid, { isVip:false, vipUntil:null, vipPlan:null });
    toast('Đã thu hồi VIP');
    closeVipManager();
    await loadUsers();
  } catch (error) {
    console.error('[admin-vip] Không thu hồi được VIP', error);
    toast(error?.message || 'Không thu hồi được VIP', 'error');
  }
}
async function adjustUserCoins(uid){
  const user = state.users.find(u => u.id === uid);
  const current = getUserCoins(user || {});
  const raw = prompt('Nhập số xu muốn cộng/trừ. Ví dụ: 100 hoặc -50', '0');
  if(raw === null) return;
  const delta = Number(raw);
  if(!Number.isFinite(delta) || delta === 0) return toast('Số xu không hợp lệ');
  await updateSensitiveUser(uid, 'coins', { delta });
  toast('Đã cập nhật xu'); loadUsers();
}
async function maxUser(uid){
  await updateSensitiveUser(uid, 'max');
  toast('Đã set MAX user'); loadUsers();
}
async function unlockUser(uid){
  await updateSensitiveUser(uid, 'unlock');
  toast('Đã unlock toàn bộ'); loadUsers();
}
async function resetUser(uid){
  if(!confirm(`Reset toàn bộ tiến độ và VIP của UID ${uid}?`)) return;
  await updateSensitiveUser(uid, 'reset');
  toast('Đã reset user'); loadUsers();
}

async function loadAuthUsers({ reset=false, search } = {}){
  if (!hasCapability('viewUsers')) return;
  const pager = state.authPager;
  if (reset) Object.assign(pager, { currentToken:'', nextToken:'', previousTokens:[], page:1 });
  pager.search = String(search ?? pager.search ?? '').trim();
  $('#authUsersTable').innerHTML = '<div class="table-state">Đang tải tài khoản Firebase Auth…</div>';
  try{
    await runSingle('load-auth-users', async () => {
      const res = await callListAuthUsers({
        maxResults:25,
        pageToken:pager.search ? '' : pager.currentToken,
        search:pager.search
      });
      state.authUsers = (res.data?.users || []).map(mergeAdminUser);
      pager.nextToken = res.data?.pageToken || '';
      renderAuthUsers();
      setUsersPagerUI(pager, 'auth', state.authUsers.length);
      backendMessage('✅ Vercel Admin API đã hoạt động. Danh sách Auth đang được phân trang an toàn.', true);
    });
  } catch(e){
    $('#authUsersTable').innerHTML = `<div class="table-state error">Không gọi được Vercel Admin API: ${safeText(e.message)}</div>`;
    setUsersPagerUI(pager, 'auth', 0);
  }
}
function loadAuthUsersPage(direction){
  const pager = state.authPager;
  if (direction > 0 && pager.nextToken) {
    pager.previousTokens.push(pager.currentToken);
    pager.currentToken = pager.nextToken;
    pager.page += 1;
  } else if (direction < 0 && pager.previousTokens.length) {
    pager.currentToken = pager.previousTokens.pop();
    pager.page = Math.max(1, pager.page - 1);
  } else return;
  loadAuthUsers();
}
function renderAuthUsers(){
  const arr = state.authUsers;
  if (!arr.length) {
    $('#authUsersTable').innerHTML = '<div class="table-state">Không có tài khoản Auth phù hợp.</div>';
    return;
  }
  const canManage = hasCapability('manageUsers');
  $('#authUsersTable').innerHTML = `<table><thead><tr><th>Tài khoản Auth</th><th>Vai trò</th><th>Trạng thái</th><th>Thời gian</th><th class="right">Thao tác</th></tr></thead><tbody>${arr.map(u => {
    const isSelf = u.uid === auth.currentUser?.uid;
    const roleControl = canManage && !isSelf
      ? `<select class="role-select" data-role-user="${u.uid}" data-current-role="${safeText(u.role || 'user')}">${['super_admin','admin','editor','user'].map(role => `<option value="${role}" ${role === (u.role || 'user') ? 'selected' : ''}>${role}</option>`).join('')}</select>`
      : `<span class="pill">${safeText(u.role || 'user')}</span>`;
    const actions = canManage && !isSelf
      ? `<button class="btn small ${u.disabled ? 'ok' : 'warn'}" data-disable="${u.uid}" data-value="${u.disabled ? 'false' : 'true'}">${u.disabled ? 'Mở khóa' : 'Khóa'}</button> <button class="btn small danger" data-authdel="${u.uid}">Xóa tài khoản</button>`
      : '<span class="muted">Không được thao tác</span>';
    return `<tr><td><b>${safeText(u.displayName || 'Không tên')}</b><div class="email">${safeText(u.email || '')}</div><div class="muted">${safeText(u.uid)}</div></td><td>${roleControl}</td><td>${u.disabled ? '<span class="pill new">Đã khóa</span>' : '<span class="pill done">Đang hoạt động</span>'}<br>Xác minh email: ${u.emailVerified ? 'có' : 'không'}</td><td>Tạo: ${safeText(u.creationTime || '')}<br>Đăng nhập cuối: ${safeText(u.lastSignInTime || '')}</td><td class="right">${actions}</td></tr>`;
  }).join('')}</tbody></table>`;
  $$('[data-role-user]').forEach(select => select.onchange = () => setUserRole(select.dataset.roleUser, select.value, select.dataset.currentRole, select));
  $$('[data-disable]').forEach(b => b.onclick = () => setAuthDisabled(b.dataset.disable, b.dataset.value === 'true'));
  $$('[data-authdel]').forEach(b => b.onclick = () => deleteAuthUser(b.dataset.authdel));
}
async function setUserRole(uid, role, previousRole, select){
  if(!confirm(`Đổi quyền UID ${uid}\nTừ: ${previousRole}\nSang: ${role}?`)) {
    select.value = previousRole;
    return;
  }
  setButtonBusy(select, true);
  try {
    await runSingle(`role:${uid}`, () => callSetUserRole({ uid, role }));
    toast(`Đã đổi quyền thành ${role}`);
    await loadAuthUsers();
  } catch (error) {
    select.value = previousRole;
    toast(error?.message || 'Không đổi được quyền', 'error');
  } finally {
    setButtonBusy(select, false);
  }
}
async function setAuthDisabled(uid, disabled){
  if(!confirm(`${disabled ? 'Khóa' : 'Mở khóa'} tài khoản UID ${uid}?`)) return;
  try {
    await runSingle(`disabled:${uid}`, () => callSetDisabled({ uid, disabled }));
    toast(disabled ? 'Đã khóa tài khoản Auth' : 'Đã mở khóa tài khoản Auth');
    await Promise.all([loadAuthUsers(), loadUsers()]);
  } catch (error) {
    toast(error?.message || 'Không cập nhật được trạng thái tài khoản', 'error');
  }
}
async function deleteAuthUser(uid){
  const typed = prompt(`XÓA VĨNH VIỄN tài khoản và toàn bộ dữ liệu riêng tại users/${uid}.\nDữ liệu dùng chung và audit log được giữ lại.\nNhập chính xác UID để xác nhận:`, '');
  if (typed !== uid) return toast('UID xác nhận không khớp. Đã hủy xóa.', 'error');
  if(!confirm(`Xác nhận lần cuối: xóa Firebase Authentication UID ${uid} và cây dữ liệu Firestore riêng?`)) return;
  try {
    await runSingle(`delete:${uid}`, () => callDeleteAuthUser({ uid, confirmationUid:typed }));
    toast('Đã xóa tài khoản Auth và dữ liệu riêng');
    await Promise.all([loadAuthUsers({reset:true}), loadUsers({reset:true}), loadDashboard()]);
  } catch (error) {
    toast(error?.message || 'Không xóa được đầy đủ tài khoản', 'error');
  }
}

function visitDateKeys(){
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { day:`${values.year}-${values.month}-${values.day}`, month:`${values.year}-${values.month}` };
}
function updateVisitSummary(summary = {}){
  $('#statVisits').textContent = n(summary.total);
  $('#statVisitsToday').textContent = n(summary.today);
  $('#statVisitsMonth').textContent = n(summary.month);
  const migration = summary.migrationComplete ? `Đã hợp nhất dữ liệu cũ (${n(summary.legacyBaseline)} lượt)` : 'Chưa hợp nhất dữ liệu cũ';
  $('#visitSummary').textContent = `Tổng: ${n(summary.total)} · Hôm nay: ${n(summary.today)} · Tháng này: ${n(summary.month)} · ${migration}`;
}
async function loadDashboard(){
  if (!hasCapability('viewAnalytics')) return;
  try {
    const response = await runSingle('dashboard', () => callGetDashboard({}));
    $('#statUsers').textContent = n(response.data?.totalUsers);
    updateVisitSummary(response.data?.visits || {});
  } catch (error) {
    $('#visitSummary').className = 'notice error';
    $('#visitSummary').textContent = `Không tải được thống kê: ${error?.message || error}`;
  }
}
function listenVisitCounter(){
  const keys = visitDateKeys();
  const values = { total:0, today:0, month:0, migrationComplete:false, legacyBaseline:0 };
  const refs = [
    [doc(db, 'analytics', 'visits'), data => {
      values.total = Number(data.total || 0);
      values.migrationComplete = data.migrationComplete === true;
      values.legacyBaseline = Number(data.legacyBaseline || 0);
    }],
    [doc(db, 'analytics', 'visits', 'daily', keys.day), data => { values.today = Number(data.count || 0); }],
    [doc(db, 'analytics', 'visits', 'monthly', keys.month), data => { values.month = Number(data.count || 0); }]
  ];
  refs.forEach(([ref, apply]) => {
    const unsubscribe = onSnapshot(ref, snapshot => {
      apply(snapshot.exists() ? snapshot.data() : {});
      updateVisitSummary(values);
    }, error => console.warn('[admin-analytics] realtime listener failed', error?.code || error?.message));
    state.unsubscribers.push(unsubscribe);
  });
}
async function loadLogs({ reset=false } = {}){
  if (!hasCapability('viewAnalytics')) return;
  const pager = state.logsPager;
  if (reset) Object.assign(pager, { cursor:null, nextCursor:null, previousCursors:[], page:1, hasMore:false });
  $('#logsTable').innerHTML = '<div class="table-state">Đang tải lịch sử truy cập…</div>';
  try {
    await runSingle('load-logs', async () => {
      const response = await callListAccessLogs({ pageSize:50, cursor:pager.cursor || {} });
      state.logs = response.data?.logs || [];
      pager.nextCursor = response.data?.cursor || null;
      pager.hasMore = response.data?.hasMore === true;
      renderLogs();
      $('#logsPrev').disabled = pager.previousCursors.length === 0;
      $('#logsNext').disabled = !pager.hasMore;
      $('#logsPageStatus').textContent = `Trang ${pager.page} · ${state.logs.length} bản ghi`;
    });
  } catch(error) {
    $('#logsTable').innerHTML = `<div class="table-state error">Không tải được lịch sử: ${safeText(error.message)}</div>`;
  }
}
function loadLogsPage(direction){
  const pager = state.logsPager;
  if (direction > 0 && pager.hasMore && pager.nextCursor) {
    pager.previousCursors.push(pager.cursor);
    pager.cursor = pager.nextCursor;
    pager.page += 1;
  } else if (direction < 0 && pager.previousCursors.length) {
    pager.cursor = pager.previousCursors.pop();
    pager.page = Math.max(1, pager.page - 1);
  } else return;
  loadLogs();
}
function renderLogs(){
  const key = $('#logSearch').value.toLowerCase().trim();
  const arr = state.logs.filter(l => !key || [l.email,l.uid,l.page,l.path,l.browser,l.userAgent,l.device].join(' ').toLowerCase().includes(key));
  $('#logsTable').innerHTML = arr.length ? `<table><thead><tr><th>Time</th><th>User / Page</th><th>Browser</th><th>Device</th></tr></thead><tbody>${arr.map(l => `<tr><td>${fmt(l.createdAt || l.time)}</td><td>${safeText(l.email || l.uid || '')}<br><span class="muted">${safeText(l.page || l.path || '')}</span></td><td>${safeText(l.browser || l.userAgent || '')}</td><td>${safeText(l.device || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="table-state">Không có dữ liệu truy cập ở trang này.</div>';
}
async function migrateVisitCounters(){
  requireSuperAdmin();
  if (!confirm('Hợp nhất bộ đếm cũ từ accessLogs/visits vào counter mới? Thao tác chỉ chạy một lần và có audit log.')) return;
  setButtonBusy($('#migrateVisits'), true, 'Đang hợp nhất…');
  try {
    const response = await runSingle('migrate-visits', () => callMigrateVisitCounters({}));
    updateVisitSummary(response.data || {});
    toast(response.data?.alreadyMigrated ? 'Dữ liệu cũ đã được hợp nhất trước đó' : 'Đã hợp nhất dữ liệu truy cập cũ');
  } catch (error) {
    toast(error?.message || 'Không hợp nhất được dữ liệu cũ', 'error');
  } finally {
    setButtonBusy($('#migrateVisits'), false, 'Đang hợp nhất…');
  }
}
async function loadCollection(){
  const name = $('#collectionSelect').value;
  try{ const snap = await getDocs(query(collection(db,name), limit(100))); state.collectionRows = snap.docs.map(d => ({ id:d.id, ...d.data() })); $('#dbOutput').textContent = JSON.stringify(state.collectionRows, null, 2); }
  catch(e){ $('#dbOutput').textContent = `Không đọc được ${name}: ${e.message}`; }
}


// ===== Admin CMS / khóa học =====
const DEFAULT_FEATURES = { registration:true, googleDesktop:true, donate:true, feedback:true, flashcard:true, writing:true, vocabulary:true, maintenance:false };
function learningRef(){ return doc(db, 'adminSettings', 'learning'); }
function overrideRef(level, lessonId){ return doc(db, 'lessonOverrides', `${level}_${Number(lessonId)}`); }
function writingOverrideRef(level, lessonId){ return doc(db, 'writingLessonOverrides', `${level}_${Number(lessonId)}`); }
function defaultLearningSettings(){
  const courses = {};
  const writingCourses = {};
  Object.entries(COURSE_TOTALS).forEach(([level,total]) => {
    courses[level] = { enabled:true, guided:true, lessons:{} };
    writingCourses[level] = { enabled:true, guided:true, lessons:{} };
    for(let i=1;i<=total;i++) {
      courses[level].lessons[`B${i}`] = { enabled:true, unlockType:'guided', coinCost:0 };
      writingCourses[level].lessons[`B${i}`] = { enabled:true, unlockType:'guided', coinCost:0 };
    }
  });
  return { accessModeVersion:2, courses, features:{...DEFAULT_FEATURES}, writing:{ accessModeVersion:2, showSentenceStructureLabels:true, courses:writingCourses } };
}
function normalizeAccessType(value, fallback='guided'){
  const normalized = String(value || '').toLowerCase();
  return ACCESS_TYPES.includes(normalized) ? normalized : fallback;
}
function accessArea(cfg, scope='course'){
  if(scope === 'writing' && cfg?.writing?.courses) return cfg.writing;
  return cfg || {};
}
function normalizeCourseConfig(cfg, level, scope='course'){
  const area = accessArea(cfg, scope);
  const rawCourse = area?.courses?.[level] ?? (scope === 'writing' ? cfg?.courses?.[level] : undefined);
  const course = rawCourse && typeof rawCourse === 'object' ? rawCourse : { enabled: rawCourse !== false, lessons:{} };
  const legacyLessons = area?.lessons?.[level] || (scope === 'writing' ? cfg?.lessons?.[level] : {}) || {};
  const lessons = { ...(course.lessons || {}) };
  const explicitModes = Number(area?.accessModeVersion || (scope === 'writing' ? cfg?.accessModeVersion : 0)) >= 2;
  Object.entries(legacyLessons).forEach(([id,value]) => {
    const key = String(id).startsWith('B') ? String(id) : `B${Number(id)||id}`;
    if(value && typeof value === 'object') lessons[key] = { enabled:value.enabled !== false, unlockType:value.unlockType || 'free', coinCost:Number(value.coinCost || 0) };
    else lessons[key] = { enabled:value !== false, unlockType:'free', coinCost:0 };
  });
  Object.entries(lessons).forEach(([key,value]) => {
    const enabled = value?.enabled !== false && value?.unlockType !== 'locked';
    let unlockType = normalizeAccessType(value?.unlockType, course.guided === false ? 'free' : 'guided');
    if(!explicitModes && unlockType === 'free' && course.guided !== false) unlockType = 'guided';
    lessons[key] = { ...value, enabled, unlockType, coinCost:Math.max(0, Number(value?.coinCost || 0)) };
  });
  return { enabled:course.enabled !== false, guided:course.guided !== false, lessons };
}
function lessonAccess(cfg, level, lesson, scope='course'){
  const course = normalizeCourseConfig(cfg, level, scope);
  const key = `B${Number(lesson)||1}`;
  return { enabled:true, unlockType:'guided', coinCost:0, ...(course.lessons?.[key] || {}) };
}
function bindLearningControls(){
  $('#lessonLevelSelect') && ($('#lessonLevelSelect').onchange = () => renderAccessGrid('course'));
  $('#saveLearningSettings') && ($('#saveLearningSettings').onclick = saveLearningSettings);
  $('#openAllLessons') && ($('#openAllLessons').onclick = () => setAllLessonsForScope('course', true));
  $('#lockAllLessons') && ($('#lockAllLessons').onclick = () => setAllLessonsForScope('course', false));
  $('#writingAccessLevelSelect') && ($('#writingAccessLevelSelect').onchange = () => renderAccessGrid('writing'));
  $('#saveWritingAccessSettings') && ($('#saveWritingAccessSettings').onclick = saveWritingAccessSettings);
  $('#openAllWritingLessons') && ($('#openAllWritingLessons').onclick = () => setAllLessonsForScope('writing', true));
  $('#lockAllWritingLessons') && ($('#lockAllWritingLessons').onclick = () => setAllLessonsForScope('writing', false));
}
async function loadLearningSettings(){
  try{
    const snap = await getDoc(learningRef());
    const saved = snap.exists() ? snap.data() : null;
    state.learningSettings = mergeDeep(defaultLearningSettings(), saved || {});
    if(saved && Number(saved.accessModeVersion) < 2) state.learningSettings.accessModeVersion = 1;
    if(saved && !saved.writing?.courses) {
      state.learningSettings.writing.courses = structuredCloneSafe(state.learningSettings.courses);
      state.learningSettings.writing.accessModeVersion = state.learningSettings.accessModeVersion;
    } else if(saved && Number(saved.writing?.accessModeVersion) < 2) {
      state.learningSettings.writing.accessModeVersion = 1;
    }
    renderLearningSettings();
  }catch(e){ toast('Không tải được cấu hình học tập'); console.error(e); }
}
function mergeDeep(base, extra){
  const out = Array.isArray(base) ? [...base] : {...base};
  Object.entries(extra || {}).forEach(([k,v]) => {
    if(v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = mergeDeep(out[k], v);
    else if(v !== undefined) out[k] = v;
  });
  return out;
}
function renderLearningSettings(){
  const cfg = state.learningSettings || defaultLearningSettings();
  const courseBox = $('#courseToggles');
  if(courseBox) courseBox.innerHTML = Object.keys(COURSE_TOTALS).map(level => { const c=normalizeCourseConfig(cfg, level); return `<label class="toggle-row"><b>${level.toUpperCase()}</b><span>${c.guided ? 'Khóa theo lộ trình' : 'Mở tự do'}</span><input type="checkbox" data-course-guided="${level}" ${c.guided ? 'checked' : ''} aria-label="Bật khóa theo lộ trình cho ${level.toUpperCase()}"></label>`; }).join('');
  const featureBox = $('#featureToggles');
  if(featureBox) featureBox.innerHTML = Object.keys(DEFAULT_FEATURES).map(key => `<label class="toggle-row"><b>${safeText(key)}</b><span>${cfg.features?.[key] ? 'Bật' : 'Tắt'}</span><input type="checkbox" data-feature-toggle="${key}" ${cfg.features?.[key] ? 'checked' : ''}></label>`).join('');
  const writingLabelsToggle = $('#writingCmsGlobalSentenceLabels');
  if(writingLabelsToggle) writingLabelsToggle.checked = cfg.writing?.showSentenceStructureLabels !== false;
  renderAccessGrid('course');
  renderAccessGrid('writing');
}

async function saveWritingSentenceLabelSetting(){
  const input = $('#writingCmsGlobalSentenceLabels');
  if(!input) return;
  try{
    const admin = requireAdmin();
    const cfg = state.learningSettings || defaultLearningSettings();
    cfg.writing = { ...(cfg.writing || {}), showSentenceStructureLabels:input.checked };
    state.learningSettings = cfg;
    await setDoc(learningRef(), {
      writing:cfg.writing,
      updatedAt:serverTimestamp(),
      updatedBy:admin.email
    }, { merge:true });
    toast(input.checked ? 'Đã hiện ký hiệu cấu trúc cho toàn bộ Luyện viết' : 'Đã ẩn ký hiệu và chú giải cho toàn bộ Luyện viết');
  }catch(error){
    input.checked = state.learningSettings?.writing?.showSentenceStructureLabels !== false;
    toast(error?.message || 'Không lưu được thiết lập hiển thị', 'error');
  }
}
function accessDom(scope){
  return scope === 'writing'
    ? { level:'#writingAccessLevelSelect', grid:'#writingLessonLockGrid' }
    : { level:'#lessonLevelSelect', grid:'#lessonLockGrid' };
}
function renderAccessGrid(scope='course'){
  const dom = accessDom(scope);
  const level = $(dom.level)?.value || 'hsk1';
  const cfg = state.learningSettings || defaultLearningSettings();
  const total = COURSE_TOTALS[level] || 1;
  const box = $(dom.grid);
  if(!box) return;
  box.innerHTML = Array.from({length:total}, (_,i) => {
    const lesson = i+1; const a = lessonAccess(cfg, level, lesson, scope);
    return `<div class="lesson-lock-item cms-access-card">
      <label><input type="checkbox" data-access-enabled="${lesson}" ${a.enabled !== false ? 'checked' : ''}> <b>B${lesson}</b></label>
      <select class="input" data-access-type="${lesson}" aria-label="Cách mở B${lesson}">
        ${ACCESS_TYPES.map(type => `<option value="${type}" ${a.unlockType === type ? 'selected' : ''}>${ACCESS_LABELS[type]}</option>`).join('')}
      </select>
      <label class="cms-access-card__cost ${a.unlockType === 'coins' ? '' : 'hidden'}"><span>Giá xu</span><input class="input" data-access-coins="${lesson}" type="number" min="0" step="1" value="${Math.max(0, Number(a.coinCost || 0))}"></label>
    </div>`;
  }).join('');
  [...box.querySelectorAll('[data-access-type]')].forEach(select => {
    select.onchange = () => {
      const card = select.closest('.cms-access-card');
      card?.querySelector('.cms-access-card__cost')?.classList.toggle('hidden', select.value !== 'coins');
    };
  });
  [...box.querySelectorAll('[data-access-enabled]')].forEach(input => {
    input.onchange = () => input.closest('.cms-access-card')?.classList.toggle('is-disabled', !input.checked);
    input.closest('.cms-access-card')?.classList.toggle('is-disabled', !input.checked);
  });
}
function readAccessGrid(scope='course'){
  const cfg = state.learningSettings || defaultLearningSettings();
  const dom = accessDom(scope);
  const level = $(dom.level)?.value || 'hsk1';
  const area = scope === 'writing' ? (cfg.writing = cfg.writing || {}) : cfg;
  area.courses = area.courses || {};
  area.accessModeVersion = 2;
  const c = normalizeCourseConfig(cfg, level, scope);
  const grid = $(dom.grid);
  [...(grid?.querySelectorAll('[data-access-enabled]') || [])].forEach(input => {
    const lesson = input.dataset.accessEnabled;
    const key = `B${lesson}`;
    const type = grid.querySelector(`[data-access-type="${lesson}"]`)?.value || 'guided';
    const cost = Number(grid.querySelector(`[data-access-coins="${lesson}"]`)?.value || 0);
    c.lessons[key] = { enabled:input.checked, unlockType:normalizeAccessType(type), coinCost:type === 'coins' ? Math.max(0, cost) : 0 };
  });
  area.courses[level] = c;
  state.learningSettings = cfg;
  return cfg;
}
function readLearningForm(){
  const cfg = readAccessGrid('course');
  cfg.courses = cfg.courses || {};
  cfg.accessModeVersion = 2;
  $$('[data-course-guided]').forEach(input => {
    const level = input.dataset.courseGuided;
    const c = normalizeCourseConfig(cfg, level);
    cfg.courses[level] = { ...c, enabled:true, guided:input.checked };
  });
  $$('[data-feature-toggle]').forEach(input => { cfg.features[input.dataset.featureToggle] = input.checked; });
  delete cfg.lessons;
  cfg.updatedAt = serverTimestamp(); cfg.updatedBy = auth.currentUser?.email || '';
  state.learningSettings = cfg;
  return cfg;
}
function setAllLessonsForScope(scope, value){
  const dom = accessDom(scope);
  const level = $(dom.level)?.value || 'hsk1';
  const cfg = state.learningSettings || defaultLearningSettings();
  const area = scope === 'writing' ? (cfg.writing = cfg.writing || {}) : cfg;
  area.courses = area.courses || {};
  area.accessModeVersion = 2;
  const c = normalizeCourseConfig(cfg, level, scope);
  for(let i=1;i<=(COURSE_TOTALS[level]||1);i++) {
    const key = `B${i}`;
    c.lessons[key] = { ...(c.lessons[key] || {}), enabled:value, unlockType:value ? 'free' : normalizeAccessType(c.lessons[key]?.unlockType), coinCost:value ? 0 : Math.max(0, Number(c.lessons[key]?.coinCost || 0)) };
  }
  area.courses[level] = c;
  state.learningSettings = cfg; renderAccessGrid(scope);
}
async function saveLearningSettings(){
  const btn = $('#saveLearningSettings');
  setButtonBusy(btn, true, 'Đang lưu...');
  try {
    requireAdmin();
    const cfg = stripUndefined(readLearningForm());
    await setDoc(learningRef(), cfg, { merge:true });
    toast('Đã lưu cấu hình khóa/mở');
    renderLearningSettings();
  } catch (e) {
    console.error('[admin-super] Lưu cấu hình học tập thất bại', { code:e?.code, message:e?.message });
    toast('Không lưu được cấu hình: ' + (e.message || e), 'error');
  } finally {
    setButtonBusy(btn, false, 'Đang lưu...');
  }
}
async function saveWritingAccessSettings(){
  const btn = $('#saveWritingAccessSettings');
  setButtonBusy(btn, true, 'Đang lưu...');
  try{
    const admin = requireAdmin();
    const cfg = readAccessGrid('writing');
    await setDoc(learningRef(), {
      writing:stripUndefined(cfg.writing),
      updatedAt:serverTimestamp(),
      updatedBy:admin.email
    }, { merge:true });
    toast('Đã lưu quyền truy cập Luyện viết');
    renderAccessGrid('writing');
  }catch(error){
    console.error('[admin-writing] Không lưu được quyền truy cập', error);
    toast(error?.message || 'Không lưu được quyền truy cập Luyện viết', 'error');
  }finally{
    setButtonBusy(btn, false, 'Đang lưu...');
  }
}

function bindCmsControls(){
  $('#cmsLevel') && ($('#cmsLevel').onchange = initCms);
  $('#cmsLoad') && ($('#cmsLoad').onclick = loadCmsLesson);
  $('#cmsSave') && ($('#cmsSave').onclick = saveCmsLesson);
  $('#cmsDeleteOverride') && ($('#cmsDeleteOverride').onclick = deleteCmsOverride);
  $('#cmsDownload') && ($('#cmsDownload').onclick = () => state.cmsLessonData && downloadJson(`${$('#cmsLevel').value}-lesson-${$('#cmsLesson').value}.json`, state.cmsLessonData));
  $('#cmsApplyVocab') && ($('#cmsApplyVocab').onclick = applyVocabTextToJson);
  $$('.cms-tab').forEach(btn => btn.onclick = () => switchCmsTab(btn.dataset.cmsTab));
}
async function initCms(){
  const level = $('#cmsLevel')?.value || 'hsk1';
  const select = $('#cmsLesson'); if(!select) return;
  const total = COURSE_TOTALS[level] || 0;
  const status = $('#cmsCatalogStatus');
  select.disabled = true;
  if(status) status.textContent = `Đang nạp ${total} bài...`;
  try{
    const res = await fetch(`assets/giaotrinhhsk/${level}/index.json`, { cache:'no-store' });
    const indexedRows = res.ok ? await res.json() : [];
    const rowsById = new Map(indexedRows.map(row => [Number(row.lessonId), row]));
    state.cmsIndex = Array.from({ length:total }, (_, index) => {
      const lessonId = index + 1;
      return rowsById.get(lessonId) || {
        lessonId,
        title:`Bài ${lessonId}`,
        file:`lesson-${String(lessonId).padStart(2, '0')}.json`
      };
    });
    select.innerHTML = state.cmsIndex.map(row => `<option value="${row.lessonId}">Bài ${row.lessonId} - ${safeText(row.title || row.chineseTitle || '')}</option>`).join('');
    if(status) status.textContent = `${level.toUpperCase()}: ${state.cmsIndex.length}/${total} bài`;
    if(state.cmsIndex.length) await loadCmsLesson();
  }catch(e){
    state.cmsIndex = Array.from({ length:total }, (_, index) => ({
      lessonId:index + 1,
      title:`Bài ${index + 1}`,
      file:`lesson-${String(index + 1).padStart(2, '0')}.json`
    }));
    select.innerHTML = state.cmsIndex.map(row => `<option value="${row.lessonId}">Bài ${row.lessonId}</option>`).join('');
    if(status) status.textContent = `${level.toUpperCase()}: ${state.cmsIndex.length}/${total} bài (dự phòng)`;
  } finally {
    select.disabled = false;
  }
}
async function loadCmsLesson(){
  const level = $('#cmsLevel').value; const lessonId = Number($('#cmsLesson').value || 1);
  const item = state.cmsIndex.find(x => Number(x.lessonId) === lessonId);
  if(!item) return toast('Không tìm thấy bài');
  setCmsStatus('Đang tải bài...');
  let data = null;
  try{ const snap = await getDoc(overrideRef(level, lessonId)); if(snap.exists()) data = snap.data().content; }catch(e){ console.warn(e); }
  if(!data){
    const res = await fetch(`assets/giaotrinhhsk/${level}/${item.file}`);
    data = await res.json();
  }
  data.level = data.level || level.replace('hsk',''); data.lessonId = Number(data.lessonId || lessonId);
  state.cmsLessonData = data;
  state.cmsOriginalData = structuredCloneSafe(data);
  fillCmsForm(data);
  setCmsStatus('Đã tải bài', 'ok');
}
function switchCmsTab(tab){
  $$('.cms-tab').forEach(b => b.classList.toggle('active', b.dataset.cmsTab === tab));
  $$('.cms-pane').forEach(p => p.classList.toggle('hidden', p.dataset.cmsPane !== tab));
}
function joinParts(parts){ return parts.map(x => String(x ?? '').replace(/\n/g, ' ').trim()).join(' | '); }
function linesToVocab(text, originals=[]){ return String(text||'').split('\n').map((line, idx)=>{ const [hanzi='',pinyin='',meaning='',example='',audio='']=line.split('|').map(x=>x.trim()); if(!hanzi) return null; const original=originals[idx]||{}; return { ...original, id:original.id||`vocab-${idx+1}`, hanzi, pinyin, meaning, example, ...(audio?{audio}:{}) }; }).filter(Boolean); }
function vocabToLines(arr){ return (arr||[]).map(v => joinParts([v.hanzi||v.word||'', v.pinyin||'', v.meaning||v.vi||v.vietnamese||'', v.example||'', v.audio||''])).join('\n'); }
function lessonTextToLines(arr){ return (arr||[]).map(v => joinParts([v.speaker||v.title||'', v.chinese||v.content||v.text||'', v.vietnamese||v.translation||'', v.audio||''])).join('\n'); }
function linesToLessonText(text, originals=[]){ return String(text||'').split('\n').map((line,idx)=>{ const [label='',chinese='',vietnamese='',audio='']=line.split('|').map(x=>x.trim()); if(!label&&!chinese) return null; const original=originals[idx]||{}; const next={ ...original, chinese, vietnamese, ...(audio?{audio}:{}) }; if(Object.prototype.hasOwnProperty.call(original,'title') || !Object.prototype.hasOwnProperty.call(original,'speaker')) { next.title=label; delete next.speaker; } else { next.speaker=label; } if(chinese !== String(original.chinese||original.content||original.text||'').replace(/\n/g,' ').trim()) delete next.segments; return next; }).filter(Boolean); }
function simpleBlockToLines(arr){ return (arr||[]).map(v => joinParts([v.title||'', v.chinese||v.content||'', v.vietnamese||v.translation||''])).join('\n'); }
function linesToSimpleBlock(text, contentKey='content'){ return String(text||'').split('\n').map(line=>{ const [title='',content='',vietnamese='']=line.split('|').map(x=>x.trim()); return (title||content) ? { title, [contentKey]:content, ...(vietnamese?{vietnamese}:{}) } : null; }).filter(Boolean); }
function grammarToLines(arr){ return (arr||[]).map(g => joinParts([g.title||'', g.pattern||g.structure||'', g.explanation||'', Array.isArray(g.examples)?g.examples.join(' ; '):(g.examples||'')])).join('\n'); }
function linesToGrammar(text){ return String(text||'').split('\n').map(line=>{ const [title='',pattern='',explanation='',examples='']=line.split('|').map(x=>x.trim()); return title ? { title, pattern, explanation, examples: examples ? examples.split(';').map(x=>x.trim()).filter(Boolean) : [] } : null; }).filter(Boolean); }
function exercisesToLines(arr){ return (arr||[]).map(e => joinParts([e.type||'', e.question||'', Array.isArray(e.options)?e.options.join(' ; '):(e.options||''), e.answer||'', e.explanation||'', e.hint||'', e.xp||''])).join('\n'); }
function linesToExercises(text){ return String(text||'').split('\n').map(line=>{ const [type='',question='',options='',answer='',explanation='',hint='',xp='']=line.split('|').map(x=>x.trim()); return question ? { type:type||'multiple-choice', question, options:options?options.split(';').map(x=>x.trim()).filter(Boolean):[], answer, explanation, hint, ...(xp?{xp:Number(xp)||0}:{}) } : null; }).filter(Boolean); }

function fillCmsForm(data){
  $('#cmsTitle').value = data.title || '';
  $('#cmsDesc').value = data.desc || data.description || '';
  $('#cmsXp').value = data.xp || data.rewardXp || 20;
  $('#cmsLocked').checked = Boolean(data.isLocked);
  $('#cmsVisible').checked = data.visible !== false;
  $('#cmsVocabText').value = (data.vocabulary || []).map(v => [v.hanzi || v.word || '', v.pinyin || '', v.meaning || v.vi || v.vietnamese || '', v.example || ''].join(' | ')).join('\n');
  $('#cmsVocabEditor').value = vocabToLines(data.vocabulary || []);
  $('#cmsExtendedEditor').value = vocabToLines(data.extendedVocabulary || []);
  $('#cmsReadingEditor').value = lessonTextToLines(data.lessonText || []);
  $('#cmsStoryEditor').value = simpleBlockToLines(data.story || []);
  $('#cmsCultureEditor').value = (data.culture || []).map(v => joinParts([v.title || '', v.content || ''])).join('\n');
  $('#cmsGrammarEditor').value = grammarToLines(data.grammar || []);
  $('#cmsExercisesEditor').value = exercisesToLines(data.exercises || []);
  $('#cmsJson').value = JSON.stringify(data, null, 2);
  state.cmsEditorBaseline = Object.fromEntries([
    'cmsVocabEditor','cmsExtendedEditor','cmsReadingEditor','cmsStoryEditor',
    'cmsCultureEditor','cmsGrammarEditor','cmsExercisesEditor'
  ].map(id => [id, $(`#${id}`)?.value || '']));
}
function cmsEditorChanged(id){ return ($(`#${id}`)?.value || '') !== (state.cmsEditorBaseline?.[id] || ''); }
function syncQuickFieldsToData(){
  const data = JSON.parse($('#cmsJson').value || '{}');
  data.title = $('#cmsTitle').value.trim();
  data.desc = $('#cmsDesc').value.trim();
  data.xp = Number($('#cmsXp').value || data.xp || 20);
  data.isLocked = $('#cmsLocked').checked;
  data.visible = $('#cmsVisible').checked;
  if(cmsEditorChanged('cmsVocabEditor')) data.vocabulary = linesToVocab($('#cmsVocabEditor')?.value || '', data.vocabulary || []);
  if(cmsEditorChanged('cmsExtendedEditor')) data.extendedVocabulary = linesToVocab($('#cmsExtendedEditor')?.value || '', data.extendedVocabulary || []);
  if(cmsEditorChanged('cmsReadingEditor')) data.lessonText = linesToLessonText($('#cmsReadingEditor')?.value || '', data.lessonText || []);
  if(cmsEditorChanged('cmsStoryEditor')) data.story = linesToSimpleBlock($('#cmsStoryEditor')?.value || '', 'chinese');
  if(cmsEditorChanged('cmsCultureEditor')) data.culture = String($('#cmsCultureEditor')?.value || '').split('\n').map(line=>{ const [title='',content='']=line.split('|').map(x=>x.trim()); return (title||content) ? { title, content } : null; }).filter(Boolean);
  if(cmsEditorChanged('cmsGrammarEditor')) data.grammar = linesToGrammar($('#cmsGrammarEditor')?.value || '');
  if(cmsEditorChanged('cmsExercisesEditor')) data.exercises = linesToExercises($('#cmsExercisesEditor')?.value || '');
  $('#cmsJson').value = JSON.stringify(data, null, 2);
  return data;
}
function applyVocabTextToJson(){
  try{
    const data = JSON.parse($('#cmsJson').value || '{}');
    data.vocabulary = $('#cmsVocabText').value.split('\n').map((line, idx) => {
      const [hanzi='', pinyin='', meaning='', example=''] = line.split('|').map(x => x.trim());
      return hanzi ? { id: `vocab-${idx+1}`, hanzi, pinyin, meaning, example } : null;
    }).filter(Boolean);
    $('#cmsJson').value = JSON.stringify(data, null, 2);
    state.cmsLessonData = data; toast('Đã áp dụng từ vựng vào JSON');
  }catch(e){ toast('JSON không hợp lệ'); }
}
async function saveCmsLesson(){
  const saveBtn = $('#cmsSave');
  if (state.cmsSaving) return;
  state.cmsSaving = true;
  setButtonBusy(saveBtn, true, 'Đang lưu...');
  setCmsStatus('Đang lưu...');
  try{
    const admin = requireAdmin();
    const level = $('#cmsLevel').value; const lessonId = Number($('#cmsLesson').value || 1);
    if (!level || !Number.isInteger(lessonId) || lessonId < 1) throw new Error('Level hoặc mã bài học không hợp lệ.');
    const data = stripUndefined(syncQuickFieldsToData());
    if (!data || typeof data !== 'object') throw new Error('Dữ liệu bài học không hợp lệ.');
    if (!String(data.title || '').trim()) throw new Error('Tiêu đề bài học không được để trống.');
    data.level = data.level || level.replace('hsk',''); data.lessonId = Number(data.lessonId || lessonId);
    state.cmsLessonData = data;
    const lessonPatch = stripUndefined({ level, lessonId, title:data.title || '', desc:data.desc || data.description || '', xp:data.xp || 20, isLocked:Boolean(data.isLocked), visible:data.visible !== false, status:data.status || 'published', content:data, updatedAt:serverTimestamp(), updatedBy:admin.email });
    await setDoc(overrideRef(level, lessonId), lessonPatch, { merge:true });
    const cfg = state.learningSettings || defaultLearningSettings();
    const c = normalizeCourseConfig(cfg, level);
    const existingAccess = lessonAccess(cfg, level, lessonId);
    c.lessons[`B${lessonId}`] = { ...existingAccess, enabled:!data.isLocked, unlockType:normalizeAccessType(existingAccess.unlockType), coinCost:Math.max(0, Number(existingAccess.coinCost || 0)) };
    cfg.courses[level] = c;
    state.learningSettings = cfg; await setDoc(learningRef(), stripUndefined({ courses: cfg.courses, updatedAt:serverTimestamp(), updatedBy:admin.email }), { merge:true });
    state.cmsOriginalData = structuredCloneSafe(data);
    state.cmsEditorBaseline = Object.fromEntries(Object.keys(state.cmsEditorBaseline || {}).map(id => [id, $(`#${id}`)?.value || '']));
    toast('Đã lưu bài học lên web');
    setCmsStatus('Đã lưu', 'ok');
    renderLearningSettings();
  }catch(e){
    console.error('[admin-super] Lưu CMS thất bại', { code:e?.code, message:e?.message });
    toast('Lưu thất bại: ' + (e.message || e), 'error');
    setCmsStatus('Lưu thất bại', 'error');
  } finally {
    state.cmsSaving = false;
    setButtonBusy(saveBtn, false, 'Đang lưu...');
  }
}
async function deleteCmsOverride(){
  const level = $('#cmsLevel').value; const lessonId = Number($('#cmsLesson').value || 1);
  if(!confirm('Xóa bản sửa trên Firestore? Web sẽ quay về dùng file JSON cũ.')) return;
  const btn = $('#cmsDeleteOverride');
  setButtonBusy(btn, true, 'Đang xóa...');
  try {
    requireAdmin();
    await deleteDoc(overrideRef(level, lessonId));
    toast('Đã xóa bản sửa');
    await loadCmsLesson();
  } catch (e) {
    console.error('[admin-super] Xóa CMS override thất bại', { code:e?.code, message:e?.message });
    toast('Không xóa được: ' + (e.message || e), 'error');
  } finally {
    setButtonBusy(btn, false, 'Đang xóa...');
  }
}

// ===== CMS Luyện viết =====
function bindWritingCmsControls(){
  $('#writingCmsLevel') && ($('#writingCmsLevel').onchange = initWritingCms);
  $('#writingCmsLesson') && ($('#writingCmsLesson').onchange = loadWritingCmsLesson);
  $('#writingCmsLoad') && ($('#writingCmsLoad').onclick = loadWritingCmsLesson);
  $('#writingCmsSave') && ($('#writingCmsSave').onclick = saveWritingCmsLesson);
  $('#writingCmsReset') && ($('#writingCmsReset').onclick = () => loadWritingCmsLesson({ ignoreOverride:true }));
  $('#writingCmsDelete') && ($('#writingCmsDelete').onclick = deleteWritingCmsOverride);
  $('#writingCmsGlobalSentenceLabels') && ($('#writingCmsGlobalSentenceLabels').onchange = saveWritingSentenceLabelSetting);
  $('#writingCmsDownload') && ($('#writingCmsDownload').onclick = () => state.writingCmsData && downloadJson(`${$('#writingCmsLevel').value}-writing-${$('#writingCmsLesson').value}.json`, state.writingCmsData));
  $$('.writing-cms-tab').forEach(btn => btn.onclick = () => switchWritingCmsTab(btn.dataset.writingTab));
}
function setWritingCmsStatus(text, type=''){
  const el = $('#writingCmsStatus'); if(!el) return;
  el.textContent = text; el.className = `save-status ${type}`.trim();
}
function switchWritingCmsTab(tab){
  $$('.writing-cms-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.writingTab === tab));
  $$('.writing-cms-pane').forEach(pane => pane.classList.toggle('hidden', pane.dataset.writingPane !== tab));
}
async function initWritingCms(){
  const level = $('#writingCmsLevel')?.value || 'hsk1';
  const total = COURSE_TOTALS[level] || getLessonConfig(level)?.lessons?.length || 1;
  const select = $('#writingCmsLesson'); if(!select) return;
  const config = getLessonConfig(level);
  select.innerHTML = Array.from({length:total}, (_, index) => {
    const lessonId = index + 1;
    const title = config?.lessons?.[index]?.title || `Bài ${lessonId}`;
    return `<option value="${lessonId}">Bài ${lessonId} - ${safeText(title)}</option>`;
  }).join('');
  await loadWritingCmsLesson();
}
async function loadWritingCmsLesson(options={}){
  const level = $('#writingCmsLevel')?.value || 'hsk1';
  const lessonId = Number($('#writingCmsLesson')?.value || 1);
  setWritingCmsStatus(options.ignoreOverride ? 'Đang nạp dữ liệu chuẩn...' : 'Đang tải bài...');
  try{
    const staticLesson = await getLessonContent(level, lessonId);
    state.writingCmsStatic = structuredCloneSafe(staticLesson);
    let content = staticLesson;
    if(!options.ignoreOverride){
      const snap = await getDoc(writingOverrideRef(level, lessonId));
      if(snap.exists()) content = normalizeWritingLessonContent(snap.data().content || snap.data(), staticLesson);
    }
    state.writingCmsData = structuredCloneSafe(content);
    fillWritingCmsForm(content);
    setWritingCmsStatus(options.ignoreOverride ? 'Đã nạp dữ liệu chuẩn (chưa lưu)' : 'Đã tải bài', 'ok');
  }catch(error){
    console.error('[admin-writing] Không tải được bài', error);
    setWritingCmsStatus('Tải thất bại', 'error');
    toast(error?.message || 'Không tải được bài Luyện viết', 'error');
  }
}
function writingVocabToLines(items=[]){
  return items.map(item => joinParts([item.chinese || item.hanzi || '', item.pinyin || '', item.vietnamese || item.meaning || '', item.audio || ''])).join('\n');
}
function writingSentencesToLines(items=[]){
  return items.map(item => joinParts([item.chinese || item.hanzi || '', item.pinyin || '', item.vietnamese || item.translation || '', item.audio || ''])).join('\n');
}
function linesToWritingVocab(text){
  return String(text || '').split('\n').map((line,index) => {
    const [chinese='',pinyin='',vietnamese='',audio=''] = line.split('|').map(part => part.trim());
    if(!chinese || !pinyin || !vietnamese) return null;
    return { id:`cms-writing-v${index+1}`, chinese, pinyin, vietnamese, audio, examples:[] };
  }).filter(Boolean);
}
function linesToWritingSentences(text, lessonId){
  return String(text || '').split('\n').map((line,index) => {
    const [chinese='',pinyin='',vietnamese='',audio=''] = line.split('|').map(part => part.trim());
    if(!chinese || !pinyin || !vietnamese) return null;
    return { chinese, pinyin, vietnamese, audio, answerTokens:null, vocabulary:{ lessonId, chinese:'' }, sourceIndex:index };
  }).filter(Boolean);
}
function fillWritingCmsForm(data){
  $('#writingCmsTitle').value = data.title || '';
  $('#writingCmsDesc').value = data.desc || data.description || '';
  $('#writingCmsXp').value = Number(data.xp || 10);
  $('#writingCmsVocab').value = writingVocabToLines(data.vocabularies || []);
  $('#writingCmsSentences').value = writingSentencesToLines(data.sentences || []);
  $('#writingCmsJson').value = JSON.stringify(data, null, 2);
  renderWritingCmsValidation(data);
}
function readWritingCmsForm(){
  const level = $('#writingCmsLevel').value;
  const lessonId = Number($('#writingCmsLesson').value || 1);
  let base = {};
  try { base = JSON.parse($('#writingCmsJson').value || '{}'); } catch { base = {}; }
  const data = {
    ...base,
    level,
    lessonId,
    title:$('#writingCmsTitle').value.trim(),
    desc:$('#writingCmsDesc').value.trim(),
    xp:Math.max(0, Number($('#writingCmsXp').value || 10)),
    vocabularies:linesToWritingVocab($('#writingCmsVocab').value),
    sentences:linesToWritingSentences($('#writingCmsSentences').value, lessonId)
  };
  data.vocabularyCount = data.vocabularies.length;
  data.sentenceCount = data.sentences.length;
  $('#writingCmsJson').value = JSON.stringify(data, null, 2);
  renderWritingCmsValidation(data);
  return data;
}
function renderWritingCmsValidation(data){
  const level = $('#writingCmsLevel')?.value || data.level || 'hsk1';
  const target = WRITING_VOCAB_TARGETS[level] || 10;
  const vocabCount = data.vocabularies?.length || 0;
  const sentenceCount = data.sentences?.length || 0;
  const valid = Boolean(data.title && vocabCount >= target && sentenceCount >= 10);
  $('#writingCmsSummary').innerHTML = `<div><b>${vocabCount}/${target}</b><span>Từ vựng</span></div><div><b>${sentenceCount}/10</b><span>Câu luyện viết</span></div><div><b>${valid ? 'Đạt' : 'Thiếu'}</b><span>Kiểm tra dữ liệu</span></div>`;
  const notice = $('#writingCmsValidation');
  notice.className = valid ? 'notice ok' : 'notice';
  notice.textContent = valid ? 'Dữ liệu đạt số lượng tối thiểu và sẵn sàng lưu.' : `Cần ít nhất ${target} từ, 10 câu và tiêu đề không rỗng.`;
}
async function saveWritingCmsLesson(){
  if(state.writingCmsSaving) return;
  const button = $('#writingCmsSave'); state.writingCmsSaving = true; setButtonBusy(button,true,'Đang lưu...');
  try{
    const admin = requireAdmin();
    const data = stripUndefined(readWritingCmsForm());
    const target = WRITING_VOCAB_TARGETS[data.level] || 10;
    if(!data.title) throw new Error('Tiêu đề không được để trống.');
    if(data.vocabularies.length < target) throw new Error(`${data.level.toUpperCase()} cần ít nhất ${target} từ.`);
    if(data.sentences.length < 10) throw new Error('Mỗi bài cần ít nhất 10 câu luyện viết.');
    await setDoc(writingOverrideRef(data.level, data.lessonId), {
      level:data.level, lessonId:data.lessonId, title:data.title,
      vocabularyCount:data.vocabularies.length, sentenceCount:data.sentences.length,
      content:data, updatedAt:serverTimestamp(), updatedBy:admin.email
    }, {merge:true});
    state.writingCmsData = structuredCloneSafe(data);
    setWritingCmsStatus('Đã lưu', 'ok'); toast('Đã lưu CMS Luyện viết');
  }catch(error){
    console.error('[admin-writing] Lưu thất bại', error);
    setWritingCmsStatus('Lưu thất bại','error'); toast(error?.message || 'Không lưu được', 'error');
  }finally{ state.writingCmsSaving = false; setButtonBusy(button,false,'Đang lưu...'); }
}
async function deleteWritingCmsOverride(){
  const level = $('#writingCmsLevel')?.value || 'hsk1';
  const lessonId = Number($('#writingCmsLesson')?.value || 1);
  if(!confirm('Xóa bản sửa Luyện viết trên Firestore và quay lại dữ liệu chuẩn?')) return;
  try{ requireAdmin(); await deleteDoc(writingOverrideRef(level, lessonId)); toast('Đã xóa bản sửa Luyện viết'); await loadWritingCmsLesson({ignoreOverride:true}); }
  catch(error){ toast(error?.message || 'Không xóa được', 'error'); }
}
