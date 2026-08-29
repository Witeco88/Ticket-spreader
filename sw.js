const CACHE='repartidor-v36';
const APP=['./','./index.html','./manifest.json','./icon-180.png','./icon-512.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin===location.origin){
    e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{
      const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return r;
    }).catch(()=>caches.match('./index.html'))));
  }
});



/* V37 integration: Ticket Scanner is only responsible for receipt extraction. */
let v37ReceiptResult = null;
async function v37ScanTicketAndFeed(file){
  const status = document.querySelector("#scan-status, #ocr-status, .scan-status");
  const setStatus = t => { if(status) status.textContent=t; };
  setStatus("Analitzant tiquet…");
  try{
    const mod = await import("./src/ticket-scanner/index.js");
    v37ReceiptResult = await mod.scanTicket(file,{onProgress:p=>{
      const labels={preprocess:"Preparant fotografia…",ocr:"Llegint tiquet…",reconstruction:"Reconstruint línies…",done:"Tiquet llegit"};
      setStatus(labels[p.stage]||"Analitzant tiquet…");
    }});
    window.dispatchEvent(new CustomEvent("ticket-scanned",{detail:v37ReceiptResult}));
    return v37ReceiptResult;
  }catch(e){
    console.error("Ticket Scanner V37:",e);
    setStatus("No s'ha pogut llegir el tiquet");
    throw e;
  }
}
window.v37ScanTicketAndFeed=v37ScanTicketAndFeed;

const V37_1_CACHE="repartidor-v37-1";
