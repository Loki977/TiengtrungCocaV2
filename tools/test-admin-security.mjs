import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { visitDedupeId } = require('../functions/admin-core.js');
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const functionsSource = read('functions/index.js');
const rules = read('firestore.rules');
const adminSource = read('assets/js/admin-super.js');
const loggerSource = read('assets/js/access-logger.js');
const adminApiSource = read('server/admin/api.mjs');
const adminHtml = read('admin-super.html');

assert.match(functionsSource, /FieldValue\.increment\(1\)/, 'Visit counters must use atomic increment');
assert.match(functionsSource, /transaction\.create\(dedupeRef/, 'Visit writes must use a backend dedupe document');
assert.match(functionsSource, /db\.recursiveDelete\(db\.collection\('users'\)\.doc\(uid\)\)/, 'User deletion must recursively remove only the user tree');
assert.match(functionsSource, /auth\.deleteUser\(uid\)/, 'User deletion must remove Firebase Authentication');
assert.ok(
  functionsSource.indexOf('await auth.deleteUser(uid)') < functionsSource.indexOf("await db.recursiveDelete(db.collection('users').doc(uid))"),
  'Authentication must be removed before private Firestore cleanup'
);
assert.match(functionsSource, /firestore_cleanup_pending/, 'Partial deletion must remain retryable and visible');
assert.match(functionsSource, /setCustomUserClaims/, 'Roles must use verified custom claims');
assert.match(functionsSource, /revokeRefreshTokens\(uid\)/, 'Role and lock changes must revoke refresh tokens');
assert.match(functionsSource, /Cannot remove or disable the final Super Admin/, 'Final Super Admin must be protected');
assert.match(functionsSource, /adminAuditLogs/, 'Administrative mutations must write audit logs');
assert.match(functionsSource, /confirmationUid !== uid/, 'Deletion must verify the typed UID');

assert.match(rules, /match \/accessLogs\/\{id\}[\s\S]*allow create, update, delete: if false;/, 'Clients must not write access logs');
assert.match(rules, /match \/analytics\/\{document=\*\*\}[\s\S]*allow write: if false;/, 'Clients must not write aggregate counters');
assert.match(rules, /request\.auth\.token\.role == "super_admin"/, 'Rules must recognize role claims');
assert.match(rules, /function isAdmin\(\)[\s\S]*isSuperAdmin\(\)/, 'Bootstrap Super Admin must inherit Admin access');
assert.match(rules, /function isCmsEditor\(\)[\s\S]*isAdmin\(\)/, 'Bootstrap Super Admin must inherit CMS editor access');
assert.match(rules, /validPublicUserUpdate[\s\S]*affectedKeys\(\)\.hasOnly/, 'Public user updates must be whitelisted');
assert.match(rules, /validStatsUpdate[\s\S]*affectedKeys\(\)[\s\S]*hasOnly\(allowedProgressKeys\(\)\)/, 'Sensitive stats must remain outside owner-writable fields');

assert.doesNotMatch(adminSource, /limit\(200\)/, 'CMS visit totals must not depend on a 200-row query');
assert.doesNotMatch(adminSource, /maxResults:\s*1000/, 'CMS user lists must be paginated');
assert.match(adminSource, /callUpdateUserData/, 'Sensitive user mutations must go through the backend');
assert.match(adminSource, /previousTokens/, 'User pagination must support previous pages');
assert.match(adminSource, /previousCursors/, 'Log pagination must support previous pages');
assert.match(adminSource, /cleanupListeners/, 'Realtime listeners must be explicitly released');
assert.match(adminSource, /runSingle/, 'Duplicate administrative requests must be suppressed');
assert.match(adminSource, /compatibleSession/, 'CMS must support verified-token compatibility when Functions are unavailable');
assert.match(adminSource, /backendAvailable:false/, 'Compatibility mode must keep destructive backend actions disabled');
assert.match(adminSource, /callAdminApi/, 'CMS actions must use the Vercel Admin API');
assert.match(loggerSource, /action:'recordVisit'/, 'Client logger must call the backend counter');
assert.doesNotMatch(loggerSource, /addDoc|collection\(.*accessLogs/, 'Client logger must not write accessLogs directly');
assert.match(adminApiSource, /verifyIdToken/, 'Vercel Admin API must verify Firebase ID tokens');
assert.match(adminApiSource, /setCustomUserClaims/, 'Vercel Admin API must manage roles with Admin SDK');
assert.match(adminApiSource, /auth\.deleteUser\(uid\)/, 'Vercel Admin API must delete the exact Auth UID');
assert.match(adminApiSource, /FieldValue\.increment\(1\)/, 'Vercel Admin API must maintain atomic visit counters');
assert.match(adminHtml, /id="usersPrev"/);
assert.match(adminHtml, /id="usersNext"/);
assert.match(adminHtml, /id="logsPrev"/);
assert.match(adminHtml, /id="logsNext"/);

const reloadIds = new Set();
for (let visitor = 0; visitor < 250; visitor += 1) {
  for (let reload = 0; reload < 10; reload += 1) {
    reloadIds.add(visitDedupeId({
      identity:`visitor-${visitor}`,
      page:'/index.html',
      nowMs:5 * 60 * 1000
    }));
  }
}
assert.equal(reloadIds.size, 250, '250 visitors must exceed the old 200 cap while reload spam stays deduplicated');

const { handleAdminRequest } = await import('../server/admin/api.mjs');
function mockResponse() {
  return {
    headers:{}, statusCode:0, payload:null, ended:false,
    setHeader(name, value){ this.headers[name] = value; },
    status(code){ this.statusCode = code; return this; },
    json(payload){ this.payload = payload; return this; },
    end(){ this.ended = true; return this; }
  };
}
const preflightResponse = mockResponse();
await handleAdminRequest({
  method:'OPTIONS',
  headers:{ origin:'http://127.0.0.1:5500' }
}, preflightResponse);
assert.equal(preflightResponse.statusCode, 204, 'Admin API must accept local preflight');
assert.equal(preflightResponse.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:5500');

const unauthenticatedResponse = mockResponse();
await handleAdminRequest({
  method:'POST',
  headers:{ origin:'http://127.0.0.1:5500' },
  body:{ action:'adminListUsers', data:{} }
}, unauthenticatedResponse);
assert.equal(unauthenticatedResponse.statusCode, 401, 'Admin API must reject missing Firebase tokens');

console.log('Admin security, pagination and visit counter checks passed.');
