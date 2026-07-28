const admin = require('firebase-admin');
const {
  AI_BATCH_LIMIT,
  DEFAULT_MODEL,
  processDueWritingSubmissions
} = require('../../functions/writing-grading-core.js');

function getAdmin() {
  if (admin.apps.length) return admin;
  const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) throw Object.assign(new Error('Firebase Admin is not configured.'), { code:'firebase_not_configured' });
  admin.initializeApp({
    credential:admin.credential.cert({
      projectId:process.env.FIREBASE_PROJECT_ID,
      clientEmail:process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
  return admin;
}

function authorized(req) {
  const expected = String(process.env.CRON_SECRET || '');
  const actual = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (!expected || !actual || expected.length !== actual.length) return false;
  return require('node:crypto').timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ ok:false, code:'method_not_allowed' });
  }
  if (!authorized(req)) return res.status(401).json({ ok:false, code:'cron_unauthorized' });
  try {
    const sdk = getAdmin();
    const report = await processDueWritingSubmissions({
      db:sdk.firestore(),
      Timestamp:sdk.firestore.Timestamp,
      FieldValue:sdk.firestore.FieldValue,
      apiKey:process.env.GEMINI_API_KEY,
      model:process.env.GEMINI_GRADING_MODEL || DEFAULT_MODEL,
      limit:Math.min(Number(req.body?.limit || AI_BATCH_LIMIT), AI_BATCH_LIMIT)
    });
    return res.status(200).json({ ok:true, report });
  } catch (error) {
    console.error('[writing-cron]', error?.code || error?.name, error?.message);
    return res.status(500).json({ ok:false, code:error?.code || 'internal' });
  }
};
