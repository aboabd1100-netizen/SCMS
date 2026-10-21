const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const out=path.resolve('scms-verification');fs.mkdirSync(out,{recursive:true});
for(const name of fs.readdirSync(out))if(name.startsWith('scms-')&&name.endsWith('.csv'))fs.unlinkSync(path.join(out,name));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const server=http.createServer((req,res)=>{const f=path.join('SC',path.basename(req.url.split('?')[0])||'index.html');if(!fs.existsSync(f)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',f.endsWith('.png')?'image/png':f.endsWith('.json')?'application/json':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.css')?'text/css; charset=utf-8':f.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(8779,'127.0.0.1',r));
 const profile=path.join(out,`browser-${Date.now()}`);
 const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9249',`--user-data-dir=${profile}`],{windowsHide:true,stdio:'ignore'});
 let ws;
 try{
  let tabs;for(let i=0;i<40;i++){try{tabs=await(await fetch('http://127.0.0.1:9249/json',{signal:AbortSignal.timeout(1000)})).json();break;}catch{await pause(250);}}
  assert(tabs,'Browser did not start');ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map(),errors=[];
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.enable');await send('Runtime.enable');
  const until=async(expression)=>{for(let i=0;i<100;i++){try{if(await ev(expression))return;}catch{}await pause(100);}throw Error('Timeout: '+expression);};
  const nav=async page=>{await send('Page.navigate',{url:`http://127.0.0.1:8779/${page}.html`});await until(`!!document.querySelector('#login-form,.main,#signup-form,#forgot-form,.guest-hero')`);};
  const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill=(selector,values)=>ev(`Object.entries(${JSON.stringify(values)}).forEach(([k,v])=>{const e=document.querySelector(${JSON.stringify(selector)}).elements[k];e.value=v;})`);
  const submit=async selector=>{await ev(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);await until(`!document.querySelector('form button:disabled')`);};
  const login=async(kind)=>{await nav('login');await fill('#login-form',{email:kind==='admin'?'admin@scms.io':'customer@scms.io',password:kind==='admin'?'Admin@12345':'Customer@12345'});await submit('#login-form');await until(`!!document.querySelector('.main')`);};
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

  await nav('index'); await until("document.querySelectorAll('.guest-feature').length===6");
  assert.equal(await ev('location.pathname'),'/index.html');
  assert.equal(await ev("document.querySelectorAll('.guest-feature').length"),6);
  assert.equal(await ev("document.querySelectorAll('.chain-flow li').length"),6);
  for(const width of [1440,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for(const lang of ['en','ar']){
      await click(`[data-language="${lang}"]`);
      assert.equal(await ev('document.documentElement.lang'),lang);
      assert(await ev('document.documentElement.scrollWidth<=innerWidth+1'));
      assert(await ev("Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)"));
      const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`home-${width}-${lang}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  await click('[data-language="en"]');
  for(const page of ['dashboard','inventory','suppliers','purchase-orders','customer-orders','shipments','warehouses','admin-offers','notifications','reports','users','settings','customer']){
    await nav(page); await until("location.pathname==='/login.html'&&!!document.querySelector('#login-form')");
  }
  await nav('login');assert(await ev("!!document.querySelector('.auth-home-link')"));
  await nav('signup');assert(await ev("!!document.querySelector('.brand img')"));

  await login('admin');
  for(const page of ['dashboard','inventory','suppliers','purchase-orders','customer-orders','shipments','warehouses','admin-offers','notifications','reports','users','settings','customer','catalog','orders','tracking','offers','customer-notifications','profile']){
    await nav(page); await until("!!document.querySelector('.header-brand')");
    assert(await ev("document.querySelector('.header-brand').complete&&document.querySelector('.header-brand').naturalWidth>0"));
    assert(await ev("!!document.querySelector('.sidebar .brand img[src*=\"scms-logo.png\"]')"));
  }
  console.log('Official logo verified across 19 signed-in pages.');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('Guest home, EN/AR, desktop/mobile, logos, auth links and 13 protected routes passed.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

