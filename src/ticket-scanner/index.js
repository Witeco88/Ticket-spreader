/*
 * Ticket Scanner Engine — integrated into Repartidor V37
 * Boundary: image -> ReceiptResult. No people, salaries or assignment logic.
 */
export const TICKET_SCANNER_VERSION = "5.7.1-integrated";
export const REPARTIDOR_VERSION = "37.1";

const LABELS = {
  total: /\b(total|totaal|grand\s*total|amount\s*due|totale|totaux|montant\s*(a|à)\s*payer)\b/i,
  subtotal: /\b(subtotal|sub\s*total|sous[- ]total|sous[- ]totale|subtotaal)\b/i,
  tax: /\b(iva|igv|vat|tax|btw|mwst|tva|imposta|imposto|tributo)\b/i,
  service: /\b(service|servicio|serviço|servizio|bediening|servicekosten)\b/i,
  tip: /\b(tip|propina|pourboire|trinkgeld|mancia|gorjeta)\b/i,
  discount: /\b(discount|descuento|desconto|remise|rabatt|sconto|korting)\b/i,
  payment: /\b(visa|mastercard|maestro|debit|credit|cash|cashless|card|kaart|betaling|payment|paiement)\b/i
};
const MONEY_RE=/((?:€\s*)?(?:\d{1,3}(?:[.\s,]\d{3})*|\d+)(?:[,.]\d{1,2})\s*€?)/g;
const LANGS=["eng","spa","cat","fra","ita","por","deu","nld"];

function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();}
function parseMoney(raw){
  if(!raw)return null;
  let s=String(raw).replace(/[€\s]/g,"");
  if(s.includes(",")&&s.includes(".")){
    if(s.lastIndexOf(",")>s.lastIndexOf(".")) s=s.replace(/\./g,"").replace(",",".");
    else s=s.replace(/,/g,"");
  } else if(s.includes(",")) {
    const p=s.split(",");
    s=p.length===2&&p[1].length<=2?s.replace(",","."):s.replace(/,/g,"");
  } else if((s.match(/\./g)||[]).length>1) s=s.replace(/\./g,"");
  const n=Number(s);
  return Number.isFinite(n)?Math.round(n*100)/100:null;
}
function moneyCandidates(text){
  const out=[]; let m;
  MONEY_RE.lastIndex=0;
  while((m=MONEY_RE.exec(text))){const amount=parseMoney(m[1]); if(amount!==null)out.push({raw:m[1],amount,index:m.index});}
  return out;
}
function hasLabel(text,re){return re.test(norm(text));}
function classify(line){
  const t=line.text||"";
  if(hasLabel(t,LABELS.total))return "TOTAL";
  if(hasLabel(t,LABELS.subtotal))return "SUBTOTAL";
  if(hasLabel(t,LABELS.discount))return "DISCOUNT";
  if(hasLabel(t,LABELS.tip))return "TIP";
  if(hasLabel(t,LABELS.service))return "SERVICE";
  if(hasLabel(t,LABELS.tax))return "TAX";
  if(hasLabel(t,LABELS.payment))return "PAYMENT";
  return "UNKNOWN";
}
function lineFromWord(w,i){
  return {id:w.id||("ocr-"+i),text:String(w.text||"").trim(),confidence:Number(w.confidence??w.conf??0),bbox:w.bbox||{x:0,y:0,width:0,height:0},engine:w.engine||"primary"};
}
function groupBoxes(words){
  const arr=(words||[]).filter(w=>String(w.text||"").trim()).map(lineFromWord).sort((a,b)=>(a.bbox.y-b.bbox.y)||(a.bbox.x-b.bbox.x));
  const groups=[];
  for(const w of arr){
    let g=groups[groups.length-1];
    const tol=Math.max(12,(g?.height||w.bbox.height||20)*0.65);
    if(!g || Math.abs((g.y+w.bbox.height/2)-(w.bbox.y+w.bbox.height/2))>tol){
      groups.push({words:[w],y:w.bbox.y,height:w.bbox.height});
    }else{
      g.words.push(w); g.height=Math.max(g.height,w.bbox.height);
    }
  }
  return groups.map((g,i)=>{
    g.words.sort((a,b)=>a.bbox.x-b.bbox.x);
    const text=g.words.map(w=>w.text).join(" ").replace(/\s+/g," ").trim();
    const xs=g.words.map(w=>w.bbox.x), ys=g.words.map(w=>w.bbox.y);
    const xe=g.words.map(w=>w.bbox.x+w.bbox.width), ye=g.words.map(w=>w.bbox.y+w.bbox.height);
    return {
      id:"line-"+i,text,confidence:g.words.reduce((s,w)=>s+w.confidence,0)/g.words.length,
      bbox:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xe)-Math.min(...xs),height:Math.max(...ye)-Math.min(...ys)},
      words:g.words
    };
  });
}
function amountForLine(line){
  const c=moneyCandidates(line.text);
  if(c.length)return c[c.length-1].amount;
  const words=(line.words||[]).slice().sort((a,b)=>a.bbox.x-b.bbox.x);
  for(let i=words.length-1;i>=0;i--){
    const mc=moneyCandidates(words[i].text); if(mc.length)return mc[mc.length-1].amount;
  }
  return null;
}
function nameForLine(line){
  const t=String(line.text||"");
  const c=moneyCandidates(t);
  if(!c.length)return t.replace(/^\s*\d+\s*[xX]?\s*/,"").trim();
  const before=t.slice(0,c[c.length-1].index).replace(/[|:]+\s*$/,"").trim();
  return before.replace(/^\s*(\d+(?:[,.]\d+)?)\s*[xX]\s*/i,"").trim();
}
function quantityForLine(line){
  const m=String(line.text||"").match(/^\s*(\d+(?:[,.]\d+)?)\s*[xX]\b/i);
  return m?Number(m[1].replace(",",".")):1;
}
function cents(n){return Math.round(Number(n||0)*100);}
function near(a,b,t=.02){return Math.abs(cents(a)-cents(b))<=cents(t);}
function mathValidate(items,total,charges){
  if(total==null)return {status:"unknown",difference:null};
  const sum=items.reduce((s,x)=>s+Number(x.amount||0)*Number(x.quantity||1),0);
  const extra=Number(charges.tax||0)+Number(charges.service||0)+Number(charges.tip||0)-Number(charges.discount||0);
  const diff=Math.round((total-(sum+extra))*100)/100;
  return {status:Math.abs(diff)<=.03?"coherent":"inconsistent",difference:diff,sum:Math.round(sum*100)/100};
}
function recoverLastItem(lines,items,total){
  if(total==null || !lines.length)return items;
  const known=new Set(items.map(x=>x._lineId));
  const candidates=lines.filter(l=>l.id&&!known.has(l.id)&&l.bbox.y<lines.find(x=>x._isTotal)?.bbox.y && amountForLine(l)!=null && classify(l)==="UNKNOWN");
  if(!candidates.length)return items;
  const current=items.reduce((s,x)=>s+Number(x.amount||0)*Number(x.quantity||1),0);
  const target=Math.round((total-current)*100)/100;
  const best=candidates.map(l=>({l,a:amountForLine(l),d:Math.abs(cents(amountForLine(l))-cents(target))}))
    .sort((a,b)=>a.d-b.d)[0];
  if(best && best.d<=3){
    const name=nameForLine(best.l);
    if(name){
      items.push({id:"item-"+(items.length+1),name,quantity:quantityForLine(best.l),amount:best.a,confidence:Math.max(.55,Number(best.l.confidence||0)),_lineId:best.l.id,recovered:true});
    }
  }
  return items;
}

export async function scanTicket(file,{onProgress=()=>{},tesseractPath="./ocr",languages=LANGS}={}){
  if(!file)throw new Error("No s'ha proporcionat cap fotografia");
  onProgress({stage:"preprocess",progress:.05});
  const OCR=await loadTesseract(tesseractPath);
  onProgress({stage:"ocr",progress:.15});
  let words=await recognizeWithLanguages(OCR,file,languages,onProgress);
  words=groupBoxes(words);
  onProgress({stage:"reconstruction",progress:.55});
  const classified=words.map(l=>({...l,kind:classify(l),amount:amountForLine(l)}));
  let totalLine=classified.filter(l=>l.kind==="TOTAL"&&l.amount!=null).sort((a,b)=>b.bbox.y-a.bbox.y)[0]||null;
  if(totalLine) totalLine._isTotal=true;
  // Total without explicit label: last plausible monetary line, but only if it
  // is after the product region and mathematically supported.
  if(!totalLine){
    const monetary=classified.filter(l=>l.amount!=null).sort((a,b)=>a.bbox.y-b.bbox.y);
    const tail=monetary[monetary.length-1];
    if(tail){
      tail._isTotal=true;
      totalLine=tail;
    }
  }
  const boundaryY=totalLine?totalLine.bbox.y:Infinity;
  const before=classified.filter(l=>l.bbox.y<boundaryY);
  const items=[];
  let charges={tax:0,service:0,tip:0,discount:0}, subtotal=null;
  for(const l of before){
    if(l.amount==null)continue;
    if(l.kind==="SUBTOTAL"){subtotal=l.amount;continue;}
    if(l.kind==="TAX"){charges.tax+=l.amount;continue;}
    if(l.kind==="SERVICE"){charges.service+=l.amount;continue;}
    if(l.kind==="TIP"){charges.tip+=l.amount;continue;}
    if(l.kind==="DISCOUNT"){charges.discount+=l.amount;continue;}
    if(l.kind==="PAYMENT")continue;
    const name=nameForLine(l);
    if(name && name.length>=2)items.push({id:"item-"+(items.length+1),name,quantity:quantityForLine(l),amount:l.amount,confidence:Math.max(.5,Number(l.confidence||0)),_lineId:l.id});
  }
  const total=totalLine?totalLine.amount:null;
  recoverLastItem(classified,items,total);
  const validation=mathValidate(items,total,charges);
  const warnings=[];
  if(!totalLine || total==null)warnings.push("Total no identificat amb prou confiança");
  if(totalLine && totalLine.kind==="UNKNOWN")warnings.push("Possible total detectat sense etiqueta explícita");
  if(validation.status==="inconsistent")warnings.push("La suma dels conceptes no coincideix amb el total");
  if(items.some(x=>x.recovered))warnings.push("S'ha recuperat una línia dubtosa mitjançant validació matemàtica");
  const totalConfidence=totalLine?Number(totalLine.confidence||0):0;
  const overallConfidence=items.length?items.reduce((s,x)=>s+x.confidence,0)/items.length:0;
  onProgress({stage:"done",progress:1});
  return {
    version:"1.0",currency:"EUR",
    items:items.map(({_lineId,...x})=>x),
    subtotal,tax:charges.tax,service:charges.service,tip:charges.tip,discount:charges.discount,
    total,
    confidence:Math.round(overallConfidence*100)/100,
    totalConfidence:Math.round(totalConfidence*100)/100,
    overallConfidence:Math.round(overallConfidence*100)/100,
    needsReview:warnings.length>0 || validation.status==="inconsistent",
    warnings,
    diagnostics:{ocrLines:classified,validation}
  };
}

async function loadTesseract(base){
  if(window.Tesseract)return window.Tesseract;
  const candidates=[`${base}/tesseract.min.js`,`./ocr/tesseract.min.js`];
  let last;
  for(const src of [...new Set(candidates)]){
    try{await loadScript(src); if(window.Tesseract)return window.Tesseract;}catch(e){last=e;}
  }
  throw new Error("No s'ha pogut carregar el motor OCR local");
}
function loadScript(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script");s.src=src;s.async=true;
    s.onload=resolve;s.onerror=()=>reject(new Error("OCR 404: "+src));document.head.appendChild(s);
  });
}
async function recognizeWithLanguages(T,file,languages,onProgress){
  // Prefer a multilingual model if the installed Tesseract build supports it;
  // otherwise use the first available language and preserve geometry.
  const langs=[...new Set(languages||LANGS)];
  let worker=null,last;
  for(const lang of ["eng",...langs]){
    try{
      worker=await T.createWorker(lang,1,{workerPath:`${location.origin}${location.pathname.replace(/\/[^\/]*$/,"")}/ocr/worker.min.js`,corePath:`${location.origin}${location.pathname.replace(/\/[^\/]*$/,"")}/ocr/core/tesseract-core.wasm.js`,langPath:`${location.origin}${location.pathname.replace(/\/[^\/]*$/,"")}/ocr/lang`});
      const r=await worker.recognize(file,{});
      const data=r?.data||{};
      const lines=(data.words||[]).filter(w=>String(w.text||"").trim()).map((w,i)=>({
        id:"ocr-"+i,text:w.text,confidence:Number(w.confidence||0)/100,
        bbox:{x:w.bbox?.x0||0,y:w.bbox?.y0||0,width:(w.bbox?.x1||0)-(w.bbox?.x0||0),height:(w.bbox?.y1||0)-(w.bbox?.y0||0)},
        engine:"tesseract"
      }));
      await worker.terminate();
      if(lines.length)return lines;
    }catch(e){last=e;try{await worker?.terminate()}catch{}}
  }
  throw last||new Error("OCR sense resultat");
}
