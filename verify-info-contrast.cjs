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



  const results=[];
  const lum=rgb=>{const v=rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});return .2126*v[0]+.7152*v[1]+.0722*v[2]};
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const rgb=value=>value.match(/\d+/g).slice(0,3).map(Number);
  async function check(page){
    await nav(page);await until('!!document.querySelector(".theme-toggle")');
    for(const lang of ['en','ar']){
      await click(page==='index'?'[data-language="'+lang+'"]':'[data-action="language"][data-id="'+lang+'"]');
      for(const theme of ['light','dark']){
        if(await ev('document.documentElement.dataset.theme!=='+JSON.stringify(theme)))await click('.theme-toggle');
        const info=await ev('(()=>{const s=getComputedStyle(document.documentElement);return {muted:s.getPropertyValue("--muted").trim(),soft:s.getPropertyValue("--soft").trim(),backgrounds:["--bg","--bg-2","--panel","--panel-strong","--hover"].map(k=>s.getPropertyValue(k).trim()),text:s.getPropertyValue("--text").trim(),samples:[...document.querySelectorAll(".scms .subtle,.scms .notice,.page-header p,.home-section-note,.chain-description,.guest-feature p")].map(e=>({color:getComputedStyle(e).color,weight:getComputedStyle(e).fontWeight,opacity:getComputedStyle(e).opacity,notice:e.classList.contains("notice")}))}})()');
        assert.equal(info.muted,theme==='light'?'#475569':'#C0CCDA');assert.equal(info.soft,info.muted);
        const hex=v=>[1,3,5].map(i=>parseInt(v.slice(i,i+2),16));
        for(const background of info.backgrounds)assert(ratio(hex(info.muted),hex(background))>=4.5,page+' secondary contrast');
        for(const sample of info.samples){const expected=hex(sample.notice?info.text:info.muted);assert.deepEqual(rgb(sample.color),expected,page+' '+JSON.stringify(sample));assert.equal(sample.opacity,'1');}
        results.push({page,lang,theme,samples:info.samples.length,minContrast:Math.min(...info.backgrounds.map(b=>ratio(hex(info.muted),hex(b))))});
      }
    }
  }
  for(const page of ['index','login','signup','forgot-password'])await check(page);
  await login('admin');for(const page of ['admin','dashboard','inventory','suppliers','purchase-orders','customer-orders','shipments','warehouses','admin-offers','notifications','reports','users','settings','customer','catalog','orders','tracking','offers','customer-notifications','profile'])await check(page);
  fs.writeFileSync(path.join(out,'info-contrast-results.json'),JSON.stringify(results,null,2));assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS '+results.length+' page/language/theme checks: stronger shared helper text, clear info banners, opaque text, contrast >=4.5:1 on all theme surfaces, no JavaScript errors.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
