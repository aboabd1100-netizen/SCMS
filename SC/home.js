(() => {
  'use strict';
  const chain = [['Suppliers','الموردون'],['Purchase Orders','أوامر الشراء'],['Warehouses','المستودعات'],['Inventory','المخزون'],['Customer Orders','طلبات العملاء'],['Shipments','الشحنات']];
  const features = [
    ['Inventory Management','إدارة المخزون','Know stock levels, availability and replenishment needs across your products.','تابع مستويات المخزون والكميات المتاحة واحتياجات إعادة التوريد.'],
    ['Supplier Management','إدارة الموردين','Keep supplier details, partnerships and performance in one place.','اجمع بيانات الموردين والشراكات ومؤشرات الأداء في مكان واحد.'],
    ['Warehouse Management','إدارة المستودعات','Coordinate storage capacity, locations and stock transfers.','نسّق سعة التخزين والمواقع وتحويلات المخزون.'],
    ['Shipment Tracking','تتبع الشحنات','Follow shipment progress and delivery status from dispatch to arrival.','تابع تقدم الشحنات وحالة التسليم من الإرسال إلى الوصول.'],
    ['Offers & Promotions','العروض والتخفيضات','Connect customer orders with available offers and promotional codes.','اربط طلبات العملاء بالعروض المتاحة ورموز التخفيض.'],
    ['Reports & Analytics','التقارير والتحليلات','Understand inventory, supplier and shipment performance with clear reports.','افهم أداء المخزون والموردين والشحنات من خلال تقارير واضحة.']
  ];
  const visuals = [['warehouse.jpg','Organized warehouse inventory and pallet shelves'],['receiving.jpg','Warehouse team checking inbound cargo'],['saudi-docks.webp','Modern Saudi distribution center and loading docks'],['saudi-logistics.jpg','Saudi logistics delivery fleet'],['stock-handling.jpg','Palletized products ready for business distribution'],['analytics.svg','Illustrative SCMS inventory and shipment analytics dashboard']];
  const destinations=['#reports-preview','#supply-chain','#saudi-network','#guest-tracking','#offers','#reports-preview'];
  window.addEventListener('scms:language',event=>{language=event.detail==='ar'?'ar':'en';render();});
  let language='en'; try { language=localStorage.getItem('scms-lang')==='ar'?'ar':'en'; } catch {}
  function render(){
    const ar=language==='ar'; document.documentElement.lang=language; document.documentElement.dir=ar?'rtl':'ltr';
    document.querySelectorAll('[data-en]').forEach(el=>{el.textContent=el.dataset[language];});
    document.querySelectorAll('[data-language]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.language===language)));
    document.querySelector('.skip-link').textContent=ar?'انتقل إلى المحتوى':'Skip to content';
    document.querySelector('nav').setAttribute('aria-label',ar?'القائمة الرئيسية':'Main navigation');
    document.querySelector('#chain-flow').innerHTML=chain.map((item,i)=>`<li><button type="button" data-hero-step="${i}" aria-pressed="false"><span>${String(i+1).padStart(2,'0')}</span><strong>${item[ar?1:0]}</strong></button>${i<5?'<b aria-hidden="true">↓</b>':''}</li>`).join('');
    document.querySelector('#feature-grid').innerHTML=features.map((item,i)=>`<article class="guest-feature"><img class="feature-image" src="assets/${visuals[i][0]}" alt="${visuals[i][1]}" loading="lazy" width="640" height="360"><span class="feature-number">${String(i+1).padStart(2,'0')}</span><h3>${item[ar?1:0]}</h3><p>${item[ar?3:2]}</p><a class="feature-explore" href="${destinations[i]}"><span>${ar?'استكشف':'Explore'}</span><span aria-hidden="true">${ar?'←':'→'}</span><span class="home-sr-only"> ${item[ar?1:0]}</span></a></article>`).join('');
  }
  document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>{language=button.dataset.language;try{localStorage.setItem('scms-lang',language);}catch{}render();}));
  render();
})();
