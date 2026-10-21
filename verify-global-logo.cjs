const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const out=path.resolve('scms-verification');fs.mkdirSync(out,{recursive:true});
for(const name of fs.readdirSync(out))if(name.startsWith('scms-')&&name.endsWith('.csv'))fs.unlinkSync(path.join(out,name));
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


  const expected='scms-logo.png?v=fd2888e83a01-global-2';
  const results=[];
  const checkPage=async(page)=>{
    await nav(page);
    await until("!!window.SCMSLogo && document.querySelectorAll('.scms-footer img').length===1 && document.querySelectorAll('img[src*=\"scms-logo\"]').length>=2");
    for(const lang of ['en','ar']){
      const selector=page==='index'?'[data-language="'+lang+'"]':'[data-action="language"][data-id="'+lang+'"]';
      await click(selector);
      await until("document.documentElement.lang==='"+lang+"'");
      for(const theme of ['light','dark']){
        await until("!!document.querySelector('.theme-toggle')");
        if(await ev("document.documentElement.dataset.theme!=="+JSON.stringify(theme)))await click('.theme-toggle');
        await until("Array.from(document.querySelectorAll('img[src*=\"scms-logo\"]')).every(i=>i.complete&&i.naturalWidth===1448&&i.naturalHeight===1086)");
        const images=await ev("Array.from(document.querySelectorAll('.guest-brand img,.scms-footer-brand img,.official-brand img,img.header-brand')).map(i=>({src:i.getAttribute('src'),filter:getComputedStyle(i).filter,position:getComputedStyle(i).position,bg:getComputedStyle(i).backgroundColor}))");
        assert(images.length>=2,page+' logo locations');
        for(const image of images){
          assert.equal(image.src,expected,page+' stale logo');
          assert.equal(image.position,'static',page+' old crop');
          assert.equal(image.bg,'rgba(0, 0, 0, 0)',page+' logo backing');
          assert(theme==='dark'?image.filter.includes('scms-logo-dark'):image.filter==='none',page+' theme rendering');
        }
        const hash=await ev("(async()=>{const data=await(await fetch(SCMSLogo.src,{cache:'reload'})).arrayBuffer();const hash=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,'0')).join('');})()");
        assert.equal(hash,'fd2888e83a01a4614cfd040690dd810a3a68a3d2dff065ae3666d17af105242f',page+' incorrect image bytes');
        assert.equal(await ev("document.documentElement.dir"),lang==='ar'?'rtl':'ltr');
        results.push({page,lang,theme,logos:images.length,hash});
      }
    }
    console.log(page+': official image verified in EN/AR and Light/Dark');
  };
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for(const page of ['index','login','signup','forgot-password'])await checkPage(page);
  await login('admin');
  for(const page of ['admin','dashboard','inventory','suppliers','purchase-orders','customer-orders','shipments','warehouses','admin-offers','notifications','reports','users','settings','customer','catalog','orders','tracking','offers','customer-notifications','profile'])await checkPage(page);
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(out,'global-logo-results.json'),JSON.stringify(results,null,2));
  console.log('All 24 routes verified individually: 96 page/language/theme checks; every logo matches the newest project image bytes.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

