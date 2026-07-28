const DRAG_THRESHOLD = 8;

function escapeSelector(value) {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

export function createTokenItems(questionId, tokens = []) {
  return tokens.map((text, index) => ({
    id: `${questionId}-token-${index}`,
    text: String(text),
    originalIndex: index,
  }));
}

export function sanitizeTokenOrder(items, order) {
  const allowed = new Set(items.map(item => item.id));
  const seen = new Set();
  return (Array.isArray(order) ? order : []).filter(id => {
    if (!allowed.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function answerFromOrder(items, order) {
  const byId = new Map(items.map(item => [item.id, item]));
  return sanitizeTokenOrder(items, order).map(id => byId.get(id)?.text || '').join('');
}

export function moveToken(order, tokenId, {
  zone = 'answer',
  targetId = '',
  after = false,
} = {}) {
  const next = order.filter(id => id !== tokenId);
  if (zone !== 'answer') return next;
  const targetIndex = targetId ? next.indexOf(targetId) : -1;
  if (targetIndex < 0) {
    next.push(tokenId);
  } else {
    next.splice(targetIndex + (after ? 1 : 0), 0, tokenId);
  }
  return next;
}

function tokenButton(item, selected) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `reorder-token${selected ? ' is-selected' : ''}`;
  button.dataset.tokenId = item.id;
  button.dataset.zone = selected ? 'answer' : 'bank';
  button.draggable = false;
  button.setAttribute('aria-label', selected
    ? `${item.text}, đang ở câu trả lời. Bấm để đưa về danh sách.`
    : `${item.text}. Bấm để đưa vào câu trả lời.`);
  const text = document.createElement('span');
  text.className = 'reorder-token__text';
  text.textContent = item.text;
  button.append(text);
  if (selected) {
    const remove = document.createElement('span');
    remove.className = 'reorder-token__remove';
    remove.setAttribute('aria-hidden', 'true');
    remove.textContent = '×';
    button.append(remove);
  }
  return button;
}

export class ReorderBoard {
  constructor({ questionId, tokens, savedOrder = [], onChange }) {
    this.items = createTokenItems(questionId, tokens);
    this.byId = new Map(this.items.map(item => [item.id, item]));
    this.order = sanitizeTokenOrder(this.items, savedOrder);
    this.onChange = onChange;
    this.dragTokenId = '';
    this.suppressClick = false;
    this.pointer = null;
    this.root = document.createElement('section');
    this.root.className = 'reorder-board';
    this.root.setAttribute('aria-label', 'Sắp xếp các thẻ từ thành câu');
    this.render();
  }

  get element() {
    return this.root;
  }

  availableItems() {
    const selected = new Set(this.order);
    return this.items.filter(item => !selected.has(item.id));
  }

  emit(message = '') {
    this.onChange?.(answerFromOrder(this.items, this.order), [...this.order]);
    if (message && this.live) this.live.textContent = message;
  }

  insert(tokenId, targetId = '', after = false) {
    this.order = moveToken(this.order, tokenId, { zone: 'answer', targetId, after });
    const item = this.byId.get(tokenId);
    this.render();
    this.emit(`${item?.text || 'Thẻ'} đã được đưa vào câu trả lời.`);
  }

  remove(tokenId) {
    this.order = moveToken(this.order, tokenId, { zone: 'bank' });
    const item = this.byId.get(tokenId);
    this.render();
    this.emit(`${item?.text || 'Thẻ'} đã trở lại danh sách từ.`);
  }

  reorder(tokenId, direction) {
    const index = this.order.indexOf(tokenId);
    if (index < 0) return;
    const nextIndex = Math.min(this.order.length - 1, Math.max(0, index + direction));
    if (nextIndex === index) return;
    const next = [...this.order];
    next.splice(index, 1);
    next.splice(nextIndex, 0, tokenId);
    this.order = next;
    this.render();
    this.emit(`${this.byId.get(tokenId)?.text || 'Thẻ'} đã đổi vị trí.`);
    this.root.querySelector(`[data-token-id="${escapeSelector(tokenId)}"]`)?.focus();
  }

  drop(tokenId, zone, targetId = '', clientX = 0) {
    if (!this.byId.has(tokenId)) return;
    if (zone === 'bank') {
      this.remove(tokenId);
      return;
    }
    let after = false;
    if (targetId) {
      const target = this.root.querySelector(`[data-token-id="${escapeSelector(targetId)}"]`);
      if (target) after = clientX > target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2;
    }
    this.insert(tokenId, targetId, after);
  }

  bindToken(button) {
    const tokenId = button.dataset.tokenId;
    button.addEventListener('click', () => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      if (button.dataset.zone === 'answer') this.remove(tokenId);
      else this.insert(tokenId);
    });
    button.addEventListener('keydown', event => {
      if (button.dataset.zone !== 'answer') return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.reorder(tokenId, -1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.reorder(tokenId, 1);
      } else if (event.key === 'Delete' || event.key === 'Backspace' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.remove(tokenId);
      }
    });
    button.addEventListener('dragstart', event => {
      this.dragTokenId = tokenId;
      button.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', tokenId);
    });
    button.addEventListener('dragend', () => {
      this.dragTokenId = '';
      button.classList.remove('is-dragging');
      this.clearDropTargets();
    });
    button.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.pointer = {
        id: event.pointerId,
        tokenId,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      };
      button.setPointerCapture?.(event.pointerId);
    });
    button.addEventListener('pointermove', event => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - this.pointer.startX, event.clientY - this.pointer.startY);
      if (!this.pointer.dragging && distance < DRAG_THRESHOLD) return;
      this.pointer.dragging = true;
      this.suppressClick = true;
      button.classList.add('is-dragging');
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-drop-zone], .reorder-token');
      this.clearDropTargets();
      target?.classList.add('is-drop-target');
      event.preventDefault();
    });
    button.addEventListener('pointerup', event => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const wasDragging = this.pointer.dragging;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-drop-zone], .reorder-token');
      this.pointer = null;
      button.classList.remove('is-dragging');
      this.clearDropTargets();
      if (!wasDragging || !target) return;
      const zone = target.dataset.zone || target.dataset.dropZone || target.closest('[data-drop-zone]')?.dataset.dropZone || 'answer';
      const targetId = target.classList.contains('reorder-token') ? target.dataset.tokenId : '';
      this.drop(tokenId, zone, targetId === tokenId ? '' : targetId, event.clientX);
      event.preventDefault();
    });
    button.addEventListener('pointercancel', () => {
      this.pointer = null;
      button.classList.remove('is-dragging');
      this.clearDropTargets();
    });
  }

  bindDropZone(zone) {
    zone.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      zone.classList.add('is-drop-target');
    });
    zone.addEventListener('dragleave', event => {
      if (!zone.contains(event.relatedTarget)) zone.classList.remove('is-drop-target');
    });
    zone.addEventListener('drop', event => {
      event.preventDefault();
      const tokenId = event.dataTransfer.getData('text/plain') || this.dragTokenId;
      const target = event.target.closest('.reorder-token');
      this.drop(tokenId, zone.dataset.dropZone, target?.dataset.tokenId || '', event.clientX);
      this.clearDropTargets();
    });
  }

  clearDropTargets() {
    this.root.querySelectorAll('.is-drop-target').forEach(element => element.classList.remove('is-drop-target'));
  }

  render() {
    this.root.replaceChildren();
    const instruction = document.createElement('p');
    instruction.className = 'reorder-board__hint';
    instruction.textContent = 'Bấm hoặc kéo thẻ xuống ô trả lời. Trong ô trả lời, kéo để đổi vị trí; bàn phím dùng ← → để sắp xếp và Delete để xóa.';

    const bankLabel = document.createElement('strong');
    bankLabel.className = 'reorder-board__label';
    bankLabel.textContent = 'Các từ cho sẵn';
    const bank = document.createElement('div');
    bank.className = 'reorder-token-zone reorder-token-bank';
    bank.dataset.dropZone = 'bank';
    bank.dataset.zone = 'bank';
    bank.setAttribute('aria-label', 'Danh sách từ cho sẵn');

    this.availableItems().forEach(item => {
      const button = tokenButton(item, false);
      this.bindToken(button);
      bank.append(button);
    });
    if (!bank.childElementCount) {
      const empty = document.createElement('span');
      empty.className = 'reorder-zone-empty';
      empty.textContent = 'Bạn đã dùng tất cả thẻ.';
      bank.append(empty);
    }

    const answerLabel = document.createElement('strong');
    answerLabel.className = 'reorder-board__label';
    answerLabel.textContent = 'Câu trả lời';
    const answer = document.createElement('div');
    answer.className = 'reorder-token-zone reorder-answer-zone';
    answer.dataset.dropZone = 'answer';
    answer.dataset.zone = 'answer';
    answer.setAttribute('aria-label', 'Ô sắp xếp câu trả lời');
    this.order.forEach(id => {
      const item = this.byId.get(id);
      if (!item) return;
      const button = tokenButton(item, true);
      this.bindToken(button);
      answer.append(button);
    });
    if (!answer.childElementCount) {
      const empty = document.createElement('span');
      empty.className = 'reorder-zone-empty';
      empty.textContent = 'Bấm hoặc kéo thẻ vào đây';
      answer.append(empty);
    }
    this.bindDropZone(bank);
    this.bindDropZone(answer);

    this.live = document.createElement('span');
    this.live.className = 'sr-only';
    this.live.setAttribute('aria-live', 'polite');
    this.root.append(instruction, bankLabel, bank, answerLabel, answer, this.live);
  }
}
