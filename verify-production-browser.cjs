/* Run against scripts/browser_test_server.py: browser writes stay in scms_test. */
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const base='http://127.0.0.1:5002';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'scms-release-browser-'));
 const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9269',`--user-data-dir=${profile}`],{windowsHide:true,stdio:'ignore'});
 let ws;
 try{
  let tabs;for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9269/json')).json();break;}catch{await pause(100);}}
  assert(tabs,'Chrome did not start');ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map(),errors=[];
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const until=async expression=>{for(let i=0;i<150;i++){try{if(await ev(expression))return;}catch{}await pause(100);}throw Error('Timeout: '+expression);};
  await send('Runtime.enable');await send('Page.enable');
  const nav=async page=>{await send('Page.navigate',{url:base+'/'+page+'.html'});await until(`document.readyState==='complete' && !!window.SCMS?.data && !!document.querySelector('#login-form,#signup-form,#forgot-form,.main,.guest-hero')`);};
  const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const login=async role=>{await nav('login');await ev(`(async()=>{await SCMS.login('${role}@scms.io','${role==='admin'?'Admin':'Customer'}@12345',false);})()`);};
  let checks=0;
  async function check(page){
   await nav(page);
   if(page==='index'){
    await until(`document.querySelectorAll('.home-city-list button').length>0`);
    assert(await ev(`(async()=>{const summary=await SCMS.publicSummary();const selected=document.querySelector('#home-hub-detail');return summary.network.some(w=>selected.textContent.includes(w.name));})()`),'Home map uses recorded warehouse names');
    assert(await ev(`Array.from(document.querySelectorAll('#scms-logo-dark feFlood')).map(n=>n.getAttribute('flood-color')).join(',')==='#D6C6A5,#2F855A'`),'Official logo palette');
   }
   for(const lang of ['en','ar']){
    await click(page==='index'?`[data-language="${lang}"]`:`[data-action="language"][data-id="${lang}"]`);
    assert.equal(await ev('document.documentElement.dir'),lang==='ar'?'rtl':'ltr');
    for(const theme of ['dark','light']){
     await ev(`SCMSTheme.set('${theme}')`);
     for(const width of [1440,390]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      await ev('new Promise(requestAnimationFrame)');
      assert(await ev('document.documentElement.scrollWidth<=innerWidth+2'),`${page} ${lang} ${theme} ${width} overflow`);
      assert(await ev(`Array.from(document.querySelectorAll('.guest-brand img,.official-brand img,img.header-brand')).every(img=>img.naturalWidth>0 && (getComputedStyle(img).filter${theme==='dark'?".includes('scms-logo-dark')":"==='none'"}))`));
      checks++;
      if(page==='index' && lang==='en' && width===1440){
       fs.writeFileSync(path.join('.runtime',`release-home-${theme}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      }
     }
    }
   }
   // Exercise the actual font buttons at both ends of the preference range.
   for(const step of ['1','1','-1','-1'])await click(`[data-font-step="${step}"]`);
   assert(await ev('document.documentElement.scrollWidth<=innerWidth+2'),page+' font controls overflow');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for(const page of ['index','login','signup','forgot-password'])await check(page);
  await login('admin');
  for(const page of ['admin','dashboard','inventory','suppliers','purchase-orders','customer-orders','shipments','warehouses','admin-offers','notifications','reports','users','settings'])await check(page);
  // Stored XSS must remain text when an authenticated profile is rendered.
  await ev(`(async()=>{const u=SCMS.user();await SCMS.updateProfile({...u,name:'<img src=x onerror="window.scmsXss=1">',address:'Riyadh',language:'en'});})()`);
  await nav('profile');assert.equal(await ev('window.scmsXss||0'),0);assert(!await ev('!!document.querySelector("img[onerror]")'));
  await login('customer');
  for(const page of ['customer','catalog','orders','tracking','offers','customer-notifications','profile'])await check(page);
  await nav('orders');
  assert(await ev(`(async()=>{const r=await fetch('/users.html');return r.status===403;})()`));
  for(const kind of ['user','order','offer','logout']){
   await ev(`window.scmsConfirmationExecuted=false;window.scmsConfirmationResult=SCMSConfirm.run('${kind}',()=>{window.scmsConfirmationExecuted=true;});true`);
   await until(`document.querySelector('#scms-confirm-dialog')?.open`);
   await click('#scms-confirm-dialog .confirm-cancel');
   await until(`!document.querySelector('#scms-confirm-dialog')`);
   assert.equal(await ev('window.scmsConfirmationExecuted'),false);
  }
  await nav('index');await until(`!document.querySelector('#guest-tracking-form button').disabled`);
  await ev(`document.querySelector('#guest-tracking-number').value='SHP-1087';document.querySelector('#guest-tracking-form').requestSubmit()`);
  await until(`!!document.querySelector('#guest-tracking-result [data-ready=true]')`);
  assert(await ev(`Object.keys(localStorage).every(k=>['scms-theme','scms-lang','scms-display'].includes(k))`));
  await nav('orders');
  await ev(`window.scmsLogoutResult=SCMSConfirm.run('logout',()=>SCMS.logout());true`);
  await click('#scms-confirm-dialog .confirm-submit');
  await until('!SCMS.user()');
  assert(await ev(`(async()=>{const r=await fetch('/api/orders');return r.status===401;})()`));
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log(`PASS: ${checks} page/language/theme/viewport checks, font controls, database-backed home map, official logo palette, stored XSS, role denial, confirmations, tracking, logout, preference-only storage.`);
 }finally{ws?.close();browser.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
