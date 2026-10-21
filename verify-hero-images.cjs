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



  await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await nav('index');
  await until("!!document.querySelector('[data-hero-step]') && document.querySelector('.guest-hero').dataset.heroImage");
  const stageFiles=['receiving.jpg','hero-purchase-orders.jpg','riyadh-warehouse.jpg','stock-handling.jpg','hero-fulfillment.jpg','saudi-logistics.jpg'];
  const hover=i=>ev("document.querySelector('[data-hero-step=\""+i+"\"]').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}))");
  const leave=()=>ev("document.querySelector('#chain-flow').dispatchEvent(new PointerEvent('pointerleave',{pointerType:'mouse'}))");
  const imageIs=async i=>{await until("document.querySelector('.guest-hero').dataset.heroImage==="+JSON.stringify(stageFiles[i]));assert.equal(await ev("document.querySelectorAll('.hero-image-visible').length"),1);assert(await ev("document.querySelector('.hero-image-visible').complete&&document.querySelector('.hero-image-visible').naturalWidth>0"));};
  const urls=[];
  for(const width of [1440,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
    for(const lang of ['en','ar']){
      await click('[data-language="'+lang+'"]');await until("document.documentElement.lang==='"+lang+"'");
      for(const theme of ['dark','light']){
        if(await ev("document.documentElement.dataset.theme!=="+JSON.stringify(theme)))await click('.theme-toggle');
        for(let i=0;i<6;i++){
          await hover(i);await imageIs(i);
          assert.equal(await ev("document.querySelector('.hero-step-active button').dataset.heroStep"),String(i));
          urls.push(await ev("document.querySelector('.hero-image-visible').getAttribute('src')"));
          await click('[data-hero-step="'+i+'"]');
          assert.equal(await ev("document.querySelector('[data-hero-step=\""+i+"\"]').getAttribute('aria-pressed')"),'true');
          await leave();await imageIs(i);
        }
        await hover(0);await imageIs(0);await leave();await imageIs(5);
        await hover(1);await hover(3);await hover(2);await imageIs(2);
        await leave();await imageIs(5);
        await ev("document.querySelector('[data-hero-step=\"1\"]').focus()");await imageIs(1);
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
        assert.equal(await ev("document.querySelector('.guest-hero').dataset.heroCommitted"),'1');
        await ev("document.querySelector('.hero-actions a').focus()");await imageIs(1);
        assert(await ev("document.documentElement.scrollWidth<=innerWidth+1"));
        assert.equal(await ev("getComputedStyle(document.querySelector('.hero-logistics-image')).transitionDuration"),'0.45s');
        await ev("window.scrollTo(0,0)");await pause(550);
        const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'hero-stages-'+width+'-'+lang+'-'+theme+'.png'),Buffer.from(shot.data,'base64'));
      }
    }
  }
  assert.equal(new Set(urls).size,6);
  await ev("document.querySelector('[data-hero-step=\"4\"]').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'touch'}))");
  await imageIs(1);
  await click('[data-hero-step="4"]');await imageIs(4);await leave();await imageIs(4);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await hover(3);await imageIs(3);
  assert.equal(await ev("getComputedStyle(document.querySelector('.hero-logistics-image')).transitionDuration"),'0s');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('Hero stage images passed: six distinct assets, hover previews, committed clicks, mouse leave restoration, rapid switching, keyboard Enter, touch selection, both themes/languages, desktop/mobile and reduced motion.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

