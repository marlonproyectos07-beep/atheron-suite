# Informe de la ejecucion P0 (ATH-DEV-018) — 2026-10-26

**RESULTADO FINAL: REQUIERE RECUPERACION.** El turno se creo, pero quedo **publicado** (no en borrador), la regla 169 creo un espejo en Casa y ambos aparecen en los .ics publicos. Segun el protocolo se detuvo toda operacion y **NO se borro nada**. Pendiente de decision humana.

## PRECHECK: APROBADO
[Run 40409776452](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/40409776452) (solo lectura) y repetido dentro de la ejecucion. Todo en verde: objetivo `atheron1.odoo.com` / `atheron1`; usuario interno activo **uid 2** (la API key es la del usuario administrador: privilegio alto, riesgo aparte); compania 5; esquema de `planning.slot` exacto (obligatorios `access_token`, `company_id`, `repeat_unit`; `state` draft/published; campos a escribir editables); rol 37 = 301, sala, recurso 31 material de la compania 5; ventana 15-16 oct sin turnos en los seis roles ni espejos de Casa; sin cierres ni lineas de pedido activas; marcador inexistente; 13 automatizaciones activas sobre `planning.slot`, dominios evaluados con el codigo VIVO: al crear un borrador solo se dispararian 12 y 22 (157 sin acciones), cadena de codigo sin HTTP/correo/ventas/iCal; al borrar, 23/158/168 con 168 limitado a espejos por `x_bloqueo_ref`. Linea base: turnos 601, rol 37: 85, pedidos 1440, contactos 2727, correos 5084.

## Escritura unica: [run 40409863117](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/40409863117), 22:06:58 UTC
Una creacion de `planning.slot` con los valores autorizados exactos (rol 37, recurso 31, compania 5, `state='draft'`, 2026-10-15 20:00:00 -> 2026-10-16 16:00:00 UTC, marcador de prueba; sin `x_guest_id`, `x_nobeds_id`, `x_bloqueo_ref`). **ID creado: 39686.** No hubo ninguna otra escritura.

## Lo OBSERVADO (no simulado), lecturas de las 22:08 y 22:09 UTC ([evidencia 1](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/40410104975), [evidencia 2](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/40410213051))
| Aspecto | Esperado (prediccion) | Observado |
|---|---|---|
| Estado del turno 39686 | draft | **published** (creado y escrito a las 22:06:58) |
| Resto de campos | exactos | exactos (rol, recurso, compania, fechas, marcador); sin huesped, canal, pedido ni `x_nobeds_id` |
| Espejo de Casa (regla 169) | ninguno | **turno 39687**, rol 69, recurso 79, mismas fechas, `x_bloqueo_ref = '39686'` |
| Turnos totales | +1 | **+2** (603); rol 37: +1 (86) |
| Disponibilidad 301 (2026-10-15) | 0 -> 1 | 0 -> 1 (oferta 12136); recalculo pendiente: 0 |
| Pedidos, contactos, correos, mensajes | sin cambios | **sin cambios** (1440 / 2727 / 5084; 0 mensajes) |
| .ics publicos | sin cambios | **el marcador aparece en los feeds del rol 37 (301) y del 69 (Casa)** tras el refresco de las 22:08:16 |

## Por que se publico (causa probable, a confirmar)
El rol 37 tiene `sync_shift_rental = true` (leido): en Odoo los turnos de roles sincronizados con alquiler se publican al crearse aunque se pida `draft`. Los 409 turnos historicos estan todos publicados por lo mismo. **La prediccion de los informes ATH-DEV-016/017 ("un borrador se queda en borrador y no genera espejo") era una SIMULACION y quedo REFUTADA por la observacion.** La matriz de autorizaciones se corrigio: P0 ya no es autorizable.

## Efectos externos
- No hay correos, pedidos ni contactos nuevos.
- **Si hay publicacion externa:** el cron 147 regenero los .ics publicos y contienen el evento ficticio (noche **pasada**, 2026-10-15) con el texto del marcador en el SUMMARY, tanto en el feed de 301 como en el de Casa. Las OTAs ignoran fechas pasadas y el marcador `ODOO` es el filtro anti-eco de NOBEDS, pero el comportamiento del Worker con este evento no esta demostrado. Cada refresco (5 min) lo mantiene hasta que se retire el turno.
- Booking, Airbnb y Smoobu no se tocaron. Las reglas 167/169 y el cron 147 no se modificaron.

## Por que no se retiro (Fase 4)
Condiciones de retirada: ID exacto ✔; **"sigue en draft" ✘** (esta publicado); no alcanzar registros preexistentes ✔ (la ventana solo tenia nuestros dos turnos); pero el borrado dispara la regla 168 que **borra tambien el espejo 39687** (un segundo registro que no creo directamente esta operacion). Por la instruccion de no ejecutar un borrado ciego ante un efecto inesperado, se detuvo.

## Recuperacion lista (NO ejecutada) — requiere decision del CEO
Modo `recover` del workflow `smoobu-odoo-p0` (codigo en `runRecovery`, probado con datos simulados): exige la frase `ATH-DEV-018-RETIRAR-39686-Y-SU-ESPEJO`; solo puede borrar el id **39686** (no puede crear nada); antes verifica que el turno es exactamente el P0, que el unico turno que lo referencia es 39687 (rol 69, mismas fechas) y que no hay nada mas en la ventana; si no, no escribe. Tras el borrado, la regla 168 retira 39687, la 23 recalcula la disponibilidad y la 158 regenera los .ics; el modo verifica que ambos turnos desaparecieron, que los contadores vuelven a 601 / 85 / 1440 / 2727 / 5084, que la disponibilidad vuelve a 0 y consulta si algun .ics conserva el marcador (se limpia en el siguiente refresco, <= 5 min).
**Riesgo residual mientras no se retire:** un evento ficticio de una noche pasada visible en dos feeds iCal publicos; dos turnos publicados de prueba en produccion (contadores historicos de disponibilidad de una fecha pasada).

## Lecciones
1. Un borrador no es posible en roles con `sync_shift_rental`: no existe una operacion de escritura de un turno que evite 169 y el iCal.
2. Toda prediccion por lectura de codigo debe validarse antes de una escritura; faltaba leer `sync_shift_rental` y la logica de `create` de planning (no es una automatizacion visible).
3. La API key actual es la de un administrador: crear un usuario tecnico de minimo privilegio antes de cualquier otra escritura.

---
# Recuperacion autorizada (frase `ATH-DEV-018-RETIRAR-39686-Y-SU-ESPEJO`) — 2026-10-26

Ejecucion: [run 40412139111](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/40412139111) (modo `recover`, 22:24:19 UTC). Verificacion de solo lectura: [run 40412860666](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/40412860666) (22:29:53 UTC).

**Comprobaciones previas (todas verdaderas):** 39686 era exactamente el piloto (rol 37, recurso 31, compania 5, 2026-10-15 20:00 -> 2026-10-16 16:00 UTC, marcador exacto, sin huesped/canal/pedido/`x_nobeds_id`/`x_bloqueo_ref`); 39687 era el unico turno con `x_bloqueo_ref='39686'` (rol 69, fechas identicas); no habia nada mas en la ventana.
**Escritura:** un solo borrado, del id 39686. La regla 168 retiro el espejo 39687.

| Comprobacion | Resultado (22:29:53 UTC) |
|---|---|
| 39686 y 39687 existen | **no** (ambos desaparecieron) |
| Turnos totales / rol 37 | 601 / 85 = linea base |
| Ventana 15-16 oct | vacia; sin espejos del id |
| .ics publicos (301 y Casa) | **marcador ausente**; refrescados 22:28:13 por el cron 147 (sin invocarlo); Casa 101 008 bytes = tamano previo al piloto |
| Disponibilidad 301, 2026-10-15 | **booked sigue en 1 con recalculo pendiente** (y el 16 tambien marcado pendiente); aun no se ha ejecutado el recalculo del Booking Engine disparado por la automatizacion 23 |
| Ventas / contactos / correos | +1 / +2 / +3 frente a la linea base, **creados entre 22:17 y 22:23, es decir despues de la creacion y ANTES de la retirada** (sin relacion con el turno: la cadena de codigo no crea ventas, contactos ni correos y el turno no tenia pedido). Los 3 correos estan en estado `exception` (no se enviaron). Parecen actividad real del negocio; no se puede probar causa por lectura |

**Resultado: RECUPERACION PARCIAL.** Registros y feeds restaurados; falta solo que el Booking Engine recalcule la disponibilidad historica (contador de una fecha pasada). No se invoco ningun cron ni se toco nada mas. Siguiente paso sin intervencion: esperar el cron del Booking Engine y confirmar por lectura; si no se corrige, decision humana (recalculo desde Odoo) o autorizacion expresa.
