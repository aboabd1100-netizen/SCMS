/* One shared footer for guest, account, customer and operations pages. */
(() => {
  const footer = document.createElement('footer');
  footer.className = 'scms-footer';
  footer.innerHTML = `
    <div class="scms-footer-identity">
      <a class="scms-footer-brand" href="index.html" aria-label="SCMS Home"><img src="${window.SCMSLogo.src}" alt="SCMS — Smart Supply Chain Management System" width="160"></a>
      <p data-en="Smart Supply Chain Management System" data-ar="النظام الذكي لإدارة سلسلة التوريد">Smart Supply Chain Management System</p>
      <p class="scms-footer-location" data-en="KSA | Kingdom of Saudi Arabia" data-ar="المملكة العربية السعودية - KSA">KSA | Kingdom of Saudi Arabia</p>
    </div>
    <div class="scms-footer-credit">
      <p class="scms-footer-label" data-en="PROJECT / UI DESIGN" data-ar="تصميم المشروع والواجهة">PROJECT / UI DESIGN</p>
      <p class="scms-footer-designer"><span data-en="Designed by:" data-ar="تصميم المشروع:">Designed by:</span> <bdi dir="ltr"><strong>Abdullah Alharbi</strong></bdi></p>
    </div>
    <address class="scms-footer-contact">
      <p class="scms-footer-label" data-en="CUSTOMER SERVICE" data-ar="خدمة العملاء">CUSTOMER SERVICE</p>
      <a href="tel:+966503727574"><span data-en="Customer Service" data-ar="خدمة العملاء">Customer Service</span><bdi dir="ltr">+966 50 372 7574</bdi></a>
      <a href="mailto:support@scms-ksa.com"><span data-en="Email" data-ar="البريد الإلكتروني">Email</span><bdi dir="ltr">support@scms-ksa.com</bdi></a>
    </address>`;
  const translate = () => {
    const language = document.documentElement.lang === 'ar' ? 'ar' : 'en';
    footer.lang = language;
    footer.dir = language === 'ar' ? 'rtl' : 'ltr';
    footer.querySelectorAll('[data-en]').forEach(node => { node.textContent = node.dataset[language]; });
  };
  document.body.append(footer);
  translate();
  new MutationObserver(translate).observe(document.documentElement, {attributes:true, attributeFilter:['lang']});
})();
