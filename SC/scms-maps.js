/* Geographic maps: local boundaries/road geometry, OSM detail tiles, no GPS claims. */
window.SCMSMaps=(()=>{
  const cities=[['Riyadh','الرياض',24.7136,46.6753],['Jeddah','جدة',21.4858,39.1925],['Dammam','الدمام',26.4207,50.0888],['Medina','المدينة المنورة',24.5247,39.5692],['Yanbu','ينبع',24.0895,38.0618],['Jubail','الجبيل',27.0046,49.6583],['Khobar','الخبر',26.2172,50.2083],['Tabuk','تبوك',28.3838,36.5662]];
  const active=new Map(),cache=new Map();
  const ar=()=>document.documentElement.lang==='ar',t=(en,a)=>ar()?a:en;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const city=text=>cities.find(c=>String(text).toLowerCase().includes(c[0].toLowerCase())||String(text).includes(c[1]));
  const json=url=>{if(!cache.has(url))cache.set(url,fetch(url).then(r=>{if(!r.ok)throw Error('Map data unavailable');return r.json();}).catch(e=>{cache.delete(url);throw e;}));return cache.get(url);};
  function cleanup(){for(const [el,map] of active)if(!el.isConnected){map.remove();active.delete(el);}}
  function marker(map,c,html,kind='warehouse',label=true){
    const mark=L.marker([c[2],c[3]],{icon:L.divIcon({className:'logistics-marker '+kind,html:'<span></span>',iconSize:[22,22],iconAnchor:[11,11]}),title:ar()?c[1]:c[0]}).addTo(map).bindPopup(html);
    if(label)mark.bindTooltip(esc(ar()?c[1]:c[0]),{permanent:true,direction:kind==='destination'||c[0]==='Khobar'?'left':'right',offset:[12,0],className:'city-label'});
    return mark;
  }
  async function base(el){
    const map=L.map(el,{scrollWheelZoom:false,minZoom:4,maxZoom:15,attributionControl:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([24.5,43.5],5);active.set(el,map);
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>');
    map.createPane('geography');map.getPane('geography').style.zIndex=190;
    const boundaries=await json('saudi-geography.json');if(!el.isConnected)return map;
    L.geoJSON(boundaries,{pane:'geography',interactive:false,style:f=>({color:'var(--border)',weight:1,fillColor:f.properties.name==='Saudi Arabia'?'var(--surface)':'var(--bg-secondary)',fillOpacity:1})}).addTo(map);
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{className:'saudi-dark-tiles',maxZoom:19,updateWhenIdle:true}).addTo(map);
    const notice=el.parentElement.querySelector('.map-availability');
    tiles.on('tileerror',()=>{if(notice)notice.textContent=t('Street tiles unavailable · showing saved geographic map','تعذر تحميل تفاصيل الشوارع · تظهر الخريطة الجغرافية المحفوظة');});
    tiles.on('load',()=>{if(notice&&el.querySelector('.leaflet-tile-loaded'))notice.textContent='';});
    L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
    return map;
  }
  async function network(el){
    const map=await base(el);if(!el.isConnected)return;
    const s=SCMS.data,points=[];
    const geometry=await json('route-network.json');if(!el.isConnected)return;
    L.geoJSON(geometry.routes[0].geometry,{style:{color:'var(--accent)',weight:2,opacity:.48,dashArray:'5 7'},interactive:false}).addTo(map);
    for(const w of s.warehouses){
      const c=city(w.location)||city(w.name);if(!c)continue;
      points.push([c[2],c[3]]);const pct=Math.round(SCMS.usage(s,w.id)/w.capacity*100),kind=w.status==='Maintenance'?'maintenance':pct>=s.settings.capacityWarning?'high':'warehouse';
      const m=marker(map,c,`<strong>${esc(ar()?(SCText.ar[w.name]||w.name):w.name)}</strong><p>${esc(ar()?c[1]:c[0])}</p><p>${w.status==='Maintenance'?t('Maintenance','صيانة'):t('Operational','قيد التشغيل')}</p><b>${pct}% ${t('Capacity','السعة')}</b>`,kind);
      el.closest('.network-section').querySelector(`[data-map-warehouse="${CSS.escape(w.id)}"]`)?.addEventListener('click',()=>{map.setView([c[2],c[3]],9);m.openPopup();});
    }
    if(points.length)map.fitBounds(points,{padding:[45,55],maxZoom:7});
    el.dataset.ready='true';setTimeout(()=>{if(el.isConnected&&active.get(el)===map)map.invalidateSize();},50);
  }
  const progress=sh=>{const stages={Preparing:0,'Picked Up':.2,'In Transit':.55,'At Destination':.9,Delivered:1};const state=sh.status==='Delayed'?[...sh.history].reverse().find(h=>h.status in stages)?.status:sh.status;return stages[state]??0;};
  async function shipment(el){
    const sh=SCMS.data.shipments.find(s=>s.id===el.dataset.shipmentMap);if(!sh)return;
    const map=await base(el);if(!el.isConnected)return;
    const po=SCMS.data.purchaseOrders.find(p=>p.id===sh.poId),supplier=po&&SCMS.data.suppliers.find(s=>s.id===po.supplierId);
    const origin=city(sh.origin)||city(supplier?.region),destination=city(sh.destination);
    const note=el.parentElement.querySelector('.map-route-note');
    if(!origin||!destination||sh.origin.includes(' / ')){note.textContent=t('Exact route unavailable for this address or multi-origin shipment. Saudi network shown.','المسار الدقيق غير متاح لهذا العنوان أو للشحنة متعددة المصادر. تظهر شبكة المملكة.');el.dataset.ready='true';return;}
    marker(map,origin,`<b>${t('Origin','المصدر')}</b><p>${esc(sh.origin)}</p>`,'origin');
    marker(map,destination,`<b>${t('Destination','الوجهة')}</b><p>${esc(sh.destination)}</p>`,'destination');
    map.fitBounds([[origin[2],origin[3]],[destination[2],destination[3]]],{padding:[55,65],maxZoom:10});
    try{
      const saved=destination[0]==='Khobar'&&['Riyadh','Jeddah'].includes(origin[0]);
      const url=saved?`route-${origin[0].toLowerCase()}-khobar.json`:`https://router.project-osrm.org/route/v1/driving/${origin[3]},${origin[2]};${destination[3]},${destination[2]}?overview=full&geometries=geojson`;
      const result=await json(url);if(!el.isConnected)return;
      const coords=result.routes[0].geometry.coordinates.map(c=>[c[1],c[0]]),p=progress(sh);
      L.polyline(coords,{color:'var(--accent)',weight:5,opacity:.25}).addTo(map);
      const distances=[0];for(let i=1;i<coords.length;i++)distances.push(distances[i-1]+map.distance(coords[i-1],coords[i]));
      const target=distances.at(-1)*p;let i=distances.findIndex(d=>d>=target);if(i<0)i=coords.length-1;
      const ratio=i?(target-distances[i-1])/(distances[i]-distances[i-1]||1):0;
      const position=i?coords[i].map((v,k)=>coords[i-1][k]+(v-coords[i-1][k])*ratio):coords[0];
      const completed=[...coords.slice(0,i),position];L.polyline(completed,{color:'var(--accent)',weight:5,opacity:1}).addTo(map);
      const truck=L.divIcon({className:'route-truck',html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h11v11H3zM14 10h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',iconSize:[34,34],iconAnchor:[17,17]});
      L.marker(position,{icon:truck,title:t('Illustrative shipment position','موقع توضيحي للشحنة')}).addTo(map);
      note.textContent=t(`Road route: ${Math.round(result.routes[0].distance/1000)} km · City-level endpoints · Position illustrates recorded status, not live GPS.`,`المسار البري: ${Math.round(result.routes[0].distance/1000)} كم · المواقع على مستوى المدينة · موضع المركبة توضيحي حسب الحالة وليس GPS مباشرًا.`);
    }catch{note.textContent=t('Road route unavailable. Verified origin and destination cities are shown.','المسار البري غير متاح. تظهر مدينتا المصدر والوجهة المحددتان.');}
    el.dataset.ready='true';setTimeout(()=>{if(el.isConnected&&active.get(el)===map)map.invalidateSize();},50);
  }
  function mount(){cleanup();document.querySelectorAll('[data-network-map],[data-shipment-map]').forEach(el=>{if(active.has(el))return;(el.hasAttribute('data-network-map')?network(el):shipment(el)).catch(()=>{const note=el.parentElement.querySelector('.map-availability');if(note)note.textContent=t('Map could not load. Shipment and warehouse details remain available.','تعذر تحميل الخريطة. تظل بيانات الشحنة والمستودعات متاحة.');});});}
  return {mount,cleanup,cities};
})();
