/* Shared font-size buttons; existing saved preferences remain intact. */
(() => {
  const root=document.documentElement,key='scms-display',sizes=['small','default','large'];
  const defaults={size:'default',english:'Inter',arabic:'Tajawal',contrast:false};
  const english={Inter:"'Inter','Segoe UI',sans-serif",Arial:'Arial,sans-serif',Poppins:"'Poppins','Segoe UI',sans-serif"};
  const arabic={Tajawal:"'Tajawal',sans-serif",Cairo:"'Cairo',sans-serif",'Noto Kufi Arabic':"'Noto Kufi Arabic',sans-serif"};
  let prefs={...defaults};
  function read(){try{prefs={...defaults,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{prefs={...defaults};}}
  function apply(){
    if(!sizes.includes(prefs.size))prefs.size='default';
    root.dataset.fontSize=prefs.size;root.dataset.contrast=prefs.contrast?'high':'normal';
    root.style.setProperty('--font-primary',english[prefs.english]||english.Inter);
    root.style.setProperty('--font-arabic',arabic[prefs.arabic]||arabic.Tajawal);
    const ar=root.lang==='ar',index=sizes.indexOf(prefs.size);
    document.querySelectorAll('.font-size-control').forEach(group=>{
      group.setAttribute('aria-label',ar?'حجم الخط':'Font size');
      group.querySelectorAll('[data-font-step]').forEach(button=>{
        const decrease=button.dataset.fontStep==='-1';
        const label=ar?(decrease?'تصغير حجم الخط':'تكبير حجم الخط'):(decrease?'Decrease font size':'Increase font size');
        button.setAttribute('aria-label',label);button.title=label;
        button.disabled=decrease?index===0:index===sizes.length-1;
      });
    });
  }
  read();apply();
  function mount(){
    const header=document.querySelector('.guest-actions,.header-tools,.auth-top');
    if(header&&!header.querySelector('.font-size-control')){
      const group=document.createElement('div');group.className='font-size-control';group.setAttribute('role','group');group.dir='ltr';
      group.innerHTML='<button type="button" data-font-step="-1">A−</button><button type="button" data-font-step="1">A+</button>';
      header.append(group);
    }
    apply();
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('.font-size-control [data-font-step]');if(!button||button.disabled)return;
    read();const index=Math.max(0,sizes.indexOf(prefs.size));prefs.size=sizes[Math.max(0,Math.min(sizes.length-1,index+Number(button.dataset.fontStep)))];
    try{localStorage.setItem(key,JSON.stringify(prefs));}catch{}apply();
  });
  addEventListener('storage',event=>{if(event.key===key){read();apply();}});
  document.addEventListener('DOMContentLoaded',()=>{
    mount();new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
    new MutationObserver(apply).observe(root,{attributes:true,attributeFilter:['lang']});
  });
})();
