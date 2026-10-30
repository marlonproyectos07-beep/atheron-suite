# Piloto minimo sobre Odoo 19 original, sin duplicar la base (ATH-DEV-017)

Decision del CEO: no duplicar, no crear staging. Todo lo de abajo es **lectura y simulacion** sobre `atheron1`. Ensayo real: [run 40407989596](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/40407989596) (`npm run pilot-dryrun`), solo `search_read` y `fields_get`; resumen anonimizado en `fixtures/pilot-dryrun-2026-10-26.json`. Cero escrituras, cero Smoobu.

## 1. Garantia de que el ensayo no escribe
- El cliente JSON-2 solo admite `search_read`, `read`, `search`, `search_count`, `fields_get`, `name_search`; rechaza `create`, `write`, `unlink`, `run`, `method_direct_trigger`, `action_*` ANTES de la red (pruebas).
- Prueba con un cliente real y `fetch` simulado: el ensayo solo emite `fields_get` y `search_read`, ninguna URL de mutacion.
- Analisis estatico de los modulos del ensayo: ninguna llamada a Odoo fuera de `searchRead`/`fieldsGet`; ningun `execute_kw`, `.run()` ni `_trigger()`.
- No se ejecuta ninguna accion de servidor ni cron: los efectos se **predicen** replicando el codigo leido en ATH-DEV-016.

## 2. Estado actual (ANTES) leido en produccion
- Seis roles: todos `x_is_a_room_offer`, `x_casa` = La Magia de Zipaquira, recursos 28/29/30/31/32/79, todos con habitacion NOBEDS mapeada.
- 166 turnos entre 2026-09-11 y 2027-01-24: **todos publicados y ninguno con `x_nobeds_id`** (son reservas directas de Odoo). 37 espejos de Casa y 1 espejo por habitacion de la unica reserva real de Casa.
- Hora de entrada/salida de "Nights": 15 y 11. Zona del sitio web: no legible.
- Booking Engine: 6 ofertas, 680 filas de disponibilidad, 0 pendientes de recalculo, 0 cierres de recurso.
- iCal: feeds publicos refrescados a las 21:50:00 (cada 5 min); el de Casa pesa 101 008 bytes, los demas 110 (vacios).
- `res.partner` 7 (comodin de la automatizacion 170) tiene forma de nombre de persona: **no sirve como marcador**. `x_guest_id` lo usan las acciones 1651 (notifica a NOBEDS), 1652 (factura DIAN), 1654 y 1648: **no se debe escribir**.

## 3. Candidato evaluado (SOLO candidato)
Noches libres en las seis unidades, sin cierre de recurso:
- **Pasadas:** 2026-10-15 (candidata), 2026-10-13, 2026-10-12. Sin efecto comercial.
- **Futuras:** 85 libres, **las 85 comercializables** (tienen disponibilidad ofertada): descartadas.
Ficticia: reserva `900000001`, habitacion 301, noche **2026-10-15** (15:00 -> 11:00 Bogota; 20:00Z -> 16:00Z), clave `SMOOBU-900000001:301:2026-10-15`. No tiene relacion con la reserva real 161419736.

## 4. ANTES / PROPUESTO / RIESGOS
| | ANTES | P0: borrador, 301, 2026-10-15 | P1: publicado, 301, 2026-10-15 |
|---|---|---|---|
| Turnos de 301 esa noche | 0 | +1 (borrador) | +1 (publicado) |
| Espejo en Casa (regla 169) | no hay | **no se crea** (exige published) | **se crea** (mismo intervalo, `x_bloqueo_ref`) |
| Automatizaciones que corren | — | 12 (sin cambios si las horas son correctas), 22 | 12, 22, 169 y, en cascada, 12/22 sobre el espejo |
| Disponibilidad (`x_availability`) | 301: 0 reservadas | oferta de 301: 0 -> 1 (fecha pasada) | ofertas de 301 y de Casa: 0 -> 1 |
| iCal publico | sin evento | **sin cambios** | 301: +1 evento; Casa: +2; visible en <= 5 min |
| Ordenes, contactos, correos | 0 | 0 (164/170/171 exigen `x_nobeds_id`) | 0 |
| Eco con Smoobu | — | no aplica | **no descartable** (turno "directo" en el .ics que consume NOBEDS/Worker) |
| Clave en el .ics | — | no sale | visible salvo token opaco |
| Reversible | — | si, con borrado manual autorizado | si, pero el borrado arrastra el espejo y refresca el .ics |
**Riesgos de P0:** el contador `x_availability` de una fecha pasada pasa a 1 (dato interno, sin venta); exige borrar luego. **Riesgos de P1:** salida a OTAs en <= 5 min por el cron 147, que no se puede neutralizar selectivamente (apagarlo corta la sincronizacion con OTAs/NOBEDS: prohibido), eco no descartable y sin staging para probarlo.

## 5. Seguridad (Fase 2)
- **Un turno por noche** sigue siendo el modo predeterminado; por estancia exige `allowStayMode:true` (bloqueado).
- **Clave privada sin crear campos** (`src/opaque-key.mjs`): `name` lleva `SM-` + 16 hex de HMAC-SHA256(sal, clave legible). Determinista (se recalcula desde Smoobu sin libro aparte), irreversible sin la sal, no revela la reserva en el .ics publico. Necesita un secreto nuevo `SMOOBU_KEY_SAL` (>= 16 caracteres), **no configurado**. `x_guest_id` y `res.partner` 7 descartados; `x_nobeds_id` prohibido.
- **Anti-eco** (`src/echo-guard.mjs`): se ignoran bloqueos/calendarios, el marcador `ODOO`, canales de calendario, reservas ya importadas y coincidencias exactas con turnos ajenos. La forma de las reservas de Smoobu no esta verificada (API 401). Control manual adicional: **no importar en Smoobu el calendario iCal de Odoo/NOBEDS**.
- **Liberar y borrar siguen bloqueados**: toda liberacion sale `BLOQUEADA`; no existe operacion de borrado; las pruebas verifican que un espejo (compartido o no) nunca es objetivo de una propuesta y que `assertNoDestructiveOps` rechaza cualquier otra cosa.

## 6. Matriz de autorizaciones (calculada, `src/authorization-matrix.mjs`)
| Op | Descripcion | Veredicto |
|---|---|---|
| P0 | borrador de 301 en noche pasada libre | **AUTORIZABLE CON APROBACION EXPRESA** |
| P1 | publicado de 301 | **PILOTO PRODUCTIVO NO SEGURO** |
| P2 | publicado de Casa | **PILOTO PRODUCTIVO NO SEGURO** |
| P3 | turno de cobertura de Casa | BLOQUEADA |
| P4 | modificar fechas | BLOQUEADA (espejo desfasado) |
| P5 | liberar con draft/cancelled | INEFICAZ Y BLOQUEADA |
| P6 | borrar turno propio | SOLO MANUAL, NUNCA AUTOMATICA |
| P7 | escribir `x_nobeds_id` | PROHIBIDA |
| P8 | escribir en Smoobu | BLOQUEADA (401) |

## 7. Operacion unica propuesta (P0) — NO ejecutada
- **Operacion:** crear UN `planning.slot`: rol 37, recurso 31, compania 5, `state='draft'`, 2026-10-15 20:00:00 -> 2026-10-16 16:00:00 (UTC), `name` = token opaco (o clave de prueba, porque un borrador no entra en el .ics), sin `x_nobeds_id`, sin `x_bloqueo_ref`, sin `x_guest_id`.
- **Efectos previstos:** automatizaciones 12 y 22; `x_availability` de la oferta de 301 para 2026-10-15 pasa de 0 a 1. Nada mas.
- **Verificacion posterior (solo lectura):** el turno existe con las horas exactas (12 no las reescribio); no hay espejo en Casa; el feed de 301 y el de Casa no cambian de tamano; no hay `sale.order`, `res.partner` ni `mail.mail` nuevos; `x_availability` = 1 solo en esa fecha.
- **Recuperacion:** borrar ese unico turno de forma manual y autorizada (dispara 23: la disponibilidad vuelve a 0; 158: refresca el .ics sin cambios; 168: sin espejos que borrar) y verificar por lectura.
- **Que demuestra y que no:** demuestra permisos de escritura, normalizacion de horas, enlace a la disponibilidad y ausencia de ordenes/espejos con borrador. **No demuestra** espejos, iCal ni eco (eso exige publicar) ni libera nada.

## 8. Conclusion
**PILOTO PRODUCTIVO PUBLICADO (P1/P2): NO SEGURO.** El control que falta es una forma de **sacar un unico turno del feed iCal sin tocar el cron 147 ni las reglas** (hoy un turno publicado "directo" siempre entra), o un entorno de prueba. Solo P0 es autorizable, con aprobacion expresa de Marlon, y no prueba la parte peligrosa. El conector NO esta operativo: la API de Smoobu sigue en 401 y no se ha probado ninguna escritura.
