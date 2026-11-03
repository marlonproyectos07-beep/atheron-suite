# ATH-DEV-140 — Piloto aislado de contacto por WhatsApp

Estado: **desarrollo y simulación. No fusionado. Sin escrituras posibles hoy** (`PILOT_WA_ARMED = false`).

## Para qué

Probar, con UNA reserva real elegida por ID, que Odoo crea el borrador y la nota interna con el enlace `wa.me`, sin repetir
ATH-DEV-118 (ya ejecutado el 2026-10-31, COT/2026/03847, agotado) y sin tocar la sincronización programada.

## Aislamiento

| Tema | Piloto aislado (este) | Sincronización programada | Piloto ATH-DEV-118 |
|---|---|---|---|
| Interruptor | `PILOT_WA_ARMED` (constante, hoy `false`) | `SYNC_ARM` | `PILOT_ARMED` |
| Frase de armado | propia (`PILOT_WA_ARM_PHRASE`) | `SYNC_ARM_PHRASE` | `PILOT_ARM_PHRASE` |
| Tokens | `APROBADO-PILOTO-WA-<id>-<clave>-<huella>` y `APROBADO-ADMIN-WA-...` | no aplica | `APROBADO-PILOTO-...` |
| Bloqueo #101 / `SYNC_DESBLOQUEO` | no lo lee ni lo cambia | lo respeta | no aplica |
| Selección de reserva | **por ID** (`PILOT_WA_ID`) | imposible | por clave |
| Disparo | solo `workflow_dispatch`, sin `schedule` | cron | manual |

El workflow `smoobu-odoo-pilot-wa.yml` no usa `SYNC_*`, no tiene permiso de escritura en el repositorio ni en incidencias. Ninguna
frase ni token de otro mecanismo arma este cliente (probado).

## Qué se valida antes de escribir (18 controles, todos deben dar OK)

Selección única en el plan · operación CREATE_ORDER lista · token de gerencia ligado al estado actual de la reserva · token de
administrador si la clave lo es · reserva vigente · teléfono válido (E.164) e igual al del plan · enlace WhatsApp posible ·
llegada futura con **margen de 7 días** (`PILOT_WA_MIN_DAYS`) · habitación · fechas · importe coherente (Booking: base + impuestos) ·
sin pedido duplicado en Odoo · sin conflicto con otras reservas del plan ni con **Casa Completa** · sin conflicto con pedidos ya
existentes en Odoo (también borradores) · disponibilidad · identidad del contacto · tope de 3 escrituras.
Si una lectura es incompleta, se detiene. Si cualquier control falla: 0 escrituras.

## Límites que se conservan

- 3 escrituras como máximo: `res.partner.create`, `sale.order.create` (borrador, sin impuestos) y `message_post` interno.
- Nunca confirma, cancela, modifica, factura, cobra, borra ni crea turnos. Nunca envía mensajes: el chat se abre con un clic y envía una persona.
- La nota solo es válida si es de esa reserva, HTML con **una** ancla `wa.me` cuyo número es el del huésped.
- El cliente queda **consumido** tras el primer uso o ante cualquier error; repetirlo no duplica (lectura previa) y la recuperación cierra INTENT sin borrar nada.
- Los pedidos históricos (COT/2026/03847 y 03848) no se leen para escribir ni se modifican.

## Procedimiento exacto

**A. Elegir la reserva (solo lectura).** Criterios: directa o Airbnb con teléfono; llegada ≥ 7 días; una habitación (no Casa Completa);
sin otra reserva solapada. Obtener su ID de Smoobu (solo dígitos, 6–12).

**B. Simular (sin riesgo).** Actions → *Piloto aislado WhatsApp* → Run workflow: `reservation_id` = ID, `modo` = **simulacion**, `min_days` = 7.
Lee Smoobu y Odoo, no escribe nada. El resumen muestra la lista de controles (`OK` o el código del fallo), los hechos de la nota
(`anchors:1, host:wa.me, phoneMatches:true`), y los **dos tokens** que gerencia debe dar (el de administrador solo si aplica).
Si algún control falla o sale `PILOTO_NO_APTO`, elegir otra reserva: no se continúa.

**C. Autorizar (gerencia).** Gerencia revisa B y responde por escrito con el ID y los tokens exactos. Si la reserva cambia en Smoobu
(precio, fechas, teléfono) los tokens dejan de valer: repetir B.

**D. Armar (PR aparte, fusión por orden de gerencia).** Un PR que cambie solo `PILOT_WA_ARMED = true` y una ventana
`PILOT_WA_NOT_BEFORE/AFTER` de **máx. 15 minutos**. Gerencia crea la variable `PILOT_WA_ARM` con la frase propia. No se tocan `SYNC_*` ni #101.
El usuario técnico/credenciales de escritura de Odoo los provee gerencia; no se generan aquí.

**E. Ejecutar una vez.** Dentro de la ventana: Run workflow con el mismo ID, `modo` = **real**, `approval` y `admin_approval`.
Resultado esperado: `APLICADA`, pasos `partner.create, sale.order.create, note`, 3 escrituras.

**F. Verificar.** Abrir el borrador en Odoo: estado borrador, sin factura ni pago, sin turno; en el chatter, la nota con "Abrir chat de WhatsApp"
clicable que abre el chat con el mensaje escrito. Confirmar que COT/2026/03847 y 03848 no cambiaron. No enviar el mensaje salvo decisión de gerencia.

**G. Desarmar.** Revertir `PILOT_WA_ARMED = false` y la ventana a `null` (PR), borrar la variable `PILOT_WA_ARM`. Si algo falló: `FALLO_PARCIAL`,
no reintentar; revisar el diario (artefacto) y corregir a mano; el cliente ya está consumido.

## Riesgos conocidos

- La nota con `wa.me` y la lectura del diario contienen datos del huésped: solo internos, nunca en reportes públicos (el script publica hechos, no PII).
- Booking casi nunca trae teléfono: esas reservas no son aptas para esta prueba.
- El enlace de check-in no llega por la API en la reserva observada: el mensaje saldrá sin él.
- Que el enlace sea clicable en Odoo está probado por código y pruebas; la primera comprobación en pantalla es el paso F.
- La ventana de conflictos en Odoo lee hasta 50 pedidos; si hay más, se detiene (`LECTURA_INCOMPLETA`).

## Pruebas

`test/sync-pilot-wa.test.mjs` (21 pruebas, datos sintéticos): simulación completa con 0 cambios en Odoo; cada fallo de verificación previa
(teléfono vacío/sin país/distinto, llegada pasada/< 7 días, cancelada, habitación, fechas, importe, duplicado, Casa Completa, misma
habitación); selección única y ejecución solo de la elegida; tokens (los del piloto anterior no valen, cambio de estado los invalida, doble
aprobación); borrador completo con nota HTML y consumo; alcance (otra reserva, otro número, nota sin `wa.me`); recuperación sin duplicados;
desarmado (0 llamadas de red); aislamiento del workflow y de los módulos; privacidad. Suite completa: 397/397.
