# Auditoria de automatizaciones sobre `planning.slot` (ATH-DEV-016)

Fuente: lectura de SOLO LECTURA de PRODUCCION (`atheron1`), [run 40405341572](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/40405341572) (`npm run audit`). Se leyeron `base.automation`, sus `ir.actions.server` reales (`action_server_ids`), el Booking Engine, los crons relacionados y metadatos de entorno. No se ejecuto ninguna accion, no se creo ni modifico ningun turno, no se llamo a Smoobu. Los campos de URL y UUID de webhooks no se pidieron; las lineas de codigo con palabras de credencial se omiten y las URLs se reducen al host. Matriz estructurada: `fixtures/automation-matrix-2026-10-26.json` (verificada por `test/automation-matrix.test.mjs`).

## 1. Matriz de disparadores (resumen)
| Id | Automatizacion | Evento | Efecto | Externo | Riesgo | Control en staging |
|---|---|---|---|---|---|---|
| 12 | Fix Slot Times (1481) | crear/editar | reescribe inicio/fin a la hora de entrada/salida de `sale_renting.recurrence_nightly` (zona del sitio web) | no | bajo | comprobar que los turnos creados ya estan en 15:00/11:00 Bogota |
| 22 | Booking Engine: cambio (1500 -> 1495 -> 1493) | crear/editar | enlaza y recalcula `x_availability` de las ofertas del recurso; **ignora `state`, `x_checkin_state` y `x_bloqueo_ref`** | si (disponibilidad directa) | alto | sitio web despublicado; medir noche cerrada |
| 23 | Booking Engine: borrado (1496) | borrar | recalcula; **unica via que libera** | si | medio | no se borra automaticamente |
| 51 | NOBEDS -> Odoo (1648, webhook) | webhook externo | crea/actualiza turnos y `res.partner`; cancelacion => `state=draft` | si | alto | webhook inactivo; NOBEDS no apunta a staging |
| 55, 157 | iCal al cambiar | crear/editar | **sin acciones enlazadas: inertes** | no | bajo | reconfirmar |
| 158 | Regenerar iCal al borrar (1654) | borrar | regenera los .ics publicos | si | alto | .ics solo en host de staging |
| 164 | Anti-duplicado NOBEDS (1841) | crear con `x_nobeds_id` | **borra** el turno si hay otro del rol ese dia | no | alto si se usara | el conector NO escribe `x_nobeds_id` |
| 167 | Casa bloquea habitaciones (1853) | crear/editar publicado sin `x_bloqueo_ref` | espejo por habitacion libre; omite ante cualquier solape | si | alto | pruebas de espejo y solape |
| 168 | Limpiar bloques al borrar (1854) | borrar | borra todo turno con `x_bloqueo_ref` = id borrado (aunque el espejo cubra a otra habitacion) | si | alto | prueba de espejo compartido |
| 169 | Habitacion bloquea Casa (1855) | crear/editar publicado sin `x_bloqueo_ref` | espejo en Casa salvo cualquier solape; **no actualiza un espejo existente** | si | alto | motor rechaza espejo parcial |
| 170 | Orden borrador desde OTA (1857) | crear con `x_nobeds_id` | crea `res.partner` y `sale.order` | no | alto si se usara | sin `x_nobeds_id` no se dispara |
| 171 | Cancelar orden OTA (1858) | `state=draft` + `x_nobeds_id` + `sale_line_id` | cancela la orden o `message_post` | si (correo) | medio | sin correo saliente |

## 2. Crons con efecto externo (activos en produccion)
147 refresca el iCal publico **cada 5 minutos** (accion 1654); 150 envia correo de alerta NOBEDS cada 15 min; 143 saldos bancarios 15 min; 103 stock 1 h; 32/34/35 sincronizacion bancaria; 58 Google Calendar; 70 Marketing Automation; 26/42 envio de facturas e informes; 75 IAP VIES; 148 poda parametros NOBEDS. Un pago `payment.provider` (id 14) esta habilitado y hay 1 servidor de correo saliente activo.

## 3. Hallazgos que cambian el diseno
1. **Draft y cancelled NO liberan disponibilidad.** El calculo del Booking Engine (1493/1495) busca turnos por recurso y fechas sin mirar `state`, `x_checkin_state` ni `x_bloqueo_ref`. `draft` solo saca el turno del iCal (1654 filtra `published`), lo que deja un estado inconsistente. **La unica via nativa de liberar es borrar**, y borrar arrastra los espejos (168).
2. **Crear un turno del conector llega a las OTAs** en <= 5 min: el feed de la habitacion incluye turnos publicados con `x_nobeds_id` vacio; NOBEDS/Worker lo consumen. Sin mitigacion, una reserva de Smoobu volveria a Booking/Airbnb por esa via (riesgo de eco con Smoobu).
3. **La clave en `name` es visible en el .ics publico**: el SUMMARY usa `x_guest_id.name` o `name`. Decision pendiente (no crear campos sin autorizacion).
4. **Modificar fechas desfasa el espejo**: 167/169 no actualizan un espejo existente. El motor no modifica turnos: libera (bloqueado) y crea.
5. **`x_nobeds_id` esta prohibido** para el conector: activaria 164 (borrado), 170 (ventas) y 171.
6. **Horario**: la accion 1481 explica el 15:00/11:00 (lee la hora de entrada/salida del producto de alquiler y la zona del sitio web).
7. **Entorno**: Odoo Online (modulos `saas_*`, Studio), version 19.0.1.3, 445 modulos; produccion no neutralizada; `database.expiration_date = 2026-12-02` (motivo `renewal`).

## 4. Limitaciones de esta auditoria
No se leyeron las acciones 1667 (stock) ni 1762 (saldos); solo su analisis estatico. No se ejecuto nada: el comportamiento real sigue sin probarse. El analisis estatico es por patrones de texto.
