# ATH-OPS-DASHBOARD-001 — Centro de Operaciones Atheron (Beds24 solo lectura → tablero)

Rama: `feature/ath-odoo-hotel-017-booking-airbnb-level1`. Sin tocar Producción, Beds24 (escritura), OTA ni Odoo.

## 1. Veredicto honesto: DASHBOARD_GATE = PARTIAL

Lo que **sí** está hecho y probado en local con datos sintéticos: el modelo, el adaptador de solo lectura, la consolidación de estadías maestras, el tablero (HTML renderizado), el caso médico y 17 pruebas nuevas (suite completa: 642/642).
Lo que **no** se pudo hacer desde este entorno: leer Beds24 real (no hay token ni se debe pegar en el chat) y crear los modelos/vistas dentro de Odoo STAGING (sin acceso). Por eso «disponibilidad real desde Beds24» y «tablero en Odoo STAGING» quedan **PENDIENTES**, no aprobados.

| Condición del gate | Estado | Evidencia |
|---|---|---|
| Disponibilidad real desde Beds24 | **PENDIENTE** (adaptador listo, sin lectura real) | `src/ops/beds24-readonly.mjs`; test con transporte simulado |
| Reservas OTA visibles | VERIFICADO sintético | test «OTA y directas visibles» (BOOKING/AIRBNB) |
| Reservas directas visibles | VERIFICADO sintético | ídem (DIRECT) |
| Rotación de habitaciones visible | VERIFICADO sintético | test «rotación» y «grilla» (ROOM_MOVE 203→EXTERNO→302) |
| Médico consolidado como una estadía | VERIFICADO sintético | test «médico: UNA estadía…» |
| Saldo correcto | VERIFICADO sintético | tests de pago reportado vs confirmado |
| Ninguna escritura en Beds24 | VERIFICADO por construcción y prueba | transporte solo GET + lista cerrada de rutas + test de escaneo del código |
| Producción intacta | VERIFICADO | solo archivos nuevos bajo `integrations/` y `AI/`; sin merge a main ni cambios de config |

## 2. Arquitectura

```
Booking ─┐
Airbnb  ─┼→ Beds24 (GET) → Adaptador solo lectura → normalizeBeds24Booking
Directas ┘                                            │
Registro maestro (x_hotel_master_stay) ─┐              ▼
Libro de pagos CONFIRMADOS (Odoo) ──────┴→ consolidateStays → buildOps → HTML / payload del tablero
```

Archivos (todos nuevos, `integrations/odoo-hotel-gateway/`):
`src/ops/config.mjs` (IDs 359051 y rooms 740215–740221, ya documentados en 031) · `beds24-readonly.mjs` · `master-stay.mjs` · `ops-board.mjs` · `render-html.mjs` · `dates.mjs` · `scripts/ops-dashboard.mjs` · `test/ops-dashboard.test.mjs` · `test/fixtures/ops-medico.mjs`.
Se **reutiliza** `angela-board-model.mjs` (ventanas HOY/MAÑANA/7 DÍAS/MES, orden de la fila KPI, filtro de registros QA) para no abrir una segunda definición de KPI.

## 3. Modelo de datos (especificación para Odoo STAGING; no creado)

Odoo es la capa de operación/finanzas; Beds24 sigue siendo la única fuente de reservas y disponibilidad. Odoo **no** guarda una copia editable de reservas: guarda lo que Beds24 no tiene.

**`x_hotel_master_stay`** (estadía comercial) — `x_ref` (único, p. ej. ATH-STAY-MEDICO-OCT2026-001), `x_guest`, `x_source`, `x_nights`, `x_nightly_rate`, `x_total_sale`, `x_currency`, `x_notes`.
**`x_hotel_stay_member`** — `x_stay_id`, `x_kind` (BEDS24 | EXTERNAL), `x_beds24_booking_id` (solo BEDS24), `x_label`, `x_checkin`, `x_checkout`, `x_charge` (solo EXTERNAL). Los tramos de habitación **no** se duplican: las fechas y la habitación se leen de Beds24 en cada refresco.
**`x_hotel_stay_installment`** — `x_stay_id`, `x_seq`, `x_amount`, `x_due_date`.
Pagos confirmados = `account.payment` en estado `paid` (regla ya usada en `odoo-reporting-reader`), vinculados a la estadía y, si aplica, a `beds24PaymentId`.
El tablero consume una **caché de solo lectura** del último refresco (id Beds24, fechas, habitación, estado, cargos, pagos reportados); se reconstruye entera en cada lectura, nunca se edita a mano.

Reglas de integridad: un `bookingId` pertenece a una sola estadía; una estadía solo cuenta **una** vez su huésped, su venta, su saldo y sus noches; los tramos no se solapan y no deben tener huecos (se avisa); `x_total_sale` del registro manda sobre la suma de cargos y toda diferencia se avisa (`TOTAL_DISCREPANCIA`).

## 4. Normalización multi-reserva → MASTER_STAY_REFERENCE

Orden (gana la primera que aplique): 1) registro maestro; 2) etiqueta `ATH-STAY-…` en `apiReference` o notas de Beds24; 3) `masterId` nativo de Beds24; 4) reserva suelta. **Nunca se funde por nombre del huésped**: lo que parece continuación se reporta como `POSIBLE_CONTINUACION`. Etiqueta sin registro → `MASTER_SIN_REGISTRO` (el total y el plan de pagos quedan sin verificar). Operativamente: Ángela escribe la etiqueta en las notas de cada reserva Beds24 del tramo.

## 5. Reglas financieras y de ocupación (implementadas)

- `PAYMENT_REPORTED ≠ PAYMENT_CONFIRMED`. Los pagos que trae Beds24 entran como **REPORTADOS** y **no** restan. Solo los del libro de Odoo (o `paymentPolicy: 'CONFIRMED'` si dirección lo decide) restan. Un pago no se cuenta dos veces (por id).
- `SALDO = VENTA_TOTAL − PAGO_CONFIRMADO` (mínimo 0; el sobrepago se informa aparte). Cuotas: los pagos confirmados cubren las cuotas en orden; vencida si `due_date < hoy`.
- OTA confirmada = ocupación real. BLACKOUT = BLOQUEADA, no ocupada. HOLD = nota «HOLD hasta AAAA-MM-DD HH:MM» (procedimiento de ATH-BEDS24-GO-LIVE-QA-001); vencido deja de bloquear; HOLD sin vencimiento se avisa.
- Casa Completa (room 740221) se expande a las 5 físicas: ocupa cada una **una vez**; si choca con una habitación vendida → sobreventa.
- Cada habitación-noche cae en **una** categoría (OCUPADA > HOLD > BLOQUEADA > DISPONIBLE), de modo que la suma siempre cierra con la capacidad.
- Un cambio de habitación es `ROOM_MOVE`: **no** cuenta como llegada ni salida; LLEGADAS/SALIDAS/CONFIRMADAS cuentan estadías, no segmentos.

## 6. Caso piloto: médico

21 noches × 55.000 = 1.155.000 · 203 (11→17 oct, 6 n) · EXTERNAL (17→18, 1 n) · 302 (18 oct→1 nov, 14 n) · 2 cuotas de 577.500 (2.ª el 19 oct).
Resultados de las pruebas: 1 estadía, 3 segmentos, venta contada una vez; cargos 330.000+55.000+770.000 cuadran con el total; con solo pago reportado el saldo es 1.155.000, con la 1.ª cuota confirmada es 577.500 y el próximo pago es 2026-10-19 (vencido a partir del 20); el 12 oct «habitación actual 203, siguiente EXTERNO el 17 oct»; el 17 «EXTERNO → 302 el 18»; esa noche 203 y 302 quedan disponibles; KPI de llegadas/salidas = 0 en los cambios y 1 el 11 oct (llegada) y el 1 nov (salida).
Capturas: `AI/ATH-OPS-DASHBOARD-001_evidence/tablero-2026-10-11.png` y `…-10-16.png` (HTML incluido).

## 7. Supuestos y pendientes (HIPÓTESIS hasta una lectura real autorizada)

1. Nombres de campos de la API v2 (`arrival`, `departure`, `roomId`, `masterId`, `apiReference`, `invoiceItems[type=charge|payment]`, `channel`, parámetros `departureFrom/arrivalTo/includeInvoiceItems/page`) tomados de la documentación general, **no verificados** contra la cuenta. Primer paso al tener token: `--live` en un rango pequeño y revisar `anomalías`.
2. `new`/`request` se tratan como bloqueantes **no confirmadas** (comportan como HOLD).
3. En el piloto, la fecha de la 1.ª cuota no fue informada → `null` (`SIN_FECHA`); y no se sabe si el primer pago está confirmado: el tablero lo trata como **reportado** hasta que Odoo lo confirme.
4. La noche EXTERNAL se factura (55.000) pero no ocupa habitación Atheron; SALIDAS usa la salida **global** de la estadía (1 nov). Si dirección prefiere contar la salida de Atheron el 17 oct, es un cambio de una línea.
5. El token se lee **solo** de `BEDS24_TOKEN` en el entorno; no se guarda ni se imprime. Aún no se pide `write:bookings` (no hace falta).
6. No se instaló nada en Odoo STAGING ni se enlazó el HTML a una ruta del Gateway: requiere acceso y autorización.

## 8. Cómo ejecutarlo

```bash
cd integrations/odoo-hotel-gateway
node --test                                    # 642 pruebas
node scripts/ops-dashboard.mjs --fixture medico --as-of 2026-10-16 --out salida.html
BEDS24_TOKEN=… node scripts/ops-dashboard.mjs --live --as-of 2026-10-16 --registry registro.json --ledger pagos.json --out salida.html
```

## 9. Decisiones que necesito de Marlon

1. Autorizar una **lectura real** (token de solo lectura, `read:bookings`) para validar los campos y cerrar «disponibilidad real».
2. Dar acceso/autorización para crear en Odoo STAGING los 3 modelos de §3 y publicar el tablero (o aprobar servirlo desde el Gateway).
3. ¿Los pagos anotados en Beds24 cuentan como confirmados o solo los de Odoo? (hoy: solo Odoo).
4. Fecha y estado de la 1.ª cuota del médico.
