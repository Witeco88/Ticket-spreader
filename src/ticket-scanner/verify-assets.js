export async function verifyTicketScannerAssets(base="./ocr"){
  const paths=[
    "tesseract.min.js","worker.min.js",
    "core/tesseract-core.wasm.js","core/tesseract-core-simd.wasm.js",
    "core/tesseract-core-lstm.wasm.js","core/tesseract-core-simd-lstm.wasm.js",
    "lang/cat.traineddata.gz","lang/spa.traineddata.gz","lang/eng.traineddata.gz",
    "lang/fra.traineddata.gz","lang/ita.traineddata.gz","lang/por.traineddata.gz",
    "lang/deu.traineddata.gz","lang/nld.traineddata.gz"
  ];
  const out=[];
  for(const p of paths){
    try{
      const r=await fetch(`${base}/${p}`,{cache:"no-store"});
      out.push({path:p,status:r.status,ok:r.ok});
    }catch(e){out.push({path:p,status:0,ok:false,error:String(e)})}
  }
  return out;
}
