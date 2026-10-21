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



  await login('admin');await nav('admin-offers');
  async function editor(){await click('[data-action="edit-offer"][data-id=""]');await fill('#editor-form',{en:'Verification offer',ar:'Verification',descriptionEn:'Test',descriptionAr:'Test',code:'VERIFYTEST'});await ev('document.querySelector("#editor-form [name=productIds]").checked=true');}
  for(const lang of ['en','ar'])for(const theme of ['dark','light']){
    await click('[data-action="language"][data-id="'+lang+'"]');await ev('document.documentElement.dataset.theme='+JSON.stringify(theme));
    await editor();await ev('SCMS.saveEditor=()=>new Promise(r=>{window.saved=r});document.querySelector("#editor-form").requestSubmit()');
    assert.equal(await ev('document.querySelectorAll(".offer-save-alert:not(.is-hiding)").length'),0,'No premature success');
    await ev('saved({id:"verified"})');await until('!!document.querySelector(".page-header + .offer-save-alert")');
    assert.equal(await ev('document.querySelector("#scms-dialog").open'),false);
    const message=await ev('document.querySelector(".offer-save-alert span").textContent');assert(lang==='en'?message==='Offer added successfully.':message.startsWith('\u062a\u0645\u062a'));
    assert.equal(await ev('document.querySelector(".offer-save-alert").getAttribute("role")'),'status');
    await click('[data-action="close-offer-alert"]');await until('!document.querySelector(".offer-save-alert")');
    await editor();await ev('SCMS.saveEditor=async()=>{throw Error("Rejected")};document.querySelector("#editor-form").requestSubmit()');await until('!!document.querySelector("#editor-form .offer-save-alert.is-error")');
    assert(await ev('document.querySelector("#scms-dialog").open'));assert.equal(await ev('document.querySelectorAll(".offer-save-alert:not(.is-error)").length'),0);
    await click('#editor-form [data-action="close-offer-alert"]');await until('!document.querySelector(".offer-save-alert")');await click('[data-action="close"]');
  }
  await editor();await ev('SCMS.saveEditor=async()=>({id:"verified"});document.querySelector("#editor-form").requestSubmit()');await until('!!document.querySelector(".offer-save-alert")');await pause(3500);assert(await ev('!!document.querySelector(".offer-save-alert")'));await until('!document.querySelector(".offer-save-alert")');
  assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS: pending saves show no success; successful/failed saves, exact English and Arabic localization, both themes, manual dismissal, retained failed form and automatic dismissal. No real offers created.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
