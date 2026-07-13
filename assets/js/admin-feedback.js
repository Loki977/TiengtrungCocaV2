import { collection, query, orderBy, onSnapshot, updateDoc, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

const ADMIN_EMAIL = 'nqthanhforwork@gmail.com';
const list = document.getElementById('feedbackList');
const search = document.getElementById('feedbackSearch');
const filter = document.getElementById('feedbackStatusFilter');
let feedbacks = [];
let unsubscribe = null;

window.addEventListener('cc:auth-ready', handleAuth);
setTimeout(() => handleAuth({ detail: { user: window.CCFirebase?.getCurrentUser?.() } }), 900);

function handleAuth(event) {
  const user = event.detail?.user || window.CCFirebase?.auth?.currentUser;
  if (!window.CCFirebase?.isAuthReady?.()) return;
  if (!user || String(user.email || '').toLowerCase() !== ADMIN_EMAIL) {
    location.replace('index.html');
    return;
  }
  startRealtime();
}

function startRealtime() {
  if (unsubscribe || !window.CCFirebase?.db) return;
  const q = query(collection(window.CCFirebase.db, 'feedbacks'), orderBy('createdAt', 'desc'));
  unsubscribe = onSnapshot(q, (snapshot) => {
    feedbacks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, (error) => {
    console.error(error);
    list.innerHTML = '<div class="admin-empty">Không tải được feedback. Kiểm tra Firestore Rules.</div>';
  });
}

search.addEventListener('input', render);
filter.addEventListener('change', render);
list.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'delete') {
    if (confirm('Xóa feedback này?')) await deleteDoc(doc(window.CCFirebase.db, 'feedbacks', id));
    return;
  }
  await updateDoc(doc(window.CCFirebase.db, 'feedbacks', id), { status: btn.dataset.action });
});

function render() {
  const keyword = search.value.trim().toLowerCase();
  const status = filter.value;
  const items = feedbacks.filter(item => {
    const text = [item.displayName,item.email,item.type,item.title,item.message,item.page].join(' ').toLowerCase();
    return (!keyword || text.includes(keyword)) && (status === 'all' || item.status === status);
  });
  if (!items.length) {
    list.innerHTML = '<div class="admin-empty">Không có góp ý phù hợp.</div>';
    return;
  }
  list.innerHTML = items.map(cardHtml).join('');
}
function cardHtml(item) {
  const avatar = item.photoURL ? `<img src="${escapeHtml(item.photoURL)}" alt="">` : '👤';
  const time = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString('vi-VN') : '';
  return `<article class="feedback-card">
    <div class="feedback-avatar">${avatar}</div>
    <div>
      <div class="feedback-head"><div><div class="feedback-name">${escapeHtml(item.displayName || 'Ẩn danh')}</div><div class="feedback-email">${escapeHtml(item.email || 'Chưa đăng nhập')}</div></div><div><span class="feedback-status ${escapeHtml(item.status || 'new')}">${escapeHtml(item.status || 'new')}</span><div class="feedback-time">${escapeHtml(time)}</div></div></div>
      <span class="feedback-type">${escapeHtml(item.type || 'Other')}</span>
      ${item.title ? `<div class="feedback-title">${escapeHtml(item.title)}</div>` : ''}
      <div class="feedback-message">${escapeHtml(item.message || '')}</div>
      <div class="feedback-meta">${escapeHtml(item.page || '')}<br>${escapeHtml(item.browser || '')}</div>
      <div class="feedback-actions"><button class="btn-read" data-action="read" data-id="${item.id}">Mark Read</button><button class="btn-done" data-action="done" data-id="${item.id}">Mark Done</button><button class="btn-delete" data-action="delete" data-id="${item.id}">Delete</button></div>
    </div>
  </article>`;
}
function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch])); }
