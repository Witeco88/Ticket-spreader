# Repartidor + Ticket Scanner 5.7.1

Integració del motor de Ticket Scanner 5.7.1 dins de Repartidor v36, mantenint el sistema d'assignació a persones.

## Entrada
- Fer foto
- Seleccionar foto existent
- Seleccionar arxiu (imatges; PDF només és acceptat pel selector però no analitzat encara)

## Lectura
El motor conserva OCR Tesseract local, reconstrucció geomètrica, idiomes europeus, detecció de productes/imports, classificació de càrrecs i frontera del TOTAL.

El primer TOTAL explícit fiable és terminal: tot el contingut posterior s'ignora. IVA, impostos, servei, propina, descompte, pagament i footer no són productes.

Si una única línia de producte queda sense import però la diferència amb el total la identifica matemàticament, es pot recuperar amb `needsReview=true` i avís explícit.

## GitHub Pages
El workflow inclòs descarrega i verifica els assets OCR locals i publica `public/`. Per usar aquest workflow, configura **Settings → Pages → GitHub Actions**.

Si vols **Deploy from a branch → main → /(root)**, els assets OCR s'han de tenir físicament dins del repositori a `ocr/`; el workflow no s'executa en aquesta modalitat.

## Diagnòstic
La pantalla d'escaneig inclou diagnòstic de línies OCR, classificació, frontera del total, contingut ignorat i validació matemàtica.
