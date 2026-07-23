import { getApps } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import { addDoc, collection, doc, getDoc, getFirestore, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

const HOME_PATHS = ['/', '/index.html'];
const LEARNING_SETTINGS_REST_URL = 'https://firestore.googleapis.com/v1/projects/tiengtrungcoca/databases/(default)/documents/adminSettings/learning';
const isHome = HOME_PATHS.includes(location.pathname) || location.pathname.endsWith('/index.html');
if (isHome) void initHomeFabs();

async function waitForFirebaseDb() {
  const resolveDb = () => window.CCFirebase?.db
    || window.sharedFirebase?.db
    || (getApps().length ? getFirestore(getApps()[0]) : null);
  const currentDb = resolveDb();
  if (currentDb) return currentDb;

  return new Promise(resolve => {
    let timeoutId = 0;
    const finish = () => {
      window.removeEventListener('firebase-ready', finish);
      if (timeoutId) clearTimeout(timeoutId);
      resolve(resolveDb());
    };
    window.addEventListener('firebase-ready', finish, { once: true });
    timeoutId = window.setTimeout(finish, 1500);
  });
}

async function readDonateSettingFromRest() {
  const response = await fetch(LEARNING_SETTINGS_REST_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return payload.fields?.features?.mapValue?.fields?.donate?.booleanValue !== false;
}

async function isDonateEnabled() {
  try {
    const db = await waitForFirebaseDb();
    if (db) {
      const snapshot = await getDoc(doc(db, 'adminSettings', 'learning'));
      return snapshot.data()?.features?.donate !== false;
    }
    return await readDonateSettingFromRest();
  } catch (error) {
    try {
      return await readDonateSettingFromRest();
    } catch (fallbackError) {
      console.warn('[home-fabs] Không tải được cấu hình ủng hộ, dùng trạng thái mặc định.', error, fallbackError);
      return true;
    }
  }
}

async function initHomeFabs() {
  if (document.querySelector('.cc-home-fabs')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="cc-home-fabs" aria-label="Công cụ trang chủ">
      <button class="cc-fab" id="ccFeedbackFab" type="button"><span>💬</span>Góp ý</button>
    </div>
    <div class="cc-popup-backdrop" id="ccFeedbackModal">
      <div class="cc-popup" role="dialog" aria-modal="true" aria-labelledby="ccFeedbackTitle">
        <div class="cc-popup__head"><div><h3 id="ccFeedbackTitle">Gửi góp ý</h3><p>Góp ý của bạn sẽ giúp website tốt hơn.</p></div><button class="cc-popup__close" data-close="ccFeedbackModal">✕</button></div>
        <form class="cc-form" id="ccFeedbackForm">
          <label>Tiêu đề (không bắt buộc)<input id="ccFeedbackInputTitle" maxlength="120" placeholder="Ví dụ: lỗi phát âm bài 3"></label>
          <label>Loại góp ý<select id="ccFeedbackType"><option>Bug</option><option>Feature request</option><option>UI/UX</option><option>Lesson</option><option>Other</option></select></label>
          <label>Nội dung<textarea id="ccFeedbackMessage" required placeholder="Nhập góp ý..."></textarea></label>
          <div class="cc-success" id="ccFeedbackSuccess">✅ Đã gửi góp ý!</div>
          <div class="cc-popup__actions"><button class="cc-btn cc-btn--soft" type="button" data-close="ccFeedbackModal">Đóng</button><button class="cc-btn cc-btn--primary" type="submit">Send</button></div>
        </form>
      </div>
    </div>`);

  document.getElementById('ccFeedbackFab').addEventListener('click', () => openModal('ccFeedbackModal'));
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  document.querySelectorAll('.cc-popup-backdrop').forEach(el => el.addEventListener('click', e => { if (e.target === el) closeModal(el.id); }));
  document.getElementById('ccFeedbackForm').addEventListener('submit', submitFeedback);

  if (!await isDonateEnabled() || !document.querySelector('.cc-home-fabs')) return;
  document.querySelector('.cc-home-fabs').insertAdjacentHTML('beforeend',
    '<button class="cc-fab" id="ccDonateFab" type="button"><span>❤️</span>Ủng hộ</button>');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="cc-popup-backdrop" id="ccDonateModal">
      <div class="cc-popup cc-donate-card" role="dialog" aria-modal="true" aria-labelledby="ccDonateTitle">
        <div class="cc-popup__head"><div><h3 id="ccDonateTitle">Ủng hộ mình</h3><p>Cảm ơn bạn đã đồng hành ❤️</p></div><button class="cc-popup__close" data-close="ccDonateModal">✕</button></div>
        <img class="cc-donate-qr" src="assets/images/donate/qr.png" alt="QR ủng hộ MB Bank"
onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=&quot;cc-qr-error&quot;>Không tải được mã QR.</div>');">
       <div class="cc-donate-info" style="width:100%;text-align:center;display:grid;gap:6px;justify-items:center;"><div>Bank: MB Bank</div><div>Owner: NGO QUANG THANH</div><div>Account: <strong id="ccDonateAccount">06287599896666</strong></div></div>
        <div class="cc-popup__actions"><button class="cc-btn cc-btn--soft" id="ccCopyAccount" type="button">Copy Account Number</button><button class="cc-btn cc-btn--primary" type="button" data-close="ccDonateModal">Close</button></div>
      </div>
    </div>`);
  document.getElementById('ccDonateFab').addEventListener('click', () => openModal('ccDonateModal'));
  document.querySelectorAll('#ccDonateModal [data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  document.getElementById('ccDonateModal').addEventListener('click', event => { if (event.target.id === 'ccDonateModal') closeModal('ccDonateModal'); });
  document.getElementById('ccCopyAccount').addEventListener('click', async () => {
    await navigator.clipboard?.writeText('06287599896666');
    toast('Đã copy số tài khoản.');
  });
}
function openModal(id){document.getElementById(id)?.classList.add('open');}
function closeModal(id){document.getElementById(id)?.classList.remove('open');}
function toast(message){window.CCFirebase?.showToast?.(message) || alert(message);}
async function submitFeedback(event){
  event.preventDefault();
  const form = event.currentTarget;
  const msg = document.getElementById('ccFeedbackMessage').value.trim();
  if (!msg) return;
  const fb = window.CCFirebase;
  if (!fb?.db) return alert('Firebase chưa sẵn sàng.');
  const user = fb.getCurrentUser?.() || fb.auth?.currentUser || null;
  const payload = {
    uid: user?.uid || '', displayName: user?.displayName || '', email: user?.email || '', photoURL: user?.photoURL || '',
    type: document.getElementById('ccFeedbackType').value,
    title: document.getElementById('ccFeedbackInputTitle').value.trim(),
    message: msg, page: location.href, browser: navigator.userAgent, createdAt: serverTimestamp(), status: 'new'
  };
  form.querySelectorAll('button,input,textarea,select').forEach(x=>x.disabled=true);
  try {
    await addDoc(collection(fb.db, 'feedbacks'), payload);
    document.getElementById('ccFeedbackSuccess').classList.add('show');
    form.reset();
    setTimeout(()=>{document.getElementById('ccFeedbackSuccess').classList.remove('show');closeModal('ccFeedbackModal');},900);
  } finally { form.querySelectorAll('button,input,textarea,select').forEach(x=>x.disabled=false); }
}
