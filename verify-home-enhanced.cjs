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
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  const until=async(expression)=>{for(let i=0;i<100;i++){try{if(await ev(expression))return;}catch{}await pause(100);}throw Error('Timeout: '+expression);};
  const nav=async page=>{await send('Page.navigate',{url:`http://127.0.0.1:8784/${page}.html`});await until(`!!document.querySelector('#login-form,.main,#signup-form,#forgot-form,.guest-hero')`);};
  const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill=(selector,values)=>ev(`Object.entries(${JSON.stringify(values)}).forEach(([k,v])=>{const e=document.querySelector(${JSON.stringify(selector)}).elements[k];e.value=v;})`);
  const submit=async selector=>{await ev(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);await until(`!document.querySelector('form button:disabled')`);};
  const login=async(kind)=>{await nav('login');await fill('#login-form',{email:kind==='admin'?'admin@scms.io':'customer@scms.io',password:kind==='admin'?'Admin@12345':'Customer@12345'});await submit('#login-form');await until(`!!document.querySelector('.main')`);};


  await nav('index');
  await until("!!document.querySelector('#home-hub-detail') && !!document.querySelector('.scms-footer')");
  assert.equal(await ev("document.querySelectorAll('.guest-feature').length"),6);
  assert.equal(await ev("new Set(Array.from(document.querySelectorAll('.feature-image')).map(i=>i.src)).size"),6);
  assert.equal(await ev("document.querySelectorAll('.home-process-flow li').length"),7);
  assert.equal(await ev("document.querySelectorAll('g[data-city]').length"),8);
  assert.equal(await ev("document.querySelectorAll('.home-offer-card').length"),3);
  await ev("document.querySelectorAll('img').forEach(i=>i.loading='eager')");
  await until("Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)");
  for(const width of [1440,768,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for(const lang of ['en','ar']){
      await click('[data-language="'+lang+'"]');
      await until("document.querySelector('#home-hub-detail') && document.documentElement.lang==='"+lang+"'");
      for(const theme of ['dark','light']){
        await until("document.querySelector('.theme-toggle')");
        if(await ev("document.documentElement.dataset.theme!=="+JSON.stringify(theme)))await click('.theme-toggle');
        await pause(350);
        assert(await ev('document.documentElement.scrollWidth<=innerWidth+1'),width+' '+lang+' '+theme+' overflow');
        for(let i=0;i<8;i++){
          await click('.home-city-list [data-city="'+i+'"]');
          assert.equal(await ev("document.querySelectorAll('.home-city-list [aria-pressed=true]').length"),1);
          assert(await ev("document.querySelector('#home-hub-detail').textContent.length>20"));
        }
        await ev("document.querySelector('g[data-city=\"0\"]').focus()");
        assert(await ev("document.querySelector('g[data-city=\"0\"]').classList.contains('selected')"));
        for(let i=0;i<7;i++){
          await click('[data-step="'+i+'"]');
          assert.equal(await ev("document.querySelectorAll('.home-process-flow [aria-pressed=true]').length"),1);
        }
        await click('[data-range="7"]');
        assert.equal(await ev("document.querySelectorAll('.home-chart-dot').length"),7);
        await click('[data-range="30"]');
        assert.equal(await ev("document.querySelectorAll('.home-chart-dot').length"),10);
        for(let i=0;i<3;i++){
          await click('[data-offer="'+i+'"]');
          assert(await ev("document.querySelector('.home-offer-dialog').open"));
          assert.equal(await ev("document.querySelector('.home-offer-dialog').getAttribute('aria-labelledby')"),'home-offer-title');
          await click('.home-dialog-close');
          assert(!(await ev("document.querySelector('.home-offer-dialog').open")));
        }
        await ev("document.querySelector('#home-stats').scrollIntoView()");
        await pause(1400);
        const totals=await ev("Array.from(document.querySelectorAll('[data-count]')).map(el=>SCMSNumbers.formatText(el.textContent,false))");
        assert.equal(totals[2],'3,065');assert(totals[4].includes('92.5'));
        const digits=await ev("Array.from(document.querySelectorAll('[data-count]')).map(el=>el.textContent).join(' ')");
        assert(!(lang==='ar'?/[0-9]/:/[?-?]/).test(digits));
        if((width===1440&&lang==='en'&&theme==='dark')||(width===390&&lang==='ar'&&theme==='light')){
          for(const section of ['home','saudi-network','supply-chain','shipment-preview','reports-preview','offers']){
            await ev("document.getElementById("+JSON.stringify(section)+").scrollIntoView()");
            await pause(800);
            const shot=await send('Page.captureScreenshot',{format:'png'});
            fs.writeFileSync(path.join(out,'enhanced-'+section+'-'+width+'-'+lang+'-'+theme+'.png'),Buffer.from(shot.data,'base64'));
          }
        }
      }
    }
  }
  await click('.home-motion-control');
  assert(await ev("document.documentElement.classList.contains('home-motion-paused')"));
  assert(await ev("document.querySelector('.home-route-map').animationsPaused()"));
  await click('.home-motion-control');
  assert(!(await ev("document.documentElement.classList.contains('home-motion-paused')")));
  assert(await ev("!!document.querySelector('animateMotion')"));
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await until("document.documentElement.classList.contains('home-motion-paused')");
  assert.equal(await ev("getComputedStyle(document.querySelector('.hero-logistics-image')).animationName"),'none');
  assert.equal(await ev("document.querySelectorAll('animateMotion').length"),0);
  await send('Emulation.setEmulatedMedia',{features:[]});
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('Enhanced home passed: 6 distinct feature visuals, 7 process steps, 8 hubs, 3 offers, chart ranges, stats, both languages/themes at 1440/768/390px, keyboard focus, pause/resume and reduced motion.');
 }finally{if(ws)ws.close();browser.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

