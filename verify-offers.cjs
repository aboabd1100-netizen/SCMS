const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const out=path.resolve('scms-verification');fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const server=http.createServer((req,res)=>{const f=path.join('SC',decodeURIComponent(req.url.split('?')[0]).replace(/^\//,'')||'index.html');if(!fs.existsSync(f)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',f.endsWith('.jpg')?'image/jpeg':f.endsWith('.png')?'image/png':f.endsWith('.json')?'application/json':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.css')?'text/css; charset=utf-8':f.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(8784,'127.0.0.1',r));
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
  const nav=async page=>{await send('Page.navigate',{url:`http://127.0.0.1:8784/${page}.html`});await until(`!!document.querySelector('#login-form,.main,#signup-form,#forgot-form,.guest-hero')`);};
  const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill=(selector,values)=>ev(`Object.entries(${JSON.stringify(values)}).forEach(([k,v])=>{const e=document.querySelector(${JSON.stringify(selector)}).elements[k];e.value=v;})`);
  const submit=async selector=>{await ev(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);await until(`!document.querySelector('form button:disabled')`);};
  const login=async(kind)=>{await nav('login');await fill('#login-form',{email:kind==='admin'?'admin@scms.io':'customer@scms.io',password:kind==='admin'?'Admin@12345':'Customer@12345'});await submit('#login-form');await until(`!!document.querySelector('.main')`);};


  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await login('admin');
  assert.equal(await ev("document.querySelector('.admin-welcome').textContent"),'Welcome, Abdullah Alharbi');
  await click('[data-action="language"][data-id="ar"]');
  assert.equal(await ev("document.querySelector('.admin-welcome').textContent"),'مرحباً، عبدالله الحربي');
  await nav('admin-offers');
  for(const lang of ['en','ar']){
    await click('[data-action="language"][data-id="'+lang+'"]');
    for(const theme of ['dark','light']){
      if(await ev('document.documentElement.dataset.theme!=='+JSON.stringify(theme)))await click('.theme-toggle');
      for(const width of [1440,390]){
        await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
        await click('[data-action="edit-offer"][data-id=""]');
        await until("!!document.querySelector('#editor-form[data-offer-styled=true]')");
        assert.equal(await ev("document.querySelector('input[name=discount] + .offer-number-display').value"),lang==='ar'?'١٠':'10');
        assert.equal(await ev("document.querySelector('input[name=minQty] + .offer-number-display').value"),lang==='ar'?'١':'1');
        assert(await ev("document.querySelector('input[name=start] + .offer-date-button').textContent.includes(new Intl.DateTimeFormat(document.documentElement.lang==='ar'?'ar-SA-u-nu-arab':'en-SA-u-nu-latn',{dateStyle:'medium',calendar:'gregory'}).format(new Date(SCMS.day()+'T12:00:00')))"));
        await ev("(()=>{const e=document.querySelector('input[name=discount] + .offer-number-display');e.value=document.documentElement.lang==='ar'?'٩٢٫٥':'92.5';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
        assert.equal(await ev("document.querySelector('input[name=discount]').value"),'92.5');
        await ev("(()=>{const e=document.querySelector('input[name=minQty] + .offer-number-display');e.value=document.documentElement.lang==='ar'?'٥':'5';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
        assert.equal(await ev("document.querySelector('input[name=minQty]').value"),'5');
        await ev("document.querySelector('#editor-form').requestSubmit()");
        assert(await ev("document.querySelectorAll('.offer-field-error').length>=4"),'custom required errors');
        await click('input[name=start] + .offer-date-button');
        assert(await ev("!!document.querySelector('.offer-calendar [data-date]')"));
        const bounds=await ev("(()=>{const d=document.querySelector('#scms-dialog'),r=document.querySelector('.offer-calendar').getBoundingClientRect();return {overflow:d.scrollWidth-d.clientWidth,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()");
        assert(bounds.overflow<=2,JSON.stringify(bounds));assert(bounds.left>=0&&bounds.right<=bounds.width&&bounds.top>=0&&bounds.bottom<=bounds.height,JSON.stringify(bounds));
        const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`offer-form-${lang}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
        await ev("document.querySelector('.offer-calendar [data-date=\"'+SCMS.day()+'\"]').click()");
        assert.equal(await ev("document.querySelector('input[name=start]').value"),await ev('SCMS.day()'));
        await ev("document.querySelector('#scms-dialog').close()");
      }
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await click('[data-action="language"][data-id="en"]');
  const target=await send('Target.createTarget',{url:'http://127.0.0.1:8784/index.html'});
  const attached=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const hs=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params,sessionId:attached.sessionId}));});
  const he=async expression=>{const r=await hs('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const hu=async expression=>{for(let i=0;i<100;i++){try{if(await he(expression))return;}catch{}await pause(100);}throw Error('Home timeout '+expression);};
  await hs('Runtime.enable');await hu("!!window.SCMS?.data?.offers&&document.querySelectorAll('.home-offer-card').length>0");
  await click('[data-action="edit-offer"][data-id=""]');await until("!!document.querySelector('#editor-form[data-offer-styled=true]')");
  await fill('#editor-form',{en:'Integration Offer',ar:'عرض التحقق',descriptionEn:'Saudi logistics promotion',descriptionAr:'عرض الخدمات اللوجستية السعودية',discount:'15',minQty:'10',code:'TESTLIVE15'});
  await ev("document.querySelector('#editor-form input[name=productIds]').checked=true;document.querySelector('#editor-form').requestSubmit()");
  await until("SCMS.data.offers.some(o=>o.code==='TESTLIVE15')");
  await hu("Array.from(document.querySelectorAll('.home-offer-card')).some(c=>c.textContent.includes('TESTLIVE15'))");
  await click('[data-action="language"][data-id="ar"]');
  assert(await ev("Array.from(document.querySelectorAll('.offer-card')).find(c=>c.textContent.includes('TESTLIVE15')).querySelector('.offer-value').textContent.includes('١٥٪')"));
  await click('[data-action="language"][data-id="en"]');
  assert(await ev("Array.from(document.querySelectorAll('.offer-card')).find(c=>c.textContent.includes('TESTLIVE15')).querySelector('.offer-value').textContent.includes('15%')"));
  assert(await he("(()=>{const c=Array.from(document.querySelectorAll('.home-offer-card')).find(c=>c.textContent.includes('TESTLIVE15'));return c===document.querySelector('.home-offer-card')&&c.textContent.includes('Saudi logistics promotion')&&c.querySelectorAll('dl dd').length===4&&c.textContent.includes('15%')})()"),'newest active card complete');
  await ev("SCMS.transaction(s=>{const o=s.offers.find(o=>o.code==='TESTLIVE15');for(const [id,start,end,enabled] of [['TEST-SCHEDULED',SCMS.day(5),SCMS.day(30),true],['TEST-EXPIRED',SCMS.day(-30),SCMS.day(-1),true],['TEST-DISABLED',SCMS.day(),SCMS.day(30),false]])s.offers.push({...o,id,code:id,start,end,enabled})})");
  await hu("SCMS.data.offers.some(o=>o.id==='TEST-DISABLED')");
  assert.deepEqual(await he("Array.from(document.querySelectorAll('.home-offer-card')).map(c=>c.dataset.offerId)"),await he("SCMS.data.offers.slice().reverse().filter(o=>SCMS.offerStatus(o)==='Active').map(o=>o.id)"));
  await he("document.querySelector('[data-language=ar]').click()");await hu("document.documentElement.lang==='ar'");
  assert(await he("Array.from(document.querySelectorAll('.home-offer-card')).find(c=>c.textContent.includes('TESTLIVE15')).textContent.includes('١٥')"),'Arabic numerals and intact code');
  await he("document.querySelector('.home-offer-card [data-live-offer]').click()");
  assert(await he("document.querySelector('.home-offer-dialog').open"));
  await ev("SCMS.transaction(s=>{s.offers.find(o=>o.code==='TESTLIVE15').enabled=false})");
  await hu("!Array.from(document.querySelectorAll('.home-offer-card')).some(c=>c.textContent.includes('TESTLIVE15'))");
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS: bilingual welcome; 8 form/calendar theme-language-viewport combinations; unchanged native validation and date values; real admin offer creation; cross-tab live synchronization; newest active-only offers; all details; Arabic numerals and preserved promo codes; live deactivation.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

