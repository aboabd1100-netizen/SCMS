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
  let checks=0;
  for(const [page,action,method,kind] of [['users','delete-user','deleteUser','user'],['admin-offers','delete-offer','deleteOffer','offer'],['customer-orders','order-status','updateOrder','order'],['dashboard','logout','logout','logout']]){
    await nav(page);
    await ev('window.confirm=()=>{throw Error("Browser confirm prohibited")};window.calls=0;SCMS.'+method+'=async()=>{window.calls++}');
    for(const lang of ['en','ar'])for(const theme of ['dark','light']){
      await click('[data-action="language"][data-id="'+lang+'"]');
      await ev('document.documentElement.dataset.theme='+JSON.stringify(theme));
      const trigger='[data-action="'+action+'"]';
      async function open(){await click(trigger);if(kind==='order'){await fill('#editor-form',{status:'Cancelled'});await ev('document.querySelector("#editor-form").requestSubmit()');}await until('!!document.querySelector("#scms-confirm-dialog[open]")');}
      const before=await ev('calls');await open();
      assert.equal(await ev('calls'),before,'No action before confirmation');
      assert.equal(await ev('document.activeElement.className'),'confirm-cancel');
      assert.equal(await ev('document.querySelector("#scms-confirm-dialog").dir'),lang==='ar'?'rtl':'ltr');
      assert(await ev('(()=>{const r=document.querySelector("#scms-confirm-dialog").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0})()'));
      await click('.confirm-cancel');await until('!document.querySelector("#scms-confirm-dialog")');assert.equal(await ev('calls'),before);
      if(kind==='order')await click('[data-action="close"]');
      await open();await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until('!document.querySelector("#scms-confirm-dialog")');assert.equal(await ev('calls'),before);
      if(kind==='order')await click('[data-action="close"]');
      if(kind!=='logout'){await open();await click('.confirm-submit');await until('!document.querySelector("#scms-confirm-dialog")');assert.equal(await ev('calls'),before+1);if(kind==='order')assert.equal(await ev('document.querySelector("#scms-dialog").open'),false);}
      checks++;
    }
  }
  await nav('purchase-orders');await ev('window.calls=0;SCMS.updatePO=async()=>{calls++}');await click('[data-action="po-status"]');await fill('#editor-form',{status:'Cancelled'});await ev('document.querySelector("#editor-form").requestSubmit()');await until('!!document.querySelector("#scms-confirm-dialog[open]")');assert.equal(await ev('calls'),0);await click('.confirm-submit');await until('!document.querySelector("#scms-confirm-dialog")');assert.equal(await ev('calls'),1);
  await nav('dashboard');
  await ev('window.calls=0;SCMS.logout=async()=>{calls++;throw new Error("Test failure")};');await click('[data-action="logout"]');await click('.confirm-submit');await until('!document.querySelector(".confirm-error").hidden');assert.equal(await ev('calls'),1);await click('.confirm-cancel');await until('!document.querySelector("#scms-confirm-dialog")');
  await ev('window.calls=0;void SCMSConfirm.run("user",()=>new Promise(r=>{calls++;window.release=r}));');await click('.confirm-submit');await click('.confirm-submit');assert.equal(await ev('calls'),1);assert(await ev('document.querySelector(".confirm-cancel").disabled'));await ev('release()');await until('!document.querySelector("#scms-confirm-dialog")');
  await ev('window.calls=0;void SCMSConfirm.run("user",async()=>{calls++});');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await until('!document.querySelector("#scms-confirm-dialog")');assert.equal(await ev('calls'),0,'Enter defaults to safe cancel');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:800,deviceScaleFactor:1,mobile:false});await ev('void SCMSConfirm.run("logout",async()=>{});');assert(await ev('(()=>{const r=document.querySelector("#scms-confirm-dialog").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()'));await click('.confirm-cancel');await until('!document.querySelector("#scms-confirm-dialog")');
  await login('customer');await nav('orders');await ev('window.calls=0;SCMS.updateOrder=async()=>{calls++}');await click('[data-action="order-cancel"]');assert.equal(await ev('calls'),0);await click('.confirm-submit');await until('!document.querySelector("#scms-confirm-dialog")');assert.equal(await ev('calls'),1);
  await ev('SCMS.logout=async()=>{}');await click('[data-action="logout"]');await click('.confirm-submit');await until('!!document.querySelector("#login-form")');
  assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS '+checks+' bilingual/theme action checks, cancellation, Escape, explicit confirmation, admin/customer order paths, busy/error handling, mobile, logout redirect; no real records deleted.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
