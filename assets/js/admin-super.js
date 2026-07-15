import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import { getFirestore, collection, query, orderBy, limit, onSnapshot, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js';

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
const state = { feedbacks: [], users: [], logs: [], collectionRows: [], authUsers: [], learningSettings: null, cmsLessonData: null, cmsOriginalData: null, cmsIndex: [], cmsSaving: false, cmsEditorBaseline: {} };
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
  $('#adminAvatar').src = user.photoURL || '';
  $('#loginScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  bootOnce();
});

let booted = false;
function bootOnce(){ if(booted) return; booted = true; bindUI(); listenFeedbacks(); loadUsers(); loadLogs(); renderLessonTotals(); checkBackend(); loadLearningSettings(); initCms(); }
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
}
function switchTab(tab){
  $$('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
  $$('.tab-panel').forEach(x => x.classList.add('hidden'));
  $(`#tab-${tab}`)?.classList.remove('hidden');
  $('#pageTitle').textContent = {dashboard:'Tổng quan',feedback:'Góp ý người dùng',users:'Quản lý người dùng',auth:'Phân quyền',learning:'Quản lý khóa học',content:'Quản lý nội dung',logs:'Thống kê truy cập',database:'Cài đặt dữ liệu'}[tab] || 'Admin';
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
        <div class="meta"><div class="avatar">${f.photoURL ? `<img src="${safeText(f.photoURL)}" alt="">` : safeText((f.displayName || f.email || '?').slice(0,1))}</div><div><div class="name">${safeText(f.displayName || 'Ẩn danh')} <span class="pill ${safeText(f.status || 'new')}">${safeText(f.status || 'new')}</span></div><div class="email">${safeText(f.email || '')}</div><div class="time">${fmt(f.createdAt)} · ${safeText(f.type || 'Other')}</div></div></div>
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
  } catch(e){ $('#usersTable').innerHTML = `<div class="muted">Không đọc được users: ${safeText(e.message)}</div>`; }
}
function getUserXp(u){ return Number(u.stats?.xp ?? u.xp ?? 0); }
function getUserCoins(u){ return Number(u.stats?.coins ?? u.coins ?? 0); }
function getUserVip(u){ return Boolean(u.stats?.isVip ?? u.isVip); }
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
  $('#usersTable').innerHTML = `<table><thead><tr><th>Người dùng</th><th>XP / Cấp</th><th>Xu / VIP</th><th>Tiến độ</th><th>Cập nhật</th><th class="right">Thao tác</th></tr></thead><tbody>${arr.map(u => `
    <tr><td><b>${safeText(u.displayName || u.name || 'Học viên')}</b><div class="email">${safeText(u.email || '')}</div><div class="muted">${safeText(u.id)}</div></td><td>XP: <b>${n(getUserXp(u))}</b><br>Cấp: ${safeText(getUserLevel(u))}<br>Pet: ${getPetLevel(u)}/10</td><td>Xu: <b>${n(getUserCoins(u))}</b><br>VIP: ${getUserVip(u) ? '✅ bật' : '— tắt'}<br><span class="muted">Bài đã mở: ${safeText(JSON.stringify(u.stats?.unlockedLessons || {})).slice(0,90)}</span></td><td>Hoàn thành: ${getCompletedCount(u)}<br>Mở tất cả: ${(u.stats?.unlockedAll || u.unlockedAll) ? 'có' : 'không'}</td><td>${fmt(u.updatedAt || u.stats?.updatedAt)}</td><td class="right"><button class="btn small primary" data-max="${u.id}">Max tất cả</button> <button class="btn small ok" data-unlock="${u.id}">Mở khóa</button> <button class="btn small ok" data-vip="${u.id}" data-vip-value="${getUserVip(u) ? 'false' : 'true'}">${getUserVip(u) ? 'Tắt VIP' : 'Bật VIP'}</button> <button class="btn small" data-coins="${u.id}">± Xu</button> <button class="btn small danger" data-reset="${u.id}">Reset</button></td></tr>`).join('')}</tbody></table>`;
  $$('[data-max]').forEach(b => b.onclick = () => maxUser(b.dataset.max));
  $$('[data-unlock]').forEach(b => b.onclick = () => unlockUser(b.dataset.unlock));
  $$('[data-vip]').forEach(b => b.onclick = () => setUserVip(b.dataset.vip, b.dataset.vipValue === 'true'));
  $$('[data-coins]').forEach(b => b.onclick = () => adjustUserCoins(b.dataset.coins));
  $$('[data-reset]').forEach(b => b.onclick = () => resetUser(b.dataset.reset));
}
async function writeUserStats(uid, patch){
  await Promise.all([
    setDoc(userRef(uid), { updatedAt:serverTimestamp(), adminUpdatedAt:serverTimestamp(), ...patch.public }, { merge:true }),
    setDoc(statsRef(uid), { updatedAt:serverTimestamp(), adminUpdatedAt:serverTimestamp(), ...patch.stats }, { merge:true })
  ]);
}
async function setUserVip(uid, value){
  await writeUserStats(uid, { public:{ isVip:value }, stats:{ isVip:value, vipUntil:value ? null : '' } });
  toast(value ? 'Đã bật VIP' : 'Đã tắt VIP'); loadUsers();
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
  await writeUserStats(uid, { public:{ adminBoost:false, unlockedAll:false }, stats:{ xp:0, coins:0, totalCoinsEarned:0, isVip:false, vipUntil:'', unlockedLessons:{}, writingCompleted:{}, coinHistory:[], checkInStreak:0, lastCheckInDate:'', todayXp:0, lastXp:0, level:1, petLevel:1, spiritLevel:1, unlockedAll:false, completedLessonIds:{}, completedLessons:0, courses:{hsk1:0,hsk2:0,hsk3:0,hsk4:0,hsk5:0,hsk6:0}, streak:0, history:[] } });
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
function defaultLearningSettings(){
  const courses = {};
  Object.entries(COURSE_TOTALS).forEach(([level,total]) => {
    courses[level] = { enabled:true, lessons:{} };
    for(let i=1;i<=total;i++) courses[level].lessons[`B${i}`] = { enabled:true, unlockType:'free', coinCost:0 };
  });
  return { courses, features:{...DEFAULT_FEATURES} };
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
  return { enabled:course.enabled !== false, lessons };
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
  $('#freeAllLessons') && ($('#freeAllLessons').onclick = () => setAllLessonsUnlockType('free'));
  $('#vipAllLessons') && ($('#vipAllLessons').onclick = () => setAllLessonsUnlockType('vip'));
  $('#coinsAllLessons') && ($('#coinsAllLessons').onclick = () => setAllLessonsUnlockType('coins', Number($('#bulkCoinCost')?.value || 50)));
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
  if(courseBox) courseBox.innerHTML = Object.keys(COURSE_TOTALS).map(level => { const c=normalizeCourseConfig(cfg, level); return `<label class="toggle-row"><b>${level}</b><span>${c.enabled ? 'Đang mở' : 'Đang khóa'}</span><input type="checkbox" data-course-toggle="${level}" ${c.enabled ? 'checked' : ''}></label>`; }).join('');
  const featureBox = $('#featureToggles');
  if(featureBox) featureBox.innerHTML = Object.keys(DEFAULT_FEATURES).map(key => `<label class="toggle-row"><b>${safeText(key)}</b><span>${cfg.features?.[key] ? 'Bật' : 'Tắt'}</span><input type="checkbox" data-feature-toggle="${key}" ${cfg.features?.[key] ? 'checked' : ''}></label>`).join('');
  renderLessonLockGrid();
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
      <label><input type="checkbox" data-lesson-enabled="${lesson}" ${a.enabled !== false ? 'checked' : ''}> <b>B${lesson}</b></label>
      <select class="input" data-lesson-unlock="${lesson}">
        <option value="free" ${a.unlockType==='free'?'selected':''}>free</option>
        <option value="coins" ${a.unlockType==='coins'?'selected':''}>coins</option>
        <option value="vip" ${a.unlockType==='vip'?'selected':''}>vip</option>
        <option value="locked" ${a.unlockType==='locked'?'selected':''}>locked</option>
      </select>
      <input class="input" type="number" min="0" data-lesson-cost="${lesson}" value="${Number(a.coinCost||0)}" title="coinCost">
    </div>`;
  }).join('');
}
function readLearningForm(){
  const cfg = state.learningSettings || defaultLearningSettings();
  cfg.courses = cfg.courses || {};
  $$('[data-course-toggle]').forEach(input => {
    const level = input.dataset.courseToggle;
    const c = normalizeCourseConfig(cfg, level);
    cfg.courses[level] = { ...c, enabled:input.checked };
  });
  $$('[data-feature-toggle]').forEach(input => { cfg.features[input.dataset.featureToggle] = input.checked; });
  const level = $('#lessonLevelSelect')?.value || 'hsk1';
  const c = normalizeCourseConfig(cfg, level);
  $$('[data-lesson-enabled]').forEach(input => {
    const lesson = input.dataset.lessonEnabled;
    const key = `B${lesson}`;
    c.lessons[key] = c.lessons[key] || {};
    c.lessons[key].enabled = input.checked;
  });
  $$('[data-lesson-unlock]').forEach(input => {
    const key = `B${input.dataset.lessonUnlock}`;
    c.lessons[key] = c.lessons[key] || {};
    c.lessons[key].unlockType = input.value;
    if(input.value === 'locked') c.lessons[key].enabled = false;
  });
  $$('[data-lesson-cost]').forEach(input => {
    const key = `B${input.dataset.lessonCost}`;
    c.lessons[key] = c.lessons[key] || {};
    c.lessons[key].coinCost = Math.max(0, Number(input.value || 0));
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
    c.lessons[key] = { ...(c.lessons[key] || {}), enabled:value, unlockType:value ? (c.lessons[key]?.unlockType || 'free') : 'locked' };
  }
  cfg.courses[level] = c;
  state.learningSettings = cfg; renderLessonLockGrid();
}
function setAllLessonsUnlockType(type, cost=0){
  const level = $('#lessonLevelSelect')?.value || 'hsk1';
  const cfg = state.learningSettings || defaultLearningSettings();
  const c = normalizeCourseConfig(cfg, level);
  for(let i=1;i<=(COURSE_TOTALS[level]||1);i++) {
    c.lessons[`B${i}`] = { enabled:type !== 'locked', unlockType:type, coinCost:type === 'coins' ? Math.max(0, Number(cost||0)) : 0 };
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
    c.lessons[`B${lessonId}`] = { ...(c.lessons[`B${lessonId}`] || {}), enabled:!data.isLocked, unlockType:data.isLocked ? 'locked' : (c.lessons[`B${lessonId}`]?.unlockType || 'free') };
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
