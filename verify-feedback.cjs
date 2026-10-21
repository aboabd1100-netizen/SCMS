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


  await nav('login');
  for(const lang of ['en','ar']){
    await click('[data-action="language"][data-id="'+lang+'"]');
    for(const theme of ['dark','light']){
      if(await ev('document.documentElement.dataset.theme!=='+JSON.stringify(theme)))await click('.theme-toggle');
      await ev("document.querySelector('#login-form').requestSubmit()");
      assert.equal(await ev("document.querySelector('.scms-field-error').textContent"),lang==='ar'?'يرجى ملء هذا الحقل':'Please fill out this field');
      assert.equal(await ev("document.querySelector('.scms-field-error').getAttribute('role')"),'alert');
      assert.equal(await ev("document.querySelectorAll('.scms-field-error').length"),2);
      await ev("(()=>{const e=document.querySelector('#login-form input[type=email]');e.value='admin@scms.io';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
      assert.equal(await ev("document.querySelectorAll('.scms-field-error').length"),1);
      await ev("document.querySelector('#login-form input[type=email]').value=''");
    }
  }
  await login('admin');
  for(const theme of ['dark','light']){
    if(await ev('document.documentElement.dataset.theme!=='+JSON.stringify(theme)))await click('.theme-toggle');
    const chart=await ev("(()=>{const d=document.querySelector('.donut-visual'),n=d.querySelector('strong'),s=getComputedStyle(n),p=getComputedStyle(d,'::before'),a=d.getBoundingClientRect(),b=n.getBoundingClientRect();return {color:s.color,bg:p.backgroundColor,weight:s.fontWeight,z:s.zIndex,center:Math.abs(a.left+a.width/2-b.left-b.width/2)<1&&Math.abs(a.top+a.height/2-b.top-b.height/2)<1}})()");
    assert.equal(chart.color,theme==='dark'?'rgb(241, 245, 249)':'rgb(15, 23, 42)');assert.equal(chart.weight,'800');assert.equal(chart.z,'1');assert(chart.center);assert.notEqual(chart.color,chart.bg);
  }
  await nav('admin-offers');await click('[data-action="edit-offer"][data-id=""]');await until("!!document.querySelector('#editor-form[data-offer-styled=true]')");await ev("document.querySelector('#editor-form').requestSubmit()");
  assert.equal(await ev("document.querySelector('.offer-field-error').textContent"),'يرجى ملء هذا الحقل');
  assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS: bilingual inline required messages, no duplicate errors, clearing on valid input, preserved submission validation, offer form consistency, and centered high-contrast donut values in both themes.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

