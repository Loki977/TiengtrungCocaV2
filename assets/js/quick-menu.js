(function () {
  'use strict';

  const menu = document.querySelector('.quick-menu__inner');
  if (!menu || menu.dataset.quickMenuBound === 'true') return;
  menu.dataset.quickMenuBound = 'true';

  const cards = [...menu.querySelectorAll('.quick-card')];
  let activeCard = null;

  function setActive(card) {
    activeCard = card || null;
    cards.forEach((item) => {
      const active = item === activeCard;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-expanded', String(active));
    });
    menu.classList.toggle('has-active', Boolean(activeCard));
    if (activeCard) menu.dataset.activeIndex = String(cards.indexOf(activeCard));
    else delete menu.dataset.activeIndex;
  }

  function activateOrNavigate(card, event) {
    if (card === activeCard) return;
    event?.preventDefault();
    setActive(card);
  }

  cards.forEach((card) => {
    card.setAttribute('aria-expanded', 'false');
    card.addEventListener('click', (event) => activateOrNavigate(card, event));
    card.addEventListener('keydown', (event) => {
      if (event.key !== ' ') return;
      event.preventDefault();
      if (card === activeCard) {
        location.assign(card.href);
      } else {
        setActive(card);
      }
    });
  });

  document.addEventListener('pointerdown', (event) => {
    if (!activeCard || event.target.closest('.quick-menu__inner')) return;
    setActive(null);
  });

  document.addEventListener('focusin', (event) => {
    if (!activeCard || event.target.closest('.quick-menu__inner')) return;
    setActive(null);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && activeCard) {
      const previous = activeCard;
      setActive(null);
      previous.focus();
    }
  });
})();
