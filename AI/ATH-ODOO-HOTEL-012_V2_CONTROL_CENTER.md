# ATH-ODOO-HOTEL-012 V2 — Atheron Hotel Control Center

> Rama `feature/ath-odoo-hotel-012-master-board-housekeeping`. Base: `72bd7ad`.
> Odoo **STAGING** únicamente. Production no tocada. Sin merge a `main`.
> Booking/Codex no tocado.
>
> **Limitación central de esta sesión:** entorno cloud **sin credenciales ni
> sesión de Odoo STAGING** (sin `ODOO_*`, sin `.env`; mismo bloqueo que
> HOTEL-009/012). Todo lo de abajo es **código + pruebas con transporte
> simulado + datos ficticios**. **Nada se verificó contra Odoo real** y la
> vista "CENTRO DE OPERACIONES — ATHERON HOTELS" de Studio **no fue
> modificada** (vive en Odoo, no en el repo).

## 1. Qué existía (auditado y reutilizado)

| Pieza | Estado | Uso en V2 |
|---|---|---|
| `odoo-reporting-reader.mjs` (dominio fijo `x_order_involves_room`) | válido | reutilizado; se **añade** `fetchAllHotelReservations` (paginado), `x_hold_origin`, lectura de tareas de aseo |
| `master-board-model.mjs` (catálogo, padre/hijas) | válido | **fuente única** del catálogo de unidades y de CASA COMPLETA ↔ habitaciones |
| `operational-read-model.mjs` | válido | `paymentStatus()` reutilizado |
| `housekeeping-model.mjs` | válido | `computeHousekeepingPriority()` reutilizado |
| `financial-model.mjs` | válido para HOTEL-009 | **no modificado** (contrato probado); su `accounts_receivable` se conserva solo como comparación |
| Tablero Studio / Kanban 6833 / vista Orders 1508 / acciones 1901-1902 | en Odoo | **intactos** |

No se creó otro dashboard, PMS ni inventario: `control-center-model.mjs` es un
read-model puro que **compone** lo anterior; `control-center-render.mjs` es un
informe estático del mismo contrato (revisión de diseño/evidencia), no un
frontend paralelo.

## 2. Hallazgos de la auditoría de datos

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| F1 | `fetchHotelReservations` lee **300 filas sin orden**; STAGING ya tenía >300 reservas hoteleras → KPI truncados en silencio | alta | **corregido**: `fetchAllHotelReservations` pagina (`order: id asc`) y marca `truncated` |
| F2 | `accounts_receivable` (HOTEL-009) = Σ `max(total − cobrado, 0)` de **todas** las no canceladas → incluye HOLD, opción y consulta (pipeline, no cartera) y estancias ya cerradas | alta | **corregido en V2**: `saldo_operativo` solo suma VENDIDAS y se descompone |
| F3 | `paymentPending` y `balance` de `toOperationalItem` ignoran `x_hotel_balance` y el estado | media | documentado; V2 usa `x_hotel_balance` y marca discrepancias (`ANOMALIA_SALDO`) |
| F4 | `alternatives-engine.UNIT_CATALOG` usa capacidades **supuestas** 4/4/4/4/4/20; Odoo real (HOTEL-009 Gate 009-A) es 2/4/4/7/3/22 | media | **NO tocado** (motor de reservas, fuera de alcance); V2 usa las reales. Decisión pendiente: alinearlo |
| F5 | `master-board-model` trata el día de check-out como OCUPADA (`<= checkout`); `angela-read-model` lo trata como CHECK-OUT | baja | V2 define noche = `checkin ≤ d < checkout` (el día de salida es "sale hoy") |
| F6 | Mapper descartaba `x_hold_origin` (web/sofia/ota/staff) | baja | añadido como `hold_origin` (sin inferir canal) |
| F7 | No hay campo estructurado para bloqueos administrativos / fuera de servicio | brecha | DATA_GAP; estado soportado pero vacío |

### SALDOS_PENDIENTES_FINDING (357 / $37.202.549 COP)

**ORIGEN NO DEMOSTRADO EN STAGING** (sin acceso). No se cambió ningún número.
Lo demostrado **en código**:

- 357 > 300: el KPI de Odoo **no** sale del lector del Gateway (que se corta en 300).
- La fórmula HOTEL-009 mezcla pipeline no vendido y estancias terminadas
  (F2); la prueba `SALDOS: el saldo operativo excluye HOLD/opcion/consulta`
  muestra la diferencia en un caso controlado.
- `sale.order` es compartido con CCTV/Syscom (`x_modo_syscom`); un KPI de la
  vista de Odoo sin el dominio `x_order_involves_room = true` los mezclaría.

Hipótesis a descartar con **un comando** (solo lectura, solo agregados, sin
nombres ni teléfonos), que decide cuál reproduce el número:

```bash
TARGET_COUNT=357 TARGET_AMOUNT=37202549 node scripts/saldos-audit-live.mjs
```

Evalúa 9 definiciones candidatas (A–I: hotel/no-hotel, vendidas/pipeline/
terminadas, con/sin canceladas, `x_hotel_balance` vs `total − cobrado`, todo
`sale.order`) y devuelve `ORIGEN_DEMOSTRADO: <id>` o `ORIGEN_NO_REPRODUCIDO`
(en cuyo caso hay que leer el dominio de la vista en Studio). **Pendiente
de ejecutar por Marlon (sesión local con credenciales).**

## 3. Contrato de KPI (SOURCE / DOMAIN / FORMULA / VALIDATION)

Vive en código (`KPI_DEFINITIONS`, 22 KPI, probado que ninguno quede sin los
4 campos) y se imprime en el informe. Resumen de los críticos:

| KPI | Fórmula | Excluye |
|---|---|---|
| Disponibles / Reservadas / Ocupadas / HOLD / Bloqueadas | partición de **unidades físicas** (5 hab. + Algarra + Neusa = 7; CASA COMPLETA Atheron es compuesta y no suma) | — |
| Ocupación por unidades % | ocupadas ÷ vendibles × 100 (vendibles = físicas − fuera de servicio) | bloqueado, HOLD, reservado-sin-check-in |
| Ocupación por personas % | personas alojadas ÷ capacidad vendible × 100. Atheron = 2+4+4+7+3 = 20; si la casa está tomada, 22 | Algarra/Neusa: capacidad sin confirmar → DATA_GAP, global marcado *parcial* |
| Saldo por cobrar (operativo) | Σ `x_hotel_balance` de VENDIDAS con saldo | HOLD/opción/consulta/canceladas |
| Ventas del día | Σ `amount_total` de VENDIDAS creadas hoy | pipeline |
| Ingresos del periodo | devengado: `total ÷ noches × noches en el periodo` | pipeline |
| ADR / RevPAR | ingresos ÷ noches-habitación vendidas / noches disponibles | null si no hay noches |
| Cobrado | `account.payment` por **fecha real**; `x_hotel_paid` solo como *acumulado* | sin pagos leídos = `null`, no 0 |

Reglas: bloqueado ≠ ocupado · HOLD ≠ vendido · reserva ≠ pago. Auto-validación
cruzada en cada corrida (`validation.checks`: partición, ocupadas ≤ vendibles,
0–100 %, canales suman ingresos, saldo operativo se descompone, etc.).

## 4. Estados de inventario y CASA COMPLETA ↔ habitaciones

Ocho estados: DISPONIBLE · RESERVADO · OCUPADO · HOLD · BLOQUEADO ·
ASEO PENDIENTE · LISTO · FUERA DE SERVICIO (este último solo con fuente).
Siempre con texto además de color. OCUPADO exige `checked_in`; un `confirmed`
sin check-in es RESERVADO; estado desconocido = BLOQUEADO (revisión humana).

- Casa vendida → sus 5 habitaciones heredan el estado (`via: CASA_COMPLETA`).
- Habitación tomada (ocupada/reservada/HOLD) → la casa queda BLOQUEADA
  (`via: HABITACION`, `blocked_by`), sin copiar datos del huésped.
- Conflicto (casa + habitación la misma noche) → alerta ALTA `CONFLICTO_INVENTARIO`.
- El motor real de exclusión sigue siendo la acción 1967 de Odoo; V2 solo
  **muestra** la relación, no decide disponibilidad comercial.

## 5. Housekeeping

Reutiliza las etapas reales (POR LIMPIAR / EN LIMPIEZA / LISTA PARA REVISAR /
LISTA / INCIDENCIA). Muestra: aseos hoy, pendientes, en proceso, completados,
% completados, habitaciones no listas, próximo check-in + habitación no
lista (alerta), responsable y hora. Una salida de hoy **sin check-out hecho**
no cuenta como aseo completado aunque la tarea diga LISTA (es del ciclo
anterior). Una llegada de CASA COMPLETA exige las 5 habitaciones listas.

**DATA_GAP:** (a) housekeeping solo configurado en Atheron Suite (decisión
CEO 4); (b) la lectura real de `project.task` usa `x_resource_id`,
`stage_id`, `state` (confirmados por el código vivo de la acción 1902) +
`user_ids`/`write_date` estándar, **no ejecutada contra STAGING**; (c) sin
lectura, todo queda *SIN DATO*, nunca se asume LISTO.

## 6. Revenue Intelligence (solo lectura, no modifica tarifas)

Calculado: ocupación y ADR por día de la semana, histórico (ADR/RevPAR/
ocupación), próximos 30 días, pickup 7 d, días más bajos, `DÍA VALLE` solo si
hay ≥ N muestras por día de semana (parámetros `minWeeksPerWeekday=4`,
`valleyFactor=0.75`, configurables, **heurísticos, no decisión comercial**).

**DATA NOT READY — TARIFA PISO / PUNTO DE EQUILIBRIO.** No se inventa nada.
`computeFloorRate()` (matemática pura, probada) solo calcula con **todo** lo
siguiente registrado: costo variable por noche (aseo, lavandería, amenities,
servicios variables), comisión OTA % por canal, costo fijo diario atribuible,
margen mínimo objetivo %, noches esperadas por día.
`tarifa_piso = (CV + CF/N) / (1 − comisión − margen)`;
`noches_equilibrio = CF / (ADR·(1−comisión) − CV)`.
Sin comparativo anual (STAGING arranca en 2026-09): `DATA_NOT_READY`.

## 7. Filtros y horizonte

HOY · MAÑANA · 7 DÍAS · MES ACTUAL · RANGO (máx. 366 d, inválido falla
cerrado) × propiedad / canal / estado / unidad. Filtrar por canal o estado
**no cambia la verdad del inventario** (una casa completa filtrada no libera
sus habitaciones). Dominios Odoo equivalentes: `odooDomainsFor()`.

## 8. Alertas

CHECKIN_PROXIMO_NO_LISTA · CONFLICTO_INVENTARIO · SOBREOCUPACION ·
HOLD_RELEVANTE · HOLD_VENCIDO · BLOQUEO · RESERVA_INCOMPLETA ·
SALDO_PENDIENTE · CHECKOUT_VENCIDO · LLEGADA_VENCIDA · ANOMALIA_SALDO ·
ANOMALIA_OPERATIVA (incidencia de aseo). Ninguna escribe nada.

## 9. Qué falta aplicar en Odoo (requiere sesión STAGING, aprobación de Marlon)

El código entrega el contrato; la **vista de Studio** debe reflejarlo:

1. KPI "Saldos pendientes": cambiar su dominio a `odooDomainsFor().saldo_operativo`
   **solo después** de correr la auditoría y confirmar el origen.
2. Franja de 5 segundos, estados de unidad, filtros HOY/MAÑANA/7 DÍAS/MES/RANGO y
   propiedad/canal/estado con los dominios de `odooDomainsFor()`.
3. Etapa `LISTA PARA REVISAR` (SAFE WRITE PLAN, cambio A) — sigue sin existir en Odoo.
4. Si se quiere el cuadro completo (Revenue Intelligence, alertas), usar
   `control-center-live.mjs` (informe local) mientras tanto.

## 10. Cómo reproducir

```bash
cd integrations/odoo-hotel-gateway
node --test                                   # 376 pruebas
node scripts/control-center-demo.mjs          # informe con DATOS FICTICIOS -> AI/hotel-012-v2-evidence/
# con credenciales STAGING (local, solo lectura):
REFERENCE_DATE=2026-10-03 HORIZON=7_DIAS HTML_OUT=cc.html node scripts/control-center-live.mjs
TARGET_COUNT=357 TARGET_AMOUNT=37202549 node scripts/saldos-audit-live.mjs
```

Evidencia visual (ficticia, rotulada): `AI/hotel-012-v2-evidence/control-center-demo-{desktop,movil}.png`.

## 11. Seguridad

- Lectores: solo `search_read`; dominio hotelero fijo; lista de campos fija
  (prueba: ningún `create/write/unlink`). Auditoría de saldos pide solo
  campos de agregación (sin nombre/teléfono/partner).
- Teléfono enmascarado (`****1234`) en el contrato y el HTML; prueba de que el
  teléfono completo no aparece. Sin secretos en código ni evidencia.
- `loadGuardedConfig` rechaza cualquier base distinta de STAGING.
- ACL real de Odoo (grupos de la vista/acciones): **no revisable sin sesión**.
- No se cambió `financial-model.mjs`, el Gateway HTTP, `odoo-adapter`,
  availability/quote/HOLD/status/cancel/idempotencia ni HOTEL-017.
