# ATH-ODOO-HOTEL-008 — Mapa unico OTA <-> Odoo

> Creado 2026-09-29 durante la auditoria ATH-ODOO-HOTEL-008 (recuperacion +
> auditoria real OTA <-> Odoo). Fase D de la orden.
>
> Regla de esta tabla: una celda solo lleva un valor si hay evidencia
> verificada (codigo, respuesta real de Odoo, o lectura de pantalla en
> Booking/Airbnb/Odoo). Si no hay evidencia, la celda dice `PENDIENTE` — no
> se inventa ningun ID, nombre ni estado. Ver tambien
> `AI/ATH-ODOO-HOTEL-008A_HANDOFF.md`, `AI/ATH-ODOO-HOTEL-008A_CHECKPOINT_2026-09-28.md`
> y `AI/ODOO_HOTEL_PROMOTION_MANIFEST.md` (fila 7 del inventario) para el
> origen de cada dato.

## Hallazgo previo (corregido tras auditoria en vivo 2026-09-29)

No existe en el repositorio `atheron-codex` (`integrations/odoo-hotel-gateway`)
ningun conector API/iCal hacia Booking.com o Airbnb: ese gateway es una capa
tecnica entre agentes IA (Sofia/Claude/ChatGPT/Codex) y el motor de precios
de Odoo, sin relacion con OTAs.

**Pero SI existe un conector real, dentro de Odoo mismo, fuera de este
repositorio**: el modulo/automatizacion **NOBEDS** (menu `Reservacion >
Reservas OTA (NOBEDS)`, accion Odoo `action-1847`). Segun su propio texto de
ayuda en pantalla: "Aqui ves TODOS los bloques que entraron desde NOBEDS
(Airbnb/Booking/etc.), identificados por `x_nobeds_id` y sin orden de
venta... si cancelaste/eliminaste una reserva en NOBEDS pero el bloque sigue
aqui (NOBEDS no lo solto de su iCal), [...] el Worker deja de re-importarlo."
Esto confirma: **sincronizacion via iCal, con un worker periodico**, no via
API de Booking/Airbnb. El 2026-09-29 esta bandeja mostraba 0 bloques
huerfanos (no es evidencia de que la sincronizacion este sana en general,
solo de que no hay fantasmas pendientes de limpiar hoy).

No se pudo confirmar en esta sesion si NOBEDS es un modulo de terceros
instalado, un desarrollo a medida, ni donde vive su codigo (no esta en
`atheron-codex`) — **PENDIENTE**, requiere acceso a Ajustes > Apps en Odoo
o preguntar a quien lo instalo.

Aparte de NOBEDS, las reservas de Kevin, Jhon, Blanca y Monica (ver casos
abajo) SI aparecen como `sale.order` reales en Odoo con los montos y fechas
correctos — pero coinciden con los mismos IDs de cotizacion que ya trajo la
orden de Marlon, consistente con carga manual de recepcion o con NOBEDS
generando el bloque y recepcion completando la venta. No se pudo distinguir
el mecanismo exacto sin abrir cada `sale.order` uno a uno (no se hizo por
limite de tiempo de esta sesion).

## Tabla por unidad

| Unidad | OTA Property/Listing ID (Booking) | OTA Room ID (Booking) | Listing ID (Airbnb) | Nombre publicado OTA | Unidad Odoo (unit_id, staging) | Producto/Resource Odoo | Planning Resource | Tipo de inventario | Sincronizacion actual | Estado | Evidencia | Pendiente |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 201 | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | 1 | `resource.resource` (asumido, ver manifiesto fila 7) | PENDIENTE | Habitacion individual | NINGUNA (no hay conector OTA) | NO_EXISTE (conexion OTA) / PROBADO (Odoo interno) | HOLD 22216 real contra unit_id 1, `AI/ODOO_HOTEL_PROMOTION_MANIFEST.md` fila 7 | Confirmar Booking/Airbnb en navegador |
| 202 | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE (no confirmado desde este repo) | PENDIENTE | PENDIENTE | Habitacion individual | NINGUNA | NO_VERIFICADO | — | unit_id real + Booking/Airbnb |
| 203 | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | Habitacion individual | NINGUNA | NO_VERIFICADO | — | unit_id real + Booking/Airbnb |
| 301 | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | Habitacion individual | NINGUNA | NO_VERIFICADO | — | unit_id real + Booking/Airbnb |
| 302 | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | Habitacion individual | NINGUNA | NO_VERIFICADO | — | unit_id real + Booking/Airbnb |
| CASA COMPLETA | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | Unidad compuesta (bloquea 201/202/203/301/302 y viceversa) | NINGUNA | PROBADO (regla anti-overbooking interna Odoo) / NO_VERIFICADO (lado OTA) | gate4 (hold_id 22219) e inverse-gate (hold_id 22220) del checkpoint 2026-09-28: regla de bloqueo cruzado confirmada dentro de Odoo | Confirmar que Booking/Airbnb respetan esta regla o si dependen de bloqueo manual |

## Canales fuera de OTA

| Canal | Conectado a Odoo | Como | Evidencia |
|---|---|---|---|
| Web (hotelesatheron.com) | NO_VERIFICADO | — | Fuera del alcance de este gateway |
| WhatsApp / Sofia | SI (parcial) | Via `integrations/odoo-hotel-gateway` (`availability/quote/hold/status`), probado contra staging, pendiente promocion a produccion | `README.md`, `AI/ODOO_HOTEL_PROMOTION_MANIFEST.md` |
| Recepcion / manual | PROBABLE (no verificado en esta sesion) | Carga manual directa en Odoo | Hipotesis a confirmar en navegador |

## Casos verificados en vivo (2026-09-29, solo lectura)

### Camilo (Airbnb, habitacion 301)

- Listing Airbnb: "Smart Suite+WiFi+Alexa, close salt mine @Zipaquira",
  nombre interno `Marlon301(PUBLI)573188983167`, **listing ID
  `1057232086445101786`**, mapea a habitacion 301 (confirmado por el
  listado de anuncios de Airbnb).
  - Habitacion 302 = listing separado "habitacion 302 baño privado" /
    `Marlon302(PUBLI)573188983167`. 201/202/203 tienen sus propios listings
    individuales tambien.
- Huesped: Camilo Ochoa (+1 acompanante, 2 huespedes). Confirmacion Airbnb
  `HM4D9HFYRW`. Reserva creada (Booking date) domingo 27 sep 2026. Check-in
  lunes 28 sep 3:00pm, check-out martes 29 sep 11:00am (1 noche). Politica
  de cancelacion: Flexible.
  - Ingreso bruto: COP 150.000. Tarifa de servicio Airbnb: -COP 27.667,50.
    **Payout neto: COP 122.332,50**, programado para 29 sep 2026 (mismo dia
    del check-out) via Airbnb Payouts -> cuenta "Atheron Suite, Savings
    0136 (COP)".
  - **NO_VERIFICADO en Odoo**: no aparece como `sale.order`/cotizacion en el
    tablero de Reservacion > Ordenes cerca de esas fechas (se revisaron las
    cotizaciones con check-in 25-29 sep 2026 y no aparece "Camilo"). Puede
    ser que aun no se haya cargado (checkout fue hoy mismo) o que el
    flujo NOBEDS no genero sale.order para esta reserva. **Pendiente de
    confirmar con Marlon/recepcion.**

### Casa Completa — riesgo de overbooking real (Booking.com)

Booking.com opera **Casa Completa como un establecimiento propio**
("Atheron Grand House Zipaquira de 10 a 20 personas", `hotel_id 16569053`),
separado del establecimiento "Hotel Atheron Suite" (`hotel_id 16559325`,
habitaciones individuales). **Los dos calendarios no estan enlazados entre
si del lado de Booking** — cada uno se vende independientemente.

Se encontraron 3 reservas de Casa Completa en Booking (ago-sep 2026):

| Huesped | Fechas | Adultos | Estado | Importe | Reserva | Creada |
|---|---|---|---|---|---|---|
| Jesus Alfredo Barranco Leon | 2-4 ago 2026 | 16 | **Cancelada por el cliente** | COP 1.280.000 | 5445429001 | 6 jun 2026 |
| Mia Walton | 10-17 ago 2026 | 2 | **Cancelada** | COP 4.200.000 | 6099472779 | 16 jul 2026 |
| Paola Largo | 28-29 sep 2026 | 12 | OK (en curso) | COP 700.000 | 6634915879 | 27 sep 2026 |

**Riesgo de overbooking confirmado con evidencia real**: durante la ventana
de Mia Walton (Casa Completa, 10-17 ago 2026, luego cancelada), Booking
vendio **por separado, con estado OK**, la habitacion 302 individual
(huesped Jackeine Rengifo, 11-12 ago 2026, reserva 5622919983, "HABITACION
302 CAMA DOBLE BAÑO PRIVADO Y SOFA CAMA") y tambien la 302 el 13-14 ago
(Rendon Lukas, reserva 6318154187, OK). Es decir: **mientras Casa Completa
estaba vendida en Booking, la 302 tambien se vendio en Booking como unidad
suelta para noches dentro de esa misma ventana** — el riesgo de
overbooking es real y esta confirmado, no es solo una sospecha del CEO. En
este caso puntual no se materializo un huesped duplicado en el lugar
porque la reserva de Casa Completa termino cancelada antes del check-in,
pero la causa raiz (dos calendarios de Booking sin bloqueo cruzado) sigue
activa hoy.

Para la ventana de Jesus Alfredo (2-4 ago 2026, 16 adultos, cancelada) no
se encontro ninguna reserva individual de habitacion en Booking para esas
mismas fechas — en ese caso puntual no hubo doble venta detectable del
lado de Booking.

**No se pudo confirmar todavia** cual de estos 3 casos es exactamente el
que describio Marlon ("solo quedaba libre la 202") sin mas detalle de
fecha de su parte; el patron de riesgo mas fuerte con evidencia real es el
de Mia Walton + habitacion 302.

## Proximo paso

Completar cada `PENDIENTE` con lectura autenticada de solo-lectura en
Booking Extranet, Airbnb host y Odoo produccion (bloqueado hasta que exista
sesion de navegador — ver reporte principal de esta tarea).
