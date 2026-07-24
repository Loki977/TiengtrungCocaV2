import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Minimal DOM so the shared browser helper can be imported and avatar fallback can be tested.
class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name); else this.values.delete(name);
    return enabled;
  }
  contains(name) { return this.values.has(name); }
}
class FakeElement {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.classList = new FakeClassList(); this.dataset = {}; this.children = []; this.attributes = {}; this.textContent = ''; }
  replaceChildren(...children) { this.children = children; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener() {}
}
globalThis.document = {
  getElementById: () => null,
  createElement: (tag) => new FakeElement(tag),
  head: { appendChild: () => {} },
  body: { classList: new FakeClassList() }
};
globalThis.window = {};

const vipModule = await import(`${pathToFileURL(path.join(root, 'assets/js/vip-user.js')).href}?test=${Date.now()}`);
const { getVipState, getVipStatusLabel, renderVipAvatar } = vipModule;
const now = Date.UTC(2026, 6, 17, 12, 0, 0);

assert.equal(getVipState({ isVip: false, vipUntil: null }, now).active, false, 'User thường không được VIP');
assert.equal(getVipState({ isVip: true, vipUntil: null }, now).permanent, true, 'vipUntil=null phải là VIP vĩnh viễn');
assert.equal(getVipStatusLabel({ isVip: true, vipUntil: null }, now), 'VIP vĩnh viễn');
assert.equal(getVipState({ isVip: true }, now).active, false, 'Thiếu vipUntil không được coi là vĩnh viễn');
assert.equal(getVipState({ isVip: 'true', vipUntil: null }, now).active, false, 'isVip phải đúng boolean true');
assert.equal(getVipState({ isVip: true, vipUntil: new Date(now - 1) }, now).expired, true, 'VIP quá hạn phải bị vô hiệu');
assert.equal(getVipState({ isVip: true, vipUntil: { toDate: () => new Date(now + 30 * 86400000) } }, now).active, true, 'Firestore Timestamp còn hạn phải hợp lệ');
assert.equal(getVipState({ isVip: true, vipUntil: null, stats: { isVip: false, vipUntil: null } }, now).active, false, 'private/stats là nguồn quyền duy nhất');
assert.equal(getVipStatusLabel({ isVip: true, vipUntil: new Date(now - 1) }, now), 'Đã hết hạn');
const avatarShell = new FakeElement('span');
renderVipAvatar(avatarShell, { displayName: 'Admin', photoURL: '' }, { isVip: true, vipUntil: null }, { size: 'sm' });
assert.equal(avatarShell.children[0]?.textContent, 'A', 'Avatar rỗng phải hiện fallback chữ cái');
assert.equal(avatarShell.classList.contains('is-vip'), true, 'Avatar VIP hợp lệ phải giữ khung/vương miện');

const rules = read('firestore.rules');
assert.match(rules, /request\.auth\.token\.email == "nqthanhforwork@gmail\.com"/, 'Rules phải khóa theo Super Admin');
assert.match(rules, /validStatsCreate\(\)[\s\S]*keys\(\)\.hasOnly\(allowedProgressKeys\(\)\)/, 'Create stats phải whitelist trường');
assert.match(rules, /validStatsUpdate\(\)[\s\S]*affectedKeys\(\)[\s\S]*hasOnly\(allowedProgressKeys\(\)\)/, 'Update stats phải whitelist trường thay đổi');
const allowedBlock = rules.match(/function allowedProgressKeys\(\) \{([\s\S]*?)\n    \}/)?.[1] || '';
for (const field of ['isVip', 'vipUntil', 'vipPlan', 'role', 'permissions', 'isAdmin']) {
  assert.equal(allowedBlock.includes(`'${field}'`), false, `${field} không được nằm trong whitelist tiến độ`);
}
assert.match(rules, /match \/private\/stats[\s\S]*allow create:[\s\S]*validStatsCreate\(\)[\s\S]*allow update:[\s\S]*validStatsUpdate\(\)/, 'Stats phải áp dụng kiểm tra ở cả create và update');

// Policy simulation for the two required denial scenarios.
const allowedProgress = new Set([...allowedBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]));
for (const attemptedField of ['isVip', 'vipUntil', 'vipPlan', 'role']) {
  assert.equal(allowedProgress.has(attemptedField), false, `User update ${attemptedField} phải bị rules từ chối`);
}

const authSource = read('assets/js/firebase-auth.js');
assert.match(authSource, /getDocFromServer\(userStatsDocRef\(user\.uid\)\)/, 'Quyền VIP phải đọc từ Firestore server');
assert.match(authSource, /PROGRESS_STATS_FIELDS/, 'Client chỉ gửi whitelist tiến độ');
assert.match(authSource, /progressStatsForWrite\(currentStats\)/, 'Lưu tiến độ phải loại trường đặc quyền');

const hskSource = read('assets/js/hsk.js');
const hskDetailStart = hskSource.indexOf('async function renderLessonDetail');
const hskSettingsGuard = hskSource.indexOf('requireFreshLearningSettings', hskDetailStart);
const hskPathGuard = hskSource.indexOf('getLearningPathAccess', hskSettingsGuard);
const hskLoad = hskSource.indexOf('loadLessonJson', hskDetailStart);
assert.ok(
  hskDetailStart >= 0
    && hskSettingsGuard > hskDetailStart
    && hskPathGuard > hskSettingsGuard
    && hskLoad > hskPathGuard,
  'hsk.js phải xác minh cấu hình và quyền theo lộ trình trước khi tải JSON'
);
assert.match(hskSource, /getDocFromServer/, 'hsk.js phải xác minh cấu hình khóa bài từ server');
assert.doesNotMatch(hskSource, /requireFreshVipAccess|unlockLessonWithCoins/, 'Quyền học HSK không được phụ thuộc VIP hoặc xu');

const lessonSource = read('lesson-page.js');
const lessonInit = lessonSource.indexOf('async function init()');
const lessonGuardCall = lessonSource.indexOf('if (!await verifyLessonAccessBeforeLoad()) return;', lessonInit);
const lessonLoadCall = lessonSource.indexOf('const staticLesson = await getLessonContent(level, lessonId);', lessonInit);
assert.ok(lessonInit >= 0 && lessonGuardCall > lessonInit && lessonLoadCall > lessonGuardCall, 'lesson-page.js phải guard trước khi tải nội dung');
assert.match(lessonSource, /getDocFromServer/, 'lesson-page.js phải dùng Firestore server');

const adminSource = read('assets/js/admin-super.js');
for (const plan of ["lifetime", "'30d'", "'90d'", "'365d'", 'custom', 'off']) assert.ok(adminSource.includes(plan), `Admin phải có lựa chọn ${plan}`);
assert.match(adminSource, /Timestamp\.fromDate/, 'Admin phải lưu hạn VIP bằng Firestore Timestamp');
assert.match(adminSource, /base = extend && current\.active/, 'Gia hạn phải dựa trên hạn hiện tại khi còn hiệu lực');
assert.match(adminSource, /renderAvatar/, 'Avatar Admin phải dùng renderer chuẩn');
assert.equal(adminSource.includes('applyAvatar('), false, 'Không được gọi applyAvatar sai cách trong Admin');

const profile = read('profile.html');
assert.match(profile, /id="spiritPetCard"[^>]*hidden/, 'Linh thú phải ẩn mặc định để tránh nháy với user thường');
assert.equal(profile.includes("if (localStorage.getItem('cc_profileBackground') === 'true') document.body.classList.add('profile-bg-enabled');"), false, 'Không được bật nền VIP trực tiếp từ localStorage');
assert.match(profile, /hasVerifiedVip/, 'Đổi nền phải dựa trên VIP đã xác minh');

const vipSource = read('assets/js/vip-user.js');
for (const amount of ['69000', '299000', '389000', '459000']) assert.ok(vipSource.includes(amount), `Thiếu giá VIP ${amount}`);
assert.equal(vipSource.includes('90d'), false, 'Bảng mua VIP không còn gói 3 tháng');
assert.match(vipSource, /assets\/images\/donate\/qr\.png/, 'Modal VIP phải hiển thị QR chuyển khoản');
assert.equal(fs.existsSync(path.join(root, 'assets/images/donate/qr.png')), true, 'File QR chuyển khoản phải tồn tại');

assert.match(rules, /match \/writingLessonOverrides\/{docId}[\s\S]*allow read: if true;[\s\S]*allow write: if isSuperAdmin\(\)/, 'CMS Luyện viết phải chỉ cho Super Admin ghi');
const adminHtml = read('admin-super.html');
assert.match(adminHtml, /data-tab="writing"/, 'Admin phải có tab Luyện viết');
assert.match(adminSource, /writingLessonOverrides/, 'Admin phải lưu override Luyện viết');
console.log('VIP security checks: PASS');
