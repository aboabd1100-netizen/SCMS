const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const out=path.resolve('scms-verification');fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const server=http.createServer((req,res)=>{const f=path.join('SC',decodeURIComponent(req.url.split('?')[0]).replace(/^\//,'')||'index.html');if(!fs.existsSync(f)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',f.endsWith('.jpg')?'image/jpeg':f.endsWith('.png')?'image/png':f.endsWith('.json')?'application/json':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.css')?'text/css; charset=utf-8':f.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(f));});
(async()=>{

 const profile=path.join(out,`browser-${Date.now()}`);
 const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9254',`--user-data-dir=${profile}`],{windowsHide:true,stdio:'ignore'});
 let ws;
 try{
  let tabs;for(let i=0;i<40;i++){try{tabs=await(await fetch('http://127.0.0.1:9254/json',{signal:AbortSignal.timeout(1000)})).json();break;}catch{await pause(250);}}
  assert(tabs,'Browser did not start');ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map(),errors=[];
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.enable');await send('Runtime.enable');
  const until=async(expression)=>{for(let i=0;i<100;i++){try{if(await ev(expression))return;}catch{}await pause(100);}throw Error('Timeout: '+expression);};
  const nav=async page=>{await send('Page.navigate',{url:`http://127.0.0.1:5002/${page}.html`});await until(`!!document.querySelector('#login-form,.main,#signup-form,#forgot-form,.guest-hero')`);};
  const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill=(selector,values)=>ev(`Object.entries(${JSON.stringify(values)}).forEach(([k,v])=>{const e=document.querySelector(${JSON.stringify(selector)}).elements[k];e.value=v;})`);
  const submit=async selector=>{await ev(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);await until(`!document.querySelector('form button:disabled')`);};
  const login=async(kind)=>{await nav('login');await fill('#login-form',{email:kind==='admin'?'admin@scms.io':'customer@scms.io',password:kind==='admin'?'Admin@12345':'Customer@12345'});await submit('#login-form');await until(`!!document.querySelector('.main')`);};


  await login('admin');await nav('warehouses');await click('[data-action="edit-warehouse"][data-id=""]');
  await fill('#editor-form',{name:'UI Riyadh Hub',location:'Riyadh, Saudi Arabia',capacity:'1000',staff:'2',status:'Operational'});await submit('#editor-form');await until("SCMS.data.warehouses.some(w=>w.name==='UI Riyadh Hub')");
  const warehouse=await ev("SCMS.data.warehouses.find(w=>w.name==='UI Riyadh Hub').id");assert(await ev("document.body.textContent.includes('UI Riyadh Hub')"));
  await nav('suppliers');await click('[data-action="edit-supplier"][data-id=""]');await fill('#editor-form',{name:'UI Saudi Supplier',contact:'Procurement',email:'ui-supplier@example.com',region:'Riyadh',category:'Packaging',status:'Active',onTime:'95',quality:'98'});await submit('#editor-form');await until("SCMS.data.suppliers.some(s=>s.name==='UI Saudi Supplier')");
  const supplier=await ev("SCMS.data.suppliers.find(s=>s.name==='UI Saudi Supplier').id");
  await nav('inventory');await click('[data-action="edit-product"][data-id=""]');await fill('#editor-form',{en:'UI Logistics Product',ar:'منتج لوجستي للاختبار',descriptionEn:'Browser workflow product',descriptionAr:'منتج اختبار سير العمل',sku:'UI-LOG-100',category:'Packaging',supplierId:supplier,min:'2',cost:'10',price:'15',active:'true',warehouseId:warehouse,qty:'5'});await submit('#editor-form');await until("SCMS.data.products.some(p=>p.sku==='UI-LOG-100')");
  const product=await ev("SCMS.data.products.find(p=>p.sku==='UI-LOG-100').id");assert(await ev("document.body.textContent.includes('UI-LOG-100')"));
  await nav('purchase-orders');await click('[data-action="new-po"]');await fill('#editor-form',{supplierId:supplier,warehouseId:warehouse,expected:'2099-12-31',status:'Pending Approval',qty:'2'});await ev("document.querySelector('#editor-form [name=supplierId]').dispatchEvent(new Event('change',{bubbles:true}))");await fill('#editor-form',{productId:product});await submit('#editor-form');await until('SCMS.data.purchaseOrders.some(p=>p.supplierId==='+JSON.stringify(supplier)+')');
  const po=await ev('SCMS.data.purchaseOrders.find(p=>p.supplierId==='+JSON.stringify(supplier)+').id');
  for(const status of ['Approved','Ordered','Received']){await click('[data-action="po-status"][data-id="'+po+'"]');await fill('#editor-form',{status});await submit('#editor-form');await until('SCMS.data.purchaseOrders.find(p=>p.id==='+JSON.stringify(po)+').status==='+JSON.stringify(status));}
  assert.equal(await ev('SCMS.quantity(SCMS.data,'+JSON.stringify(product)+','+JSON.stringify(warehouse)+')'),7);
  await login('customer');await nav('catalog');await click('[data-action="new-order"][data-id="'+product+'"]');await fill('#order-form',{address:'Riyadh, Saudi Arabia',lineProduct:product,lineWarehouse:warehouse,lineQty:'1',code:''});await submit('#order-form');await until('SCMS.data.orders.some(o=>o.items.some(i=>i.productId==='+JSON.stringify(product)+'))');
  const order=await ev('SCMS.data.orders.find(o=>o.items.some(i=>i.productId==='+JSON.stringify(product)+')).id');await nav('orders');assert(await ev('document.body.textContent.includes('+JSON.stringify(order)+')'));
  await login('admin');await nav('customer-orders');assert(await ev('document.body.textContent.includes('+JSON.stringify(order)+')'));
  for(const status of ['Confirmed','Processing','Ready for Shipment']){await click('[data-action="order-status"][data-id="'+order+'"]');await fill('#editor-form',{status});await submit('#editor-form');await until('SCMS.data.orders.find(o=>o.id==='+JSON.stringify(order)+').status==='+JSON.stringify(status));}
  await nav('shipments');await click('[data-action="new-shipment"]');await fill('#editor-form',{reference:'order:'+order,carrier:'UI Saudi Freight',departure:'2026-01-01',eta:'2099-12-31'});await submit('#editor-form');await until('SCMS.data.shipments.some(s=>s.orderId==='+JSON.stringify(order)+')');
  const shipment=await ev('SCMS.data.shipments.find(s=>s.orderId==='+JSON.stringify(order)+').id');
  for(const status of ['In Transit','Delivered']){await click('[data-action="shipment-status"][data-id="'+shipment+'"]');await fill('#editor-form',{status,eta:'2099-12-31'});await submit('#editor-form');await until('SCMS.data.shipments.find(s=>s.id==='+JSON.stringify(shipment)+').status==='+JSON.stringify(status));}
  assert.equal(await ev('SCMS.quantity(SCMS.data,'+JSON.stringify(product)+','+JSON.stringify(warehouse)+')'),6);
  await login('customer');await nav('tracking');assert(await ev('document.body.textContent.includes('+JSON.stringify(shipment)+')'));
  assert.equal(await ev("Object.keys(localStorage).filter(k=>/state|session|orders|inventory/.test(k)).length"),0);
  assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS: existing UI forms connect warehouses, suppliers, products, stock, purchase receipt, customer orders, admin processing, shipment dispatch/delivery and customer tracking; no browser business storage.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

