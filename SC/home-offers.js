/* Public offers read the same SCMS records and status rules as the admin portal. */
(() => {
  const M=window.SCMS,grid=document.querySelector('.home-offer-grid'),dialog=document.querySelector('.home-offer-dialog');
  if(!M||!grid)return;
  const ar=()=>document.documentElement.lang==='ar',t=(en,a)=>ar()?a:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=v=>esc(typeof v==='object'?(ar()?v.ar:v.en):v);
  const date=v=>new Intl.DateTimeFormat(ar()?'ar-SA-u-nu-arab':'en-SA-u-nu-latn',{dateStyle:'medium',calendar:'gregory',timeZone:'Asia/Riyadh'}).format(new Date(v+'T12:00:00+03:00'));
  const discount=o=>o.type==='Free Shipping'?t('Free delivery','توصيل مجاني'):new Intl.NumberFormat(ar()?'ar-SA-u-nu-arab':'en-SA-u-nu-latn',{style:'percent',maximumFractionDigits:1}).format(o.discount/100);
  const products=o=>o.productIds.map(id=>M.data.products.find(p=>p.id===id)).filter(Boolean).map(p=>label(p.name)).join(t(', ','، '));
  const details=o=>`<p>${label(o.description)}</p>${o.code?`<p class="home-promo-code">${t('Promo code','رمز العرض')}: <bdi data-number-format="off">${esc(o.code)}</bdi></p>`:''}<dl class="home-offer-details"><div><dt>${t('Minimum Quantity','الحد الأدنى للكمية')}</dt><dd>${new Intl.NumberFormat(ar()?'ar-SA-u-nu-arab':'en-SA-u-nu-latn').format(o.minQty)}</dd></div><div><dt>${t('Start date','تاريخ البداية')}</dt><dd>${date(o.start)}</dd></div><div><dt>${t('End date','تاريخ النهاية')}</dt><dd>${date(o.end)}</dd></div><div><dt>${t('Applicable products','المنتجات المشمولة')}</dt><dd>${products(o)}</dd></div></dl>`;
  let loaded=false,lastView;
  function render(){
    if(!loaded)return;
    const view=M.data.revision+"/"+M.day()+"/"+ar();if(view===lastView)return;lastView=view;
    const offers=[...M.data.offers].reverse().filter(o=>M.offerStatus(o)==='Active');
    grid.innerHTML=offers.length?offers.map(o=>`<article class="home-offer-card home-glass" data-offer-id="${esc(o.id)}"><div class="home-offer-top"><span class="home-status">${t('Active','نشط')}</span><strong>${discount(o)}</strong></div><h3>${label(o.name)}</h3>${details(o)}<button type="button" class="home-text-link" data-live-offer="${esc(o.id)}">${t('View Offer →','عرض التفاصيل ←')}</button></article>`).join(''):`<p class="home-offer-note">${t('No active offers at the moment. Check back for new promotions.','لا توجد عروض نشطة حاليًا. تابعنا للاطلاع على العروض الجديدة.')}</p>`;
    if(dialog.open)dialog.close();
  }
  grid.addEventListener('click',event=>{
    const button=event.target.closest('[data-live-offer]');if(!button)return;
    const o=M.data.offers.find(o=>o.id===button.dataset.liveOffer&&M.offerStatus(o)==='Active');if(!o){render();return;}
    dialog.innerHTML=`<button type="button" class="home-dialog-close" aria-label="${t('Close offer details','إغلاق تفاصيل العرض')}">×</button><p class="guest-eyebrow">${t('ACTIVE PROMOTION','عرض نشط')}</p><h2 id="home-offer-title">${label(o.name)}</h2><strong class="home-offer-discount">${discount(o)}</strong>${details(o)}<p>${t('Minimum eligible quantity','الحد الأدنى للكمية المؤهلة')}: ${new Intl.NumberFormat(ar()?'ar-SA-u-nu-arab':'en-SA-u-nu-latn').format(o.minQty)}</p><a class="guest-button" href="offers.html">${t('Use this offer in your portal','استخدم العرض في بوابتك')}</a>`;
    dialog.setAttribute('aria-labelledby','home-offer-title');dialog.showModal();
  });
  grid.innerHTML=`<p class="home-offer-note">${t('Loading offers…','جارٍ تحميل العروض…')}</p>`;
  M.init().then(()=>{loaded=true;render();}).catch(()=>{grid.innerHTML=`<p class="home-offer-note">${t('Offers could not load. Please reload the page.','تعذر تحميل العروض. يرجى إعادة تحميل الصفحة.')}</p>`;});
  window.addEventListener('scms:data',render);
  window.addEventListener('focus',render);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  // Reapply the shared active-status rule when date boundaries change while open.
  setInterval(render,60000);
})();
