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
  await nav('index');await until("!!document.querySelector('.display-toggle')");
  assert(await ev("(()=>{const h=document.querySelector('.guest-hero');return h.nextElementSibling.id==='guest-tracking'&&h.nextElementSibling.nextElementSibling.id==='offers'&&document.querySelector('#offers').nextElementSibling.id==='supply-chain'})()"));
  const change=(name,value)=>ev(`(()=>{const e=document.querySelector('#display-dialog [data-display="${name}"]');if(e.type==='checkbox')e.checked=${JSON.stringify(value)};else e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click('.display-toggle');await change('size','large');assert.equal(await ev("getComputedStyle(document.documentElement).fontSize"),'20px');
  await change('english','Arial');assert(await ev("getComputedStyle(document.body).fontFamily.includes('Arial')"));
  await change('arabic','Cairo');await change('contrast',true);assert.equal(await ev("document.documentElement.dataset.contrast"),'high');
  await change('theme','light');assert.equal(await ev("document.documentElement.dataset.theme"),'light');
  await change('language','ar');await until("document.documentElement.lang==='ar'");assert.equal(await ev("document.documentElement.dir"),'rtl');assert(await ev("getComputedStyle(document.body).fontFamily.includes('Cairo')"));
  await nav('login');await until("!!document.querySelector('.display-toggle')");assert.equal(await ev("document.documentElement.dataset.fontSize"),'large');assert.equal(await ev("document.documentElement.dataset.contrast"),'high');
  await login('admin');await nav('settings');await until("!!document.querySelector('#display-settings')");assert(await ev("document.querySelector('#display-settings h2').textContent.includes('العرض')"));
  await ev("(()=>{const s=document.querySelector('#display-settings [data-display=size]');s.value='default';s.dispatchEvent(new Event('change',{bubbles:true}));})()");assert.equal(await ev("getComputedStyle(document.documentElement).fontSize"),'18px');
  for(const page of ['index','login','signup','dashboard','inventory','admin-offers','settings','profile']){
    await nav(page);await until("!!document.querySelector('.display-toggle')");
    for(const lang of ['en','ar']){
      await click(page==='index'?'[data-language="'+lang+'"]':'[data-action="language"][data-id="'+lang+'"]');
      for(const width of [1440,390]){
        await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
        for(const size of ['small','default','large']){
          await click('.display-toggle');await change('size',size);await change('contrast',false);await click('[data-display-close]');
          const overflow=await ev('document.documentElement.scrollWidth-innerWidth');assert(overflow<=2,`${page} ${lang} ${width} ${size}: overflow ${overflow}`);
          assert.equal(await ev("document.querySelectorAll('.scms-footer').length"),1);
        }
      }
    }
  }
  await nav('index');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await click('.display-toggle');await change('size','default');await change('theme','light');await click('[data-display-close]');await ev("document.querySelector('.scms-footer').scrollIntoView()");
  assert(await ev("document.querySelector('.scms-footer').getBoundingClientRect().height<240"));
  fs.writeFileSync(path.join(out,'footer-compact.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await nav('settings');await until("!!document.querySelector('#display-settings')");
  fs.writeFileSync(path.join(out,'display-settings.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS: home order, compact footer, persisted font size/families/theme/contrast/language, settings and quick access, eight routes at three sizes in EN/AR desktop/mobile, no JavaScript errors.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

