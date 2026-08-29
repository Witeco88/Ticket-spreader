/* Ticket Scanner 5.7.1 engine integrated into Repartidor. */
(function(){
"use strict";
const VERSION="5.7.1-integrated";
const moneyRe=/(?:€\s*)?(?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:\s*[,.]\s*\d{1,2})(?:\s*€)?|(?:€\s*)\d+(?:\s*[,.]\s*\d{1,2})(?:\s*€)?|\b\d+(?:\s*[,.]\s*\d{1,2})?\s*€\b/g;
const labels={
 total:/\b(total|totaal|totale|gesamt|summe|gesamtbetrag|grand\s*total|amount\s*due|importe\s*total|montant\s*total|totale\s*complessivo|valor\s*total|valor\s*a\s*pagar|montant\s*du|totale\s*da\s*pagare)\b/i,
 subtotal:/\b(subtotal|sub\s*total|sous[- ]total|zwischensumme|zwischenbetrag|subtotale|sous-total|subtotaal)\b/i,
 tax:/\b(iva|vat|tax|taxe|impuesto|impostos|imposto|btw|tva|mwst|ust|belasting|taxa)\b/i,
 service:/\b(service|servicio|servei|servizio|servico|serviço|service\s+charge|dienstleistung|bedienung|dienst)\b/i,
 tip:/\b(tip|tips|propina|pourboire|mancia|gorjeta|trinkgeld)\b/i,
 discount:/\b(discount|descuento|descompte|remise|sconto|desconto|rabatt|korting)\b/i,
 payment:/\b(visa|mastercard|maestro|pin|cash|contant|card|kaart|payment|betaald|change|wisselgeld|tarjeta|carte|pagament|pagamento|efectivo)\b/i,
 footer:/\b(thank|thanks|thank you|gracias|gràcies|merci|grazie|obrigad|obrigado|dank|bedankt|dank u|danke|enquete|survey|www\.|http|facebook|instagram)\b/i
};
function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function pm(s){
 let t=String(s).replace(/[€\s]/g,"");
 if(t.includes(",")&&t.includes(".")) t=t.lastIndexOf(",")>t.lastIndexOf(".")?t.replace(/\./g,"").replace(",","."):t.replace(/,/g,"");
 else if(t.includes(",")) t=t.replace(",",".");
 const n=Number(t); return Number.isFinite(n)?Math.round(n*100)/100:null;
}
function money(s){
 const raw=String(s).replace(/\s+/g," ");
 const ms=[...raw.matchAll(moneyRe)];
 if(ms.length) return {value:pm(ms[ms.length-1][0]),raw:ms[ms.length-1][0]};
 const loose=raw.match(/(?:€\s*)?\d{1,4}\s*[,.]\s*\d{1,2}(?:\s*€)?/);
 return loose?{value:pm(loose[0]),raw:loose[0]}:null;
}
function totalLike(s){
 const raw=norm(s), compact=raw.replace(/0/g,"o").replace(/1/g,"i").replace(/[^a-z]/g,"");
 if(labels.total.test(raw)) return true;
 return ["total","totaal","totale","totao","totai","tota1","tota","gesamt","gesammt","gesam","summe","grandtotal","amountdue","importetotal","montanttotal","totalecomplessivo","valortotal"].some(v=>compact.includes(v));
}
function fiscalLike(s){const n=norm(s);return labels.tax.test(n)||/\b(5|6|7|9|10|13|19|20|21|22|23|24|25)%\b/.test(n);}
function paymentLike(s){return labels.payment.test(String(s));}
function footerLike(s){return labels.footer.test(norm(s));}
function administrativeLike(s){
 const n=norm(s);
 return fiscalLike(n)||paymentLike(n)||footerLike(n)||labels.subtotal.test(n)||labels.service.test(n)||labels.tip.test(n)||labels.discount.test(n);
}
function plausibleName(s){
 const n=norm(s).trim();
 if(!n||n.length<2) return false;
 if(totalLike(n)||administrativeLike(n)) return false;
 return /[a-zà-ÿ]/i.test(n);
}
function amountOnly(s){const t=String(s).trim(),m=money(t);return !!m&&t.replace(/€|\d|[,\.\s\-]/g,"")==="";}
function lineFromWords(words){
 const a=(Array.isArray(words)?words:[]).filter(w=>w?.text?.trim()&&w.bbox).sort((x,y)=>x.bbox.y0-y.bbox.y0||x.bbox.x0-y.bbox.x0);
 const groups=[];
 for(const w of a){
  const cy=(w.bbox.y0+w.bbox.y1)/2,h=Math.max(1,w.bbox.y1-w.bbox.y0);
  let g=groups.find(q=>Math.min(w.bbox.y1,q.y1)-Math.max(w.bbox.y0,q.y0)>0 || Math.abs(cy-q.cy)<=Math.max(h,q.h)*.72);
  if(!g){g={words:[],cy,h,y0:w.bbox.y0,y1:w.bbox.y1};groups.push(g);}
  g.words.push(w);g.cy=g.words.reduce((sum,v)=>sum+(v.bbox.y0+v.bbox.y1)/2,0)/g.words.length;
  g.h=Math.max(g.h,h);g.y0=Math.min(g.y0,w.bbox.y0);g.y1=Math.max(g.y1,w.bbox.y1);
 }
 const rows=groups.sort((a,b)=>a.cy-b.cy).map((g,i)=>{
  g.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);
  const text=g.words.map(w=>w.text).join(" ").replace(/\s+/g," ").trim();
  const conf=g.words.reduce((sum,w)=>sum+(Number(w.confidence)||0),0)/g.words.length/100;
  return {id:"line-"+(i+1),text,confidence:conf,money:money(text),y:g.cy,y0:g.y0,y1:g.y1,h:g.h,words:g.words};
 });
 // Rebuild multi-row product names. If several text-only rows precede an amount row,
 // join them all. This avoids losing names such as "Pizza / Margherita / 18,00".
 const out=[];
 let pending=[];
 for(let i=0;i<rows.length;i++){
  const r=rows[i];
  if(!r.money){
   pending.push(r);
   continue;
  }
  const priceOnly=amountOnly(r.text);
  if(priceOnly && pending.length){
   const nameText=pending.map(x=>x.text).join(" ").replace(/\s+/g," ").trim();
   const gap=r.y0-pending[pending.length-1].y1;
   if(nameText && gap<=Math.max(80,r.h*2.8)){
    const merged={...pending[0],text:nameText+" "+r.text,money:r.money,
      confidence:Math.min(...pending.map(x=>x.confidence).concat([r.confidence])),
      y0:pending[0].y0,y1:r.y1,y:(pending[0].y+r.y)/2,words:pending.flatMap(x=>x.words).concat(r.words)};
    out.push(merged);pending=[];continue;
   }
  }
  // Flush pending rows before a non-price row; they remain available for diagnostics.
  out.push(...pending);pending=[];out.push(r);
 }
 out.push(...pending);
 return out.map((r,i)=>({...r,id:"line-"+(i+1)}));
}
function lineData(d){
 if(Array.isArray(d?.words)&&d.words.length) return lineFromWords(d.words);
 if(Array.isArray(d?.lines)&&d.lines.length) return d.lines.map((l,i)=>({id:"line-"+(i+1),text:String(l.text||"").trim(),confidence:Number(l.confidence||0)/100,money:money(l.text),y:l.bbox?.y0||i,y0:l.bbox?.y0||i,y1:l.bbox?.y1||i+1,h:(l.bbox?.y1||i+1)-(l.bbox?.y0||i),words:[]}));
 return String(d?.text||"").split(/\n+/).map((text,i)=>({id:"line-"+(i+1),text:text.trim(),confidence:.35,money:money(text),y:i,y0:i,y1:i+1,h:1,words:[]})).filter(x=>x.text);
}
function parse(lines){
 const totalCandidates=[];
 for(let i=0;i<lines.length;i++){
  const l=lines[i];
  if(l.money&&totalLike(l.text)) totalCandidates.push({i,line:l,score:140+(20-Math.min(20,lines.length-i)),explicit:true,reasons:["etiqueta de total"]});
  if(i<lines.length-1&&totalLike(l.text)&&!l.money&&lines[i+1].money){
   totalCandidates.push({i:i+1,line:{...l,text:l.text+" "+lines[i+1].text,money:lines[i+1].money,confidence:Math.min(l.confidence,lines[i+1].confidence)},score:170,explicit:true,reasons:["etiqueta i import reconstruïts"]});
  }
 }
 let totalCand=totalCandidates.sort((a,b)=>b.score-a.score)[0]||null, implicit=false;
 // Unlabeled total: only accept an amount after a coherent run of product rows.
 if(!totalCand){
  for(let i=0;i<lines.length;i++){
   const l=lines[i]; if(!l.money||!amountOnly(l.text))continue;
   const before=lines.slice(0,i).filter(x=>x.money&&plausibleName(String(x.text).replace(x.money.raw,"").trim()));
   if(before.length<2)continue;
   const sum=Math.round(before.reduce((a,r)=>a+r.money.value,0)*100)/100;
   if(Math.abs(sum-l.money.value)<=.02){
    totalCand={i,line:l,score:100+before.length*5,explicit:false,reasons:["total implícit","coincideix amb suma de productes"]};break;
   }
  }
  implicit=!!totalCand;
 }
 const boundary=totalCand?totalCand.i:lines.length;
 const rows=[];
 for(let i=0;i<boundary;i++){
  const l=lines[i]; if(!l.money)continue;
  const rawName=String(l.text).replace(l.money.raw,"").trim();
  if(!plausibleName(rawName)||administrativeLike(rawName))continue;
  let name=rawName,quantity=1;
  const q=name.match(/^(?:([0-9]+(?:[.,][0-9]+)?)\s*[x×*]\s*)/i);
  if(q){quantity=Math.max(1,Number(q[1].replace(",",".")));name=name.slice(q[0].length).trim();}
  else {const q2=name.match(/^(\d+)\s+(?=[A-Za-zÀ-ÿ])/);if(q2){quantity=+q2[1];name=name.slice(q2[0].length).trim();}}
  if(!plausibleName(name))continue;
  rows.push({id:"item-"+(rows.length+1),name,quantity,amount:l.money.value,confidence:Math.min(.99,Math.max(.05,(l.confidence||.5)*.98)),sourceLine:l.id,recovered:false});
 }
 // Recover one or more missing final item amounts only when arithmetic identifies them
 // uniquely. Mark the result for review; never hide the inference.
 const total=totalCand?.line?.money?.value??null;
 if(total!=null){
  const known=rows.reduce((a,r)=>a+r.amount,0);
  const missing=lines.slice(0,boundary).filter(l=>!l.money&&plausibleName(l.text)&&!administrativeLike(l.text));
  const diff=Math.round((total-known)*100)/100;
  if(missing.length===1&&diff>0&&diff<1000){
   rows.push({id:"item-"+(rows.length+1),name:missing[0].text.replace(/^\d+\s+/,"").trim(),quantity:1,amount:diff,confidence:Math.min(.72,Math.max(.35,missing[0].confidence||.4)),sourceLine:missing[0].id,recovered:true});
  }
 }
 rows.sort((a,b)=>Number(a.sourceLine.split("-")[1])-Number(b.sourceLine.split("-")[1]));
 let subtotal=null,tax=0,service=0,tip=0,discount=0;
 const warnings=[];
 for(let i=0;i<boundary;i++){
  const t=norm(lines[i].text),v=lines[i].money?.value;
  if(v==null)continue;
  if(labels.subtotal.test(t))subtotal=v;
  else if(labels.tax.test(t))tax+=v;
  else if(labels.service.test(t))service+=v;
  else if(labels.tip.test(t))tip+=v;
  else if(labels.discount.test(t))discount+=Math.abs(v);
 }
 const productSum=Math.round(rows.reduce((a,r)=>a+r.amount,0)*100)/100;
 if(subtotal==null&&rows.length)subtotal=productSum;
 const expected=Math.round((productSum+tax+service+tip-discount)*100)/100;
 const diff=total==null?null:Math.round((total-expected)*100)/100;
 const coherent=diff!=null&&Math.abs(diff)<=.02;
 if(!totalCand)warnings.push("No s'ha pogut identificar un total fiable.");
 if(implicit)warnings.push("Possible total detectat sense etiqueta explícita.");
 if(total!=null&&!coherent)warnings.push(`La suma (${expected.toFixed(2)}) no coincideix amb el total (${total.toFixed(2)}).`);
 if(rows.some(r=>r.recovered))warnings.push("S'ha recuperat un concepte per conciliació matemàtica; revisar-lo.");
 const avg=rows.length?rows.reduce((a,r)=>a+r.confidence,0)/rows.length:0;
 const totalConfidence=totalCand?Math.min(.995,Math.max(.05,(totalCand.line.confidence||.7)*(totalCand.explicit?1:.82))):0;
 const overall=Math.round((avg*.45+totalConfidence*.35+(coherent?.2:0))*100)/100;
 const classifications=lines.map((l,i)=>({
  index:i,line:l.text,type:totalLike(l.text)?"TOTAL":labels.subtotal.test(l.text)?"SUBTOTAL":fiscalLike(l.text)?"TAX":labels.service.test(l.text)?"SERVICE":labels.tip.test(l.text)?"TIP":labels.discount.test(l.text)?"DISCOUNT":paymentLike(l.text)?"PAYMENT":footerLike(l.text)?"FOOTER":l.money?"PRODUCT_CANDIDATE":"UNKNOWN",amount:l.money?.value??null
 }));
 return {
  version:"1.0",currency:"EUR",items:rows,subtotal,tax,service,tip,discount,total,
  confidence:overall,totalConfidence,overallConfidence:overall,
  needsReview:!totalCand||!coherent||!rows.length||rows.some(r=>r.confidence<.8)||rows.some(r=>r.recovered),
  warnings,validation:{productSum,expectedTotal:expected,difference:diff,coherent},
  diagnostics:{classifications,totalBoundaryIndex:totalCand?.i??null,totalDetection:totalCand?{explicit:!!totalCand.explicit,score:totalCand.score,reasons:totalCand.reasons}:null,ignoredAfterTotal:totalCand?lines.slice(totalCand.i+1).map(l=>l.text):[],reconstructedLines:lines.map(l=>({text:l.text,confidence:l.confidence,bbox:l.words?.length?{x:Math.min(...l.words.map(w=>w.bbox.x0)),y:l.y0,width:Math.max(...l.words.map(w=>w.bbox.x1))-Math.min(...l.words.map(w=>w.bbox.x0)),height:l.y1-l.y0}:null}))}
 };
}
async function preprocess(file){
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url;});
  const scale=Math.min(2.5,2200/Math.max(1,img.width));
  const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
  const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);
  const d=ctx.getImageData(0,0,c.width,c.height);
  for(let j=0;j<d.data.length;j+=4){const y=.299*d.data[j]+.587*d.data[j+1]+.114*d.data[j+2];const v=Math.max(0,Math.min(255,(y-128)*1.55+128));d.data[j]=d.data[j+1]=d.data[j+2]=v;}
  ctx.putImageData(d,0,0); return c;
 } finally {URL.revokeObjectURL(url);}
}
async function scan(file,onProgress){
 if(!window.Tesseract) throw new Error("Motor OCR local no disponible.");
 if(file.type==="application/pdf") throw new Error("Els PDF encara no es poden analitzar directament. Selecciona una fotografia o una imatge del tiquet.");
 onProgress?.(8,"Carregant fotografia…");
 const canvas=await preprocess(file); onProgress?.(20,"Preprocessant fotografia…");
 const worker=await Tesseract.createWorker(["cat","spa","eng","nld","fra","deu","ita","por"],1,{
  workerPath:"./ocr/worker.min.js",corePath:"./ocr/core",langPath:"./ocr/lang",
  logger:m=>onProgress?.(25+Math.round((m.progress||0)*65),"OCR: "+(m.status||"processant"))
 });
 try{
  const r=await worker.recognize(canvas);
  const lines=lineData(r.data);
  const parsed=parse(lines);
  window.TicketScanner57.last={raw:r.data,lines,parsed};
  onProgress?.(96,"Validant resultat…");
  return parsed;
 } finally {await worker.terminate();}
}
window.TicketScanner57={version:VERSION,scan,parse,lineData,last:null};
})();