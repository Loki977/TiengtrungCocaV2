'use strict';

const crypto = require('node:crypto');

const ROLES = Object.freeze(['super_admin', 'admin', 'editor', 'user']);
const ADMIN_ROLES = Object.freeze(['super_admin', 'admin']);
const CMS_ROLES = Object.freeze(['super_admin', 'admin', 'editor']);
const VISIT_BUCKET_MS = 30 * 60 * 1000;

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return ROLES.includes(role) ? role : 'user';
}

function hasRole(role, allowed) {
  return allowed.includes(normalizeRole(role));
}

function normalizePage(value) {
  const input = String(value || '/').trim();
  const withoutQuery = input.split(/[?#]/, 1)[0] || '/';
  const prefixed = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return prefixed.replace(/\/{2,}/g, '/').slice(0, 240);
}

function safeText(value, maxLength = 500) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function visitTimeKeys(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  return { day, month: `${values.year}-${values.month}` };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function visitFingerprint({ uid = '', ip = '', userAgent = '', language = '' } = {}) {
  if (uid) return `uid:${uid}`;
  return `anon:${sha256(`${ip}|${userAgent}|${language}`)}`;
}

function visitDedupeId({ identity, page, nowMs = Date.now() }) {
  const bucket = Math.floor(Number(nowMs) / VISIT_BUCKET_MS);
  return sha256(`${bucket}|${identity}|${normalizePage(page)}`);
}

function wouldRemoveLastSuperAdmin({ currentRole, nextRole, superAdminCount }) {
  return normalizeRole(currentRole) === 'super_admin'
    && normalizeRole(nextRole) !== 'super_admin'
    && Number(superAdminCount) <= 1;
}

function roleCapabilities(role) {
  const normalized = normalizeRole(role);
  return Object.freeze({
    role: normalized,
    cms: hasRole(normalized, CMS_ROLES),
    viewUsers: hasRole(normalized, ADMIN_ROLES),
    viewAnalytics: hasRole(normalized, ADMIN_ROLES),
    manageUsers: normalized === 'super_admin',
    manageRoles: normalized === 'super_admin',
    manageSensitiveFields: normalized === 'super_admin'
  });
}

module.exports = {
  ADMIN_ROLES,
  CMS_ROLES,
  ROLES,
  VISIT_BUCKET_MS,
  hasRole,
  normalizePage,
  normalizeRole,
  roleCapabilities,
  safeText,
  sha256,
  visitDedupeId,
  visitFingerprint,
  visitTimeKeys,
  wouldRemoveLastSuperAdmin
};
