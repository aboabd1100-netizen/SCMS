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


  await nav('index');
  await until("!!document.querySelector('#guest-tracking-form button:not(:disabled)')");
  assert.equal(await ev("SCMS.user()"),null);
  assert(await ev("document.querySelector('.guest-hero').nextElementSibling.id==='guest-tracking'"));
  await fill('#guest-tracking-form',{tracking:'NOT-FOUND'});await submit('#guest-tracking-form');
  assert.equal(await ev("document.querySelector('.tracking-error').textContent"),'Tracking number not found. Please check the number and try again.');
  await fill('#guest-tracking-form',{tracking:'shp-1087'});await submit('#guest-tracking-form');
  await until("!!document.querySelector('#guest-tracking-result [data-ready=true]')");
  assert.equal(await ev("document.querySelectorAll('#guest-tracking-result .tracking-facts>div').length"),7);
  assert.equal(await ev("document.querySelectorAll('#guest-tracking-result .tracking-progress li').length"),5);
  assert(await ev("document.querySelector('#guest-tracking-result').textContent.includes('SHP-1087')"));
  for(const lang of ['en','ar']){
    await click('[data-language="'+lang+'"]');
    await until("!!document.querySelector('#guest-tracking-result [data-ready=true]')");
    for(const theme of ['dark','light']){
      if(await ev('document.documentElement.dataset.theme!=='+JSON.stringify(theme)))await click('.theme-toggle');
      for(const width of [1440,390]){
        await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
        await pause(150);
        const result=await ev("(()=>{const s=document.querySelector('#guest-tracking'),r=document.querySelector('.tracking-summary');return {overflow:document.documentElement.scrollWidth-innerWidth,font:getComputedStyle(s.querySelector('input')).fontSize,dir:document.documentElement.dir,date:r.querySelectorAll('dd')[5].textContent}})()");
        assert(result.overflow<=2,JSON.stringify({lang,theme,width,...result}));assert.equal(result.font,'16px');assert.equal(result.dir,lang==='ar'?'rtl':'ltr');assert(lang==='ar'?/[٠-٩]/.test(result.date):/[0-9]/.test(result.date));
        await ev("document.querySelector('#guest-tracking-result').scrollIntoView()");
        const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`guest-tracking-${lang}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
      }
    }
  }
  await login('customer');await nav('tracking');
  assert(await ev("document.querySelector('#page-content .tracking-summary')!==null"));
  assert.equal(await ev("document.querySelectorAll('#page-content .tracking-facts>div').length"),8);
  assert(await ev("(()=>{const p=document.querySelector('#page-content');return p.querySelector('.tracking-summary').compareDocumentPosition(p.querySelector('.map-frame'))&Node.DOCUMENT_POSITION_FOLLOWING})()"));
  assert(await ev("document.querySelector('#page-content .tracking-facts').textContent.includes('SHP-1087')"));
  await login('admin');
  for(const page of ['dashboard','inventory','suppliers','purchase-orders','customer-orders','shipments','warehouses','admin-offers','notifications','reports','users','settings','profile']){
    await nav(page);assert.equal(await ev("getComputedStyle(document.querySelector('.nav-item')).fontSize"),'16px');
    assert(await ev("document.querySelector('link[href*=refinements]')!==null"));
    for(const lang of ['en','ar']){
      await click('[data-action="language"][data-id="'+lang+'"]');
      for(const width of [1440,390]){
        await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
        const overflow=await ev('document.documentElement.scrollWidth-innerWidth');assert(overflow<=2,page+' '+lang+' '+width+' overflow '+overflow);
      }
    }
  }
  await nav('shipments');await click('[data-action="shipment-view"][data-id="SHP-1087"]');
  assert.equal(await ev("document.querySelectorAll('#scms-dialog .tracking-facts>div').length"),8);
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS: login-free valid/invalid tracking, existing shipment source, 7 public and 8 internal facts, five-stage progress, local Saudi map, language/theme/mobile checks, top placement, shared typography across admin modules, and shipment dialog.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

