# ATH-STAGING-RECOVERY-CLAUDE-003 — reglas funcionales del tablero de Ángela (cerradas)

Fecha: 2026-10-10. Decisiones aprobadas por dirección. **Solo local:** sin Odoo remoto, sin push, producción intacta.
Código: `integrations/odoo-hotel-gateway/src/angela-board-model.mjs` (modelo puro, 27 pruebas), `src/operational-read-model.mjs` (corregido), `src/odoo-reporting-reader.mjs` (mapeo ampliado), `recovery/payloads/{kpi-row.json,search-angela-filtros.xml}`, `recovery/r7-angela-board.mjs` (paso 7).

## 1. Reglas implementadas

| # | Decisión | Implementación | Pruebas |
|---|---|---|---|
| 1 | **Reserva CONFIRMADA** = real, no cancelada, no QA/TEST/FICTICIO, no solo HOLD y con criterio comercial de su propiedad/acuerdo | `classifyConfirmation()` → `CONFIRMADA / NO_CONFIRMADA / PENDIENTE_CRITERIO / EXCLUIDA`. Estados que pueden confirmar: `confirmed, pre_checkin, checked_in, checked_out, closed`. `no_show` no cuenta. **Un registro existente no es confirmado por existir.** | exclusiones, criterio por propiedad |
| 2 | Ventanas | `resolveWindow()`: HOY = hoy; MAÑANA = hoy+1; 7 DÍAS = hoy…hoy+6; MES = día 1…último del mes actual (bisiestos y fin de año probados) | 2 pruebas |
| 3 | **SALDO_REAL** = total − pagos `PAYMENT_CONFIRMED`; `PAYMENT_REPORTED` no resta | `realBalance()`. Origen de CONFIRMED: `account.payment` con `state='paid'` (misma regla que ya usa el lector: «nunca cuenta un pago cancelado o en borrador»), vinculado con `attachConfirmedPayments()`. Un reembolso confirmado (outbound) sube el saldo | 3 pruebas |
| 4 | Fila KPI **arriba** y en orden fijo | `KPI_ROW` (fuente única) → `payloads/kpi-row.json`; R7 paso 7 valida que coincidan. Orden: DISPONIBLES, OCUPADAS, HOLD, BLOQUEADAS, LLEGADAS HOY, SALIDAS HOY, RESERVAS CONFIRMADAS, SALDO PENDIENTE | orden + payload |
| 5 | **OCUPADAS = unidades físicas** | `roomsOnDate()`: partición de las 5 habitaciones, cada una en una sola categoría por prioridad OCUPADA > HOLD > BLOQUEADA > OTA_EXTERNO > DISPONIBLE. Casa Completa se expande a las 5 habitaciones; un conjunto elimina duplicados, y un solape Casa+habitación se **reporta** como conflicto de integridad en vez de sumarse | 8 pruebas |
| 6 | Separación visual | `KPI_GROUPS`: OPERACIÓN COMERCIAL (Disponibles, Ocupadas, Llegadas, Salidas, Confirmadas) · INVENTARIO NO VENDIBLE (HOLD, Bloqueadas) · FINANCIERO (Saldo pendiente) | orden + grupos |
| 7 | Filtros HOY / MAÑANA / 7 DÍAS / MES | `search-angela-filtros.xml` (borrador, sin probar en Odoo) + «Solo operación real» | XML y campos verificados |

### Qué significa OCUPADAS según la fecha
- **Hoy → FÍSICA:** solo `checked_in` (el huésped está dentro).
- **Fecha futura → PROYECTADA:** reservas `confirmed` (si cumplen el criterio) `/ pre_checkin / checked_in` que cubren la noche.
- **Fecha pasada → HISTÓRICA:** `checked_in / checked_out / closed`.
- Noche = `[check-in, check-out)`: el día de salida no ocupa. Excluye HOLD, bloqueos, canceladas, QA, TEST, FICTICIO.
- Excluido por diseño: Casa Completa de **otras propiedades** (Algarra, Neusa) no cuenta en las 5 habitaciones de La Magia.

## 2. Corrección del sobreconteo de OCUPADAS (lector local)

**Defecto confirmado:** `odoo_status_raw` se mapeaba pero nadie lo usaba; `toOperationalItem` caía a `deriveStatus()` por fechas, de modo que consultas, opciones y confirmadas sin check-in que cruzaban la fecha salían «OCUPADA».
**Corrección:**
- `statusFromRaw()` convierte el estado **real** de Odoo en estado operativo; OCUPADA solo con `checked_in` dentro de la estancia.
- `inHouse()` exige estado real (`status_source = ODOO_REAL`), excluye QA/TEST/FICTICIO y no cuenta nada derivado solo de fechas. `today()` hereda la corrección.
- Se añadió `status_source` e `is_test` a cada ítem; el mapeo de Odoo trae también `hold_origin` y `deposit_ok` (campo `x_hotel_deposit_ok`, ya existente).
- La prueba antigua que daba por ocupada una reserva sin estado real fue **reemplazada** (era precisamente el defecto); se añadieron 4 pruebas del comportamiento correcto.

## 3. Lo que ya no depende de nadie
Reglas, modelo, pruebas, contrato KPI, filtros (borrador) y corrección del lector. **Pruebas:** suite del gateway 517/517 (incluye 27 del tablero, 18 del read-model operativo y 12 de recuperación).

## 4. Decisiones que quedaron explícitas (no son supuestos ocultos)
1. `no_show` **no** cuenta como confirmada (la regla dice «no cancelada»; un no-show no es estancia). Cambiar es una línea.
2. «LLEGADAS HOY / SALIDAS HOY» se rotulan así solo en la ventana HOY; en MAÑANA/7 DÍAS/MES pasan a «LLEGADAS / SALIDAS» de la ventana.
3. Salidas cuenta `checked_in / checked_out / closed` (las que salieron hoy y las que aún no).
4. Fuera de HOY, DISPONIBLES/OCUPADAS/HOLD/BLOQUEADAS se expresan en **noches-habitación** (5 × días de la ventana).

## 5. Verificación de la identidad de la partición
Para cada noche: DISPONIBLES + OCUPADAS + HOLD + BLOQUEADAS + OTA_EXTERNO = 5 (`partition_ok`). Probado en HOY, 7 DÍAS y MES.

## 6. Abierto (necesita decisión; el tablero lo muestra como PENDIENTE y NO lo mete en ningún número)
| # | Pendiente | Efecto mientras no se decida |
|---|---|---|
| A | **Criterio comercial de confirmación por propiedad/acuerdo.** El texto aprobado lo exige pero no lo define. Opciones ya implementadas: `status` (basta el estado de Odoo), `deposit_ok` (anticipo mínimo cubierto, `x_hotel_deposit_ok`) o una función propia. La acción 1899 CONFIRMAR hoy **no** exige anticipo. | RESERVAS CONFIRMADAS = 0 y aparece `confirmadas_sin_criterio_comercial = N`. La ocupación futura proyectada tampoco cuenta esas reservas. `checked_in` sí ocupa (es un hecho físico). |
| B | **Bloques `external` de Booking/Airbnb** (pueden ser huéspedes reales o bloqueos manuales hechos en la OTA; el tipo no lo distingue). Política `SEPARATE` / `AS_OCCUPIED` / `AS_BLOCKED`. | Categoría propia **OTA_EXTERNO**: no vendible, fuera de OCUPADAS y de BLOQUEADAS. |
| C | **Portador de la fila KPI dentro de Odoo** (vista `dashboard` Enterprise, vista sobre `planning.slot`, o tablero local). El contrato está listo y validado; falta decidir quién lo dibuja arriba del Kanban. | R7 paso 7 solo valida el contrato; no escribe. |
| D | **Fuente de PAYMENT_REPORTED.** No existe en el repo (no hay estado «reportado» en Odoo). Sin esa fuente, solo CONFIRMED se calcula y lo reportado se informa como 0. | Saldo = total − confirmados, que es lo aprobado. |
| E | **Saldo `x_hotel_balance` de Odoo** frente a SALDO_REAL: se sigue sin saber cómo Odoo calcula `x_hotel_balance/x_hotel_paid` (el dump lo dirá). El filtro XML «Con saldo» queda marcado PROVISIONAL. | El KPI usa `realBalance()`, no el campo. |
| F | **Datos de bloques (`planning.slot`)** para BLOQUEADAS/HOLD de inventario: el modelo los acepta (`{unit, kind, start, end}`), pero **leerlos de Odoo** exige conocer los campos de `planning.slot` (están en el dump). | Con `blocks = []`, BLOQUEADAS = 0; no es dato, es ausencia de fuente. |

## 7. Qué espera exactamente al dump
Solo F (definición de campos de slot / lectura de bloques) y E (cómo se calculan `x_hotel_balance/x_hotel_paid`), más R1/R4 de las fases de recuperación. **A, B y C son decisiones de negocio, no del dump.**
