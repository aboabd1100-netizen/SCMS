/* Runs before styles paint; shared by every SCMS route. */
(() => {
  const root = document.documentElement;
  let theme = 'dark';
  try { theme = localStorage.getItem('scms-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); } catch {}
  const update = value => {
    root.dataset.theme = value === 'light' ? 'light' : 'dark';
    document.querySelectorAll('.theme-toggle').forEach(button => {
      const light = root.dataset.theme === 'light', ar = root.lang === 'ar';
      const label = light ? (ar ? '☾ الوضع الداكن' : '☾ Dark Mode') : (ar ? '☀ الوضع الفاتح' : '☀ Light Mode');
      if (button.textContent !== label) button.textContent = label;
      button.setAttribute('aria-label', ar ? (light ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح') : `Switch to ${light ? 'dark' : 'light'} mode`);
      button.setAttribute('aria-pressed', String(light));
    });
  };
  window.SCMSTheme={set:value=>{try{localStorage.setItem('scms-theme',value);}catch{}update(value);}};
  update(theme);
  document.addEventListener('click', event => {
    if (!event.target.closest('.theme-toggle')) return;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('scms-theme', next); } catch {}
    update(next);
  });
  document.addEventListener('DOMContentLoaded', () => {
    const mount = () => {
      const header = document.querySelector('.guest-actions, .header-tools, .auth-top');
      if (header && !header.querySelector('.theme-toggle')) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'theme-toggle'; header.prepend(button);
      }
      update(root.dataset.theme);
    };
    mount();
    new MutationObserver(mount).observe(document.body, {childList:true, subtree:true});
    new MutationObserver(() => update(root.dataset.theme)).observe(root, {attributes:true, attributeFilter:['lang']});
  });
  addEventListener('storage', event => { if (event.key === 'scms-theme') update(event.newValue); });
})();
