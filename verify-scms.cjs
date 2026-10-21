const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const out=path.resolve('scms-verification');fs.mkdirSync(out,{recursive:true});
for(const name of fs.readdirSync(out))if(name.startsWith('scms-')&&name.endsWith('.csv'))fs.unlinkSync(path.join(out,name));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const server=http.createServer((req,res)=>{const f=path.join('SC',path.basename(req.url.split('?')[0])||'index.html');if(!fs.existsSync(f)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',f.endsWith('.png')?'image/png':f.endsWith('.json')?'application/json':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.css')?'text/css; charset=utf-8':f.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(8768,'127.0.0.1',r));
 const profile=path.join(out,`browser-${Date.now()}`);
 const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9231',`--user-data-dir=${profile}`],{windowsHide:true,stdio:'ignore'});
 let ws;
 try{
  let tabs;for(let i=0;i<40;i++){try{tabs=await(await fetch('http://127.0.0.1:9231/json',{signal:AbortSignal.timeout(1000)})).json();break;}catch{await pause(250);}}
  assert(tabs,'Browser did not start');ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map(),errors=[];
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.enable');await send('Runtime.enable');
  const until=async(expression)=>{for(let i=0;i<100;i++){try{if(await ev(expression))return;}catch{}await pause(100);}throw Error('Timeout: '+expression);};
  const nav=async page=>{await send('Page.navigate',{url:`http://127.0.0.1:8768/${page}.html`});await until(`!!document.querySelector('#login-form,.main,#signup-form,#forgot-form')`);};
  const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill=(selector,values)=>ev(`Object.entries(${JSON.stringify(values)}).forEach(([k,v])=>{const e=document.querySelector(${JSON.stringify(selector)}).elements[k];e.value=v;})`);
  const submit=async selector=>{await ev(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);await until(`!document.querySelector('form button:disabled')`);};
  const login=async(kind)=>{await nav('login');await fill('#login-form',{email:kind==='admin'?'admin@scms.io':'customer@scms.io',password:kind==='admin'?'Admin@12345':'Customer@12345'});await submit('#login-form');await until(`!!document.querySelector('.main')`);};
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await nav('login');await fill('#login-form',{email:'admin@scms.io',password:'incorrect'});await submit('#login-form');assert(await ev(`!!document.querySelector('.form-error').textContent`));
  await login('admin');
  assert.equal(await ev('SCMS.data.settings.currency'),'SAR');
  assert.deepEqual(await ev('SCMS.data.warehouses.slice(0,3).map(w=>w.location)'),['Riyadh, Saudi Arabia','Dammam, Saudi Arabia','Jeddah, Saudi Arabia']);
  assert(await ev(`document.querySelectorAll('.sar-money .riyal-symbol').length>0`));
  assert(await ev(`fetch('saudi-riyal.svg').then(r=>r.ok&&r.headers.get('content-type').includes('image/svg'))`));

  assert.equal(await ev('SCMS.data.warehouses.length'),8);
  assert(await ev(`document.querySelector('.header-brand').complete&&document.querySelector('.header-brand').naturalWidth===1448`));
  for(const width of [1440,390])for(const lang of ['en','ar']){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    await nav('warehouses');await click(`button[data-action="language"][data-id="${lang}"]`);
    await until(`document.querySelector('[data-network-map]').dataset.ready==='true'`);
    assert.equal(await ev(`document.querySelectorAll('[data-network-map] .logistics-marker').length`),8);
    await ev(`document.querySelector('.network-section').scrollIntoView()`);await pause(1400);
    let shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`network-map-${width}-${lang}.png`),Buffer.from(shot.data,'base64'));
    await nav('shipments');await click('[data-action="shipment-view"][data-id="SHP-1087"]');
    await until(`document.querySelector('[data-shipment-map]').dataset.ready==='true'`);
    assert.equal(await ev(`document.querySelectorAll('.shipment-steps li').length`),5);
    assert.equal(await ev(`document.querySelectorAll('.route-truck').length`),1);
    assert(await ev(`(()=>{const d=document.querySelector('dialog');return d.scrollWidth<=d.clientWidth+1})()`));
    await pause(1200);shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`shipment-map-${width}-${lang}.png`),Buffer.from(shot.data,'base64'));
    await click('[data-action="close"]');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await nav('dashboard');
  assert.equal(await ev(`SCMS.quantity(SCMS.data,'p4')`),15);
  await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*tile.openstreetmap.org*','*router.project-osrm.org*']});
  await nav('shipments');await click('[data-action="shipment-view"][data-id="SHP-1087"]');
  await until(`document.querySelector('[data-shipment-map]').dataset.ready==='true'`);
  assert(await ev(`document.querySelectorAll('.leaflet-geography-pane path').length>5`),'Offline geography missing');
  assert.equal(await ev(`document.querySelectorAll('.route-truck').length`),1,'Saved road route missing offline');
  await click('[data-action="close"]');await nav('warehouses');
  await until(`document.querySelector('[data-network-map]').dataset.ready==='true'`);
  await click('[data-map-warehouse="wh-8"]');assert(await ev(`document.querySelector('.leaflet-popup-content').textContent.includes('0%')`));
  await send('Network.setBlockedURLs',{urls:[]});await nav('dashboard');
  assert(await ev(`SCMS.notifications().some(n=>n.type==='Low Stock')`));assert(await ev(`SCMS.notifications().some(n=>n.type==='Out of Stock')`));
  const ops=['dashboard','inventory','suppliers','purchase-orders','shipments','warehouses','customer-orders','admin-offers','notifications','users','reports','settings'];
  const customer=['customer','catalog','orders','tracking','offers','customer-notifications','profile'];
  let layouts=0;
  if(!process.env.FLOWS_ONLY){
   await ev(`SCMS.logout()`);
   for(const width of [1440,768,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for(const page of ['login','signup','forgot-password']){
     await nav(page);
     for(const lang of ['en','ar']){
      await click(`button[data-action="language"][data-id="${lang}"]`);
      assert(!(await ev(`document.documentElement.scrollWidth>innerWidth+1`)),`${page} overflow`);
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,`${page}-${width}-${lang}.png`),Buffer.from(shot.data,'base64'));layouts++;
     }
    }
   }
   for(const role of ['admin','customer']){
    await login(role);
    for(const width of [1440,768,390]){
     await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
     for(const page of role==='admin'?ops:customer){
      await nav(page);
      for(const lang of ['en','ar']){
       await click(`button[data-action="language"][data-id="${lang}"]`);
       const layout=await ev(`(()=>{const side=document.querySelector('.sidebar').getBoundingClientRect(),main=document.querySelector('.main').getBoundingClientRect(),cells=[...document.querySelectorAll('thead tr:first-child th')].map(e=>e.getBoundingClientRect().x);return {overflow:document.documentElement.scrollWidth>innerWidth+1,dir:document.documentElement.dir,side:{x:side.x,r:side.right},main:{x:main.x,r:main.right},cells,title:document.querySelector('h1')?.textContent,links:[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'))}})()`);
       assert(!layout.overflow,`${page} ${width} ${lang}: overflow`);assert.equal(layout.dir,lang==='ar'?'rtl':'ltr');assert(layout.title);
       if(width>980)assert(lang==='ar'?layout.side.x>=layout.main.r-1:layout.side.r<=layout.main.x+1,`${page}: sidebar`);
       if(layout.cells.length>1)assert(lang==='ar'?layout.cells[0]>layout.cells[1]:layout.cells[0]<layout.cells[1]);
       for(const href of layout.links)if(href.endsWith('.html'))assert(fs.existsSync(path.join('SC',href)),href);
       const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,`${page}-${width}-${lang}.png`),Buffer.from(shot.data,'base64'));layouts++;
      }
     }
    }
   }
   console.log(`Passed ${layouts} connected screen layout checks.`);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await login('customer');await nav('catalog');await click('button[data-action="language"][data-id="en"]');
  await click('[data-action="new-order"][data-id="p2"]');await fill('#order-form',{lineQty:'20',code:'SAFETY10'});await submit('#order-form');
  assert.equal(await ev(`document.querySelector('dialog').open`),false,await ev(`document.querySelector('.form-error')?.textContent`));
  const orderId=await ev(`SCMS.data.orders[0].id`);
  assert.equal(await ev(`SCMS.data.orders[0].discount`),37);assert.equal(await ev(`SCMS.data.orders[0].total`),358);assert.equal(await ev(`SCMS.available(SCMS.data,'p2')`),350);
  const before=await ev(`SCMS.data.revision`);
  const rejection=await ev(`SCMS.createOrder({items:[{productId:'p2',warehouseId:'wh-2',qty:99999}],address:'Test address',code:''}).then(()=>false,e=>true)`);assert(rejection);assert.equal(await ev(`SCMS.data.revision`),before);
  await nav('dashboard');await until(`location.pathname.endsWith('customer.html')`);
  await login('admin');await nav('customer-orders');assert(await ev(`document.body.textContent.includes('${orderId}')`));
  await ev(`SCMS.updateOrder('${orderId}','Confirmed')`);await ev(`SCMS.updateOrder('${orderId}','Processing')`);await ev(`SCMS.updateOrder('${orderId}','Ready for Shipment')`);
  await ev(`SCMS.createShipment({orderId:'${orderId}',carrier:'Test Carrier',departure:SCMS.day(),eta:SCMS.day(3)})`);
  const shipmentId=await ev(`SCMS.data.shipments[0].id`);
  await ev(`SCMS.updateShipment('${shipmentId}','Picked Up',SCMS.day(3))`);assert.equal(await ev(`SCMS.quantity(SCMS.data,'p2')`),360);
  await ev(`SCMS.updateShipment('${shipmentId}','In Transit',SCMS.day(3))`);assert.equal(await ev(`SCMS.quantity(SCMS.data,'p2')`),360);assert.equal(await ev(`SCMS.reserved(SCMS.data,'p2')`),10);
  await ev(`SCMS.updateShipment('${shipmentId}','Delayed',SCMS.day(4))`);
  await login('customer');await nav('tracking');assert(await ev(`document.body.textContent.includes('${shipmentId}')`));assert(await ev(`SCMS.notifications().some(n=>n.type==='Shipment Delayed')`));
  await login('admin');await ev(`SCMS.updateShipment('${shipmentId}','At Destination',SCMS.day(4))`);assert.equal(await ev(`SCMS.quantity(SCMS.data,'p2')`),360);await ev(`SCMS.updateShipment('${shipmentId}','Delivered',SCMS.day(4))`);assert.equal(await ev(`SCMS.data.orders.find(o=>o.id==='${orderId}').status`),'Delivered');
  const qty=await ev(`SCMS.quantity(SCMS.data,'p4')`);
  await ev(`SCMS.updatePO('PO-2048','Approved')`);await ev(`SCMS.updatePO('PO-2048','Ordered')`);await ev(`SCMS.updatePO('PO-2048','Received')`);assert.equal(await ev(`SCMS.quantity(SCMS.data,'p4')`),qty+60);
  assert(await ev(`SCMS.updatePO('PO-2048','Received').then(()=>false,e=>true)`));assert.equal(await ev(`SCMS.quantity(SCMS.data,'p4')`),qty+60);
  const total=await ev(`SCMS.data.stock.reduce((n,x)=>n+x.qty,0)`);
  await ev(`SCMS.transfer({productId:'p4',from:'wh-1',to:'wh-2',qty:10})`);assert.equal(await ev(`SCMS.data.stock.reduce((n,x)=>n+x.qty,0)`),total);
  assert(await ev(`SCMS.transfer({productId:'p1',from:'wh-1',to:'wh-3',qty:1000}).then(()=>false,e=>true)`));
  await nav('inventory');await click('[data-action="stock"][data-id="p4"]');await fill('#editor-form',{qty:'0',reason:'Verification depletion'});await submit('#editor-form');
  assert.equal(await ev(`SCMS.quantity(SCMS.data,'p4','wh-1')`),0);
  await ev(`SCMS.transaction(s=>{SCMS.setStock(s,'p4','wh-2',0)})`);assert(await ev(`SCMS.notifications().some(n=>n.id==='stock-p4'&&n.type==='Out of Stock')`));
  await nav('admin-offers');await click('[data-action="edit-offer"]');await fill('#editor-form',{en:'Industrial test offer',ar:'عرض صناعي اختباري',descriptionEn:'Selected sensor inventory',descriptionAr:'مخزون المستشعرات المحدد',discount:'5',minQty:'1',code:'SENSOR5'});await ev(`document.querySelector('[name="productIds"][value="p4"]').checked=true`);await submit('#editor-form');assert(!(await ev(`document.querySelector('dialog').open`)));
  await login('customer');await nav('offers');assert(await ev(`document.body.textContent.includes('SENSOR5')`));
  await nav('profile');await fill('#profile-form',{address:'Updated customer delivery address'});await submit('#profile-form');assert.equal(await ev(`SCMS.user().address`),'Updated customer delivery address');
  await nav('customer-notifications');await click('[data-action="read-all"]');await until(`SCMS.notifications().every(n=>n.read)`);
  await login('admin');await nav('reports');await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});await click('[data-action="export"]');
  await pause(300);assert(fs.readdirSync(out).some(name=>name.startsWith('scms-inventory-levels')&&name.endsWith('.csv')));
  // Exercise the editors rather than relying exclusively on model calls.
  await nav('suppliers');await click('[data-action="edit-supplier"]');await fill('#editor-form',{name:'Verification Supplier',contact:'Test Contact',email:'supply@example.com',region:'Central',onTime:'95',quality:'97'});await submit('#editor-form');assert(!(await ev(`document.querySelector('dialog').open`)));
  const supplierId=await ev(`SCMS.data.suppliers.at(-1).id`);
  await nav('warehouses');await click('[data-action="edit-warehouse"]');await fill('#editor-form',{name:'Verification Warehouse',location:'Central Hub',capacity:'10',staff:'2'});await submit('#editor-form');assert(!(await ev(`document.querySelector('dialog').open`)));
  const warehouseId=await ev(`SCMS.data.warehouses.at(-1).id`);
  await nav('inventory');await click('[data-action="edit-product"]');await fill('#editor-form',{en:'Verification component',ar:'مكون للتحقق',sku:'TEST-COMPONENT',supplierId,cost:'8',price:'12.50',min:'10',descriptionEn:'Industrial supply chain component',descriptionAr:'مكون لسلسلة التوريد الصناعية',warehouseId,qty:'9'});await submit('#editor-form');assert(!(await ev(`document.querySelector('dialog').open`)),await ev(`document.querySelector('.form-error')?.textContent`));
  const productId=await ev(`SCMS.data.products.at(-1).id`);
  assert(await ev(`SCMS.notifications().some(n=>n.id==='capacity-${warehouseId}')`));
  await nav('notifications');await click('[data-action="read-all"]');await until(`SCMS.notifications().every(n=>n.read)`);
  await ev(`SCMS.transaction(s=>SCMS.setStock(s,'${productId}','${warehouseId}',0))`);
  assert(await ev(`SCMS.notifications().some(n=>n.id==='stock-${productId}'&&n.type==='Out of Stock'&&!n.read)`));
  await nav('purchase-orders');await click('[data-action="new-po"]');await fill('#editor-form',{supplierId,warehouseId,qty:'5',status:'Pending Approval'});await ev(`document.querySelector('#editor-form [name="supplierId"]').dispatchEvent(new Event('change',{bubbles:true}))`);await submit('#editor-form');assert(!(await ev(`document.querySelector('dialog').open`)));
  const poId=await ev(`SCMS.data.purchaseOrders[0].id`);
  await ev(`SCMS.updatePO('${poId}','Approved')`);await ev(`SCMS.updatePO('${poId}','Ordered')`);
  await nav('shipments');await click('[data-action="new-shipment"]');await fill('#editor-form',{reference:'po:'+poId,carrier:'Inbound Carrier'});await submit('#editor-form');assert(!(await ev(`document.querySelector('dialog').open`)));
  const inbound=await ev(`SCMS.data.shipments[0].id`);
  await ev(`SCMS.updateShipment('${inbound}','In Transit',SCMS.day(3))`);await ev(`SCMS.updateShipment('${inbound}','Delivered',SCMS.day(3))`);assert.equal(await ev(`SCMS.quantity(SCMS.data,'${productId}')`),5);assert.equal(await ev(`SCMS.data.purchaseOrders.find(p=>p.id==='${poId}').status`),'Received');
  await nav('users');await click('[data-action="edit-user"]');await fill('#editor-form',{name:'Verification Manager',email:'manager@example.com',phone:'123456',role:'Manager',accountType:'Internal',password:'Manager@12345'});await submit('#editor-form');assert(!(await ev(`document.querySelector('dialog').open`)));
  await nav('settings');await fill('#settings-form',{company:'SCMS Verified',capacityWarning:'90',stockWarningPercent:'110'});await submit('#settings-form');assert.equal(await ev(`SCMS.data.settings.capacityWarning`),90);assert(await ev(`document.querySelector('.topbar').textContent.includes('SCMS Verified')`));
  await login('customer');const oldAvailable=await ev(`SCMS.available(SCMS.data,'p1')`);const cancelOrder=await ev(`SCMS.createOrder({items:[{productId:'p1',warehouseId:'wh-1',qty:1}],address:SCMS.user().address,code:'FREIGHTFREE'})`);assert.equal(await ev(`SCMS.data.orders[0].shipping`),0);await ev(`SCMS.updateOrder('${cancelOrder}','Cancelled')`);assert.equal(await ev(`SCMS.available(SCMS.data,'p1')`),oldAvailable);
  assert(await ev(`(()=>{try{SCMS.quote(SCMS.data,[{productId:'p3',qty:10,price:42}],'PACK8');return false;}catch{return true;}})()`));
  await ev(`SCMS.logout()`);await nav('signup');await fill('#signup-form',{name:'Test Business',email:'testbusiness@example.com',phone:'+1 555 0109',password:'LocalTest@12345',confirm:'LocalTest@12345'});await submit('#signup-form');await until(`location.pathname.endsWith('profile.html')&&!!document.querySelector('#profile-form')`);assert.equal(await ev(`SCMS.user().role`),'Customer');
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(out,process.env.FLOWS_ONLY?'flow-results.json':'results.json'),JSON.stringify({layouts,errors,flows:'Login validation, customer order with applied offer, reservation and oversell protection, role route guard, shipment lifecycle, shared customer tracking, PO receiving exactly once, inbound shipment receiving, transfer conservation/capacity rejection, stock alerts and recurring unread state, supplier/product/warehouse/user/offer editors, settings, profile saving, notification read state, CSV export, cancellation, free shipping, scheduled-offer rejection, signup'},null,2));
  console.log('Connected supply-chain flows passed. No browser exceptions.');
  await send('Browser.close');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
