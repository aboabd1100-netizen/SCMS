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



  const expected={dark:{'--bg':'#1C1C1C','--bg-2':'#232323','--panel':'#2A2A2A','--panel-strong':'#333333','--text':'#F5F1E8','--muted':'#B8B2A7','--soft':'#8F8A82','--line':'#4A4741','--divider':'#3A3834'},light:{'--bg':'#F3F0E8','--bg-2':'#EAE5D9','--panel':'#FFFFFF','--panel-strong':'#FFFFFF','--text':'#222222','--muted':'#6F6A61','--soft':'#918A80','--line':'#D8D2C4','--divider':'#E2DDD2'}};
  for(const palette of Object.values(expected))Object.assign(palette,{'--primary':'#2F855A','--secondary':'#7A8B5A','--accent-soft':'#D6C6A5','--success':'#3FAE67','--warning':'#D89B2B','--error':'#C94A4A','--neutral':'#7C7C7C'});
  const results=[];
  async function check(page){
    await nav(page);await until('!!document.querySelector(".theme-toggle")');
    for(const lang of ['en','ar']){
      await click(page==='index'?'[data-language="'+lang+'"]':'[data-action="language"][data-id="'+lang+'"]');
      for(const theme of ['dark','light']){
        if(await ev('document.documentElement.dataset.theme!=='+JSON.stringify(theme)))await click('.theme-toggle');
        const palette=await ev('(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries('+JSON.stringify(Object.keys(expected.dark))+'.map(k=>[k,s.getPropertyValue(k).trim().toUpperCase()]));})()');assert.deepEqual(palette,expected[theme],page+' '+lang+' '+theme);
        assert.equal(await ev('getComputedStyle(document.body).backgroundColor'),theme==='dark'?'rgb(28, 28, 28)':'rgb(243, 240, 232)');
        const style=await ev('(()=>{const get=s=>{const e=document.querySelector(s);if(!e)return null;const c=getComputedStyle(e);return {bg:c.backgroundColor,color:c.color}};return {sidebar:get(".sidebar"),header:get(".topbar,.guest-header"),footer:get(".scms-footer"),primary:get(".primary-btn,.guest-button:not(.secondary)"),fields:[...document.querySelectorAll("input:not([type=checkbox]),select,textarea")].map(e=>getComputedStyle(e).backgroundColor),legacy:[...document.querySelectorAll("button,a,th,td,p,.panel,.status,svg path")].filter(e=>{const c=getComputedStyle(e);return [c.color,c.backgroundColor,c.stroke,c.fill].some(x=>["rgb(34, 211, 238)","rgb(8, 145, 178)","rgb(59, 130, 246)","rgb(37, 99, 235)","rgb(243, 199, 90)"].includes(x))}).length}})()');
        assert.equal(style.legacy,0,page+' stale accent');
        if(style.sidebar)assert.equal(style.sidebar.bg,theme==='dark'?'rgb(28, 28, 28)':'rgb(255, 255, 255)');
        if(style.header)assert.equal(style.header.bg,theme==='dark'?'rgb(35, 35, 35)':'rgb(255, 255, 255)');
        if(style.footer)assert.equal(style.footer.bg,theme==='dark'?'rgb(28, 28, 28)':'rgb(234, 229, 217)');
        if(style.primary){assert.equal(style.primary.bg,'rgb(47, 133, 90)');assert.equal(style.primary.color,'rgb(255, 255, 255)');}
        for(const bg of style.fields)assert.equal(bg,theme==='dark'?'rgb(35, 35, 35)':'rgb(255, 255, 255)',page+' input');
        assert.equal(await ev('document.documentElement.dir'),lang==='ar'?'rtl':'ltr');results.push({page,lang,theme});
      }
    }
  }
  for(const page of ['index','login','signup','forgot-password'])await check(page);
  await login('admin');for(const page of ['admin','dashboard','inventory','suppliers','purchase-orders','customer-orders','shipments','warehouses','admin-offers','notifications','reports','users','settings','customer','catalog','orders','tracking','offers','customer-notifications','profile'])await check(page);
  for(const theme of ['dark','light']){
    await nav('dashboard');if(await ev('document.documentElement.dataset.theme!=='+JSON.stringify(theme)))await click('.theme-toggle');await click('[data-action="logout"]');assert.equal(await ev('getComputedStyle(document.querySelector(".confirm-submit")).backgroundColor'),'rgb(47, 133, 90)');assert.equal(await ev('getComputedStyle(document.querySelector(".confirm-submit")).color'),'rgb(255, 255, 255)');await click('.confirm-cancel');await until('!document.querySelector("#scms-confirm-dialog")');
    await nav('users');await click('[data-action="delete-user"]');assert.equal(await ev('getComputedStyle(document.querySelector(".confirm-submit")).backgroundColor'),'rgb(201, 74, 74)');await click('.confirm-cancel');await until('!document.querySelector("#scms-confirm-dialog")');
    await nav('index');await pause(400);fs.writeFileSync(path.join(out,'industrial-home-'+theme+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await nav('dashboard');await pause(400);fs.writeFileSync(path.join(out,'industrial-dashboard-'+theme+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false});assert(await ev('document.documentElement.scrollWidth-innerWidth<=2'));await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  }
  await nav('index');await fill('#guest-tracking-form',{tracking:'SHP-1087'});await submit('#guest-tracking-form');await until('!!document.querySelector("#guest-tracking-result [data-ready=true]")');assert(await ev('[...document.querySelectorAll("#guest-tracking-result .leaflet-overlay-pane path")].some(e=>getComputedStyle(e).stroke==="rgb(47, 133, 90)")'),'Tracking route emerald');
  assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(out,'industrial-theme-results.json'),JSON.stringify(results,null,2));console.log('PASS 24 pages / 96 language-theme checks, exact palettes, neutral header/sidebar/footer, readable primary buttons, neutral inputs, confirmation colors, emerald tracking routes, mobile overflow and no JS errors.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
