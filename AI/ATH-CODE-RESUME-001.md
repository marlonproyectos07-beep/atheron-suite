# ATH-CODE-RESUME-001 — retoma técnica (sin tocar producción)

## 1. Auditoría del repo
- Rama `feature/ath-odoo-hotel-017-booking-airbnb-level1`; HEAD de partida `e123036` = el commit pedido; árbol limpio; sin commits pendientes de push; ramas remota y local alineadas.
- Pruebas disponibles: gateway `node --test` (integrations/odoo-hotel-gateway), sitio `npm run prueba` y `npm run comprueba`, `npm run build`.

## 2. Web Direct Booking (commit e123036) — PASS
Verificado leyendo el commit y el sitio construido: CTA global (cabecera, escritorio y móvil) → Beds24; hero y cierre de la home → Beds24; Hotel Atheron Suite (cabecera, hero, habitaciones) y su tarjeta del catálogo → Beds24; Casa Completa (ficha y detalle) y demás hospedajes → WhatsApp; `booking_request_click` (solo si gtag existe); URL única en `src/data/beds24.ts` con `propid=359051&lang=es`; los 42 enlaces del build llevan `&lang=es`. Build OK, 42/42.
Pendiente que sigue siendo externo: abrir el motor real (la sesión no llega a beds24.com).

## 3. `public/admin/config.yml`
Línea 45 ya es `branch: main`. No hubo nada que cambiar (no se tocó). **Ojo:** mientras no se haga el merge, `main` aloja el sitio antiguo; el panel `/admin` de esta rama escribiría ahí. Es el paso previo al merge que dirección ya ordenó.

## 4. OPS Dashboard (001 + 002 + esta misión)
Soporta: 5 habitaciones físicas; Casa Completa como recurso derivado (se expande a las 5, ocupación una vez); STAY; ROOM_SEGMENTS; FREE, OCCUPIED, ARRIVAL, DEPARTURE, HOLD, BLACKOUT, OVERBOOKING, ROOM_MOVE y **DAY_USE (nuevo)**.
DAY_USE: se detecta por salida == llegada o por la etiqueta `DAY_USE` / `USO TEMPORAL` en las notas (Beds24 puede exigir una noche). Es una estadía de 0 noches con un tramo en la fecha de uso; estado propio en la grilla; no cuenta como OCUPADA, llegada, salida ni confirmada de alojamiento; su saldo sí entra en SALDO PENDIENTE; si el huésped que pernocta esa noche está en la misma habitación → OVERBOOKING `DAY_USE_CHOCA_CON_ESTADIA`. No se conectó a producción ni a Beds24 (solo lectura, sin cambios).
Sigue PARTIAL en lo real: sin lectura Beds24 real ni Odoo STAGING (bloqueos de entorno de la 002).

## 5. Cierre diario (modelo STAGING) — `src/ops/daily-close.mjs`
Salida: ventas del día, dinero recibido, caja, banco, saldos huésped, Booking por cobrar, Airbnb por cobrar, egresos, diferencia vs Odoo.
- `PAYMENT_REPORTED != PAYMENT_CONFIRMED`: solo lo confirmado es dinero recibido/caja/banco y reduce saldo; lo reportado se lista aparte.
- Efectivo confirmado → diario `Efectivo_Atheron_Suite`; otro diario → advertencia (no se corrige solo). Pago confirmado sin medio o sin fecha → advertencia.
- Sin totales de Odoo → `SIN_DATOS_ODOO` (no se inventa); con ellos, diferencia por concepto y `cuadra`.
- Booking/Airbnb por cobrar = venta bruta − confirmado (la comisión real la fija el pago de la OTA; no se supone).
- **Caso de prueba (sintético, sin registrar nada):** walk-in, hab. 302, uso temporal, 11/10/2026, COP 100.000, confirmado, efectivo → venta 100.000, caja 100.000 en `Efectivo_Atheron_Suite`, saldo 0; si solo está reportado → recibido 0 y saldo 100.000.
- **Hipótesis a decidir:** reconocimiento de la venta de estadías largas: por noche (defecto, el médico suma 1.155.000 una sola vez) o entera en el check-in (`recognition: 'CHECKIN'`).
- Existe además `financial-model.dailyClose` (sobre reservas de Odoo); este modelo trabaja sobre estadías Beds24 y no lo sustituye.

## 6. Tests
Gateway 653/653 (642 base + 3 de la 002 + 8 nuevas); sitio 42/42; build OK; escaneo de secretos limpio.

## 7. Airbnb
Sin cambios: mapping bloqueado en Beds24 (soporte). No se trabajó ninguna API de Airbnb ni workaround.
