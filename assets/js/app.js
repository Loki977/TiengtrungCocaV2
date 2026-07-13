/* ================================================
   TIENG TRUNG CAM & COCA — app.js
   Ripple effects · Header scroll · Hamburger · Modal · Path interactions · Timer
   ================================================ */

(function () {
  'use strict';

  /* ── Ripple Effect ── */
  function createRipple(event) {
    const btn = event.currentTarget;
    const wave = document.createElement('span');
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    wave.classList.add('ripple-wave');
    wave.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;

    btn.appendChild(wave);
    wave.addEventListener('animationend', () => wave.remove());
  }

  function attachRipples() {
    document.querySelectorAll('.ripple').forEach(btn => {
      btn.removeEventListener('click', createRipple);
      btn.addEventListener('click', createRipple);
    });
  }
  attachRipples();

  /* ── Header: shadow on scroll ── */
  const header = document.getElementById('header');
  if (header) {
    const onScroll = () => {
      header.classList.toggle('scrolled', window.scrollY > 10);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Hamburger / Mobile Nav ── */
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileNav.classList.toggle('open');
      hamburger.classList.toggle('open', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // Close on link click
    mobileNav.querySelectorAll('.nav__link').forEach(link => {
      link.addEventListener('click', () => {
        mobileNav.classList.remove('open');
        hamburger.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  /* ── Login Modal ── */
  const loginModal   = document.getElementById('loginModal');
  const loginBtn     = document.getElementById('loginBtn');
  const loginBtnMob  = document.getElementById('loginBtnMobile');
  const modalClose   = document.getElementById('modalClose');
  const loginForm    = document.getElementById('loginForm');
  const authPanels   = loginModal?.querySelectorAll('[data-auth-panel]') || [];
  const authTitle    = loginModal?.querySelector('[data-auth-title]');
  const authSubtitle = loginModal?.querySelector('[data-auth-subtitle]');

  function switchAuthMode(mode) {
    const isRegister = mode === 'register';
    authPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.authPanel === mode));
    if (authTitle) authTitle.textContent = isRegister ? 'Tạo tài khoản mới' : 'Chào mừng trở lại!';
    if (authSubtitle) authSubtitle.textContent = isRegister
      ? authSubtitle.dataset.registerSubtitle
      : authSubtitle.dataset.loginSubtitle;
    window.requestAnimationFrame(() => {
      loginModal?.querySelector(`[data-auth-panel="${mode}"] input`)?.focus();
    });
  }

  function openModal() {
    if (!loginModal) return;
    switchAuthMode('register');
    loginModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!loginModal) return;
    loginModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  loginBtn?.addEventListener('click', openModal);
  loginBtnMob?.addEventListener('click', () => {
    mobileNav?.classList.remove('open');
    hamburger?.classList.remove('open');
    document.body.style.overflow = '';
    openModal();
  });
  modalClose?.addEventListener('click', closeModal);
  loginModal?.addEventListener('click', e => {
    if (e.target === loginModal) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
  loginModal?.querySelectorAll('[data-auth-switch]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      switchAuthMode(link.dataset.authSwitch);
    });
  });

  loginForm?.addEventListener('submit', e => {
    e.preventDefault();
    console.log('redirect reason:', 'login form delegated to Firebase');
    return;
    const submitBtn = loginForm.querySelector('[type="submit"]');
    if (!submitBtn) return;

    submitBtn.textContent = 'Đang đăng nhập…';
    submitBtn.disabled = true;

    setTimeout(() => {
      closeModal();
      submitBtn.textContent = 'Đăng nhập';
      submitBtn.disabled = false;
      showToast('Chào mừng trở lại! 🎉');
    }, 1200);
  });

  /* ── Toast Notification ── */
  function showToast(message) {
    const existing = document.querySelector('.toast');
    existing?.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:3000;
      background:var(--charcoal); color:#fff;
      padding:12px 20px; border-radius:12px;
      font-family:'Poppins',sans-serif; font-size:.875rem; font-weight:500;
      box-shadow:0 8px 32px rgba(0,0,0,.25);
      transform:translateY(16px); opacity:0;
      transition:transform .25s ease, opacity .25s ease;
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity   = '1';
      });
    });

    setTimeout(() => {
      toast.style.transform = 'translateY(16px)';
      toast.style.opacity   = '0';
      toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
  }

  /* ── Learning Path: active node interaction ── */
  document.querySelectorAll('.path-node').forEach(node => {
    if (node.classList.contains('locked')) return;

    node.addEventListener('click', function () {
      const label = this.querySelector('.path-node__label')?.textContent || 'bài học này';
      showToast(`Đang mở: ${label} 🚀`);
    });

    // Hover tooltip for locked nodes
    node.addEventListener('mouseenter', function () {
      this.setAttribute('aria-current', 'step');
    });
    node.addEventListener('mouseleave', function () {
      this.removeAttribute('aria-current');
    });
  });

  // Locked node click feedback
  document.querySelectorAll('.path-node.locked').forEach(node => {
    node.addEventListener('click', () => {
      showToast('Hoàn thành cấp trước để mở khóa! 🔒');
      node.animate([
        { transform: 'translateX(0)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ], { duration: 350, easing: 'ease-in-out' });
    });
  });

  /* ── Course Card: locked click feedback ── */
  document.querySelectorAll('.course-card--locked').forEach(card => {
    card.addEventListener('click', () => {
      showToast('Hoàn thành các cấp trước để mở khóa! 🔒');
    });
  });

  /* ── Smooth nav link active state ── */
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav__link');

  if (sections.length && navLinks.length) {
    const ioOpts = { rootMargin: '-50% 0px -50% 0px' };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          const href = link.getAttribute('href')?.replace('#', '');
          link.classList.toggle('active', href === id);
        });
      });
    }, ioOpts);

    sections.forEach(sec => observer.observe(sec));
  }

  /* ── Progress bar animation on scroll ── */
  const progressEls = document.querySelectorAll('.progress-bar__fill, .mini-progress, .card__level-fill');

  if ('IntersectionObserver' in window) {
    const progressObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const targetWidth = el.style.width;
          el.style.width = '0%';
          requestAnimationFrame(() => {
            requestAnimationFrame(() => { el.style.width = targetWidth; });
          });
          progressObserver.unobserve(el);
        }
      });
    }, { threshold: 0.3 });

    progressEls.forEach(el => {
      el.dataset.target = el.style.width;
      progressObserver.observe(el);
    });
  }

  /* ── Ring progress animation on scroll ── */
  const ringProgress = document.querySelector('.ring-progress');
  if (ringProgress && 'IntersectionObserver' in window) {
    const targetDash = ringProgress.getAttribute('stroke-dasharray');
    ringProgress.setAttribute('stroke-dasharray', '0 314');

    const ringObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        requestAnimationFrame(() => {
          ringProgress.setAttribute('stroke-dasharray', targetDash);
        });
        ringObserver.disconnect();
      }
    }, { threshold: 0.5 });

    ringObserver.observe(ringProgress.closest('.daily-goal') || document.body);
  }

  /* ── Card entrance animation ── */
  const cardEls = document.querySelectorAll('.card, .course-card, .continue-card, .daily-goal');

  if ('IntersectionObserver' in window) {
    const cardObserver = new IntersectionObserver(entries => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          entry.target.style.transitionDelay = `${(i % 4) * 60}ms`;
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          cardObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    cardEls.forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity .4s ease, transform .4s ease';
      cardObserver.observe(el);
    });
  }

  /* ── Signup button confetti burst ── */
  const signupBtn = document.getElementById('signupBtn');
  signupBtn?.addEventListener('click', () => {
    showToast('Chào mừng bạn đến với Cam & Coca! 🍊🎉');
  });

})();
