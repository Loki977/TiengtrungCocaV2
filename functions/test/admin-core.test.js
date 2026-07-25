'use strict';

const assert = require('node:assert/strict');
const {
  normalizePage,
  normalizeRole,
  roleCapabilities,
  visitDedupeId,
  visitFingerprint,
  visitTimeKeys,
  wouldRemoveLastSuperAdmin
} = require('../admin-core');

assert.equal(normalizeRole('SUPER_ADMIN'), 'super_admin');
assert.equal(normalizeRole('unknown'), 'user');
assert.equal(roleCapabilities('user').cms, false);
assert.equal(roleCapabilities('editor').cms, true);
assert.equal(roleCapabilities('editor').viewUsers, false);
assert.equal(roleCapabilities('admin').viewUsers, true);
assert.equal(roleCapabilities('admin').manageRoles, false);
assert.equal(roleCapabilities('super_admin').manageRoles, true);
assert.equal(roleCapabilities('super_admin').manageSensitiveFields, true);

assert.equal(normalizePage('https://example.com//hsk.html?x=1'), '/https:/example.com/hsk.html');
assert.equal(normalizePage('/hsk.html?x=1#top'), '/hsk.html');
assert.deepEqual(visitTimeKeys(new Date('2026-07-24T17:30:00.000Z')), {
  day: '2026-07-25',
  month: '2026-07'
});

const identity = visitFingerprint({ ip:'203.0.113.1', userAgent:'Test', language:'vi' });
const first = visitDedupeId({ identity, page:'/index.html', nowMs:0 });
assert.equal(first, visitDedupeId({ identity, page:'/index.html', nowMs:29 * 60 * 1000 }));
assert.notEqual(first, visitDedupeId({ identity, page:'/index.html', nowMs:31 * 60 * 1000 }));
assert.notEqual(first, visitDedupeId({ identity, page:'/hsk.html', nowMs:0 }));

assert.equal(wouldRemoveLastSuperAdmin({
  currentRole:'super_admin',
  nextRole:'admin',
  superAdminCount:1
}), true);
assert.equal(wouldRemoveLastSuperAdmin({
  currentRole:'super_admin',
  nextRole:'admin',
  superAdminCount:2
}), false);
assert.equal(wouldRemoveLastSuperAdmin({
  currentRole:'admin',
  nextRole:'user',
  superAdminCount:1
}), false);

console.log('Admin core tests passed.');
