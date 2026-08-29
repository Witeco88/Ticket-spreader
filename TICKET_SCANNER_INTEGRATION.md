# Repartidor V37 — Ticket Scanner integrat

La V37 integra el motor Ticket Scanner 5.7.1 dins de Repartidor.

Flux:
Foto / seleccionar fotografia -> Ticket Scanner -> ReceiptResult -> sistema d'assignació existent.

Ticket Scanner no conté cap lògica de persones o repartiment.

La UI de Repartidor es manté com a punt d'entrada. El resultat queda disponible a
`window.ticketScannerReceipt` i es dispara l'event `repartidor-receipt-ready`.

Per a integrar amb un setter existent es poden usar:
`window.loadReceiptItems(items, receipt)` o `window.setReceiptItems(items, receipt)`.

Versió: V37.
