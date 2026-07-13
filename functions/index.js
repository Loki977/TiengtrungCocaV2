const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const ADMIN_EMAIL = 'nqthanhforwork@gmail.com';

// Cho phép web Vercel + Live Server gọi Cloud Functions.
// Quyền admin vẫn được chặn bằng Firebase Auth ở assertAdmin(), nên CORS chỉ mở cổng gọi API.
const CALLABLE_OPTIONS = {
  region: 'us-central1',
  cors: [
    'https://tiengtrungcoca.vercel.app',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    /https:\/\/.*\.vercel\.app$/
  ]
};

function assertAdmin(request) {
  const email = request.auth?.token?.email || '';
  if (!request.auth || email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Only admin can use this function.');
  }
}

function userToJson(userRecord) {
  return {
    uid: userRecord.uid,
    email: userRecord.email || '',
    emailVerified: Boolean(userRecord.emailVerified),
    displayName: userRecord.displayName || '',
    photoURL: userRecord.photoURL || '',
    disabled: Boolean(userRecord.disabled),
    creationTime: userRecord.metadata?.creationTime || '',
    lastSignInTime: userRecord.metadata?.lastSignInTime || '',
    providerData: (userRecord.providerData || []).map(p => ({ providerId: p.providerId, uid: p.uid, email: p.email || '' })),
    customClaims: userRecord.customClaims || {}
  };
}

exports.adminSyncAdminClaim = onCall(CALLABLE_OPTIONS, async (request) => {
  assertAdmin(request);
  await admin.auth().setCustomUserClaims(request.auth.uid, { admin: true });
  await admin.firestore().collection('admins').doc(request.auth.uid).set({
    email: ADMIN_EMAIL,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return { ok: true };
});

exports.adminListUsers = onCall(CALLABLE_OPTIONS, async (request) => {
  assertAdmin(request);
  const maxResults = Math.min(Number(request.data?.maxResults) || 1000, 1000);
  const pageToken = request.data?.pageToken || undefined;
  const result = await admin.auth().listUsers(maxResults, pageToken);
  return {
    users: result.users.map(userToJson),
    pageToken: result.pageToken || ''
  };
});

exports.adminSetUserDisabled = onCall(CALLABLE_OPTIONS, async (request) => {
  assertAdmin(request);
  const uid = String(request.data?.uid || '');
  const disabled = Boolean(request.data?.disabled);
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required.');
  if (uid === request.auth.uid && disabled) throw new HttpsError('failed-precondition', 'Admin cannot disable self.');
  const user = await admin.auth().updateUser(uid, { disabled });
  await admin.firestore().collection('users').doc(uid).set({
    authDisabled: disabled,
    adminUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  logger.info('Admin changed disabled status', { uid, disabled });
  return { ok: true, user: userToJson(user) };
});

exports.adminDeleteUser = onCall(CALLABLE_OPTIONS, async (request) => {
  assertAdmin(request);
  const uid = String(request.data?.uid || '');
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required.');
  if (uid === request.auth.uid) throw new HttpsError('failed-precondition', 'Admin cannot delete self.');
  await admin.auth().deleteUser(uid);
  await admin.firestore().collection('users').doc(uid).set({
    authDeleted: true,
    authDeletedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  logger.warn('Admin deleted auth user', { uid });
  return { ok: true };
});
