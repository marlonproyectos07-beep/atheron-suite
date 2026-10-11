# ATH-OPS-DASHBOARD-002 — Lectura real de Beds24 y despliegue en Odoo STAGING

## 1. Estado: BLOQUEADO en lectura real y en despliegue (por entorno, no por código)

| Requisito | Estado | Causa exacta |
|---|---|---|
| Lectura real Beds24 | **BLOQUEADO** | (a) no existe en el entorno ninguna variable/secret de Beds24: falta **`BEDS24_TOKEN`** (token de **solo lectura**, scope `read:bookings`, propiedad 359051); (b) el host **`beds24.com`** responde `403` en el túnel del proxy (política de red de la sesión) |
| Odoo STAGING `atheron1-hotel-staging-20261009` | **BLOQUEADO** | el host `atheron1-hotel-staging-20261009.odoo.com` no es alcanzable desde la sesión (sin respuesta) y no hay credenciales Odoo en el entorno (tampoco variable de usuario/clave/API key) |

Cómo desbloquear (sin pegar nada en el chat): en el menú del entorno cloud → Edit → **Network access**: permitir `beds24.com` y `atheron1-hotel-staging-20261009.odoo.com`; y en **Environment variables / Network secrets**: añadir `BEDS24_TOKEN` (solo lectura) y, para Odoo, las variables que se decidan (propongo `ODOO_STAGING_URL`, `ODOO_STAGING_DB`, `ODOO_STAGING_USER`, `ODOO_STAGING_API_KEY`). Una sesión nueva las recoge. No se han simulado resultados reales: **ningún dato de este documento proviene de Beds24 real**.

## 2. Lo que sí queda hecho y probado (645/645; 642 previos + 3)

- `scripts/ops-beds24-probe.mjs`: lectura real **solo GET** → informe JSON con **inventario de campos (nombre y tipo, nunca valores)**, total de reservas reales y campos esperados ausentes. Sin `BEDS24_TOKEN` sale con código 3 diciendo qué variable falta (probado).
- `src/ops/field-probe.mjs`: `inventoryFields` / `missingExpectedFields`.
- Pruebas nuevas: sonda sin token; inventario sin valores personales; caso médico con las cifras reales dadas por dirección.
- Seguridad de solo lectura (de 001, vigente): el transporte rechaza POST/PUT/PATCH/DELETE y rutas fuera de lista; un test escanea `src/ops` buscando métodos de escritura. Escrituras Beds24 = 0; OTA = 0; Producción = no tocada.

## 3. Hallazgo de modelado con las cifras reales del médico

Con #94515854 (203, 11→17 oct) = **385.000** y #94517233 (302, 18 oct→1 nov) = **770.000**, la suma ya es 1.155.000. 385.000 = 7 × 55.000: **la noche externa del 17 al 18 va facturada dentro de #94515854**, aunque ese registro termina el 17. Consecuencias aplicadas:
- El tramo `EXTERNAL` se registra con `charge: 0` (su venta ya está en #94515854); con el cargo de 55.000 daría `TOTAL_DISCREPANCIA` (1.210.000 ≠ 1.155.000). El test de cifras reales confirma 0 avisos, venta contada una vez, saldo 1.155.000 con pago confirmado 0, y el 12 oct: habitación actual 203 → siguiente EXTERNO el 17 oct.
- Riesgo: el total por tramo no coincide con noches × tarifa (6 × 55.000 = 330.000). El tablero usa el total del **registro maestro** y compara con los cargos de Beds24; no «corrige» Beds24.

## 4. Preguntas abiertas (no inventadas)

1. **Próximo pago:** se indicó «NEXT PAYMENT 577.500 el 2026-10-19» con confirmado = 0. En 001 la fecha 19 oct era del *segundo* vencimiento. En el test lo modelé como cuota 1 = 577.500 vencida el 19 oct y cuota 2 sin fecha. **¿Cuál es el plan real (fechas de las dos cuotas)?**
2. ¿Los pagos anotados en Beds24 cuentan como confirmados o solo los de Odoo? (hoy: solo Odoo; los de Beds24 son «reportados»).

## 5. Validaciones reales pedidas — todas PENDIENTES de la lectura real

| # | Validación | Estado | Cómo se cierra |
|---|---|---|---|
| 1 | Total de reservas reales Beds24 | PENDIENTE | `real_booking_count` del informe de la sonda |
| 2 | Directa #94496816 | PENDIENTE | buscar el id en la lectura; revisar fuente DIRECT |
| 3–4 | Médico #94515854 y #94517233 | PENDIENTE (cifras dadas probadas en test) | comparar campos reales con las cifras |
| 5 | Reservas Booking importadas | PENDIENTE | `channel/source` reales |
| 6 | Blackouts Casa | PENDIENTE | status real de bloqueo y room 740221 |
| 7 | 24 nov | PENDIENTE | **no sé qué se debe validar ese día**: indíquenlo |
| 8 | Sobreventa 202 el 17 oct | PENDIENTE | el tablero ya detecta dos reclamaciones sobre la misma habitación-noche |
| 9 | Conflicto 301 / Casa el 4 ene | PENDIENTE | la regla Casa↔5 físicas ya detecta el choque (test sintético) |
| 10 | Ocupación sin doble contar Casa | VERIFICADO sintético | denominador 5; Casa se expande a 5 físicas, una vez |

## 6. Campos reales de API v2

**No verificados.** Los nombres que usa el normalizador siguen siendo hipótesis (ver §7 de ATH-OPS-DASHBOARD-001). Esta sección se completará con el informe de la sonda en cuanto exista la lectura real.

## 7. Modelo, contrato y regla de pagos (vigentes, sin cambios de diseño)

STAY, ROOM_SEGMENTS, normalización y regla `PAYMENT_REPORTED ≠ PAYMENT_CONFIRMED` están en ATH-OPS-DASHBOARD-001 §3–§5; instructivo de Ángela en `AI/ATH-OPS-DASHBOARD-001_ANGELA.md`. Evidencia visual (sintética) en `AI/ATH-OPS-DASHBOARD-001_evidence/`; las capturas con datos reales se añadirán tras la lectura real.

## 8. Gate

`DASHBOARD_GATE = FAIL` para esta misión (los cinco criterios de lectura real están sin cumplir por bloqueo de entorno). Código listo: al habilitar red y token, el siguiente paso es una sola ejecución de la sonda.
