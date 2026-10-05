# HOTEL-017 — Booking inbound AHS-302, STAGING E2E

Fecha local: 2026-10-04 (America/Bogota). Entorno único: `atheron1-hotel-staging-20260923.odoo.com` / base `atheron1-hotel-staging-20260923`. Rama: `feature/ath-odoo-hotel-017-booking-airbnb-level1`; importador base `c34c067`. Feed Odoo ID 1, Booking/AHS-302, unidad Odoo 5. La URL privada estaba configurada y se usó solo en memoria; este informe no contiene URL, UID, nombres, tokens ni credenciales.

## Snapshot previo y preflight

- AHS-302: 68 `planning.slot`, de los cuales 7 `external`. CASA COMPLETA: 78 slots.
- Huella SHA-256 de IDs de slots de 302: `fe39d10daaa0564a698e8ceb33868428e15ded7caf4b3c2b4a1ed26ab4876523`.
- Huella SHA-256 de IDs de slots de CASA: `9578384b008885116b1984c88b8e63eb0e5ca85cc91a77637a0046bb3fb526c6`.
- Inventario OTA `external`/`derived`: 112 slots en total; huella de IDs `63ad745811b6b2cee7a857d4f3c8e634c44735885a4e9e52d33c094e28fe5612`.
- Órdenes comerciales relacionadas con unidades 5/6: 92, huella de campos acotados `223fb2daed2d5f9d4c747a8e1d71394256ef5bc5f8939d48d3ef5b5a728ab87f`. Huéspedes vinculados: 7, huella `acab25a9858405f45e63a8f51359d63f4e795161a296f275bf1e7570b639b35b`.
- El GET HTTPS del iCal respondió con calendario válido y 2 eventos activos. Ventanas: 2026-10-01 a 2026-10-05 y 2026-10-17 a 2026-10-18. Ambas ya estaban ocupadas por slots Booking 40142 y 40140, respectivamente. Los campos de referencia OTA consultados en esos slots estaban vacíos, por lo que no se pudo demostrar una vinculación de UID con seguridad.

## Ejecuciones manuales

Se ejecutó dos veces el mismo comando `ota-inbound-staging.mjs 1` bajo el cargador DPAPI local. Ambas ejecuciones devolvieron `status=REVIEW`, `events=2`, `APPLIED=0`, `DUPLICATE=0`, `CONFLICT=2`, `ERROR=0`. La salida del CLI usó solo conteos y códigos; no emitió la URL ni los UID.

Después de cada ejecución, AHS-302 continuó con 68 slots y 7 externos; CASA con 78; el conjunto OTA con 112. Las tres huellas de IDs anteriores permanecieron idénticas. Los registros comerciales y huéspedes relacionados conservaron sus conteos y huellas. El feed quedó en `REVIEW`, sin `last_error`, y registró `last_sync_at=2026-10-05 03:40:33` tras la segunda pasada.

La consulta de disponibilidad del 17 al 18 de octubre devolvió `no_disponible` para AHS-302 (unidad 5) y CASA COMPLETA (unidad 6). El ledger Gateway/Odoo reconsultado después de la segunda pasada contiene 5 entradas Booking/AHS-302, entre ellas 2 `CONFLICT`; persisten tras nueva consulta. Ningún slot físico fue creado por estas pasadas. Los slots de otras unidades tampoco cambiaron, según la huella global del inventario OTA.

## Veredicto y límite de la comprobación

**STAGING_302_INBOUND_PASS = NO.** La descarga y el parseo funcionan; la prevención de duplicados físicos y el cierre por conflicto funcionan. No se demuestra todavía que los 2 eventos se acepten como `DUPLICATE` por UID ni que un evento nuevo cree su bloqueo, porque ambos rangos ya estaban ocupados por bloqueos Booking manuales. No se deben borrar, liberar ni adoptar automáticamente esos slots. La siguiente acción segura es reconciliar en lectura la identidad de los dos eventos con los bloqueos existentes y definir una adopción controlada y auditable antes de repetir el piloto.

La comparación directa incluyó órdenes, sus campos de precio/estado y huéspedes vinculados. Las tablas de tarifas y pagos no se leyeron directamente; la primera auditoría amplia de esas tablas fue rechazada por la revisión automática por exceder el alcance de AHS-302 y no se ejecutó. No hubo escritura en Booking, Airbnb, Production ni NOBEDS; el importador no crea `sale.order` desde eventos iCal.
