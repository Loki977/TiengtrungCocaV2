import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

const SESSION_KEY = 'cc_access_session_id';
const sessionId = localStorage.getItem(SESSION_KEY) || crypto.randomUUID?.() || String(Date.now());
localStorage.setItem(SESSION_KEY, sessionId);

function deviceType(){
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Android|iPhone|Mobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

async function logAccess(){
  const fb = window.CCFirebase;
  if (!fb?.db) return;
  const user = fb.getCurrentUser?.() || fb.auth?.currentUser || null;
  try {
    await addDoc(collection(fb.db, 'accessLogs'), {
      uid: user?.uid || '',
      email: user?.email || '',
      displayName: user?.displayName || '',
      page: location.pathname,
      href: location.href,
      title: document.title,
      referrer: document.referrer || '',
      browser: navigator.userAgent,
      language: navigator.language,
      device: deviceType(),
      sessionId,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn('[access-logger] skip', error?.code || error?.message || error);
  }
}

function start(){
  if (sessionStorage.getItem('cc_logged_' + location.pathname)) return;
  sessionStorage.setItem('cc_logged_' + location.pathname, '1');
  setTimeout(logAccess, 900);
}

if (window.CCFirebase?.db) start();
else window.addEventListener('firebase-ready', start, { once: true });
