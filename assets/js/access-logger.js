const PAGE_KEY = `cc_visit_recorded:${location.pathname}`;
const IS_LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname);
const ADMIN_API_URL = IS_LOCAL ? 'https://tiengtrungcoca.vercel.app/api/admin' : '/api/admin';
let requestInFlight = false;

function deviceType() {
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Android|iPhone|Mobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

function referrerPath() {
  if (!document.referrer) return '';
  try {
    const url = new URL(document.referrer);
    return url.origin === location.origin ? url.pathname : '/external';
  } catch (_) {
    return '';
  }
}

async function logAccess() {
  if (requestInFlight || sessionStorage.getItem(PAGE_KEY)) return;
  const firebase = window.CCFirebase;
  if (!firebase?.auth?.app) return;
  requestInFlight = true;
  try {
    const token = firebase.auth.currentUser ? await firebase.auth.currentUser.getIdToken() : '';
    const response = await fetch(ADMIN_API_URL, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        ...(token ? { Authorization:`Bearer ${token}` } : {})
      },
      body:JSON.stringify({
        action:'recordVisit',
        data:{
          page:location.pathname,
          title:document.title,
          referrer:referrerPath(),
          language:navigator.language,
          device:deviceType()
        }
      })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // The backend is authoritative and also deduplicates by visitor, page and
    // a 30-minute bucket. This flag only avoids duplicate calls in one tab.
    sessionStorage.setItem(PAGE_KEY, '1');
  } catch (error) {
    console.warn('[access-logger] recordVisit failed', error?.code || error?.message || error);
  } finally {
    requestInFlight = false;
  }
}

function start() {
  if (sessionStorage.getItem(PAGE_KEY)) return;
  setTimeout(logAccess, 900);
}

if (window.CCFirebase?.auth?.app) start();
else window.addEventListener('firebase-ready', start, { once: true });
