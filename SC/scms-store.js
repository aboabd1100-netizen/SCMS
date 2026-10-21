/* PostgreSQL API client. Only theme/language/font preferences use browser storage. */
window.SCMS=(()=>{
  let data,account=null,csrf='',pendingInit,polling=false;
  const tracked=new Map();
  const now=()=>new Date().toISOString(),day=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10);},pair=(en,ar)=>({en,ar}),uid=p=>p+'-'+crypto.randomUUID().slice(0,16).toUpperCase();
  const fail=(en,ar)=>{const e=new Error(en);e.ar=ar;throw e;};
  async function request(path,method='GET',body){
    const r=await fetch('/api/'+path,{method,credentials:'same-origin',headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':csrf}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    let result;try{result=await r.json();}catch{fail('The server is unavailable. Please try again.','الخادم غير متاح. يرجى المحاولة مجددًا.');}
    if(!r.ok||!result.success){const e=new Error(result.message||'Request failed.');e.ar=result.message_ar;e.status=r.status;throw e;}return result.data;
  }
  async function refresh(notify=true){const fresh=await request('state'),changed=!data||data.revision!==fresh.revision;if(!account)fresh.shipments=[...tracked.values()];data=fresh;const self=account&&data.users.find(u=>u.id===account.id);if(self)account=self;else if(account){account=null;window.dispatchEvent(new CustomEvent('scms:session'));}if(notify&&changed)window.dispatchEvent(new CustomEvent('scms:data'));return data;}
  async function init(){if(!pendingInit)pendingInit=(async()=>{const s=await request('auth/session');account=s.user;csrf=s.csrf;await refresh(false);if(!polling){polling=true;setInterval(()=>{if(!document.hidden)refresh().catch(()=>{});},5000);window.addEventListener('focus',()=>refresh().catch(()=>{}));}return data;})();return pendingInit;}
  const user=(s=data)=>account?s?.users.find(u=>u.id===account.id)||account:null;
  const operations=(u=user())=>!!u&&u.role!=='Customer';
  function canPage(page){const role=user()?.role;if(role==='Admin')return true;const access={dashboard:['Manager','Warehouse Staff','Delivery Staff','Supplier'],inventory:['Manager','Warehouse Staff'],suppliers:['Manager','Supplier'],'purchase-orders':['Manager'],shipments:['Manager','Warehouse Staff','Delivery Staff'],warehouses:['Manager','Warehouse Staff'],'customer-orders':['Manager','Warehouse Staff'],'admin-offers':['Manager'],notifications:['Manager','Warehouse Staff','Delivery Staff','Supplier'],reports:['Manager']};return (access[page]||[]).includes(role);}
  const requireOps=()=>{if(!operations())fail('Operations access required.','يلزم الدخول إلى العمليات.');};
  const requireAdmin=()=>{if(user()?.role!=='Admin')fail('Administrator access required.','يلزم حساب مدير النظام.');};
  const reserved=(s,pid,wid)=>s.stock.filter(x=>x.productId===pid&&(!wid||x.warehouseId===wid)).reduce((sum,x)=>sum+(x.reservedQty||0),0);
  const quantity=(s,pid,wid)=>s.stock.filter(x=>x.productId===pid&&(!wid||x.warehouseId===wid)).reduce((sum,x)=>sum+x.qty,0);
  const available=(s,pid,wid)=>quantity(s,pid,wid)-reserved(s,pid,wid);
  const usage=(s,wid)=>s.stock.filter(x=>x.warehouseId===wid).reduce((sum,x)=>sum+x.qty,0);
  const stockStatus=(s,p)=>{const q=quantity(s,p.id);return q<=0?'Out of Stock':q<=p.min?'Low Stock':'In Stock';};
  const offerStatus=o=>!o.enabled?'Inactive':o.start>day()?'Scheduled':o.end<day()?'Expired':'Active';
  const notifications=(s=data)=>s.notifications||[];
  async function mutate(path,method,values){const result=await request(path,method,values);await refresh();return result;}
  async function login(email,password,remember){const s=await request('auth/login','POST',{email,password,remember});account=s.user;csrf=s.csrf;await refresh(false);return account;}
  async function logout(){await request('auth/logout','POST',{});account=null;csrf='';}
  const signup=values=>request('auth/register','POST',values);
  const changePassword=(current,password)=>request('auth/password','POST',{current,password});
  const recover=email=>request('auth/recovery','POST',{email});
  const resetPassword=(token,password)=>request('auth/reset','POST',{token,password});
  const publicSummary=()=>request('public/summary');
  async function saveEditor(form){const values=Object.fromEntries(new FormData(form));values.id=form.dataset.id;values.productIds=new FormData(form).getAll('productIds');return mutate('editor/'+form.dataset.kind,'POST',values);}
  const markRead=ids=>mutate('notifications/read','POST',{ids});
  const updateProfile=values=>mutate('profile','PUT',values);
  const updateSettings=values=>mutate('settings','PUT',values);
  const createOrder=async values=>(await mutate('orders','POST',values)).id;
  const updateOrder=(id,status)=>mutate('orders/'+encodeURIComponent(id),'PUT',{status});
  const deleteUser=id=>mutate('users/'+encodeURIComponent(id),'DELETE',{});
  const deleteOffer=id=>mutate('offers/'+encodeURIComponent(id),'DELETE',{});
  const updatePO=(id,status)=>mutate('purchase-orders/'+encodeURIComponent(id),'PUT',{status});
  const createShipment=values=>mutate('shipments','POST',values);
  const updateShipment=(id,status,eta)=>mutate('shipments/'+encodeURIComponent(id),'PUT',{status,eta});
  const transfer=values=>mutate('inventory/transfer','POST',values);
  async function trackShipment(number){const shipment=await request('shipments/track/'+encodeURIComponent(number.trim()));tracked.set(shipment.id,shipment);if(!account)data.shipments=[...tracked.values()];return shipment;}
  // Preview only. The backend independently calculates prices, eligibility and totals on submit.
  function quote(s,items,code=''){let subtotal=items.reduce((n,i)=>n+i.price*i.qty,0),discount=0,shipping=25,offerId=null;
    if(code){const o=s.offers.find(o=>o.code.toUpperCase()===code.trim().toUpperCase());if(!o||offerStatus(o)!=='Active')fail('This promotion is not active.','هذا العرض غير نشط.');const eligible=items.filter(i=>o.productIds.includes(i.productId));if(eligible.reduce((n,i)=>n+i.qty,0)<o.minQty)fail('Minimum eligible quantity not reached.','لم يتم بلوغ الحد الأدنى للكمية.');if(o.type==='Free Shipping')shipping=0;else discount=eligible.reduce((n,i)=>n+i.price*i.qty,0)*o.discount/100;offerId=o.id;}
    const round=n=>Math.round(n*100)/100;return {subtotal:round(subtotal),discount:round(discount),shipping,total:round(subtotal-discount+shipping),offerId};
  }
  return {init,get data(){return data;},day,now,pair,uid,user,operations,canPage,requireOps,requireAdmin,quantity,reserved,available,stockStatus,usage,offerStatus,notifications,login,logout,signup,changePassword,recover,resetPassword,publicSummary,quote,createOrder,updateOrder,deleteUser,deleteOffer,updatePO,createShipment,updateShipment,transfer,fail,saveEditor,markRead,updateProfile,updateSettings,trackShipment,backend:true};
})();
