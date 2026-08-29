# Ticket Scanner OCR assets

Aquesta carpeta és obligatòria per a l'execució local de Ticket Scanner.
El workflow de GitHub Pages ha d'emplenar-la abans del deploy.

Fitxers esperats:
- tesseract.min.js
- worker.min.js
- core/tesseract-core.wasm.js
- core/tesseract-core-simd.wasm.js
- core/tesseract-core-lstm.wasm.js
- core/tesseract-core-simd-lstm.wasm.js
- lang/cat.traineddata.gz
- lang/spa.traineddata.gz
- lang/eng.traineddata.gz
- lang/fra.traineddata.gz
- lang/ita.traineddata.gz
- lang/por.traineddata.gz
- lang/deu.traineddata.gz
- lang/nld.traineddata.gz


## V37.1 executable
- Repartidor + Ticket Scanner 5.7.1 integrat.
- El lector s'activa en seleccionar/fer una fotografia.
- El resultat es publica com `repartidor-receipt-ready`.
- El sistema d'assignació de persones de Repartidor es manté separat.
- Abans de GitHub Pages, el workflow ha d'emplenar `/ocr` amb els assets locals de Tesseract.
