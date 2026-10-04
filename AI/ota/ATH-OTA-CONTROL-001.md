# ATH-OTA-CONTROL-001 — control local de causa y límite C0

Fecha de revisión: 2026-10-04 (America/Bogotá). Rama: `feature/ath-odoo-hotel-017-booking-airbnb-level1`. Base restaurable de código antes de esta tarea: `f510d51101938bca2068bf725345a3f4d41f3cb6`.

## C0: evidencia y decisión

Se revisaron [PHASE_C_C0_BASELINE.md](PHASE_C_C0_BASELINE.md), [matriz maestra](../ATH-INTEGRATION-MASTER-MATRIX.md), HOTEL-017, Gateway y pruebas. El C0 previo sigue **PARTIAL / NO PASS**. La documentación acredita identidades Odoo 1–6, relación CASA con cinco habitaciones, cron HOLD activo, otros jobs iCal/NOBEDS inactivos, código local y dos filas 302 observadas el 2 de octubre. No contiene una captura contemporánea restaurable de acción 1967, todos los slots, feeds, logs ni despliegue Gateway. No se puede convertir esa ausencia en evidencia mediante una prueba local.

El usuario informó que el cierre de 301 para llegada 04/10/2026 corresponde a una reserva `DIRECT_WHATSAPP`. Se registra aquí **como informe del usuario**, no como lectura de reserva/slot de Odoo: faltan ID de reserva, salida, estado y vínculo de bloqueo. Los importes no son necesarios para el control de inventario y no se copian. `PROTECTION_CUTOFF_AT=<PENDING>`; ninguna sobreventa histórica se reclasifica como nueva.

## Cambios locales comprobados

- `inventory-control.mjs` clasifica `AVAILABLE`, `RESERVED_DIRECT`, `RESERVED_BOOKING`, `RESERVED_AIRBNB`, `HOLD`, `HOUSE_BLOCK`, `MANUAL_BLOCK_EXPLAINED` y `UNEXPLAINED_BLOCK`. Un `CLOSED_MANUAL` sin motivo, origen desconocido o bloque malformado no se ofrece como libre. `AVAILABLE` requiere que el llamador declare una lectura completa; por defecto se falla cerrado.
- El puerto Gateway y `toInventory` conservan la referencia, fuente y motivo **solo si Odoo ya los devuelve**. No se cambió la acción 1967 ni se creó una reserva. No se afirma que la reserva real de 301 esté hoy centralizada.
- La exclusión CASA↔201/202/203/301/302 se reutiliza del modelo Nivel 1. Una reserva directa en habitación bloquea CASA; un HOLD en CASA bloquea las cinco habitaciones. El feed iCal derivado no expone la referencia interna.
- La comprobación de capacidad devuelve `CAPACITY_GAP` antes de disponibilidad para exceso de huéspedes. El test inyecta 22 plazas de CASA según `ATH-ODOO-HOTEL-009_HANDOFF.md`; el catálogo local de alternativas aún usa un fixture público de 20 y no sustituye la capacidad viva de Odoo.
- 25/12/2026, 20 personas: el fixture local lee inventario completo, permite evaluar CASA, simula un HOLD con ID y verifica el cierre trazable de las cinco habitaciones. No demuestra HOLD real ni escritura OTA.
- 25/12/2026, 200 personas: devuelve `CAPACITY_GAP` sin pedir disponibilidad, cotización ni HOLD.

## Límite operativo para el siguiente gate

La operación real `ota_blocks_list` debe devolver causa y referencia verificables de reservas directas/HOLD/cierres manuales; hoy el contrato local puede conservar esos campos, pero la respuesta real no está acreditada. Una fuente genérica `odoo` permanece `UNEXPLAINED_BLOCK`. Además, el piloto WhatsApp desplegado sigue en modo *availability-only*, sin permiso para HOLD; esta tarea no lo cambió. El `applyBlock` OTA local hace leer y luego escribir, por lo que no prueba atomicidad entre canales.

Antes de C1: completar C0 solo lectura con snapshot seguro contemporáneo de acción 1967, `x_hotel_ota_feed`, slots y logs OTA, configuración de runner/Preview y la reserva directa 301 vinculada a su slot. Redactar referencias privadas; no copiar secretos. Mantener el cierre de 301 mientras falte evidencia. Conservar el backup histórico solo como referencia parcial. Ninguna escritura real, despliegue, merge o cambio tarifario se efectuó en esta tarea.
