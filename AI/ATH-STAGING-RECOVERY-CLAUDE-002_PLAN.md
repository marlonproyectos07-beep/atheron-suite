# ATH-STAGING-RECOVERY-CLAUDE-002 — orden de recuperación, verificación, rollback y tablero de Ángela

Fecha: 2026-10-10. Rama: `feature/ath-odoo-hotel-017-booking-airbnb-level1`. Complementa `AI/ATH-STAGING-RECOVERY-CLAUDE-001_MATRIZ.md`.
**Alcance de esta pasada:** solo evidencia ya disponible (repo). Nada contra Odoo remoto, sin push, producción intacta. Donde falta metadata del dump, el script **se detiene** (`BLOCKED`) en vez de suponer.

## 1. Estado de los scripts (`integrations/odoo-hotel-gateway/recovery/`)

| Fase | Script | Estado | De dónde sale lo que escribe | Falta del dump |
|---|---|---|---|---|
| R0 | `r0-preflight-readonly.mjs` | **LISTO, sin ejecutar** (ejecutor de solo lectura por lista blanca) | respaldo JSON del repo | nada |
| R1 | `r1-models-fields.mjs` | **ESQUELETO** | `AI/recovery-extract/{models,fields,selections}.json` | **todo** (definiciones `x_hotel_*` y campos de `planning.slot`) |
| R2 | (sin script propio) | **PENDIENTE DE ADAPTAR** | las definiciones de los 97 campos de `sale.order` YA están en `ir-model-fields-sale-order-custom.json`, pero R1 solo lee `AI/recovery-extract/fields.json`. Adaptar R1 para aceptar ese JSON (sin selection_ids: aquí `selection` viene como texto) es trabajo local, sin dump | solo `compute/store` y la lista `selection` normalizada |
| R3 | `r3-master-data.mjs` | **LISTO** (dry-run por defecto) | respaldo JSON (propiedad, 5 hab., Casa, anticipos) | nada; requiere R1 aplicado |
| R4 | `r4-actions-automations.mjs` | **ESQUELETO** | `AI/recovery-extract/{server_actions,automations,crons}.json` | **todo** el código de `planning.slot` (167/168/169/189/71…) y los enlaces automatización↔acción |
| R5 | (tarifas) | **SIN SCRIPT** a propósito | `master-data-x_hotel_rate*.json` | precios reales: no se cargan sin orden; entran como borrador |
| R6 | (operador) | **SIN SCRIPT** | `crear-usuario-angela-staging.mjs` ya existe | correo real de Ángela (no está en el repo); `groups.json` del dump |
| R7 | `r7-angela-board.mjs` | **PREPARADO (sin ejecutar) pasos 1–5; borrador el paso 6.** El XMLID de las vistas padre es una suposición que el propio script verifica por nombre y aborta si no coincide | evidencia del repo: acción 1909, vistas 6832/6833, filtro 26, menús 1000/1001 | solo si el dump difiere del respaldo del 30-sep |
| — | `rollback.mjs` (+ `r3-rollback.mjs` alias) | **LISTO** | bitácora JSON del propio script | nada |
| — | `extract/extract.sh`, `extract/discover.sql` | **PREPARADO, NO PROBADO, INCOMPLETO** | — | produce filas crudas; **no produce aún los campos derivados** del contrato |

Endurecimiento aplicado a R0/R3 (revisión de la pasada anterior):
- Ejecutor con **lista blanca de métodos**: lectura siempre; `create/write` solo con `--apply`+`RECOVERY_CONFIRM`; `unlink` solo en rollback; cualquier `action_*`/`button_*` se rechaza siempre (no pueden dispararse automatizaciones por accidente).
- Escrituras con `tracking_disable`/`mail_notrack`/`mail_create_nolog` (sin correos ni chatter).
- Comparación normalizada (many2one por id, vacíos equivalentes): antes producía falsos `DIFF`.
- R3: la Casa debe ser **única** en el respaldo (hay tres «CASA COMPLETA»); enlace padre↔hijas solo con ids nuevos y solo si falta; verificación final; ya no usa `-1` como id de propiedad.
- Rollback genérico que además comprueba que el registro siga existiendo.
- Errores de Odoo: salida con mensaje truncado, sin objeto completo.
- Pruebas locales `recovery/test/recovery.test.mjs`: 12/12; suite completa del gateway 486/486.

## 2. Orden exacto de recuperación (staging NUEVO)

```
R0  preflight (solo lectura)  ─ informa versión de Odoo, módulos y qué existe ya (posible trabajo de Codex)
 │   Puerta: sale_renting y planning instalados; decidir si hay web_studio (Enterprise) para R1.
R1  modelos x_hotel_* + campos de planning.slot   ◄── BLOQUEADO hasta AI/recovery-extract/
 │   Verificación: cada (modelo,campo) del extracto existe con el mismo ttype.
R2  97 campos x_* de sale.order  (script por adaptar; depende de R1: hay many2one a x_hotel_unit / x_hotel_rate / x_hotel_property / x_hotel_quote)
 │   Verificación: 97/97.
R3  propiedad → 201,202,203,301,302 → CASA COMPLETA → enlace de hijas → anticipos
 │   Puerta previa: existen recursos y roles de Planning por nombre (si no, `FALTA` y se crean aparte; ids nuevos).
 │   Verificación: 5 unidades hijas + Casa con 5 hijas; `search_count` de «CASA COMPLETA» de La Magia = 1.
R4  acciones de servidor → automatizaciones (INACTIVAS) → cron HOLD (INACTIVO)   ◄── BLOQUEADO hasta el extracto
 │   Orden interno: primero motor de inventario (1896) y guardia anti-solapamiento (189), luego HOLD (1897/1930/1906/1907),
 │   luego exclusión Casa↔habitaciones (167/168/169), luego reserva directa (1899/1935/1937/1938) y estados (1900–1905).
 │   Activación: manual y por separado, en este orden: 189 → 187 → 167/169 → 197 → resto → cron 155.
R5  tarifas y líneas (borrador) + capacidad extra         (sin script; con autorización, precios reales)
R6  operador/recepción: usuario de Ángela + PIN            (correo real pendiente)
R7  tablero: Kanban 6833 → formulario 6832 → acción 1909 → menús → filtro 26 → (borrador) filtros HOY/MAÑANA/7 DÍAS/MES
R8  OTA (acción 1967, feeds, crons 156–160)               FUERA DE ALCANCE hasta orden expresa de Marlon
```

Por qué R4 va antes que R7: las vistas 6832 llevan botones que llaman acciones **por id numérico**; R7 los reescribe por nombre y se niega a crear la vista si alguna acción no existe.

## 3. Verificaciones por fase y rollback

| Fase | Verificación (solo lectura, tras `--apply`) | Rollback |
|---|---|---|
| R1 | recuento de campos por modelo = extracto; `fields_get` devuelve el `ttype` esperado | `rollback.mjs <bitácora r1>` borra campos y modelos creados (en orden inverso). Ojo: borrar un campo borra sus datos; en una base recién cargada es seguro, después no. |
| R3 | 5 hijas + Casa; propiedad única; anticipos 2 | `rollback.mjs <bitácora r3>` |
| R4 | todas las automatizaciones y crons `active=False`; ningún `REVISAR`/`DEP_FALTA` sin resolver; hash SHA-256 del `code` = hash del extracto | `rollback.mjs <bitácora r4>`; las acciones quedan sin disparadores |
| R4 (activación) | prueba sintética (ver abajo) | desactivar de nuevo (`active=False`), no borrar |
| R7 | `get_views` de `sale.order` kanban/form sin error; la acción 1909 abre; botones del formulario ejecutan acciones | `rollback.mjs <bitácora r7>` |

**Prueba sintética mínima** (huéspedes ficticios, sin OTA, sin pagos, ventana segura): (a) reservar 301 una noche ⇒ Casa queda bloqueada, 201/202/203/302 libres; (b) reservar Casa esa noche ⇒ rechazada; (c) HOLD y vencimiento libera inventario; (d) misma fecha dos veces en 301 ⇒ la segunda falla. Después, cancelar todo lo creado.

## 4. Tablero de Ángela — definición cerrada

**Qué existe hoy (evidencia en el repo):**

| Pieza | Valor | Fuente |
|---|---|---|
| Menú raíz / hijo | «Hotel v1 (Piloto)» (seq 90) → «Reservas hotel» (seq 10) | `ir-ui-menu-hotel.json` |
| Acción | 1909 «Hotel v1 — Reservas hotel», `sale.order`, vistas `list,form,kanban`, dominio `[('x_hotel_unit_id','!=',False)]`, contexto `{}` | `ir-actions-act-window-hotel.json` |
| Kanban | vista 6833, extensión de `sale.order.kanban`, agrupado por `x_reservation_status`; tarjeta con unidad, check-in, check-out, adultos, saldo y badge de estado | `FINAL_APPROVED.md` (idéntico al arch del respaldo; prueba lo verifica) |
| Formulario | vista 6832 «HOTEL v1 — sale.order piloto», botones OPCION/HOLD/CONFIRMAR/PRE-CHECKIN/CHECK-IN/CHECK-OUT/CERRAR/NO-SHOW/CANCELAR **por id numérico de acción** | respaldo |
| Filtro | 26 «Operación del día (sin canceladas)», por defecto, `x_hotel_unit_id != False` y estado fuera de `cancelled/no_show` | `ir-filters-sale-order.json` |
| Lectura en código | `operational-read-model.mjs`: `today, arrivals, departures, inHouse, holds, paymentPending, upcoming, available, buildOperationalDashboard` | repo |
| Estados reales | `draft, opcion, hold, confirmed, pre_checkin, checked_in, checked_out, closed, cancelled, no_show` | `x_reservation_status` |
| Dependencias | campos `x_hotel_unit_id, x_reservation_status, x_checkin (date), x_checkout (date), x_hotel_balance, x_hotel_paid, x_num_adults, x_hold_expires, x_hold_expired`; módulos `sale_management`, `planning`, `sale_renting`; acciones de servidor 1897–1905 | respaldo |

**Qué pidió Marlon vs. qué hay:**

| Pedido | ¿Existe? | Qué falta exactamente |
|---|---|---|
| **HOY / MAÑANA / 7 DÍAS / MES** | NO | Filtros de búsqueda. **Borrador listo** en `recovery/payloads/search-angela-filtros.xml` (campos reales, sin probar). Falta: (1) validar que `context_today()`, `datetime.timedelta` y `relativedelta` evalúen en el buscador de esa versión; (2) **decisión de definición**: ventana inclusiva `x_checkin <= fin Y x_checkout >= inicio`; 7 DÍAS = hoy…hoy+6. |
| **Ocupadas** | PARCIAL, con defecto | Filtro real `x_reservation_status = checked_in` (en el borrador). **Defecto en el lector local:** `odoo_status_raw` se mapea pero nadie lo usa; `inHouse()` marca «OCUPADA» a cualquier reserva (CONSULTA, OPCION, CONFIRMADA…) cuyas fechas cubren hoy, salvo HOLD. El lector sobrecuenta ocupación. |
| **HOLD** | SÍ | Filtro «HOLD vigente» = `hold` y `x_hold_expired = False` (borrador). Hay desfase de hasta 15 min con el cron 155. |
| **Llegadas hoy / Salidas hoy** | SÍ en el lector; filtro en borrador | Excluir `cancelled/no_show/closed`. El lector solo excluye `cancelled/no_show`, no `closed`. |
| **Reservas confirmadas** | NO como definición | **Decisión:** el borrador usa `confirmed + pre_checkin`; `checked_in` cuenta como Ocupada. Marlon debe confirmarlo. |
| **Saldos reales** | PARCIAL, dos definiciones | `x_hotel_balance` (campo de Odoo) frente a `amount_total − x_hotel_paid` (calculado en `toOperationalItem`). Hay que fijar **una**. «Real» debería excluir pruebas (el filtro «Operación real (oculta QA)» existe como script, no como filtro en la acción). Falta confirmar con el dump si `x_hotel_balance/x_hotel_paid` son calculados o los escribe una acción. |
| **Disponibles** | NO en `sale.order` | Una unidad libre no es una fila de `sale.order`. Fuente necesaria: `planning.slot` + `x_hotel_unit` (con Casa compuesta). Hoy: `available()` delega en `inventory-model` (módulo local) y la acción 1914 «CONSULTAR DISPONIBILIDAD» (solo lectura, sobre la propiedad). Falta decidir **dónde se muestra** (ver §5). |
| **Bloqueadas** | NO | Requiere `planning.slot` y el campo `x_hotel_block_kind` (manual/external/derived), cuya **definición está solo en el dump**. Hasta R1 no se puede ni escribir el filtro. |
| **Separar ocupación comercial vs bloqueadas/HOLD/disponibles** | NO | Ocupación comercial = `sale.order` confirmadas/check-in. Bloqueadas/HOLD/disponibles = inventario (`planning.slot`). Los bloques **derivados** de Casa y los de OTA sin pedido no son ocupación comercial. Esto exige la vista sobre `planning.slot`. |
| **Casa Completa en la ocupación** | NO resuelto | Una reserva de Casa ocupa 1 «unidad» en `sale.order` pero 5 habitaciones físicas. Para ocupación por habitación hay que contar por `planning.slot` o expandir en el lector. |
| **Fila de KPI con totales** | NO | Odoo muestra conteos por grupo en el Kanban/lista, no una fila de tarjetas. |

## 5. Decisiones que necesita Marlon / ChatGPT (para cerrar el tablero)

1. **Definición de «Reservas confirmadas»** (¿`confirmed+pre_checkin`?) y de **ventanas** (¿7 DÍAS = hoy…hoy+6?).
2. **Una sola definición de «saldo real»** (`x_hotel_balance` o `amount_total − x_hotel_paid`) y si se excluyen pruebas por defecto.
3. **Dónde vive la fila de KPI:** (A) vista `dashboard` de Odoo Enterprise (hay que comprobar en R0 que exista para `sale.order`); (B) pivot/graph sobre `sale.order` + otra vista sobre `planning.slot` para Disponibles/Bloqueadas; (C) tablero local `angela-dashboard-live.mjs` (ya existe, requiere corregir el defecto de «Ocupadas»). Mi recomendación: **B para el piloto** (todo dentro de Odoo, sin tocar código de negocio) y corregir el lector local aparte.
4. Autorizar, cuando llegue el extracto, **corregir `inHouse()`** para usar el estado real (cambio local en `operational-read-model.mjs`, con sus pruebas).

## 6. Qué espera exactamente a `AI/recovery-extract/`

Solo esto (ver `recovery/EXTRACT-CONTRACT.md`): `models.json`, `fields.json`, `selections.json` (R1); `server_actions.json`, `automations.json`, `crons.json` (R4); `groups.json` (R6); `xmlids.json`; y la confirmación `views/menus/filters` frente al respaldo del 30-sep (R7, opcional). **Pendiente de construir cuando llegue el dump:** la parte del extractor que resuelve los campos derivados (nombres de acciones por automatización, XMLID de vista padre, etc.), porque depende de nombres de tabla que solo `discover.sql` sobre el dump real puede confirmar.

**Lo que NO depende del dump y ya está hecho:** R0, R3, R7 (pasos 1–5), rollback, pruebas, plan de verificación, definición del tablero.
**Lo que SÍ depende:** R1 y R4 completos, la columna «Bloqueadas» del tablero y las reglas de exclusión Casa↔habitaciones.
