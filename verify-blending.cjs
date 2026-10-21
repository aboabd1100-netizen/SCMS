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
  const nav=async page=>{await send('Page.navigate',{url:`http://127.0.0.1:5000/${page}.html`});await until(`!!document.querySelector('#login-form,.main,#signup-form,#forgot-form,.guest-hero')`);};
  const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill=(selector,values)=>ev(`Object.entries(${JSON.stringify(values)}).forEach(([k,v])=>{const e=document.querySelector(${JSON.stringify(selector)}).elements[k];e.value=v;})`);
  const submit=async selector=>{await ev(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);await until(`!document.querySelector('form button:disabled')`);};
  const login=async(kind)=>{await nav('login');await fill('#login-form',{email:kind==='admin'?'admin@scms.io':'customer@scms.io',password:kind==='admin'?'Admin@12345':'Customer@12345'});await submit('#login-form');await until(`!!document.querySelector('.main')`);};



  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const results=[];
  const geometry='JSON.stringify([...document.querySelectorAll(".guest-header,.topbar,.guest-hero,.page-header,.panel,.guest-feature,.home-glass,.scms-footer")].map(e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return [r.x,r.y,r.width,r.height,s.padding,s.margin,s.fontSize,s.fontWeight]}))';
  async function check(page){
    await nav(page);await until('!!document.querySelector(".theme-toggle")');
    for(const lang of ['en','ar']){
      await click(page==='index'?'[data-language="'+lang+'"]':'[data-action="language"][data-id="'+lang+'"]');
      for(const theme of ['dark','light']){
        if(await ev('document.documentElement.dataset.theme!=='+JSON.stringify(theme)))await click('.theme-toggle');
        await ev('document.fonts.ready');await pause(120);
        await ev('window.flowSheet=[...document.styleSheets].find(s=>s.href?.includes("blending.css"));flowSheet.disabled=true');
        const before=await ev(geometry);await ev('flowSheet.disabled=false');const after=await ev(geometry);assert.equal(after,before,page+' geometry unchanged '+lang+' '+theme);
        assert(await ev('getComputedStyle(document.querySelector(".topbar,.guest-header,.auth-page")).backgroundImage.includes("gradient")||!!document.querySelector(".auth-page")'),page+' header gradient');
        assert(await ev('getComputedStyle(document.body).backgroundImage.includes("gradient")'),page+' body flow');
        if(page==='index'){assert.equal(await ev('getComputedStyle(document.querySelector(".guest-hero"),"::after").pointerEvents'),'none');assert.equal(await ev('getComputedStyle(document.querySelector(".guest-hero"),"::after").position'),'absolute');}
        assert(await ev('document.documentElement.scrollWidth-innerWidth<=2'),page+' page overflow');
        results.push({page,lang,theme});
      }
    }
  }
  for(const page of ['index','login','signup','forgot-password'])await check(page);
  await login('admin');for(const page of ['admin','dashboard','inventory','suppliers','purchase-orders','customer-orders','shipments','warehouses','admin-offers','notifications','reports','users','settings','customer','catalog','orders','tracking','offers','customer-notifications','profile'])await check(page);
  for(const page of ['index','dashboard'])for(const theme of ['dark','light']){
    await nav(page);if(await ev('document.documentElement.dataset.theme!=='+JSON.stringify(theme)))await click('.theme-toggle');
    await pause(300);fs.writeFileSync(path.join(out,'blending-'+page+'-'+theme+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false});assert(await ev('document.documentElement.scrollWidth-innerWidth<=2'),page+' mobile overflow');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  }
  assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(out,'blending-results.json'),JSON.stringify(results,null,2));console.log('PASS 96 page/language/theme checks: unchanged content geometry, spacing, font sizes and weights; gradient header/body flow, safe hero overlays, desktop/mobile overflow and no JavaScript errors.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
