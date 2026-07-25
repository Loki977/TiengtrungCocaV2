'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
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
} = require('./admin-core');

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;
const BOOTSTRAP_SUPER_ADMIN_EMAILS = new Set(
  String(process.env.SUPER_ADMIN_EMAILS || 'nqthanhforwork@gmail.com')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
);
const COURSE_TOTALS = Object.freeze({ hsk1: 15, hsk2: 15, hsk3: 20, hsk4: 20, hsk5: 36, hsk6: 40 });
const CALLABLE_OPTIONS = {
  region: 'us-central1',
  cors: [
    'https://tiengtrungcoca.vercel.app',
    'http://127.0.0.1:4177',
    'http://127.0.0.1:5500',
    'http://localhost:4177',
    'http://localhost:5500',
    /https:\/\/.*\.vercel\.app$/
  ]
};

function actorFromRequest(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const email = String(request.auth.token?.email || '').toLowerCase();
  const claimedRole = normalizeRole(request.auth.token?.role);
  const role = BOOTSTRAP_SUPER_ADMIN_EMAILS.has(email) ? 'super_admin' : claimedRole;
  return {
    uid: request.auth.uid,
    email,
    role,
    displayName: safeText(request.auth.token?.name || '', 120)
  };
}

function requireRole(request, allowedRoles) {
  const actor = actorFromRequest(request);
  if (!hasRole(actor.role, allowedRoles)) {
    throw new HttpsError('permission-denied', 'Insufficient administrator role.');
  }
  return actor;
}

function requireSuperAdmin(request) {
  return requireRole(request, ['super_admin']);
}

function requireUid(value) {
  const uid = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) {
    throw new HttpsError('invalid-argument', 'A valid uid is required.');
  }
  return uid;
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const millis = Number(value);
  return Number.isFinite(millis) ? millis : 0;
}

function jsonSafe(value) {
  if (value === null || value === undefined) return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  }
  return value;
}

function publicUserSummary(data = {}) {
  const allowed = ['uid', 'displayName', 'email', 'photoURL', 'createdAt', 'updatedAt', 'authDisabled', 'role'];
  return Object.fromEntries(allowed.filter(key => data[key] !== undefined).map(key => [key, jsonSafe(data[key])]));
}

function privateStatsSummary(data = {}) {
  const allowed = [
    'xp', 'coins', 'totalCoinsEarned', 'unlockedLessons', 'currentLevel', 'petLevel',
    'completedLessons', 'completedLessonIds', 'unlockedAll', 'isVip', 'vipUntil',
    'vipPlan', 'updatedAt'
  ];
  return Object.fromEntries(allowed.filter(key => data[key] !== undefined).map(key => [key, jsonSafe(data[key])]));
}

function authUserJson(userRecord, publicData = {}, statsData = {}) {
  const email = String(userRecord.email || '').toLowerCase();
  const role = BOOTSTRAP_SUPER_ADMIN_EMAILS.has(email)
    ? 'super_admin'
    : normalizeRole(userRecord.customClaims?.role || publicData.role);
  return {
    id: userRecord.uid,
    uid: userRecord.uid,
    email: userRecord.email || '',
    emailVerified: Boolean(userRecord.emailVerified),
    displayName: userRecord.displayName || publicData.displayName || '',
    photoURL: userRecord.photoURL || publicData.photoURL || '',
    disabled: Boolean(userRecord.disabled),
    role,
    creationTime: userRecord.metadata?.creationTime || '',
    lastSignInTime: userRecord.metadata?.lastSignInTime || '',
    public: publicUserSummary(publicData),
    stats: privateStatsSummary(statsData)
  };
}

async function writeAudit(actor, action, {
  targetUid = '',
  targetEmail = '',
  details = {},
  outcome = 'success',
  errorCode = ''
} = {}) {
  await db.collection('adminAuditLogs').add({
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    targetUid,
    targetEmail: safeText(targetEmail, 240),
    details: jsonSafe(details),
    outcome,
    errorCode: safeText(errorCode, 120),
    createdAt: FieldValue.serverTimestamp()
  });
}

async function auditFailure(actor, action, targetUid, error, details = {}) {
  try {
    await writeAudit(actor, action, {
      targetUid,
      details,
      outcome: 'failure',
      errorCode: error?.code || 'unknown'
    });
  } catch (auditError) {
    logger.error('Failed to persist administrator failure audit', {
      action,
      targetUid,
      error: auditError?.message
    });
  }
}

async function countSuperAdmins() {
  let count = 0;
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    count += page.users.filter(user => {
      const email = String(user.email || '').toLowerCase();
      return BOOTSTRAP_SUPER_ADMIN_EMAILS.has(email)
        || normalizeRole(user.customClaims?.role) === 'super_admin';
    }).length;
    pageToken = page.pageToken;
  } while (pageToken);
  return count;
}

async function assertTargetCanLoseSuperAdmin(targetUser, nextRole) {
  const targetRole = BOOTSTRAP_SUPER_ADMIN_EMAILS.has(String(targetUser.email || '').toLowerCase())
    ? 'super_admin'
    : normalizeRole(targetUser.customClaims?.role);
  if (!wouldRemoveLastSuperAdmin({
    currentRole: targetRole,
    nextRole,
    superAdminCount: await countSuperAdmins()
  })) return;
  throw new HttpsError('failed-precondition', 'Cannot remove or disable the final Super Admin.');
}

async function getUserData(userRecords) {
  if (!userRecords.length) return [];
  const publicRefs = userRecords.map(user => db.collection('users').doc(user.uid));
  const statsRefs = userRecords.map(user => db.collection('users').doc(user.uid).collection('private').doc('stats'));
  const snapshots = await db.getAll(...publicRefs, ...statsRefs);
  return userRecords.map((user, index) => authUserJson(
    user,
    snapshots[index]?.exists ? snapshots[index].data() : {},
    snapshots[index + userRecords.length]?.exists ? snapshots[index + userRecords.length].data() : {}
  ));
}

async function findAuthUsers(search, maxResults) {
  const needle = String(search || '').trim().toLowerCase();
  if (!needle) return [];
  const direct = [];
  if (needle.includes('@')) {
    try { direct.push(await auth.getUserByEmail(needle)); } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  } else if (/^[A-Za-z0-9_-]{6,128}$/.test(needle)) {
    try { direct.push(await auth.getUser(needle)); } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  }
  if (direct.length) return direct;

  const matches = [];
  let pageToken;
  let scanned = 0;
  do {
    const page = await auth.listUsers(500, pageToken);
    scanned += page.users.length;
    matches.push(...page.users.filter(user => [
      user.uid,
      user.email,
      user.displayName
    ].join(' ').toLowerCase().includes(needle)));
    pageToken = page.pageToken;
  } while (pageToken && matches.length < maxResults && scanned < 5000);
  return matches.slice(0, maxResults);
}

async function visitSummary(now = new Date()) {
  const { day, month } = visitTimeKeys(now);
  const [totalSnap, daySnap, monthSnap] = await db.getAll(
    db.collection('analytics').doc('visits'),
    db.collection('analytics').doc('visits').collection('daily').doc(day),
    db.collection('analytics').doc('visits').collection('monthly').doc(month)
  );
  const totalData = totalSnap.exists ? totalSnap.data() : {};
  return {
    total: Number(totalData.total || 0),
    today: Number(daySnap.exists ? daySnap.data().count || 0 : 0),
    month: Number(monthSnap.exists ? monthSnap.data().count || 0 : 0),
    dayKey: day,
    monthKey: month,
    migrationComplete: totalData.migrationComplete === true,
    legacyBaseline: Number(totalData.legacyBaseline || 0),
    lastVisitAt: timestampMillis(totalData.lastVisitAt)
  };
}

exports.recordVisit = onCall({ ...CALLABLE_OPTIONS, maxInstances: 20 }, async request => {
  const now = new Date();
  const nowMs = now.getTime();
  const page = normalizePage(request.data?.page);
  const language = safeText(request.data?.language || request.rawRequest?.get('accept-language'), 80);
  const userAgent = safeText(request.rawRequest?.get('user-agent'), 500);
  const forwarded = String(request.rawRequest?.get('x-forwarded-for') || '').split(',')[0].trim();
  const ip = forwarded || request.rawRequest?.ip || '';
  const identity = visitFingerprint({
    uid: request.auth?.uid || '',
    ip,
    userAgent,
    language
  });
  const dedupeId = visitDedupeId({ identity, page, nowMs });
  const { day, month } = visitTimeKeys(now);
  const totalRef = db.collection('analytics').doc('visits');
  const dayRef = totalRef.collection('daily').doc(day);
  const monthRef = totalRef.collection('monthly').doc(month);
  const dedupeRef = totalRef.collection('dedupe').doc(dedupeId);
  const logRef = db.collection('accessLogs').doc();
  const nowTimestamp = Timestamp.fromMillis(nowMs);

  try {
    const counted = await db.runTransaction(async transaction => {
      const [dedupeSnap, totalSnap] = await Promise.all([
        transaction.get(dedupeRef),
        transaction.get(totalRef)
      ]);
      if (dedupeSnap.exists) return false;
      transaction.create(dedupeRef, {
        page,
        createdAt: nowTimestamp,
        expiresAt: Timestamp.fromMillis(nowMs + 48 * 60 * 60 * 1000)
      });
      transaction.set(totalRef, {
        total: FieldValue.increment(1),
        startedAt: totalSnap.exists && totalSnap.data()?.startedAt
          ? totalSnap.data().startedAt
          : nowTimestamp,
        lastVisitAt: nowTimestamp,
        counterVersion: 2
      }, { merge: true });
      transaction.set(dayRef, {
        count: FieldValue.increment(1),
        date: day,
        updatedAt: nowTimestamp
      }, { merge: true });
      transaction.set(monthRef, {
        count: FieldValue.increment(1),
        month,
        updatedAt: nowTimestamp
      }, { merge: true });
      transaction.create(logRef, {
        uid: request.auth?.uid || '',
        page,
        title: safeText(request.data?.title, 180),
        referrer: normalizePage(request.data?.referrer || '/'),
        browser: userAgent,
        language,
        device: safeText(request.data?.device, 24),
        counterVersion: 2,
        createdAt: nowTimestamp
      });
      return true;
    });
    return { ok: true, counted, dedupeWindowMinutes: 30 };
  } catch (error) {
    logger.error('recordVisit failed', { code: error?.code, message: error?.message, page });
    throw new HttpsError('internal', 'Unable to record visit.');
  }
});

exports.adminBootstrap = onCall(CALLABLE_OPTIONS, async request => {
  const actor = actorFromRequest(request);
  const existingRole = normalizeRole(request.auth.token?.role);
  if (!BOOTSTRAP_SUPER_ADMIN_EMAILS.has(actor.email) && !hasRole(existingRole, CMS_ROLES)) {
    throw new HttpsError('permission-denied', 'This account is not an administrator.');
  }
  const role = BOOTSTRAP_SUPER_ADMIN_EMAILS.has(actor.email) ? 'super_admin' : existingRole;
  const user = await auth.getUser(actor.uid);
  const claimsAlreadyCurrent = normalizeRole(user.customClaims?.role) === role
    && Boolean(user.customClaims?.admin) === hasRole(role, ADMIN_ROLES);
  if (claimsAlreadyCurrent) {
    return { ok: true, role, capabilities: roleCapabilities(role), refreshToken: false };
  }
  await auth.setCustomUserClaims(actor.uid, {
    ...(user.customClaims || {}),
    role,
    admin: hasRole(role, ADMIN_ROLES)
  });
  await db.collection('users').doc(actor.uid).set({
    role,
    roleUpdatedAt: FieldValue.serverTimestamp(),
    roleUpdatedBy: actor.uid
  }, { merge: true });
  await writeAudit({ ...actor, role }, 'admin.bootstrap', {
    targetUid: actor.uid,
    targetEmail: actor.email,
    details: { role }
  });
  return { ok: true, role, capabilities: roleCapabilities(role), refreshToken: true };
});

// Backwards-compatible callable name used by older CMS deployments.
exports.adminSyncAdminClaim = exports.adminBootstrap;

exports.adminGetSession = onCall(CALLABLE_OPTIONS, async request => {
  const actor = requireRole(request, CMS_ROLES);
  return { ok: true, ...roleCapabilities(actor.role), email: actor.email, uid: actor.uid };
});

exports.adminGetDashboard = onCall(CALLABLE_OPTIONS, async request => {
  requireRole(request, ADMIN_ROLES);
  const [usersCount, visits] = await Promise.all([
    db.collection('users').count().get(),
    visitSummary()
  ]);
  return {
    ok: true,
    totalUsers: Number(usersCount.data().count || 0),
    visits
  };
});

exports.adminListUsers = onCall(CALLABLE_OPTIONS, async request => {
  requireRole(request, ADMIN_ROLES);
  const maxResults = Math.min(Math.max(Number(request.data?.maxResults) || 25, 1), 100);
  const search = safeText(request.data?.search, 160);
  if (search) {
    const records = await findAuthUsers(search, maxResults);
    return { users: await getUserData(records), pageToken: '', search: true };
  }
  const pageToken = safeText(request.data?.pageToken, 2048) || undefined;
  const result = await auth.listUsers(maxResults, pageToken);
  return {
    users: await getUserData(result.users),
    pageToken: result.pageToken || '',
    search: false
  };
});

exports.adminSetUserRole = onCall(CALLABLE_OPTIONS, async request => {
  const actor = requireSuperAdmin(request);
  const uid = requireUid(request.data?.uid);
  const role = String(request.data?.role || '').trim().toLowerCase();
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Invalid role.');
  if (uid === actor.uid) throw new HttpsError('failed-precondition', 'You cannot change your own role.');

  try {
    const target = await auth.getUser(uid);
    await assertTargetCanLoseSuperAdmin(target, role);
    await auth.setCustomUserClaims(uid, {
      ...(target.customClaims || {}),
      role,
      admin: hasRole(role, ADMIN_ROLES)
    });
    await db.collection('users').doc(uid).set({
      role,
      roleUpdatedAt: FieldValue.serverTimestamp(),
      roleUpdatedBy: actor.uid
    }, { merge: true });
    await auth.revokeRefreshTokens(uid);
    await writeAudit(actor, 'user.role_changed', {
      targetUid: uid,
      targetEmail: target.email,
      details: { from: normalizeRole(target.customClaims?.role), to: role }
    });
    logger.info('Administrator role changed', { actorUid: actor.uid, targetUid: uid, role });
    return { ok: true, role };
  } catch (error) {
    await auditFailure(actor, 'user.role_changed', uid, error, { role });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Unable to change user role.');
  }
});

exports.adminSetUserDisabled = onCall(CALLABLE_OPTIONS, async request => {
  const actor = requireSuperAdmin(request);
  const uid = requireUid(request.data?.uid);
  const disabled = request.data?.disabled === true;
  if (uid === actor.uid) throw new HttpsError('failed-precondition', 'You cannot disable your own account.');

  try {
    const target = await auth.getUser(uid);
    if (disabled) await assertTargetCanLoseSuperAdmin(target, 'user');
    const updated = await auth.updateUser(uid, { disabled });
    await auth.revokeRefreshTokens(uid);
    await db.collection('users').doc(uid).set({
      authDisabled: disabled,
      adminUpdatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await writeAudit(actor, disabled ? 'user.disabled' : 'user.enabled', {
      targetUid: uid,
      targetEmail: target.email,
      details: { disabled }
    });
    logger.info('Administrator changed disabled status', { actorUid: actor.uid, targetUid: uid, disabled });
    return { ok: true, user: authUserJson(updated) };
  } catch (error) {
    await auditFailure(actor, disabled ? 'user.disabled' : 'user.enabled', uid, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Unable to update account status.');
  }
});

exports.adminDeleteUser = onCall(CALLABLE_OPTIONS, async request => {
  const actor = requireSuperAdmin(request);
  const uid = requireUid(request.data?.uid);
  const confirmationUid = String(request.data?.confirmationUid || '');
  if (confirmationUid !== uid) throw new HttpsError('failed-precondition', 'UID confirmation does not match.');
  if (uid === actor.uid) throw new HttpsError('failed-precondition', 'You cannot delete your own account.');

  let target;
  let wasDisabled = false;
  let authDeleted = false;
  const deletionRef = db.collection('adminDeletionJobs').doc(uid);
  try {
    try {
      target = await auth.getUser(uid);
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
      target = null;
      authDeleted = true;
    }
    if (target) {
      wasDisabled = Boolean(target.disabled);
      await assertTargetCanLoseSuperAdmin(target, 'user');
      if (!wasDisabled) await auth.updateUser(uid, { disabled: true });
    }
    await deletionRef.set({
      targetUid: uid,
      targetEmail: target?.email || '',
      requestedBy: actor.uid,
      status: authDeleted ? 'firestore_cleanup_retry' : 'started',
      authDeleted,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    if (target) {
      await auth.deleteUser(uid);
      authDeleted = true;
      await deletionRef.set({
        status: 'auth_deleted',
        authDeleted: true,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    await db.recursiveDelete(db.collection('users').doc(uid));
    await deletionRef.set({
      status: 'completed',
      authDeleted: true,
      firestoreDeleted: true,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await writeAudit(actor, 'user.deleted', {
      targetUid: uid,
      targetEmail: target?.email || '',
      details: {
        deletedScopes: [`users/${uid}`, `FirebaseAuth/${uid}`],
        preservedSharedCollections: ['feedbacks', 'accessLogs', 'adminAuditLogs', 'adminDeletionJobs']
      }
    });
    logger.warn('Administrator deleted user and private Firestore tree', { actorUid: actor.uid, targetUid: uid });
    return { ok: true };
  } catch (error) {
    if (target && !wasDisabled && !authDeleted) {
      try { await auth.updateUser(uid, { disabled: false }); } catch (_) {}
    }
    try {
      await deletionRef.set({
        status: authDeleted ? 'firestore_cleanup_pending' : 'failed',
        authDeleted,
        errorCode: safeText(error?.code || 'unknown', 120),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (_) {}
    await auditFailure(actor, 'user.deleted', uid, error, { authDeleted });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      'internal',
      authDeleted
        ? 'Authentication was deleted, but Firestore cleanup is pending. Retry the same UID.'
        : 'Unable to delete the complete user account.'
    );
  }
});

exports.adminUpdateUserData = onCall(CALLABLE_OPTIONS, async request => {
  const actor = requireSuperAdmin(request);
  const uid = requireUid(request.data?.uid);
  const action = String(request.data?.action || '');
  if (uid === actor.uid) {
    throw new HttpsError('failed-precondition', 'You cannot modify your own sensitive fields.');
  }
  const publicRef = db.collection('users').doc(uid);
  const statsRef = publicRef.collection('private').doc('stats');

  try {
    await auth.getUser(uid);
    if (action === 'vip') {
      const isVip = request.data?.isVip === true;
      const rawUntil = request.data?.vipUntilMillis;
      const vipUntil = isVip && rawUntil !== null && rawUntil !== undefined
        ? Timestamp.fromMillis(Number(rawUntil))
        : null;
      if (isVip && rawUntil !== null && (!Number.isFinite(Number(rawUntil)) || Number(rawUntil) <= Date.now())) {
        throw new HttpsError('invalid-argument', 'VIP expiry must be in the future.');
      }
      await statsRef.set({
        isVip,
        vipUntil,
        vipPlan: isVip ? safeText(request.data?.vipPlan, 32) || null : null,
        vipUpdatedAt: FieldValue.serverTimestamp(),
        vipUpdatedBy: actor.email,
        updatedAt: FieldValue.serverTimestamp(),
        adminUpdatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } else if (action === 'coins') {
      const delta = Number(request.data?.delta);
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1000000) {
        throw new HttpsError('invalid-argument', 'Coin delta is invalid.');
      }
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(statsRef);
        const current = snapshot.exists ? snapshot.data() : {};
        const coins = Math.max(0, Number(current.coins || 0) + delta);
        const history = Array.isArray(current.coinHistory) ? current.coinHistory.slice(0, 79) : [];
        transaction.set(statsRef, {
          coins,
          totalCoinsEarned: delta > 0 ? Number(current.totalCoinsEarned || 0) + delta : Number(current.totalCoinsEarned || 0),
          coinHistory: [{
            id: `admin-coins-${Date.now()}`,
            reason: 'admin-adjust',
            amount: delta,
            date: new Date().toLocaleDateString('vi-VN'),
            meta: { admin: actor.email }
          }, ...history],
          updatedAt: FieldValue.serverTimestamp(),
          adminUpdatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      });
    } else if (action === 'max' || action === 'unlock') {
      const completedLessonIds = {};
      Object.entries(COURSE_TOTALS).forEach(([level, total]) => {
        for (let lesson = 1; lesson <= total; lesson += 1) completedLessonIds[`${level}-${lesson}`] = true;
      });
      const courses = Object.fromEntries(Object.keys(COURSE_TOTALS).map(level => [level, 100]));
      const statsPatch = {
        unlockedAll: true,
        completedLessonIds,
        completedLessons: Object.keys(completedLessonIds).length,
        courses,
        updatedAt: FieldValue.serverTimestamp(),
        adminUpdatedAt: FieldValue.serverTimestamp()
      };
      if (action === 'max') Object.assign(statsPatch, {
        xp: 999999,
        todayXp: 999999,
        lastXp: 999999,
        level: 10,
        petLevel: 10,
        spiritLevel: 10,
        currentLevel: 'HSK 6',
        streak: 999
      });
      await Promise.all([
        publicRef.set({
          ...(action === 'max' ? { adminBoost: true } : {}),
          unlockedAll: true,
          adminUpdatedAt: FieldValue.serverTimestamp()
        }, { merge: true }),
        statsRef.set(statsPatch, { merge: true })
      ]);
    } else if (action === 'reset') {
      await Promise.all([
        publicRef.set({
          adminBoost: false,
          unlockedAll: false,
          adminUpdatedAt: FieldValue.serverTimestamp()
        }, { merge: true }),
        statsRef.set({
          xp: 0,
          coins: 0,
          totalCoinsEarned: 0,
          isVip: false,
          vipUntil: null,
          vipPlan: null,
          unlockedLessons: {},
          writingCompleted: {},
          coinHistory: [],
          checkInStreak: 0,
          lastCheckInDate: '',
          todayXp: 0,
          lastXp: 0,
          level: 1,
          petLevel: 1,
          spiritLevel: 1,
          unlockedAll: false,
          completedLessonIds: {},
          completedLessons: 0,
          courses: { hsk1: 0, hsk2: 0, hsk3: 0, hsk4: 0, hsk5: 0, hsk6: 0 },
          streak: 0,
          history: [],
          updatedAt: FieldValue.serverTimestamp(),
          adminUpdatedAt: FieldValue.serverTimestamp()
        }, { merge: true })
      ]);
    } else {
      throw new HttpsError('invalid-argument', 'Unsupported sensitive user action.');
    }
    await writeAudit(actor, `user.sensitive.${action}`, {
      targetUid: uid,
      details: action === 'coins' ? { delta: Number(request.data?.delta) } : { action }
    });
    return { ok: true };
  } catch (error) {
    await auditFailure(actor, `user.sensitive.${action || 'unknown'}`, uid, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Unable to update sensitive user data.');
  }
});

async function fetchLogSource(name, cursorMillis, pageSize) {
  let query = db.collection(name).orderBy('createdAt', 'desc');
  if (Number(cursorMillis) > 0) query = query.startAfter(Timestamp.fromMillis(Number(cursorMillis)));
  const snapshot = await query.limit(pageSize).get();
  return snapshot.docs.map(document => ({
    id: document.id,
    _collection: name,
    ...jsonSafe(document.data()),
    _cursorMillis: timestampMillis(document.data().createdAt)
  }));
}

exports.adminListAccessLogs = onCall(CALLABLE_OPTIONS, async request => {
  requireRole(request, ADMIN_ROLES);
  const pageSize = Math.min(Math.max(Number(request.data?.pageSize) || 50, 10), 100);
  const cursor = request.data?.cursor || {};
  const [accessLogs, visits] = await Promise.all([
    fetchLogSource('accessLogs', cursor.accessLogs, pageSize),
    fetchLogSource('visits', cursor.visits, pageSize)
  ]);
  const merged = [...accessLogs, ...visits]
    .sort((a, b) => b._cursorMillis - a._cursorMillis)
    .slice(0, pageSize);
  const consumed = { accessLogs: Number(cursor.accessLogs || 0), visits: Number(cursor.visits || 0) };
  merged.forEach(row => { consumed[row._collection] = row._cursorMillis; });
  return {
    logs: merged.map(({ _cursorMillis, ...row }) => row),
    cursor: consumed,
    hasMore: accessLogs.length === pageSize || visits.length === pageSize
  };
});

exports.adminGetVisitSummary = onCall(CALLABLE_OPTIONS, async request => {
  requireRole(request, ADMIN_ROLES);
  return { ok: true, ...(await visitSummary()) };
});

exports.adminMigrateVisitCounters = onCall(CALLABLE_OPTIONS, async request => {
  const actor = requireSuperAdmin(request);
  const totalRef = db.collection('analytics').doc('visits');
  try {
    const totalSnap = await totalRef.get();
    if (totalSnap.exists && totalSnap.data()?.migrationComplete === true) {
      return { ok: true, alreadyMigrated: true, ...(await visitSummary()) };
    }
    const cutoff = totalSnap.exists && totalSnap.data()?.startedAt
      ? totalSnap.data().startedAt
      : Timestamp.now();
    const [accessCountSnap, visitsCountSnap] = await Promise.all([
      db.collection('accessLogs').where('createdAt', '<', cutoff).count().get(),
      db.collection('visits').count().get()
    ]);
    const accessLogsCount = Number(accessCountSnap.data().count || 0);
    const visitsCount = Number(visitsCountSnap.data().count || 0);
    // These collections were used by different logger generations. max() avoids
    // double-counting deployments that wrote the same visit to both.
    const legacyBaseline = Math.max(accessLogsCount, visitsCount);
    await db.runTransaction(async transaction => {
      const current = await transaction.get(totalRef);
      if (current.exists && current.data()?.migrationComplete === true) return;
      transaction.set(totalRef, {
        total: FieldValue.increment(legacyBaseline),
        startedAt: current.exists && current.data()?.startedAt ? current.data().startedAt : cutoff,
        migrationComplete: true,
        migratedAt: FieldValue.serverTimestamp(),
        legacyBaseline,
        legacyAccessLogsCount: accessLogsCount,
        legacyVisitsCount: visitsCount,
        counterVersion: 2
      }, { merge: true });
    });
    await writeAudit(actor, 'analytics.visits_migrated', {
      details: { legacyBaseline, accessLogsCount, visitsCount }
    });
    return { ok: true, alreadyMigrated: false, ...(await visitSummary()) };
  } catch (error) {
    await auditFailure(actor, 'analytics.visits_migrated', '', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Unable to migrate legacy visit counters.');
  }
});
