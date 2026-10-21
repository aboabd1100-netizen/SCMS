/* Shared shipment presentation. Identifiers and stored records are never localized. */
window.SCMSTracking = (() => {
  const ar=()=>document.documentElement.lang==='ar',t=(en,a)=>ar()?a:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names={'Preparing':'قيد التحضير','Picked Up':'تم الاستلام من المصدر','In Transit':'قيد النقل','At Destination':'وصلت إلى الوجهة','Delivered':'تم التسليم','Delayed':'متأخر','Riyadh Distribution Hub':'مركز توزيع الرياض','Jeddah Port Hub':'مركز ميناء جدة','Dammam Cross-Dock':'مركز العبور بالدمام','Al Khobar Industrial Area, Khobar, Saudi Arabia':'المنطقة الصناعية، الخبر، المملكة العربية السعودية','Najd Freight (Demo)':'نجد للشحن (تجريبي)','Red Sea Logistics (Demo)':'البحر الأحمر للخدمات اللوجستية (تجريبي)'};
  const text=v=>esc(ar()?(names[v]||v):v);
  const date=(v,time=false)=>v?new Intl.DateTimeFormat(ar()?'ar-SA-u-nu-arab':'en-US-u-nu-latn',{year:'numeric',month:'short',day:'numeric',...(time?{hour:'numeric',minute:'2-digit'}:{}),calendar:'gregory',timeZone:'Asia/Riyadh'}).format(new Date(v.length===10?v+'T12:00:00+03:00':v)):'—';
  const steps=['Preparing','Picked Up','In Transit','At Destination','Delivered'];
  function summary(sh,related=true){
    const history=sh.history||[],last=history.at(-1),index=sh.status==='Delayed'?Math.max(0,...history.map(h=>steps.indexOf(h.status))):steps.indexOf(sh.status);
    const fields=[[t('Shipment ID','رقم الشحنة'),`<bdi data-number-format="off">${esc(sh.id)}</bdi>`],[t('Current Status','الحالة الحالية'),text(sh.status)],...(related?[[t('Related Order','الطلب المرتبط'),`<bdi data-number-format="off">${esc(sh.orderId||sh.poId||'—')}</bdi>`]]:[]),[t('Carrier','الناقل'),text(sh.carrier)],[t('Origin','المصدر'),text(sh.origin)],[t('Destination','الوجهة'),text(sh.destination)],[t('Estimated Delivery','التسليم المتوقع'),date(sh.eta)],[t('Last Update','آخر تحديث'),date(last?.at,true)]];
    return `<section class="tracking-summary" aria-label="${t('Shipment tracking details','تفاصيل تتبع الشحنة')}"><div class="tracking-summary-head"><h2>${t('Shipment details','تفاصيل الشحنة')}</h2><span class="tracking-status ${sh.status==='Delayed'?'is-delayed':''}">${text(sh.status)}</span></div><dl class="tracking-facts">${fields.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl><ol class="tracking-progress" aria-label="${t('Shipment progress','تقدم الشحنة')}">${steps.map((s,i)=>`<li class="${i<=index?'is-complete':''} ${i===index?'is-current':''}" ${i===index?'aria-current="step"':''}><span aria-hidden="true">${new Intl.NumberFormat(ar()?'ar-SA-u-nu-arab':'en-US-u-nu-latn').format(i+1)}</span><strong>${text(s)}</strong></li>`).join('')}</ol></section>`;
  }
  function timeline(sh){return `<section class="tracking-history"><h3>${t('Tracking timeline','سجل التتبع')}</h3><ol>${(sh.history||[]).map(h=>`<li><strong>${text(h.status)}</strong><time datetime="${esc(h.at)}">${date(h.at,true)}</time></li>`).join('')}</ol></section>`;}
  return {summary,timeline,text,date};
})();
