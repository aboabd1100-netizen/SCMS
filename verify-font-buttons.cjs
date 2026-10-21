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


  const palettes={dark:{'--bg':'#07111F','--bg-2':'#0B1628','--panel':'#122033','--panel-strong':'#182A3F','--accent':'#22D3EE','--secondary':'#3B82F6','--text':'#F1F5F9','--muted':'#94A3B8','--line':'#24344D','--green':'#22C55E','--amber':'#F59E0B','--red':'#EF4444'},light:{'--bg':'#F3F7FB','--panel':'#FFFFFF','--accent':'#0891B2','--secondary':'#2563EB','--text':'#0F172A','--muted':'#64748B','--line':'#D9E2EC','--green':'#16A34A','--amber':'#D97706','--red':'#DC2626'}};
  palettes.dark['--gold']='#22D3EE';palettes.light['--gold']='#0891B2';
  const results=[];
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  async function check(page){
    await nav(page);await until("!!document.querySelector('.font-size-control')");
    assert.equal(await ev("document.querySelectorAll('.font-size-control button').length"),2);
    assert.equal(await ev("document.querySelectorAll('.display-toggle,#display-dialog,#display-settings,[data-display]').length"),0);
    await click('[data-font-step="-1"]');assert.equal(await ev("getComputedStyle(document.documentElement).fontSize"),'16px');
    assert(await ev("document.querySelector('.font-size-control button').disabled"));
    await click('[data-font-step="1"]');await click('[data-font-step="1"]');assert.equal(await ev("getComputedStyle(document.documentElement).fontSize"),'20px');
    assert.equal(await ev("JSON.parse(localStorage.getItem('scms-display')).size"),'large');
    await click('[data-font-step="-1"]');assert.equal(await ev("getComputedStyle(document.documentElement).fontSize"),'18px');
    for(const lang of ['en','ar']){
      await click(page==='index'?'[data-language="'+lang+'"]':'[data-action="language"][data-id="'+lang+'"]');
      for(const theme of ['dark','light']){
        if(await ev('document.documentElement.dataset.theme!=='+JSON.stringify(theme)))await click('.theme-toggle');
        const vars=await ev("(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries("+JSON.stringify(Object.keys(palettes[theme]))+".map(k=>[k,s.getPropertyValue(k).trim().toUpperCase()]));})()");assert.deepEqual(vars,palettes[theme],page+' '+lang+' '+theme);
        const bg=await ev("getComputedStyle(document.body).backgroundColor");assert.equal(bg,theme==='dark'?'rgb(7, 17, 31)':'rgb(243, 247, 251)');
        assert.equal(await ev("document.documentElement.dir"),lang==='ar'?'rtl':'ltr');
        const golden=await ev("Array.from(document.querySelectorAll('button,a,td,th,.panel,.nav-item,.tracking-status,.offer-value')).filter(e=>{const s=getComputedStyle(e);return ['rgb(243, 199, 90)','rgb(201, 171, 114)','rgb(223, 184, 108)'].includes(s.color)||['rgb(243, 199, 90)','rgb(207, 180, 125)'].includes(s.backgroundColor)}).length");assert.equal(golden,0,page+' old accent');
        results.push({page,lang,theme});
      }
    }
  }
  for(const page of ['index','login','signup','forgot-password'])await check(page);
  await login('admin');
  for(const page of ['admin','dashboard','inventory','suppliers','purchase-orders','customer-orders','shipments','warehouses','admin-offers','notifications','reports','users','settings','customer','catalog','orders','tracking','offers','customer-notifications','profile'])await check(page);
  await nav('index');await fill('#guest-tracking-form',{tracking:'SHP-1087'});await submit('#guest-tracking-form');await until("!!document.querySelector('#guest-tracking-result [data-ready=true]')");
  assert(await ev("Array.from(document.querySelectorAll('#guest-tracking-result .leaflet-overlay-pane path')).some(p=>getComputedStyle(p).stroke==='rgb(8, 145, 178)')"),'route uses light cyan');
  for(const theme of ['dark','light']){
    if(await ev('document.documentElement.dataset.theme!=='+JSON.stringify(theme)))await click('.theme-toggle');
    await ev("window.scrollTo(0,0)");await pause(700);
    fs.writeFileSync(path.join(out,`navy-cyan-home-${theme}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:false});
    assert(await ev('document.documentElement.scrollWidth-innerWidth<=2'));
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  }
  await click('[data-font-step="1"]');await nav('settings');await until("!!document.querySelector('.font-size-control')");assert.equal(await ev("getComputedStyle(document.documentElement).fontSize"),'20px');await click('[data-font-step="-1"]');
  await nav('dashboard');fs.writeFileSync(path.join(out,'navy-cyan-dashboard.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(out,'navy-cyan-results.json'),JSON.stringify(results,null,2));console.log('PASS: font decrease/increase and bounds on all 24 routes; saved sizes; no display menu, font-family controls, or settings panel; EN/AR and both themes unchanged.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

