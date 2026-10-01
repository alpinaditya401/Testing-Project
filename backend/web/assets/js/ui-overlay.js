import { icon } from './icons.js';
import { app, escapeHtml, modalRoot, qs, qsa, toastRegion } from './dom.js';

// Toast region and the confirm dialog.
// closeModal and focusTrap stay inside showModal on purpose: they close over
// trigger, dialog and confirm. Hoisting them to module scope would break the
// focus trap silently.
export function toast(message, kind = '') {
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.innerHTML = `${icon(kind === 'warning' ? 'alert' : 'check', 'icon-sm')}<span>${escapeHtml(message)}</span>`;
  toastRegion.appendChild(node);
  setTimeout(() => node.remove(), 3300);
}

export function showModal({ title, body, confirmText = 'Lanjutkan', danger = false, onConfirm }) {
  const trigger = document.activeElement;
  app.setAttribute('aria-hidden', 'true');
  app.setAttribute('inert', '');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" role="presentation" data-close-modal>
      <section class="modal-card neu-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-card>
        <h2 id="modal-title">${escapeHtml(title)}</h2>
        <p>${body}</p>
        <div class="modal-actions">
          <button class="btn btn-sm" type="button" data-close-modal>Batal</button>
          <button class="btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}" type="button" id="modal-confirm">${escapeHtml(confirmText)}</button>
        </div>
      </section>
    </div>`;
  const dialog = modalRoot.querySelector('[data-modal-card]');
  const confirm = qs('#modal-confirm', modalRoot);

  function closeModal() {
    modalRoot.removeEventListener('keydown', focusTrap);
    modalRoot.innerHTML = '';
    app.removeAttribute('aria-hidden');
    app.removeAttribute('inert');
    trigger?.focus?.();
  }

  function focusTrap(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeModal();
      return;
    }
    if (event.key === 'Tab') {
      const focusables = qsa('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', dialog);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  modalRoot.addEventListener('keydown', focusTrap);
  confirm?.focus();
  confirm?.addEventListener('click', async () => {
    confirm.disabled = true;
    try {
      await onConfirm?.();
      closeModal();
    } catch (error) {
      toast(error.message || 'Tindakan gagal. Silakan coba lagi.', 'warning');
    } finally {
      confirm.disabled = false;
    }
  });
  qsa('[data-close-modal]', modalRoot).forEach(el => el.addEventListener('click', event => {
    if (event.target.closest('[data-modal-card]') && !event.target.matches('[data-close-modal]')) return;
    closeModal();
  }));
}
