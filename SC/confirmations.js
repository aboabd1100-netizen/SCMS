/* Shared, explicit confirmations for sensitive operations. */
window.SCMSConfirm = (() => {
  const messages = {
    user: ['Delete User', 'Are you sure you want to delete this user? This action cannot be undone.', 'Cancel', 'حذف المستخدم', 'هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء.', 'إلغاء'],
    order: ['Cancel Order', 'Are you sure you want to cancel this order?', 'Keep Order', 'إلغاء الطلب', 'هل أنت متأكد من إلغاء هذا الطلب؟', 'الاحتفاظ بالطلب'],
    offer: ['Delete Offer', 'Are you sure you want to delete this offer? This action cannot be undone.', 'Cancel', 'حذف العرض', 'هل أنت متأكد من حذف هذا العرض؟ لا يمكن التراجع عن هذا الإجراء.', 'إلغاء'],
    logout: ['Logout', 'Are you sure you want to log out?', 'Stay Logged In', 'تسجيل الخروج', 'هل أنت متأكد من تسجيل الخروج؟', 'البقاء مسجلاً']
  };
  let active = false;
  function run(kind, execute) {
    if (active) return Promise.resolve(false);
    const text = messages[kind];
    if (!text) return Promise.reject(new Error('Unknown confirmation action'));
    active = true;
    const arabic = document.documentElement.lang === 'ar', offset = arabic ? 3 : 0;
    const previous = document.activeElement;
    const modal = document.createElement('dialog');
    modal.id = 'scms-confirm-dialog';
    modal.className = 'scms-confirm';
    modal.dir = arabic ? 'rtl' : 'ltr';
    modal.lang = arabic ? 'ar' : 'en';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-labelledby', 'scms-confirm-title');
    modal.setAttribute('aria-describedby', 'scms-confirm-message');
    modal.innerHTML = `<div class="confirm-icon ${kind === 'logout' ? 'confirm-icon-primary' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${kind === 'logout' ? '<path d="M9 5H5v14h4M14 8l4 4-4 4M9 12h9"/>' : '<path d="M10.3 4.7 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v5m0 3v.5"/>'}</svg></div><h2 id="scms-confirm-title"></h2><p id="scms-confirm-message"></p><p class="confirm-error" role="alert" hidden></p><div class="confirm-actions"><button type="button" class="confirm-cancel" autofocus></button><button type="button" class="confirm-submit ${kind === 'logout' ? 'confirm-primary' : ''}"></button></div>`;
    modal.querySelector('h2').textContent = text[offset];
    modal.querySelector('#scms-confirm-message').textContent = text[offset + 1];
    const cancel = modal.querySelector('.confirm-cancel'), confirm = modal.querySelector('.confirm-submit');
    cancel.textContent = text[offset + 2];
    confirm.textContent = text[offset];
    document.body.append(modal);
    let busy = false, closing = false;
    return new Promise(resolve => {
      function close(result) {
        if (closing) return;
        closing = true;
        modal.classList.add('is-closing');
        setTimeout(() => {
          modal.close(); modal.remove(); active = false;
          if (previous?.isConnected) previous.focus();
          resolve(result);
        }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140);
      }
      cancel.addEventListener('click', () => { if (!busy) close(false); });
      modal.addEventListener('cancel', event => { event.preventDefault(); if (!busy) close(false); });
      confirm.addEventListener('click', async () => {
        if (busy || closing) return;
        busy = true; cancel.disabled = confirm.disabled = true;
        modal.setAttribute('aria-busy', 'true');
        const error = modal.querySelector('.confirm-error'); error.hidden = true;
        try { await execute(); close(true); }
        catch (e) {
          error.textContent = (arabic && e.ar) || e.message || (arabic ? 'تعذر إكمال الإجراء. حاول مجدداً.' : 'Unable to complete this action. Please try again.');
          error.hidden = false; busy = false; cancel.disabled = confirm.disabled = false;
          modal.removeAttribute('aria-busy'); cancel.focus();
        }
      });
      modal.showModal(); cancel.focus();
    });
  }
  return {run};
})();
