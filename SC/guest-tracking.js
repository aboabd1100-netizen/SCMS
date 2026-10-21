(() => {
  const M=window.SCMS,T=window.SCMSTracking,ar=()=>document.documentElement.lang==='ar',t=(en,a)=>ar()?a:en;
  const main=document.querySelector('main'),hero=document.querySelector('.guest-hero');if(!main||!hero)return;
  const section=document.createElement('section');section.id='guest-tracking';section.className='guest-container guest-section guest-tracking';hero.after(section);
  let query='',attempted=false,ready=false;
  function render(){
    section.innerHTML=`<div class="guest-tracking-heading"><span class="tracking-icon" aria-hidden="true">↗</span><div><h2>${t('Track Your Shipment','تتبع شحنتك')}</h2><p>${t('Enter your tracking number to check your shipment status.','أدخل رقم التتبع لمعرفة حالة شحنتك.')}</p></div></div><form id="guest-tracking-form"><label for="guest-tracking-number">${t('Tracking Number','رقم التتبع')}</label><div class="guest-tracking-controls"><input id="guest-tracking-number" name="tracking" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" required maxlength="80" placeholder="${t('Enter tracking number, e.g. SHP-1087','أدخل رقم التتبع، مثال: SHP-1087')}"><button class="guest-button" ${ready?'':'disabled'}>${t('Track Shipment','تتبع الشحنة')}</button></div><p class="tracking-error" role="status" aria-live="polite"></p></form><div id="guest-tracking-result" aria-live="polite"></div>`;
    section.querySelector('input').value=query;if(attempted&&ready)result();
  }
  let requestNumber=0;
  async function result(){
    const current=++requestNumber;let sh;try{sh=M.trackShipment?await M.trackShipment(query):M.data.shipments.find(s=>s.id.toUpperCase()===query.trim().toUpperCase());}catch(e){if(current!==requestNumber)return;if(e.status!==404){section.querySelector('.tracking-error').textContent=ar()?(e.ar||e.message):e.message;section.querySelector('#guest-tracking-result').innerHTML='';return;}}if(current!==requestNumber)return;
    const error=section.querySelector('.tracking-error'),target=section.querySelector('#guest-tracking-result');
    error.textContent=sh?'':t('Tracking number not found. Please check the number and try again.','رقم التتبع غير موجود. يرجى التحقق من الرقم والمحاولة مرة أخرى.');section.querySelector('input').setAttribute('aria-invalid',String(!sh));target.innerHTML=sh?T.summary(sh,false)+`<div class="guest-route-map scms"><div class="map-frame"><div class="logistics-map shipment-map" data-shipment-map="${sh.id.replace(/[^A-Za-z0-9_-]/g,'')}" role="region" aria-label="${t('Saudi shipment route','مسار الشحنة في السعودية')}"></div><p class="map-availability" role="status"></p><p class="map-route-note subtle"></p></div></div>`+T.timeline(sh):'';
    window.SCMSMaps?.mount();
  }
  section.addEventListener('input',e=>{if(e.target.name==='tracking')query=e.target.value;});
  section.addEventListener('submit',e=>{e.preventDefault();if(!ready)return;query=section.querySelector('input').value;attempted=true;result();});
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  window.addEventListener('scms:data',()=>{if(ready&&attempted)result();});
  render();M.init().then(()=>{ready=true;render();}).catch(()=>{section.querySelector('.tracking-error').textContent=t('Tracking is temporarily unavailable. Please reload and try again.','التتبع غير متاح مؤقتًا. يرجى إعادة التحميل والمحاولة مرة أخرى.');});
  // Preserve the existing sections while prioritizing shipment tracking and the process.
  const process=document.querySelector('#supply-chain');if(process)section.after(process);
  const features=document.querySelector('#features'),about=document.querySelector('#about');if(features&&process)process.after(features);if(about&&features)features.after(about);
  const network=document.querySelector('#saudi-network');if(network&&about)about.after(network);
  const offers=document.querySelector('#offers');if(offers){section.after(offers);if(process)offers.after(process);}
  const preview=document.querySelector('#shipment-preview'),reports=document.querySelector('#reports-preview'),stats=document.querySelector('#home-stats');if(network&&preview)network.after(preview);if(preview&&reports)preview.after(reports);if(reports&&stats)reports.after(stats);
})();

