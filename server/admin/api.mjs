import admin from 'firebase-admin';
import adminCore from '../../functions/admin-core.js';
import writingGradingCore from '../../functions/writing-grading-core.js';

const {
  ADMIN_ROLES,
  CMS_ROLES,
  ROLES,
  hasRole,
  normalizePage,
  normalizeRole,
  roleCapabilities,
  safeText,
  visitDedupeId,
  visitFingerprint,
  visitTimeKeys,
  wouldRemoveLastSuperAdmin
} = adminCore;
const { manualGradePatch, refreshAttemptAggregate } = writingGradingCore;

const ALLOWED_ORIGIN = /^https:\/\/.*\.vercel\.app$|^https:\/\/tiengtrungcoca\.firebaseapp\.com$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const BOOTSTRAP_EMAILS = new Set(
  String(process.env.SUPER_ADMIN_EMAILS || 'nqthanhforwork@gmail.com')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
);
const COURSE_TOTALS = Object.freeze({ hsk1:15, hsk2:15, hsk3:20, hsk4:20, hsk5:36, hsk6:40 });

class AdminApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getAdmin() {
  if (admin.apps.length) return admin;
  const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) throw new AdminApiError(503, 'firebase_not_configured', 'Firebase Admin chưa được cấu hình trên Vercel.');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:process.env.FIREBASE_PROJECT_ID,
      clientEmail:process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
  return admin;
}

function services() {
  const sdk = getAdmin();
  return {
    auth:sdk.auth(),
    db:sdk.firestore(),
    FieldValue:sdk.firestore.FieldValue,
    Timestamp:sdk.firestore.Timestamp
  };
}

function setHeaders(req, res) {
  const origin = String(req.headers.origin || '');
  if (ALLOWED_ORIGIN.test(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch {
    throw new AdminApiError(400, 'invalid_json', 'Dữ liệu JSON không hợp lệ.');
  }
}

async function authenticate(req) {
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new AdminApiError(401, 'auth_required', 'Vui lòng đăng nhập.');
  try { return await getAdmin().auth().verifyIdToken(token); } catch {
    throw new AdminApiError(401, 'invalid_token', 'Phiên đăng nhập đã hết hạn.');
  }
}

function actorFromToken(token) {
  const email = String(token.email || '').toLowerCase();
  const claimedRole = normalizeRole(token.role);
  return {
    uid:token.uid,
    email,
    role:BOOTSTRAP_EMAILS.has(email) ? 'super_admin' : claimedRole,
    displayName:safeText(token.name || '', 120)
  };
}

function requireRole(actor, allowed) {
  if (!hasRole(actor.role, allowed)) throw new AdminApiError(403, 'permission_denied', 'Không đủ quyền quản trị.');
  return actor;
}

function requireSuper(actor) {
  return requireRole(actor, ['super_admin']);
}

function requireUid(value) {
  const uid = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw new AdminApiError(400, 'invalid_uid', 'UID không hợp lệ.');
  return uid;
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return Number(value) || 0;
}

function jsonSafe(value) {
  if (value === null || value === undefined) return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}

function authUserJson(record, publicData = {}, stats = {}) {
  const email = String(record.email || '').toLowerCase();
  const role = BOOTSTRAP_EMAILS.has(email) ? 'super_admin' : normalizeRole(record.customClaims?.role || publicData.role);
  return {
    id:record.uid,
    uid:record.uid,
    email:record.email || '',
    emailVerified:Boolean(record.emailVerified),
    displayName:record.displayName || publicData.displayName || '',
    photoURL:record.photoURL || publicData.photoURL || '',
    disabled:Boolean(record.disabled),
    role,
    creationTime:record.metadata?.creationTime || '',
    lastSignInTime:record.metadata?.lastSignInTime || '',
    public:jsonSafe(publicData),
    stats:jsonSafe(stats)
  };
}

async function audit(actor, action, { targetUid = '', targetEmail = '', details = {}, outcome = 'success', errorCode = '' } = {}) {
  const { db, FieldValue } = services();
  await db.collection('adminAuditLogs').add({
    actorUid:actor.uid, actorEmail:actor.email, actorRole:actor.role,
    action, targetUid, targetEmail:safeText(targetEmail, 240),
    details:jsonSafe(details), outcome, errorCode:safeText(errorCode, 120),
    createdAt:FieldValue.serverTimestamp()
  });
}

async function auditFailure(actor, action, uid, error, details = {}) {
  try { await audit(actor, action, { targetUid:uid, details, outcome:'failure', errorCode:error?.code || 'unknown' }); } catch {}
}

async function getUserData(records) {
  if (!records.length) return [];
  const { db } = services();
  const publicRefs = records.map(user => db.collection('users').doc(user.uid));
  const statsRefs = records.map(user => db.collection('users').doc(user.uid).collection('private').doc('stats'));
  const snapshots = await db.getAll(...publicRefs, ...statsRefs);
  return records.map((user, index) => authUserJson(
    user,
    snapshots[index]?.exists ? snapshots[index].data() : {},
    snapshots[index + records.length]?.exists ? snapshots[index + records.length].data() : {}
  ));
}

async function findUsers(search, maxResults) {
  const { auth } = services();
  const needle = String(search || '').trim().toLowerCase();
  if (needle.includes('@')) {
    try { return [await auth.getUserByEmail(needle)]; } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  } else if (/^[A-Za-z0-9_-]{6,128}$/.test(needle)) {
    try { return [await auth.getUser(needle)]; } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  }
  const matches = [];
  let pageToken;
  let scanned = 0;
  do {
    const page = await auth.listUsers(500, pageToken);
    scanned += page.users.length;
    matches.push(...page.users.filter(user => [user.uid, user.email, user.displayName].join(' ').toLowerCase().includes(needle)));
    pageToken = page.pageToken;
  } while (pageToken && matches.length < maxResults && scanned < 5000);
  return matches.slice(0, maxResults);
}

async function countSuperAdmins() {
  const { auth } = services();
  let count = 0;
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    count += page.users.filter(user => BOOTSTRAP_EMAILS.has(String(user.email || '').toLowerCase())
      || normalizeRole(user.customClaims?.role) === 'super_admin').length;
    pageToken = page.pageToken;
  } while (pageToken);
  return count;
}

async function protectLastSuper(target, nextRole) {
  const currentRole = BOOTSTRAP_EMAILS.has(String(target.email || '').toLowerCase())
    ? 'super_admin' : normalizeRole(target.customClaims?.role);
  if (wouldRemoveLastSuperAdmin({ currentRole, nextRole, superAdminCount:await countSuperAdmins() })) {
    throw new AdminApiError(409, 'last_super_admin', 'Không thể xóa, khóa hoặc hạ quyền Super Admin cuối cùng.');
  }
}

async function visitSummary(now = new Date()) {
  const { db } = services();
  const { day, month } = visitTimeKeys(now);
  const totalRef = db.collection('analytics').doc('visits');
  const [total, daily, monthly] = await db.getAll(
    totalRef, totalRef.collection('daily').doc(day), totalRef.collection('monthly').doc(month)
  );
  const data = total.exists ? total.data() : {};
  return {
    total:Number(data.total || 0),
    today:Number(daily.exists ? daily.data().count || 0 : 0),
    month:Number(monthly.exists ? monthly.data().count || 0 : 0),
    dayKey:day,
    monthKey:month,
    migrationComplete:data.migrationComplete === true,
    legacyBaseline:Number(data.legacyBaseline || 0),
    lastVisitAt:timestampMillis(data.lastVisitAt)
  };
}

async function recordVisit(req, data) {
  const { db, FieldValue, Timestamp } = services();
  let uid = '';
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (token) {
    try { uid = (await getAdmin().auth().verifyIdToken(token)).uid || ''; } catch {}
  }
  const now = new Date();
  const nowMs = now.getTime();
  const page = normalizePage(data.page);
  const language = safeText(data.language || req.headers['accept-language'], 80);
  const userAgent = safeText(req.headers['user-agent'], 500);
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const identity = visitFingerprint({ uid, ip, userAgent, language });
  const dedupeId = visitDedupeId({ identity, page, nowMs });
  const { day, month } = visitTimeKeys(now);
  const totalRef = db.collection('analytics').doc('visits');
  const dedupeRef = totalRef.collection('dedupe').doc(dedupeId);
  const nowTimestamp = Timestamp.fromMillis(nowMs);
  const counted = await db.runTransaction(async transaction => {
    const [dedupe, total] = await Promise.all([transaction.get(dedupeRef), transaction.get(totalRef)]);
    if (dedupe.exists) return false;
    transaction.create(dedupeRef, { page, createdAt:nowTimestamp, expiresAt:Timestamp.fromMillis(nowMs + 48 * 60 * 60 * 1000) });
    transaction.set(totalRef, {
      total:FieldValue.increment(1),
      startedAt:total.exists && total.data()?.startedAt ? total.data().startedAt : nowTimestamp,
      lastVisitAt:nowTimestamp,
      counterVersion:2
    }, { merge:true });
    transaction.set(totalRef.collection('daily').doc(day), { count:FieldValue.increment(1), date:day, updatedAt:nowTimestamp }, { merge:true });
    transaction.set(totalRef.collection('monthly').doc(month), { count:FieldValue.increment(1), month, updatedAt:nowTimestamp }, { merge:true });
    transaction.create(db.collection('accessLogs').doc(), {
      uid, page, title:safeText(data.title, 180), referrer:normalizePage(data.referrer || '/'),
      browser:userAgent, language, device:safeText(data.device, 24), counterVersion:2, createdAt:nowTimestamp
    });
    return true;
  });
  return { ok:true, counted, dedupeWindowMinutes:30 };
}

async function bootstrap(actor, token) {
  const { auth, db, FieldValue } = services();
  if (!BOOTSTRAP_EMAILS.has(actor.email) && !hasRole(actor.role, CMS_ROLES)) {
    throw new AdminApiError(403, 'permission_denied', 'Tài khoản không có quyền CMS.');
  }
  const role = BOOTSTRAP_EMAILS.has(actor.email) ? 'super_admin' : actor.role;
  const user = await auth.getUser(actor.uid);
  const current = normalizeRole(user.customClaims?.role) === role
    && Boolean(user.customClaims?.admin) === hasRole(role, ADMIN_ROLES);
  if (!current) {
    await auth.setCustomUserClaims(actor.uid, { ...(user.customClaims || {}), role, admin:hasRole(role, ADMIN_ROLES) });
    await db.collection('users').doc(actor.uid).set({
      role, roleUpdatedAt:FieldValue.serverTimestamp(), roleUpdatedBy:actor.uid
    }, { merge:true });
    await audit({ ...actor, role }, 'admin.bootstrap', { targetUid:actor.uid, targetEmail:actor.email, details:{ role } });
  }
  return { ok:true, role, capabilities:roleCapabilities(role), refreshToken:!current };
}

async function listUsers(actor, data) {
  requireRole(actor, ADMIN_ROLES);
  const { auth } = services();
  const maxResults = Math.min(Math.max(Number(data.maxResults) || 25, 1), 100);
  const search = safeText(data.search, 160);
  if (search) return { users:await getUserData(await findUsers(search, maxResults)), pageToken:'', search:true };
  const result = await auth.listUsers(maxResults, safeText(data.pageToken, 2048) || undefined);
  return { users:await getUserData(result.users), pageToken:result.pageToken || '', search:false };
}

async function setRole(actor, data) {
  requireSuper(actor);
  const { auth, db, FieldValue } = services();
  const uid = requireUid(data.uid);
  const role = String(data.role || '').trim().toLowerCase();
  if (!ROLES.includes(role)) throw new AdminApiError(400, 'invalid_role', 'Role không hợp lệ.');
  if (uid === actor.uid) throw new AdminApiError(409, 'self_change', 'Không thể đổi quyền của chính mình.');
  try {
    const target = await auth.getUser(uid);
    await protectLastSuper(target, role);
    await auth.setCustomUserClaims(uid, { ...(target.customClaims || {}), role, admin:hasRole(role, ADMIN_ROLES) });
    await db.collection('users').doc(uid).set({ role, roleUpdatedAt:FieldValue.serverTimestamp(), roleUpdatedBy:actor.uid }, { merge:true });
    await auth.revokeRefreshTokens(uid);
    await audit(actor, 'user.role_changed', { targetUid:uid, targetEmail:target.email, details:{ from:normalizeRole(target.customClaims?.role), to:role } });
    return { ok:true, role };
  } catch (error) {
    await auditFailure(actor, 'user.role_changed', uid, error, { role });
    throw error;
  }
}

async function setDisabled(actor, data) {
  requireSuper(actor);
  const { auth, db, FieldValue } = services();
  const uid = requireUid(data.uid);
  const disabled = data.disabled === true;
  if (uid === actor.uid) throw new AdminApiError(409, 'self_change', 'Không thể khóa chính mình.');
  try {
    const target = await auth.getUser(uid);
    if (disabled) await protectLastSuper(target, 'user');
    const updated = await auth.updateUser(uid, { disabled });
    await auth.revokeRefreshTokens(uid);
    await db.collection('users').doc(uid).set({ authDisabled:disabled, adminUpdatedAt:FieldValue.serverTimestamp() }, { merge:true });
    await audit(actor, disabled ? 'user.disabled' : 'user.enabled', { targetUid:uid, targetEmail:target.email, details:{ disabled } });
    return { ok:true, user:authUserJson(updated) };
  } catch (error) {
    await auditFailure(actor, disabled ? 'user.disabled' : 'user.enabled', uid, error);
    throw error;
  }
}

async function deleteUser(actor, data) {
  requireSuper(actor);
  const { auth, db, FieldValue } = services();
  const uid = requireUid(data.uid);
  if (String(data.confirmationUid || '') !== uid) throw new AdminApiError(409, 'confirmation_mismatch', 'UID xác nhận không khớp.');
  if (uid === actor.uid) throw new AdminApiError(409, 'self_delete', 'Không thể xóa chính mình.');
  let target = null;
  let authDeleted = false;
  const job = db.collection('adminDeletionJobs').doc(uid);
  try {
    try { target = await auth.getUser(uid); } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
      authDeleted = true;
    }
    if (target) {
      await protectLastSuper(target, 'user');
      if (!target.disabled) await auth.updateUser(uid, { disabled:true });
    }
    await job.set({
      targetUid:uid, targetEmail:target?.email || '', requestedBy:actor.uid,
      status:authDeleted ? 'firestore_cleanup_retry' : 'started',
      authDeleted, updatedAt:FieldValue.serverTimestamp()
    }, { merge:true });
    if (target) {
      await auth.deleteUser(uid);
      authDeleted = true;
      await job.set({ status:'auth_deleted', authDeleted:true, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
    }
    await db.recursiveDelete(db.collection('users').doc(uid));
    await job.set({
      status:'completed', authDeleted:true, firestoreDeleted:true,
      completedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()
    }, { merge:true });
    await audit(actor, 'user.deleted', { targetUid:uid, targetEmail:target?.email || '', details:{ deletedScopes:[`users/${uid}`, `FirebaseAuth/${uid}`] } });
    return { ok:true };
  } catch (error) {
    try { await job.set({
      status:authDeleted ? 'firestore_cleanup_pending' : 'failed',
      authDeleted, errorCode:safeText(error?.code || 'unknown', 120),
      updatedAt:FieldValue.serverTimestamp()
    }, { merge:true }); } catch {}
    await auditFailure(actor, 'user.deleted', uid, error, { authDeleted });
    if (authDeleted) throw new AdminApiError(500, 'cleanup_pending', 'Auth đã xóa; dọn Firestore đang chờ. Hãy thử lại cùng UID.');
    throw error;
  }
}

async function updateSensitive(actor, data) {
  requireSuper(actor);
  const { auth, db, FieldValue, Timestamp } = services();
  const uid = requireUid(data.uid);
  const action = String(data.action || '');
  if (uid === actor.uid) throw new AdminApiError(409, 'self_change', 'Không thể sửa dữ liệu nhạy cảm của chính mình.');
  const publicRef = db.collection('users').doc(uid);
  const statsRef = publicRef.collection('private').doc('stats');
  try {
    await auth.getUser(uid);
    if (action === 'vip') {
      const isVip = data.isVip === true;
      const raw = data.vipUntilMillis;
      if (isVip && raw !== null && raw !== undefined && (!Number.isFinite(Number(raw)) || Number(raw) <= Date.now())) {
        throw new AdminApiError(400, 'invalid_vip_expiry', 'Hạn VIP phải ở tương lai.');
      }
      await statsRef.set({
        isVip,
        vipUntil:isVip && raw !== null && raw !== undefined ? Timestamp.fromMillis(Number(raw)) : null,
        vipPlan:isVip ? safeText(data.vipPlan, 32) || null : null,
        vipUpdatedAt:FieldValue.serverTimestamp(), vipUpdatedBy:actor.email,
        updatedAt:FieldValue.serverTimestamp(), adminUpdatedAt:FieldValue.serverTimestamp()
      }, { merge:true });
    } else if (action === 'coins') {
      const delta = Number(data.delta);
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1000000) throw new AdminApiError(400, 'invalid_coins', 'Số xu không hợp lệ.');
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(statsRef);
        const current = snapshot.exists ? snapshot.data() : {};
        transaction.set(statsRef, {
          coins:Math.max(0, Number(current.coins || 0) + delta),
          totalCoinsEarned:delta > 0 ? Number(current.totalCoinsEarned || 0) + delta : Number(current.totalCoinsEarned || 0),
          updatedAt:FieldValue.serverTimestamp(), adminUpdatedAt:FieldValue.serverTimestamp()
        }, { merge:true });
      });
    } else if (action === 'max' || action === 'unlock') {
      const completedLessonIds = {};
      Object.entries(COURSE_TOTALS).forEach(([level, total]) => {
        for (let lesson = 1; lesson <= total; lesson += 1) completedLessonIds[`${level}-${lesson}`] = true;
      });
      const patch = {
        unlockedAll:true, completedLessonIds, completedLessons:Object.keys(completedLessonIds).length,
        courses:Object.fromEntries(Object.keys(COURSE_TOTALS).map(level => [level, 100])),
        updatedAt:FieldValue.serverTimestamp(), adminUpdatedAt:FieldValue.serverTimestamp()
      };
      if (action === 'max') Object.assign(patch, { xp:999999, todayXp:999999, lastXp:999999, level:10, petLevel:10, spiritLevel:10, currentLevel:'HSK 6', streak:999 });
      await Promise.all([
        publicRef.set({ unlockedAll:true, ...(action === 'max' ? { adminBoost:true } : {}), adminUpdatedAt:FieldValue.serverTimestamp() }, { merge:true }),
        statsRef.set(patch, { merge:true })
      ]);
    } else if (action === 'reset') {
      await Promise.all([
        publicRef.set({ adminBoost:false, unlockedAll:false, adminUpdatedAt:FieldValue.serverTimestamp() }, { merge:true }),
        statsRef.set({
          xp:0, coins:0, totalCoinsEarned:0, isVip:false, vipUntil:null, vipPlan:null,
          unlockedLessons:{}, writingCompleted:{}, coinHistory:[], checkInStreak:0,
          lastCheckInDate:'', todayXp:0, lastXp:0, level:1, petLevel:1, spiritLevel:1,
          unlockedAll:false, completedLessonIds:{}, completedLessons:0,
          courses:{ hsk1:0, hsk2:0, hsk3:0, hsk4:0, hsk5:0, hsk6:0 },
          streak:0, history:[], updatedAt:FieldValue.serverTimestamp(), adminUpdatedAt:FieldValue.serverTimestamp()
        }, { merge:true })
      ]);
    } else throw new AdminApiError(400, 'unsupported_action', 'Thao tác dữ liệu không được hỗ trợ.');
    await audit(actor, `user.sensitive.${action}`, { targetUid:uid, details:action === 'coins' ? { delta:Number(data.delta) } : { action } });
    return { ok:true };
  } catch (error) {
    await auditFailure(actor, `user.sensitive.${action || 'unknown'}`, uid, error);
    throw error;
  }
}

async function listLogs(actor, data) {
  requireRole(actor, ADMIN_ROLES);
  const { db, Timestamp } = services();
  const pageSize = Math.min(Math.max(Number(data.pageSize) || 50, 10), 100);
  const cursor = data.cursor || {};
  const fetchSource = async name => {
    let query = db.collection(name).orderBy('createdAt', 'desc');
    if (Number(cursor[name]) > 0) query = query.startAfter(Timestamp.fromMillis(Number(cursor[name])));
    const snapshot = await query.limit(pageSize).get();
    return snapshot.docs.map(document => ({
      id:document.id, _collection:name, ...jsonSafe(document.data()),
      _cursorMillis:timestampMillis(document.data().createdAt)
    }));
  };
  const [accessLogs, visits] = await Promise.all([fetchSource('accessLogs'), fetchSource('visits')]);
  const merged = [...accessLogs, ...visits].sort((a,b) => b._cursorMillis - a._cursorMillis).slice(0, pageSize);
  const consumed = { accessLogs:Number(cursor.accessLogs || 0), visits:Number(cursor.visits || 0) };
  merged.forEach(row => { consumed[row._collection] = row._cursorMillis; });
  return {
    logs:merged.map(({ _cursorMillis, ...row }) => row),
    cursor:consumed,
    hasMore:accessLogs.length === pageSize || visits.length === pageSize
  };
}

async function migrateVisits(actor) {
  requireSuper(actor);
  const { db, FieldValue, Timestamp } = services();
  const totalRef = db.collection('analytics').doc('visits');
  const total = await totalRef.get();
  if (total.exists && total.data()?.migrationComplete === true) return { ok:true, alreadyMigrated:true, ...(await visitSummary()) };
  const cutoff = total.exists && total.data()?.startedAt ? total.data().startedAt : Timestamp.now();
  const [access, visits] = await Promise.all([
    db.collection('accessLogs').where('createdAt', '<', cutoff).count().get(),
    db.collection('visits').count().get()
  ]);
  const accessLogsCount = Number(access.data().count || 0);
  const visitsCount = Number(visits.data().count || 0);
  const legacyBaseline = Math.max(accessLogsCount, visitsCount);
  await db.runTransaction(async transaction => {
    const current = await transaction.get(totalRef);
    if (current.exists && current.data()?.migrationComplete === true) return;
    transaction.set(totalRef, {
      total:FieldValue.increment(legacyBaseline),
      startedAt:current.exists && current.data()?.startedAt ? current.data().startedAt : cutoff,
      migrationComplete:true, migratedAt:FieldValue.serverTimestamp(), legacyBaseline,
      legacyAccessLogsCount:accessLogsCount, legacyVisitsCount:visitsCount, counterVersion:2
    }, { merge:true });
  });
  await audit(actor, 'analytics.visits_migrated', { details:{ legacyBaseline, accessLogsCount, visitsCount } });
  return { ok:true, alreadyMigrated:false, ...(await visitSummary()) };
}

function writingStatusMatches(data, filter, nowMs) {
  if (!filter) return true;
  if (filter === 'pending') return ['pending_manual', 'ai_grading'].includes(data.status);
  if (filter === 'due_soon') {
    const eligibleAt = timestampMillis(data.aiEligibleAt);
    return data.status === 'pending_manual' && eligibleAt > nowMs && eligibleAt <= nowMs + 60 * 60 * 1000;
  }
  if (filter === 'graded_ai') return data.status === 'graded_ai';
  if (filter === 'graded_manual') return data.status === 'graded_manual';
  return data.status === filter;
}

function writingAdminJson(document) {
  return { id:document.id, ...jsonSafe(document.data()) };
}

async function listWritingSubmissions(actor, data) {
  requireRole(actor, CMS_ROLES);
  const { db } = services();
  const nowMs = Date.now();
  const status = safeText(data.status, 40);
  const hskLevel = safeText(data.hskLevel, 20);
  const questionType = safeText(data.questionType, 40);
  const testId = safeText(data.testId, 180);
  const userId = safeText(data.userId, 180);
  const fromMillis = Number(data.fromMillis || 0);
  const toMillis = Number(data.toMillis || 0);
  const pageSize = Math.min(Math.max(Number(data.pageSize) || 100, 10), 200);
  const snapshot = await db.collection('writingSubmissions').orderBy('submittedAt', 'desc').limit(500).get();
  const submissions = snapshot.docs
    .filter(document => {
      const item = document.data();
      const submittedAt = timestampMillis(item.submittedAt);
      return writingStatusMatches(item, status, nowMs)
        && (!hskLevel || item.hskLevel === hskLevel)
        && (!questionType || item.questionType === questionType)
        && (!testId || item.testId === testId)
        && (!userId || item.userId === userId)
        && (!fromMillis || submittedAt >= fromMillis)
        && (!toMillis || submittedAt <= toMillis);
    })
    .slice(0, pageSize)
    .map(writingAdminJson);
  return { ok:true, submissions, scanned:snapshot.size, nowMillis:nowMs };
}

async function getWritingSubmission(actor, data) {
  requireRole(actor, CMS_ROLES);
  const { db } = services();
  const id = safeText(data.submissionId, 128);
  if (!/^[a-f0-9]{64}$/u.test(id)) throw new AdminApiError(400, 'invalid_submission_id', 'submissionId không hợp lệ.');
  const document = await db.collection('writingSubmissions').doc(id).get();
  if (!document.exists) throw new AdminApiError(404, 'submission_not_found', 'Không tìm thấy bài tự luận.');
  return { ok:true, submission:writingAdminJson(document) };
}

async function gradeWritingSubmission(actor, data) {
  requireRole(actor, CMS_ROLES);
  const { db, Timestamp } = services();
  const id = safeText(data.submissionId, 128);
  if (!/^[a-f0-9]{64}$/u.test(id)) throw new AdminApiError(400, 'invalid_submission_id', 'submissionId không hợp lệ.');
  const score = Number(data.score);
  if (!Number.isFinite(score)) throw new AdminApiError(400, 'invalid_score', 'Điểm không hợp lệ.');
  const feedback = safeText(data.feedback, 2000);
  const ref = db.collection('writingSubmissions').doc(id);
  const nowMs = Date.now();
  const now = Timestamp.fromMillis(nowMs);
  const result = await db.runTransaction(async transaction => {
    const document = await transaction.get(ref);
    if (!document.exists) throw new AdminApiError(404, 'submission_not_found', 'Không tìm thấy bài tự luận.');
    const current = document.data();
    const maxScore = Number(current.maxScore || 0);
    if (score < 0 || score > maxScore) {
      throw new AdminApiError(400, 'score_out_of_range', `Điểm phải nằm trong khoảng 0–${maxScore}.`);
    }
    const patch = manualGradePatch(current, {
      score,
      feedback,
      gradedBy:actor.uid,
      gradedAtMillis:nowMs
    });
    const history = Array.isArray(current.gradingHistory) ? current.gradingHistory.slice(-19) : [];
    transaction.update(ref, {
      ...patch,
      gradedAt:now,
      updatedAt:now,
      gradingHistory:[...history, {
        source:'manual',
        score:patch.finalScore,
        feedback,
        actorUid:actor.uid,
        actorRole:actor.role,
        atMillis:nowMs,
        previousStatus:current.status,
        previousFinalScore:current.finalScore ?? null
      }]
    });
    return {
      previousStatus:current.status,
      previousScore:current.finalScore ?? null,
      finalScore:patch.finalScore,
      userId:current.userId,
      attemptId:current.attemptId
    };
  });
  await refreshAttemptAggregate({
    db,
    Timestamp,
    userId:result.userId,
    attemptId:result.attemptId,
    nowMs
  });
  await audit(actor, 'writing_submission.graded_manual', {
    targetUid:result.userId,
    details:{
      submissionId:id,
      attemptId:result.attemptId,
      previousStatus:result.previousStatus,
      previousScore:result.previousScore,
      finalScore:result.finalScore
    }
  });
  const updated = await ref.get();
  return { ok:true, submission:writingAdminJson(updated) };
}

async function dispatch(action, actor, token, data) {
  const { auth, db } = services();
  if (action === 'adminBootstrap') return bootstrap(actor, token);
  if (action === 'adminGetSession') {
    requireRole(actor, CMS_ROLES);
    return { ok:true, ...roleCapabilities(actor.role), email:actor.email, uid:actor.uid };
  }
  if (action === 'adminGetDashboard') {
    requireRole(actor, ADMIN_ROLES);
    const [users, visits] = await Promise.all([db.collection('users').count().get(), visitSummary()]);
    return { ok:true, totalUsers:Number(users.data().count || 0), visits };
  }
  if (action === 'adminListUsers') return listUsers(actor, data);
  if (action === 'adminSetUserRole') return setRole(actor, data);
  if (action === 'adminSetUserDisabled') return setDisabled(actor, data);
  if (action === 'adminDeleteUser') return deleteUser(actor, data);
  if (action === 'adminUpdateUserData') return updateSensitive(actor, data);
  if (action === 'adminListAccessLogs') return listLogs(actor, data);
  if (action === 'adminGetVisitSummary') {
    requireRole(actor, ADMIN_ROLES);
    return { ok:true, ...(await visitSummary()) };
  }
  if (action === 'adminMigrateVisitCounters') return migrateVisits(actor);
  if (action === 'adminListWritingSubmissions') return listWritingSubmissions(actor, data);
  if (action === 'adminGetWritingSubmission') return getWritingSubmission(actor, data);
  if (action === 'adminGradeWritingSubmission') return gradeWritingSubmission(actor, data);
  throw new AdminApiError(404, 'unknown_action', 'Admin action không tồn tại.');
}

export async function handleAdminRequest(req, res) {
  setHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok:false, code:'method_not_allowed', message:'Chỉ hỗ trợ POST.' });
  try {
    const body = getBody(req);
    const action = safeText(body.action, 80);
    const data = body.data && typeof body.data === 'object' ? body.data : {};
    if (action === 'recordVisit') return res.status(200).json(await recordVisit(req, data));
    const token = await authenticate(req);
    const actor = actorFromToken(token);
    return res.status(200).json(await dispatch(action, actor, token, data));
  } catch (error) {
    const status = Number(error?.status) || (String(error?.code || '').startsWith('auth/') ? 400 : 500);
    if (status >= 500) console.error('[admin-api]', error?.code || error?.name, error?.message);
    return res.status(status).json({
      ok:false,
      code:error?.code || 'internal',
      message:status >= 500 ? 'Không thể xử lý yêu cầu quản trị.' : error.message
    });
  }
}
