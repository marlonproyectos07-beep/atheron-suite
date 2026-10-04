# PHASE C / C0 — baseline y plan de restauración

**GATE:** C0 · **STATUS:** PARTIAL / NO PASS · **captura:** 2026-10-04 02:55–02:58 UTC (2026-10-03, America/Bogota). **Modo:** solo lectura de sistemas; se creó únicamente este documento local. `PROTECTION_CUTOFF_AT=<PENDING>`; no existe T0 activado. No se visitaron Booking ni Airbnb durante C0.

## Identidad y procedencia de la evidencia

- Rama local: `feature/ath-odoo-hotel-017-booking-airbnb-level1`; HEAD `f510d51101938bca2068bf725345a3f4d41f3cb6`. Está dos commits por delante de `origin/feature/ath-odoo-hotel-017-booking-airbnb-level1` (`fda6b65`, `f510d51`); no se hizo push, commit, merge ni deploy en C0. Había archivos ajenos sin seguimiento antes de C0 y no se modificaron.
- **VIVO-C0:** sesión autenticada de Odoo STAGING `atheron1-hotel-staging-20260923.odoo.com`, interfaz de Unidades, Gantt/lista de `planning.slot` y Ajustes → Acciones planificadas. Se usó modo desarrollador por parámetro de URL solo para consultar menús; no se guardó configuración. Banner: base neutralizada para pruebas; aviso de prueba gratis que expira en cuatro días, observado durante C0. No se compró ni configuró suscripción.
- **HISTÓRICO-2026-10-02:** [auditoría OTA real](../ATH-ODOO-OTA-REAL-GATE-AUDIT.md), con lectura entonces de `x_hotel_ota_feed`, slots y log Odoo; no constituye snapshot vivo de C0.
- **CÓDIGO-HEAD:** [PHASE A](../GOAL-OTA-SYNC-AUDIT-001-PHASE-A.md), [PHASE B](../GOAL-OTA-SYNC-AUDIT-001-PHASE-B.md), contratos `integrations/odoo-hotel-ical/src` y `integrations/odoo-hotel-gateway/src`.
- **BACKUP-2026-09-30:** [respaldo de Studio/STAGING](../staging-backup/README.md); anterior a cambios HOTEL-017 y a las observaciones OTA del 2 de octubre. Es punto de recuperación parcial, **no imagen actual restaurable de OTA**.

## Odoo STAGING: inventario de seis unidades objetivo

La vista Hotel v1 → Unidades mostró ocho registros en total: las cinco habitaciones objetivo y tres registros llamados CASA COMPLETA. Los tres nombres iguales **no se deben tratar como una sola unidad**. La CASA objetivo se identifica por ID 6, propiedad `HOTEL ATHERON SUITE`, recurso `Casa Completa - La Magia de Zipaquirá` y sus cinco hijas. Solo se verificó el estado activo de las seis unidades objetivo; no se modificó ninguna ficha.

| Unidad objetivo | ID `x_hotel_unit` | Estado visto | Relación con CASA 6 | Evidencia |
|---|---:|---|---|---|
| 201 | 1 | activo | hija de 6 | ficha `/odoo/action-1911/1` |
| 202 | 2 | activo | hija de 6 | ficha `/odoo/action-1911/2` |
| 203 | 3 | activo | hija de 6 | ficha `/odoo/action-1911/3` |
| 301 | 4 | activo | hija de 6 | ficha `/odoo/action-1911/4` |
| 302 | 5 | activo | hija de 6; la ficha 302 muestra CASA como compuesta | ficha `/odoo/action-1911/5` |
| CASA COMPLETA (La Magia) | 6 | activo | contiene 201/202/203/301/302 | ficha `/odoo/action-1911/6` |

La relación de datos está verificada en la interfaz; la exclusión comercial en Booking/Airbnb no se deduce de esta relación.

## Planning slots, feeds y auditoría

**VIVO-C0:** la lista general de `planning.slot` mostró 492 filas sin filtro de canal en ese momento; el Gantt de la semana 28 sep–4 oct mostró 302 y Casa bloqueadas entre el 1 y el 5 de octubre. Esto prueba presencia de slots, no la cantidad actual de bloques externos ni su procedencia. No se exportaron huéspedes ni reservas, ni se alteró disponibilidad.

**HISTÓRICO-2026-10-02:** ocho slots `external`: cinco asociados a 302/recurso 32 (dos Booking, tres Airbnb), uno etiquetado Booking en 203/recurso 30 y dos sin canal en 302/recurso 32. Había bloques derivados de Casa. Los slots 40018, 40048 y 40067 carecían de UID/procedencia OTA acreditada; el evento controlado Airbnb 302 creó después el slot 40157 y derivado 40158, y ambos fueron liberados en la prueba. No se recontaron ni revalidaron estos IDs durante C0.

**Feeds de STAGING, HISTÓRICO-2026-10-02:** `x_hotel_ota_feed` tenía exactamente dos filas, Booking `AHS-302` (Odoo 5/recurso 32, property 16559325, calendar 1655932505) y Airbnb `AHS-302` (Odoo 5/recurso 32, listing 1119517434126866031). Ambas referencias inbound/outbound estaban vacías. `x_last_sync_at=2026-10-02 05:21:06 UTC` corresponde a importaciones manuales `.ics`, no a polling continuo. Durante C0 se confirmó que el modelo `x_hotel_ota_feed` aún existe en STAGING, pero el menú no expone sus filas; **cantidad, referencias y último sync actuales no están verificados en vivo**. No se incluyó URL privada de feed ni UID.

**Audit/log, HISTÓRICO-2026-10-02:** `x_hotel_api_log` registró operaciones OTA del piloto puntual (aplicación, replay/snapshot y liberación). La cantidad y el último evento actuales no se pudieron consultar durante C0. La acción de servidor Odoo 1967 es la ruta HOTEL-017 documentada; su código vivo y hash no se capturaron hoy.

## Schedulers y estado Gateway

**VIVO-C0:** Ajustes → Acciones planificadas mostró **112** acciones (80+32 en dos páginas). La acción `HOTEL v1 — Vencer HOLDs y liberar inventario (STAGING)` estaba **activa**, intervalo **15 minutos**; coincide con el cron 155 documentado. Las acciones visibles `ATHERON - Refrescar iCal NOBEDS (salida)` (5 min), `ATHERON PMS — Verificación de Consistencia NOBEDS` (4 h), `NOBEDS - Healthcheck de sincronizacion` (15 min), `NOBEDS - Podar fantasmas vencidos` (1 día) y `ATHERON - Sincronizar reservas hotel al calendario` (5 min) estaban **inactivas**. En las 112 acciones no se observó un job nombrado Booking/Airbnb/HOTEL-017 de importación OTA. Esto no prueba que no exista un ejecutor externo a Odoo.

**CÓDIGO-HEAD:** `continuous-sync-runner.mjs` define `intervalMs=300000` (5 min), `horizonDays=30`, `staleAfterSeconds=900`, `cutoffAt=null` por defecto. El CLI `npm run phase-b` usa fixtures con 100 ms por defecto; no es polling real. `createMemoryJournal()` no es durable tras reinicio. Los adapters Booking/Airbnb/Odoo/iCal devuelven `UNSUPPORTED_OPERATION` sin puertos inyectados. `public-feed.mjs` admite las seis unidades y dos canales, horizonte de 540 días, pero exportar código no demuestra feed servido o importado. El Gateway expone contratos `ota_blocks_list/apply/release` y `ota_snapshot_list/put`, `/health` y `/ready`; se exige la acción Odoo 1967. No hay cron OTA en `vercel.json` del repo ni en scripts `package.json` de iCal/Gateway. Vercel, variables y Preview **no fueron consultados en vivo en C0**; el informe del 2 de octubre no encontró variables `HOTEL_ICAL`/`OTA` y no observó salida publicada.

**Pruebas locales C0:** `npm test` en `integrations/odoo-hotel-ical`: 115/115 PASS; en `integrations/odoo-hotel-gateway`: 321/321 PASS. Total 436 tests locales; no prueban cron, feed, Gateway desplegado, atomicidad Odoo ni latencia OTA reales.

## Cobertura Booking y Airbnb: solo repo/documentos

| Unidad | Booking conocido | Airbnb conocido | Cobertura Odoo acreditada |
|---|---|---|---|
| 201 | propiedad habitaciones 16559325; calendario/feeds sin ID probado | listing/feed pendiente | UNCONNECTED |
| 202 | propiedad habitaciones 16559325; calendario/feeds sin ID probado | listing/feed pendiente | UNCONNECTED |
| 203 | propiedad habitaciones 16559325; calendario/feed sin ID probado | listing/feed pendiente | UNCONNECTED; slot Odoo etiquetado Booking no acredita canal |
| 301 | propiedad habitaciones 16559325; calendario/feed sin ID probado | listing 1057232086445101786; feed pendiente | UNCONNECTED |
| 302 | propiedad habitaciones 16559325; calendario 1655932505; feed conocido en auditoría anterior | listing 1119517434126866031; piloto administrativo puntual | PARTIAL |
| CASA COMPLETA | propiedad Casa separada 16569053; calendario/feed pendiente | existencia e ID de anuncio pendientes | UNCONNECTED |

Documentación previa: conexión directa Booking↔Airbnb 302 existente; Booking exportaba en modo global `Solo fechas reservadas`; conexión temporal `Atheron Odoo STAGING TEST` quedó `Import needed`. Estos son hechos fechados el 2 de octubre, **no comprobaciones nuevas de C0**. No se navegó a Booking ni Airbnb, ni se leyó disponibilidad real de esos canales.

**Contadores conservadores:** CONNECTED=0; PARTIAL=1 (302); UNCONNECTED=5 (201/202/203/301/CASA); AT_RISK=6. Son cobertura demostrada hacia Odoo, no inventario de anuncios existentes.

## Respaldo, reversión y límites

El HEAD `f510d51` preserva el código local PHASE A/B; `ed0b7d6` es el commit anterior de HOTEL-017 en la rama remota. El respaldo de Odoo STAGING del 30 de septiembre incluye Studio, unidades, crons y acciones servidor de esa fecha; los hashes SHA-256 se verificaron sin modificar archivos. Ejemplos: `ir-cron.json` `8AB2B988DB0CD460EC8FB20A4DC82FF5056F122A1CD2B9E8992CC3C5E77358E9`; `master-data-x_hotel_unit.json` `DC6937E7B4ED2507B3B21F072D226ACB4ED3257633A6431B5E90DCF73FB98622`. **No usar ese respaldo antiguo para sobrescribir directamente el estado OTA actual.** No se creó copia de Production.

Antes de autorizar cualquier gate con escritura hace falta un snapshot contemporáneo, en almacenamiento seguro, de: acción 1967/código+hash; filas y referencias de `x_hotel_ota_feed` (valores secretos separados en gestor seguro); cron OTA/HOLD con IDs, estados e intervalos; slots `external`/`derived` y snapshots/logs OTA con propietario/UID/fechas; versión y variables por nombre (sin valores) de Gateway/Preview; conexiones/importadores/exportadores que el gate vaya a modificar. El acceso técnico guardado en `%LOCALAPPDATA%\AtheronSecrets\odoo-hotel-staging.cred` **existe**, pero esta sesión no pudo descifrarlo con DPAPI; no se extrajo, reconfiguró ni imprimió. La sesión web permitió solo las vistas indicadas.

**Plan de rollback para gates posteriores, no ejecutado:** (1) congelar nuevas escrituras y desactivar **solo** runner/scheduler OTA que el gate haya activado; no desactivar cron HOLD 155; (2) conservar journal, logs y bloqueos protectores, sin liberar huéspedes ni bloqueos ajenos; (3) revertir código/Preview a commit y variables previos mediante el gestor de despliegues, solo con autorización de ese gate; (4) restaurar **solo** filas/campos OTA o acción 1967 modificados, desde el snapshot contemporáneo y con comparación de hash/versión, nunca desde el ZIP de septiembre a ciegas; el script `patch-odoo-action-snapshot-staging.mjs rollback` revierte únicamente la guardia puntual de `ota_snapshot_put` si su precondición exacta coincide, y **no** es rollback universal; (5) restaurar conexiones OTA anteriores únicamente si el gate posterior las cambió, protegiendo la conexión directa 302 hasta probar paridad; (6) reconciliar Odoo contra feeds completos, confirmar ausencia de duplicados y acuse de destino antes de reabrir inventario. Si hay duda, mantener cierre protector y escalar. El rollback actual es **plan definido, no restauración demostrada**.

## PASS/FAIL y semáforo

**Conocido:** identidades Odoo 1–6 y relación Casa, cron HOLD activo, jobs iCal/NOBEDS citados inactivos, código/fixtures, pruebas locales, cobertura documentada y backup histórico. **No conectado de forma continua acreditada:** seis unidades. **No verificado en vivo C0:** detalle completo de slots externos, filas/referencias/último sync del feed, audit log y acción 1967 actuales, despliegue/variables Gateway y estado actual de conexiones OTA (por alcance expresamente restringido).

**C0_PASS: NO.** No se puede afirmar que exista un respaldo contemporáneo y restaurable de la configuración OTA ni un inventario exacto de slots/feeds/logs al instante C0. El bloqueo concreto es acceso de lectura técnica de Odoo: DPAPI de la sesión actual no descifra el almacén existente; la UI autenticada permite vista parcial, no exportación segura de esos modelos. La limitación de Booking/Airbnb es de alcance autorizado, no un error: C0 usa únicamente documentación previa. No activar C1, C2, C3 ni ningún otro gate. Siguiente acción segura: completar **C0 solo lectura** desde el entorno/usuario Windows que pueda usar el almacén técnico original, o desde una vista Odoo que permita exportar los modelos OTA con referencias privadas redactadas, y capturar snapshot/hash actual. **FINAL_SEMAPHORE: ÁMBAR / C0 INCOMPLETO.**

`STAGING_CHANGED: NO` · `BOOKING_CHANGED: NO` · `AIRBNB_CHANGED: NO` · `PRODUCTION_CHANGED: NO` · `DEPLOYED: NO` · `MAIN_MERGED: NO` · `SECRETS_EXPOSED: NO`.
