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



  await login('admin');
  const results=[];
  for(const width of [1440,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for(const page of ['inventory','suppliers','purchase-orders','customer-orders','shipments','warehouses','users','reports','dashboard','admin-offers']){
      await nav(page);await until('!!document.querySelector(".font-size-control")');
      for(const lang of ['en','ar']){
        await click('[data-action="language"][data-id="'+lang+'"]');
        for(const theme of ['dark','light']){
          await ev('document.documentElement.dataset.theme='+JSON.stringify(theme));
          await click('[data-font-step="-1"]');await click('[data-font-step="-1"]');await click('[data-font-step="1"]');
          assert.equal(await ev('document.documentElement.dataset.fontSize'),'default');
          for(const size of ['default','large']){
            if(size==='large')await click('[data-font-step="1"]');
            const info=await ev('(()=>{const rootSize=parseFloat(getComputedStyle(document.documentElement).fontSize);return {rootSize,overflow:document.documentElement.scrollWidth-innerWidth,tables:[...document.querySelectorAll(".table-wrap")].map(w=>({client:w.clientWidth,scroll:w.scrollWidth,keyboard:w.tabIndex,overflow:getComputedStyle(w).overflowX,fonts:[...w.querySelectorAll("td,th,button")].every(e=>parseFloat(getComputedStyle(e).fontSize)>=rootSize),badges:[...w.querySelectorAll(".status")].every(e=>getComputedStyle(e).whiteSpace==="nowrap"),actions:[...w.querySelectorAll("td[data-column=actions] button")].every(e=>getComputedStyle(e).whiteSpace==="nowrap"),suppliers:[...w.querySelectorAll("td[data-column=supplier]")].every(e=>e.getBoundingClientRect().width>=12*rootSize-1),actionRows:[...w.querySelectorAll("td .action-row")].every(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return r.width<=p.width+1&&[...e.children].every(c=>Math.abs(c.getBoundingClientRect().top-e.firstElementChild.getBoundingClientRect().top)<2)})}))}})()');
            assert.equal(info.rootSize,size==='default'?18:20);
            assert(info.overflow<=2,JSON.stringify({page,width,lang,size,...info}));
            for(const table of info.tables){assert(table.fonts&&table.badges&&table.actions&&table.suppliers&&table.actionRows,JSON.stringify({page,width,lang,size,table}));assert.equal(table.overflow,'auto');assert.equal(table.keyboard,0);}
            if(page==='inventory'){assert(info.tables[0].scroll>info.tables[0].client,'Inventory scrolls instead of crushing columns');}
            results.push({page,width,lang,theme,size,...info});
          }
          assert(await ev('document.querySelectorAll(".font-size-control button")[1].disabled'),'One A+ from default is the supported maximum');
        }
      }
    }
  }
  await nav('inventory');assert.equal(await ev('document.documentElement.dataset.fontSize'),'large','Font setting persists');
  fs.writeFileSync(path.join(out,'responsive-tables-results.json'),JSON.stringify(results,null,2));
  assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS '+results.length+' page/viewport/language/theme/font checks: default and A+ maximum, unchanged enlarged fonts, single-line badges/actions, supplier widths, keyboard scroll containers, no page overflow, persistence.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
