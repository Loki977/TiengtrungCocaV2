import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import { getFirestore, collection, query, orderBy, limit, onSnapshot, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js';
import { getLessonContent, normalizeWritingLessonContent } from '../../lesson-engine.js';
import { getLessonConfig } from '../../lesson-config.js';

const ADMIN_EMAIL = 'nqthanhforwork@gmail.com';
const sharedFirebase = window.CCFirebase;
if (!sharedFirebase?.auth || !sharedFirebase?.db) {
  throw new Error('Firebase Auth chưa được khởi tạo. Kiểm tra thứ tự script firebase-auth.js trước admin-super.js.');
}

const auth = sharedFirebase.auth;
const db = sharedFirebase.db || getFirestore(auth.app);
const functions = getFunctions(auth.app);

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { feedbacks: [], users: [], logs: [], collectionRows: [], authUsers: [], learningSettings: null, cmsLessonData: null, cmsOriginalData: null, cmsIndex: [], cmsSaving: false, cmsEditorBaseline: {}, writingCmsData: null, writingCmsStatic: null, writingCmsSaving: false };
const WRITING_VOCAB_TARGETS = { hsk1: 10, hsk2: 20, hsk3: 30, hsk4: 40, hsk5: 40, hsk6: 50 };
const COURSE_TOTALS = { hsk1: 15, hsk2: 15, hsk3: 20, hsk4: 20, hsk5: 36, hsk6: 40 };

const callListAuthUsers = httpsCallable(functions, 'adminListUsers');
const callSetDisabled = httpsCallable(functions, 'adminSetUserDisabled');
const callDeleteAuthUser = httpsCallable(functions, 'adminDeleteUser');
const callSyncAdminClaim = httpsCallable(functions, 'adminSyncAdminClaim');

function toast(msg, type=''){ const el=$('#toast'); el.textContent=msg; el.classList.toggle('error', type === 'error'); el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2600); }
function fmt(t){ try{ return t?.toDate ? t.toDate().toLocaleString('vi-VN') : (t ? new Date(t).toLocaleString('vi-VN') : ''); }catch{return '';} }
function n(v){ return Number(v || 0).toLocaleString('vi-VN'); }
function safeText(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function structuredCloneSafe(value){ return JSON.parse(JSON.stringify(value)); }
function downloadJson(name, data){ const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}); const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
function completedMap(){ const out = {}; Object.entries(COURSE_TOTALS).forEach(([level,total]) => { for(let i=1;i<=total;i++) out[`${level}-${i}`]=true; }); return out; }
function statsRef(uid){ return doc(db, 'users', uid, 'private', 'stats'); }
function userRef(uid){ return doc(db, 'users', uid); }
function backendMessage(text, ok=false){ const el=$('#backendNotice'); if(!el) return; el.className = ok ? 'notice ok' : 'notice'; el.innerHTML = text; }
function isAdminUser(user){ return Boolean(user?.email && user.email.toLowerCase() === ADMIN_EMAIL); }
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
  if (!isAdminUser(user)) throw new Error('Tài khoản hiện tại không có quyền Admin Super.');
  return user;
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

onAuthStateChanged(auth, user => {
  if(!user){ $('#loginScreen').classList.remove('hidden'); $('#app').classList.add('hidden'); return; }
  if(!isAdminUser(user)){ location.replace('index.html'); return; }
  $('#adminEmail').textContent = user.email;
  syncAdminVipAvatar(user);
  $('#loginScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  bootOnce();
});
window.addEventListener('cc:user-stats', event => {
  if (isAdminUser(event.detail?.user)) syncAdminVipAvatar(event.detail.user, event.detail?.stats || {});
});

let booted = false;
function bootOnce(){ if(booted) return; booted = true; bindUI(); listenFeedbacks(); loadUsers(); loadLogs(); renderLessonTotals(); checkBackend(); loadLearningSettings(); initCms(); initWritingCms(); }
function bindUI(){
  $$('.nav-item').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
  $('#refreshAll').onclick = () => { loadUsers(); loadLogs(); toast('Đã làm mới'); };
  $('#feedbackSearch').oninput = renderFeedbacks; $('#feedbackStatus').onchange = renderFeedbacks;
  $('#userSearch').oninput = renderUsers; $('#userSort').onchange = renderUsers; $('#exportUsers').onclick = () => downloadJson('users-firestore.json', state.users);
  $('#authSearch').oninput = renderAuthUsers; $('#loadAuthUsers').onclick = loadAuthUsers;
  $('#logSearch').oninput = renderLogs; $('#exportLogs').onclick = () => downloadJson('access-logs.json', state.logs);
  $('#loadCollection').onclick = loadCollection; $('#exportCollection').onclick = () => downloadJson(`${$('#collectionSelect').value}.json`, state.collectionRows);
  bindLearningControls();
  bindCmsControls();
  bindWritingCmsControls();
}
function switchTab(tab){
  $$('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
  $$('.tab-panel').forEach(x => x.classList.add('hidden'));
  $(`#tab-${tab}`)?.classList.remove('hidden');
  $('#pageTitle').textContent = {dashboard:'Tổng quan',feedback:'Góp ý người dùng',users:'Quản lý người dùng',auth:'Phân quyền',learning:'Quản lý khóa học',writing:'CMS Luyện viết',content:'Quản lý nội dung',logs:'Thống kê truy cập',database:'Cài đặt dữ liệu'}[tab] || 'Admin';
}
function renderLessonTotals(){ $('#lessonTotals').innerHTML = Object.entries(COURSE_TOTALS).map(([k,v]) => `<div><b>${k.toUpperCase()}</b><p>${v} bài học</p></div>`).join(''); }
async function checkBackend(){
  try { await callSyncAdminClaim({}); backendMessage('✅ Cloud Functions Admin SDK đã hoạt động. Bạn có thể quản lý Firebase Authentication thật ở tab <b>Auth</b>.', true); }
  catch(e){ backendMessage('⚠️ Chưa deploy hoặc chưa cấp quyền Cloud Functions Admin SDK. Tab Auth sẽ chưa hoạt động. Hãy deploy thư mục <b>functions</b>.'); }
}

function listenFeedbacks(){
  const q = query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'), limit(150));
  onSnapshot(q, snap => {
    state.feedbacks = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    $('#statFeedback').textContent = n(state.feedbacks.length);
    $('#statNew').textContent = n(state.feedbacks.filter(x => (x.status || 'new') === 'new').length);
    renderFeedbacks();
  }, err => { $('#feedbackList').innerHTML = `<div class="muted">Không đọc được feedbacks: ${safeText(err.message)}</div>`; });
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

async function loadUsers(){
  try{
    const snap = await getDocs(query(collection(db, 'users'), limit(500)));
    const users = [];
    for (const d of snap.docs) {
      const publicData = { id:d.id, ...d.data() };
      let stats = {};
      try { const s = await getDoc(statsRef(d.id)); if (s.exists()) stats = s.data(); } catch (_) {}
      users.push({ ...publicData, stats });
    }
    state.users = users;
    updateDashboardStats();
    renderUsers();
    renderFeedbacks();
  } catch(e){ $('#usersTable').innerHTML = `<div class="muted">Không đọc được users: ${safeText(e.message)}</div>`; }
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
  $('#statUsers').textContent = n(state.users.length);
  $('#statXp').textContent = n(state.users.reduce((s,u)=>s+getUserXp(u),0));
  $('#statLessons').textContent = n(state.users.reduce((s,u)=>s+getCompletedCount(u),0));
}
function renderUsers(){
  const key = $('#userSearch').value.toLowerCase().trim();
  const sort = $('#userSort').value;
  let arr = state.users.filter(u => !key || [u.email,u.displayName,u.name,u.id].join(' ').toLowerCase().includes(key));
  arr = arr.sort((a,b) => sort === 'email' ? String(a.email||'').localeCompare(String(b.email||'')) : sort === 'newest' ? String(b.updatedAt?.seconds||0).localeCompare(String(a.updatedAt?.seconds||0)) : getUserXp(b)-getUserXp(a));
  $('#usersTable').innerHTML = `<table><thead><tr><th>Người dùng</th><th>XP / Cấp</th><th>Xu / VIP</th><th>Tiến độ</th><th>Cập nhật</th><th class="right">Thao tác</th></tr></thead><tbody>${arr.map(u => {
    const vipState = getUserVipState(u);
    const vipClass = vipState.active ? 'done' : (vipState.expired || vipState.invalidExpiry ? 'new' : '');
    return `<tr><td><b>${safeText(u.displayName || u.name || 'Học viên')}</b><div class="email">${safeText(u.email || '')}</div><div class="muted">${safeText(u.id)}</div></td><td>XP: <b>${n(getUserXp(u))}</b><br>Cấp: ${safeText(getUserLevel(u))}<br>Pet: ${getPetLevel(u)}/10</td><td>Xu: <b>${n(getUserCoins(u))}</b><br><span class="pill ${vipClass}">${safeText(getUserVipLabel(u))}</span><br><span class="muted">Bài đã mở: ${safeText(JSON.stringify(u.stats?.unlockedLessons || {})).slice(0,90)}</span></td><td>Hoàn thành: ${getCompletedCount(u)}<br>Mở tất cả: ${(u.stats?.unlockedAll || u.unlockedAll) ? 'có' : 'không'}</td><td>${fmt(u.updatedAt || u.stats?.updatedAt)}</td><td class="right"><button class="btn small primary" data-max="${u.id}">Max tất cả</button> <button class="btn small ok" data-unlock="${u.id}">Mở khóa</button> <button class="btn small ok" data-vip-manage="${u.id}">Quản lý VIP</button> <button class="btn small" data-coins="${u.id}">± Xu</button> <button class="btn small danger" data-reset="${u.id}">Reset</button></td></tr>`;
  }).join('')}</tbody></table>`;
  $$('[data-max]').forEach(b => b.onclick = () => maxUser(b.dataset.max));
  $$('[data-unlock]').forEach(b => b.onclick = () => unlockUser(b.dataset.unlock));
  $$('[data-vip-manage]').forEach(b => b.onclick = () => openVipManager(b.dataset.vipManage));
  $$('[data-coins]').forEach(b => b.onclick = () => adjustUserCoins(b.dataset.coins));
  $$('[data-reset]').forEach(b => b.onclick = () => resetUser(b.dataset.reset));
}
async function writeUserStats(uid, patch = {}){
  requireAdmin();
  const jobs = [];
  if (patch.public && Object.keys(patch.public).length) jobs.push(setDoc(userRef(uid), { updatedAt:serverTimestamp(), adminUpdatedAt:serverTimestamp(), ...patch.public }, { merge:true }));
  if (patch.stats && Object.keys(patch.stats).length) jobs.push(setDoc(statsRef(uid), { updatedAt:serverTimestamp(), adminUpdatedAt:serverTimestamp(), ...patch.stats }, { merge:true }));
  await Promise.all(jobs);
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
  const admin = requireAdmin();
  await setDoc(statsRef(uid), {
    isVip: isVip === true,
    vipUntil,
    vipPlan: vipPlan ?? null,
    vipUpdatedAt: serverTimestamp(),
    vipUpdatedBy: admin.email,
    updatedAt: serverTimestamp(),
    adminUpdatedAt: serverTimestamp()
  }, { merge:true });
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
      vipUntil = Timestamp.fromDate(customDate);
    } else if (Number.isFinite(plan.days)) {
      const current = getUserVipState(user);
      const base = extend && current.active && !current.permanent && current.expiresDate
        ? current.expiresDate.getTime()
        : Date.now();
      vipUntil = Timestamp.fromDate(new Date(base + plan.days * 86400000));
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
  const next = Math.max(0, current + delta);
  const item = { id:`admin-coins-${Date.now()}`, reason:'admin-adjust', amount:delta, date:new Date().toLocaleDateString('vi-VN'), meta:{ admin:auth.currentUser?.email || ADMIN_EMAIL } };
  await writeUserStats(uid, { public:{ coins:next }, stats:{ coins:next, totalCoinsEarned: delta > 0 ? Number(user?.stats?.totalCoinsEarned || 0) + delta : Number(user?.stats?.totalCoinsEarned || 0), coinHistory:[item, ...((user?.stats?.coinHistory || []).slice(0,79))] } });
  toast('Đã cập nhật xu'); loadUsers();
}
async function maxUser(uid){
  const ids = completedMap();
  const courses = Object.fromEntries(Object.keys(COURSE_TOTALS).map(k => [k, 100]));
  await writeUserStats(uid, { public:{ adminBoost:true }, stats:{ xp:999999, todayXp:999999, lastXp:999999, level:10, petLevel:10, spiritLevel:10, unlockedAll:true, completedLessonIds:ids, completedLessons:Object.keys(ids).length, courses, currentLevel:'HSK 6', streak:999 } });
  toast('Đã set MAX user'); loadUsers();
}
async function unlockUser(uid){
  const ids = completedMap();
  const courses = Object.fromEntries(Object.keys(COURSE_TOTALS).map(k => [k, 100]));
  await writeUserStats(uid, { public:{ unlockedAll:true }, stats:{ unlockedAll:true, completedLessonIds:ids, completedLessons:Object.keys(ids).length, courses } });
  toast('Đã unlock toàn bộ'); loadUsers();
}
async function resetUser(uid){
  if(!confirm('Reset tiến độ user này?')) return;
  await writeUserStats(uid, { public:{ adminBoost:false, unlockedAll:false }, stats:{ xp:0, coins:0, totalCoinsEarned:0, isVip:false, vipUntil:null, vipPlan:null, unlockedLessons:{}, writingCompleted:{}, coinHistory:[], checkInStreak:0, lastCheckInDate:'', todayXp:0, lastXp:0, level:1, petLevel:1, spiritLevel:1, unlockedAll:false, completedLessonIds:{}, completedLessons:0, courses:{hsk1:0,hsk2:0,hsk3:0,hsk4:0,hsk5:0,hsk6:0}, streak:0, history:[] } });
  toast('Đã reset user'); loadUsers();
}

async function loadAuthUsers(){
  $('#authUsersTable').innerHTML = '<div class="muted">Đang tải tài khoản Firebase Auth...</div>';
  try{
    const res = await callListAuthUsers({ maxResults: 1000 });
    state.authUsers = res.data?.users || [];
    renderAuthUsers();
    backendMessage('✅ Cloud Functions Admin SDK đã hoạt động. Tab Auth có thể khóa/mở khóa/xóa tài khoản thật.', true);
  } catch(e){
    $('#authUsersTable').innerHTML = `<div class="notice">Không gọi được Cloud Functions: ${safeText(e.message)}<br>Hãy deploy thư mục functions và đăng nhập đúng Gmail admin.</div>`;
  }
}
function renderAuthUsers(){
  const key = $('#authSearch').value.toLowerCase().trim();
  const arr = state.authUsers.filter(u => !key || [u.email,u.uid,u.displayName].join(' ').toLowerCase().includes(key));
  $('#authUsersTable').innerHTML = arr.length ? `<table><thead><tr><th>Tài khoản Auth</th><th>Trạng thái</th><th>Thời gian</th><th class="right">Thao tác</th></tr></thead><tbody>${arr.map(u => `
    <tr><td><b>${safeText(u.displayName || 'Không tên')}</b><div class="email">${safeText(u.email || '')}</div><div class="muted">${safeText(u.uid)}</div></td><td>${u.disabled ? '<span class="pill new">Đã khóa</span>' : '<span class="pill done">Đang hoạt động</span>'}<br>Xác minh email: ${u.emailVerified ? 'có' : 'không'}</td><td>Tạo: ${safeText(u.creationTime || '')}<br>Đăng nhập cuối: ${safeText(u.lastSignInTime || '')}</td><td class="right"><button class="btn small ${u.disabled ? 'ok' : 'warn'}" data-disable="${u.uid}" data-value="${u.disabled ? 'false' : 'true'}">${u.disabled ? 'Mở khóa' : 'Khóa'}</button> <button class="btn small danger" data-authdel="${u.uid}">Xóa Auth</button></td></tr>`).join('')}</tbody></table>` : '<div class="muted">Không có Auth user phù hợp.</div>';
  $$('[data-disable]').forEach(b => b.onclick = () => setAuthDisabled(b.dataset.disable, b.dataset.value === 'true'));
  $$('[data-authdel]').forEach(b => b.onclick = () => deleteAuthUser(b.dataset.authdel));
}
async function setAuthDisabled(uid, disabled){
  if(!confirm(`${disabled ? 'Khóa' : 'Mở khóa'} tài khoản Auth này?`)) return;
  await callSetDisabled({ uid, disabled });
  toast(disabled ? 'Đã khóa tài khoản Auth' : 'Đã mở khóa tài khoản Auth');
  await loadAuthUsers();
}
async function deleteAuthUser(uid){
  if(!confirm('Xóa vĩnh viễn tài khoản Firebase Auth này? Firestore data sẽ không tự xóa nếu bạn không xóa riêng.')) return;
  await callDeleteAuthUser({ uid });
  toast('Đã xóa tài khoản Auth');
  await loadAuthUsers();
}

async function loadLogs(){
  const collections = ['accessLogs','visits'];
  let rows = [];
  for(const name of collections){
    try{ const snap = await getDocs(query(collection(db,name), orderBy('createdAt','desc'), limit(200))); rows = rows.concat(snap.docs.map(d => ({id:d.id, _collection:name, ...d.data()}))); } catch(_) {}
  }
  rows.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  state.logs = rows;
  $('#statVisits').textContent = n(rows.length);
  renderLogs();
}
function renderLogs(){
  const key = $('#logSearch').value.toLowerCase().trim();
  const arr = state.logs.filter(l => !key || [l.email,l.uid,l.page,l.path,l.browser,l.userAgent,l.device].join(' ').toLowerCase().includes(key));
  $('#logsTable').innerHTML = arr.length ? `<table><thead><tr><th>Time</th><th>User / Page</th><th>Browser</th><th>Device</th></tr></thead><tbody>${arr.map(l => `<tr><td>${fmt(l.createdAt || l.time)}</td><td>${safeText(l.email || l.uid || '')}<br><span class="muted">${safeText(l.page || l.path || '')}</span></td><td>${safeText(l.browser || l.userAgent || '')}</td><td>${safeText(l.device || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">Chưa có dữ liệu accessLogs/visits hoặc Rules chưa cho đọc.</div>';
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
  Object.entries(COURSE_TOTALS).forEach(([level,total]) => {
    courses[level] = { enabled:true, guided:true, lessons:{} };
    for(let i=1;i<=total;i++) courses[level].lessons[`B${i}`] = { enabled:true, unlockType:'free', coinCost:0 };
  });
  return { courses, features:{...DEFAULT_FEATURES}, writing:{ showSentenceStructureLabels:true } };
}
function normalizeCourseConfig(cfg, level){
  const rawCourse = cfg?.courses?.[level];
  const course = rawCourse && typeof rawCourse === 'object' ? rawCourse : { enabled: rawCourse !== false, lessons:{} };
  const legacyLessons = cfg?.lessons?.[level] || {};
  const lessons = { ...(course.lessons || {}) };
  Object.entries(legacyLessons).forEach(([id,value]) => {
    const key = String(id).startsWith('B') ? String(id) : `B${Number(id)||id}`;
    if(value && typeof value === 'object') lessons[key] = { enabled:value.enabled !== false, unlockType:value.unlockType || (value.enabled === false ? 'locked' : 'free'), coinCost:Number(value.coinCost || 0) };
    else lessons[key] = { enabled:value !== false, unlockType:value === false ? 'locked' : 'free', coinCost:0 };
  });
  return { enabled:course.enabled !== false, guided:course.guided !== false, lessons };
}
function lessonAccess(cfg, level, lesson){
  const course = normalizeCourseConfig(cfg, level);
  const key = `B${Number(lesson)||1}`;
  return { enabled:true, unlockType:'free', coinCost:0, ...(course.lessons?.[key] || {}) };
}
function bindLearningControls(){
  $('#lessonLevelSelect') && ($('#lessonLevelSelect').onchange = renderLessonLockGrid);
  $('#saveLearningSettings') && ($('#saveLearningSettings').onclick = saveLearningSettings);
  $('#openAllLessons') && ($('#openAllLessons').onclick = () => setAllLessonsForLevel(true));
  $('#lockAllLessons') && ($('#lockAllLessons').onclick = () => setAllLessonsForLevel(false));
}
async function loadLearningSettings(){
  try{
    const snap = await getDoc(learningRef());
    state.learningSettings = mergeDeep(defaultLearningSettings(), snap.exists() ? snap.data() : {});
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
  renderLessonLockGrid();
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
function renderLessonLockGrid(){
  const level = $('#lessonLevelSelect')?.value || 'hsk1';
  const cfg = state.learningSettings || defaultLearningSettings();
  const total = COURSE_TOTALS[level] || 1;
  const box = $('#lessonLockGrid');
  if(!box) return;
  box.innerHTML = Array.from({length:total}, (_,i) => {
    const lesson = i+1; const a = lessonAccess(cfg, level, lesson);
    return `<div class="lesson-lock-item cms-access-card">
      <label><input type="checkbox" data-lesson-enabled="${lesson}" ${a.enabled !== false && a.unlockType !== 'locked' ? 'checked' : ''}> <b>B${lesson}</b></label>
      <span class="muted">${a.enabled !== false && a.unlockType !== 'locked' ? 'Theo lộ trình' : 'Khóa thủ công'}</span>
    </div>`;
  }).join('');
}
function readLearningForm(){
  const cfg = state.learningSettings || defaultLearningSettings();
  cfg.courses = cfg.courses || {};
  $$('[data-course-guided]').forEach(input => {
    const level = input.dataset.courseGuided;
    const c = normalizeCourseConfig(cfg, level);
    cfg.courses[level] = { ...c, enabled:true, guided:input.checked };
  });
  $$('[data-feature-toggle]').forEach(input => { cfg.features[input.dataset.featureToggle] = input.checked; });
  const level = $('#lessonLevelSelect')?.value || 'hsk1';
  const c = normalizeCourseConfig(cfg, level);
  $$('[data-lesson-enabled]').forEach(input => {
    const lesson = input.dataset.lessonEnabled;
    const key = `B${lesson}`;
    c.lessons[key] = c.lessons[key] || {};
    c.lessons[key].enabled = input.checked;
    c.lessons[key].unlockType = input.checked ? 'free' : 'locked';
    c.lessons[key].coinCost = 0;
  });
  cfg.courses[level] = c;
  delete cfg.lessons;
  cfg.updatedAt = serverTimestamp(); cfg.updatedBy = auth.currentUser?.email || ADMIN_EMAIL;
  state.learningSettings = cfg;
  return cfg;
}
function setAllLessonsForLevel(value){
  const level = $('#lessonLevelSelect')?.value || 'hsk1';
  const cfg = state.learningSettings || defaultLearningSettings();
  const c = normalizeCourseConfig(cfg, level);
  for(let i=1;i<=(COURSE_TOTALS[level]||1);i++) {
    const key = `B${i}`;
    c.lessons[key] = { ...(c.lessons[key] || {}), enabled:value, unlockType:value ? 'free' : 'locked', coinCost:0 };
  }
  cfg.courses[level] = c;
  state.learningSettings = cfg; renderLessonLockGrid();
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
    c.lessons[`B${lessonId}`] = { ...(c.lessons[`B${lessonId}`] || {}), enabled:!data.isLocked, unlockType:data.isLocked ? 'locked' : 'free', coinCost:0 };
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
