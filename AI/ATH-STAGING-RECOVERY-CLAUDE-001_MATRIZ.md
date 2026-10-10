# ATH-STAGING-RECOVERY-CLAUDE-001 — matriz y plan de recuperación selectiva

Fecha: 2026-10-10. Rama: `feature/ath-odoo-hotel-017-booking-airbnb-level1`.
Destino futuro: `atheron1-hotel-staging-20261009` (NUEVO). Origen: `atheron1-hotel-staging-20260923` (viejo, expirado/respaldado).
Modo de esta tarea: análisis LOCAL. No se tocó Odoo remoto, producción, OTAs, WhatsApp ni pagos. Sin push.

## 0. Hallazgos que cambian el plan (leer primero)

1. **`dump.sql` y filestore NO están en este entorno.** Este contenedor en la nube solo ve el repo. El respaldo que existe aquí es `AI/staging-backup/` (JSON por XML-RPC + ZIP de Studio, **30-sep**). El dump/filestore validado vive en la máquina de Marlon o de Codex. No se pudo restaurar nada en PostgreSQL local (solo hay cliente `psql`, sin servidor, y no hay dump). → Cuando alguien lo ponga accesible, ver §7.
2. **`AI/PROJECT_STATE.md`, `AI/HANDOFF.md` y `AI/TASKS.md` no existen.** El propio `integrations/odoo-hotel-gateway/HANDOFF.md` ya lo decía. Se usó como estado vigente `AI/ATH-ODOO-HOTEL-017_STAGING-MILESTONE_2026-10-05.md` + `odoo-patches/hotel-017/manifest.json` + `AI/ATH-ODOO-HOTEL-009_FINAL_APPROVED.md`.
3. **No existe documentación HOTEL-018 en el repo** (cero coincidencias). Lo más cercano es ATH-DISP-001 (disponibilidad Casa↔habitaciones, solo en scripts) y ATH-BEDS24.
4. **El README de `staging-backup` sobrestima el ZIP de Studio.** El ZIP real contiene 22 campos (`crm.lead`, `helpdesk.ticket`, `sale.order`, `sale.order.line`, `sign.*`), 12 vistas, 2 acciones, 2 defaults. Los 97 campos de `sale.order` y las 78 vistas están en los **JSON** (`ir-model-fields-sale-order-custom.json`, `ir-ui-view-sale-order-inherited.json`), no en el ZIP. El ZIP además depende de `web_studio` (Enterprise).
5. **Los modelos propios `x_hotel_*` NO tienen definición exportada.** Hay datos (propiedad, unidad, tarifa, línea, anticipo) pero ni `ir.model` ni `ir.model.fields` de esos modelos, ni de `x_hotel_quote`, `x_hotel_ota_feed`, `x_hotel_api_log`. Tampoco los campos propios de `planning.slot` (`x_hotel_block_kind`, `x_channel`, `x_bloqueo_ref`, `x_bloqueo_src_id`, `x_hotel_is_test`…). **Es el bloqueante nº 1**: sin esos modelos no se pueden cargar las habitaciones ni la Casa. Salen de reconstruir desde las claves de `master-data-*.json` + tipos inferidos (marcado HIPÓTESIS) o, mejor, del dump.
6. **El respaldo del 30-sep es anterior a HOTEL-017 y ATH-DISP-001.** No contiene: acción 1967 (Gateway Sofía; base en `odoo-patches/hotel-017/action-1967-base-9b053e02.py` + generador `src/ota-adoption-action-code.mjs`), acciones 1979–1989, crons 156–160, `x_hotel_ota_feed` (6 filas), `x_hotel_api_log`, ni las reglas de `planning.slot` 167/168/169/170/171/189 como código (solo sus nombres están en `base-automation.json`; el código Python de planning **no se exportó** porque el filtro cubría solo `sale.order` y modelos Hotel).
7. **Los scripts del repo están blindados a la base vieja** (`ALLOWED_DATABASE = ...20260923`, y `ODOO_ACTION_ID` debe ser 1967). Contra el staging nuevo abortan: es seguro, pero obliga a un guard nuevo (ver `integrations/odoo-hotel-gateway/recovery/`).
8. **Los IDs viejos no sirven.** Roles, recursos, acciones y vistas se renumeran en la base nueva. Todo se resuelve por nombre (ver §5).

## 1. Qué estaba validado antes del vencimiento

| Hito | Estado documentado | Fuente |
|---|---|---|
| HOTEL-009 Modo Ángela (Kanban `x_reservation_status`, filtro «Operación del día», tablero gerencial) | FINAL APPROVED, ANGELA_KANBAN_VISUAL PASS | `AI/ATH-ODOO-HOTEL-009_FINAL_APPROVED.md` |
| HOTEL-004/005/006 motor tarifario, HOLD, capacidad extra, precio congelado, reserva desde cotización | Operativo en STAGING | acciones 1896–1938 en `ir-actions-server-hotel.json` |
| ATH-DISP-001 Casa↔habitaciones (reglas 167/169; corrección Booking 6388397618 21–26 dic) | Aplicado en STAGING por scripts | `scripts/ath-disp-001-*.mjs` |
| HOTEL-017 OTA Booking/Airbnb nivel 1, 5 habitaciones | `HOTEL-017_STAGING_GATE = PASS` (declarado por CEO) | milestone 2026-10-05 |
| Beds24 | Adaptador sintético + almacén durable, **pendiente de soporte Beds24** | commit `e0f0210` |

## 2. Matriz de recuperación

Leyenda método: **A** = recrear desde JSON/código del repo · **B** = requiere dump/filestore · **C** = reconstruir a mano/Studio · **D** = no recuperar.
Prioridad: CRITICAL / IMPORTANT / OPTIONAL.

| # | COMPONENTE | ESTADO EN STAGING ANTIGUO | FUENTE / ID (viejo) | DEPENDENCIAS | MÉTODO DE RECREACIÓN | RIESGO | PRIORIDAD |
|---|---|---|---|---|---|---|---|
| 1 | Modelos `x_hotel_property/unit/rate/rate_line/deposit_policy/quote` + campos | Existían (Studio) | solo claves en `master-data-*.json`; **sin definición** | Studio/`web_studio`, Enterprise | **B** (ideal: `ir.model`/`ir.model.fields` del dump). Alterno **C**: crear por script con tipos inferidos (HIPÓTESIS) | ALTO: tipos/relaciones mal inferidos | CRITICAL |
| 2 | Campos `sale.order` x_* (97) | Existían | `ir-model-fields-sale-order-custom.json` (definición completa) | #1 (relaciones a `x_hotel_unit`, `x_hotel_rate`…), `sale_renting` | **A** script idempotente por `(model,name)` | MEDIO | CRITICAL |
| 3 | Propiedad HOTEL ATHERON SUITE (+ Casa Algarra, Neusa) | 3 filas | `master-data-x_hotel_property.json` id 1 (HOLD 2 h, anticipo 30 %, check-in 15, check-out 11, cap. casa 22) | #1, compañía ATHERON S.A.S, proyecto/etapas Housekeeping (ids 35/62/63/65/127 → por nombre) | **A** buscar por `x_name`; omitir Housekeeping si no existe | BAJO | CRITICAL |
| 4 | **Habitaciones 201,202,203,301,302** | 5 unidades físicas activas | `master-data-x_hotel_unit.json` ids 1–5: cap. base/comercial 2/2, 4/4, 4/4, 6/7, 3/3 | #3, recurso+rol `planning` por unidad (28–32 / 29,19,30,37,18), producto `[MAGIA-2xx]` | **A** crear unidad por `x_name`+propiedad; recursos/roles por nombre; producto por `default_code` | MEDIO: roles/recursos nuevos ≠ ids viejos | CRITICAL |
| 5 | **Casa Completa** (unidad 6, compuesta) | cap. 22, hijas 1–5, recurso 79, rol 69 | unit id 6 | #4, recurso/rol de Casa | **A** crear tras las 5 hijas y enlazar `x_child_ids` | MEDIO | CRITICAL |
| 6 | Casa Algarra / Casa Campestre Neusa (unidades 7 y 8, **ambas también llamadas «CASA COMPLETA»**) | Existían, otras propiedades | unit ids 7, 8 | #3 | **A** pero **no confundir por nombre**: clave = (nombre, propiedad). No son la Casa de La Magia | MEDIO (colisión de nombre) | OPTIONAL |
| 7 | **Disponibilidad** (motor inventario compuesto / anti-doble-reserva) | Activo | acción 1896 (+rollback 1925), 1815, 1914 consulta, 1922 cotizador; automatizaciones 141, 187 | #2, #4, #5, `planning`, campos `planning.slot` | **A** código en JSON; **bloqueado por** campos de slot (#13) | ALTO: lógica compleja | CRITICAL |
| 8 | **HOLD** y vencimiento | Activo | acciones 1897, 1930 («HOLD visible en Planning»), 1906/1907 vencer HOLDs; cron 155 cada 15 min; automatización 197 | #7, campo `x_hold_*` de sale.order | **A** acciones + cron + automatización | MEDIO | CRITICAL |
| 9 | **Exclusión Casa↔habitaciones** | Activo | automatizaciones `planning.slot` **167** «Casa Completa bloquea Habitaciones», **169** «Habitación bloquea Casa», 168 limpieza, 189 guardia anti-solapamiento v3; 71 (mín. 10 personas-noche Casa) | #13, #4, #5 | **B** (código de 167/168/169/189 **no está en el repo**). Alterno **C**: re-escribir desde `src/hotel017-ops.mjs`/tests (HIPÓTESIS) | **ALTO: sin el código real hay que reescribirlo** | CRITICAL |
| 10 | **Reserva directa** | Operativa | acciones 1899 CONFIRMAR, 1935 crear reserva desde cotización, 1937 precio congelado, 1938; automatizaciones 198–201; vista piloto 6832; menú «Reservas hotel» acción 1909 | #2, #7, tarifas (#15) | **A** | MEDIO | CRITICAL |
| 11 | Estados de reserva: CHECKIN/CHECKOUT/CANCELAR/CERRAR/NO SHOW/OPCION/PRE CHECKIN | Operativos | acciones 1900–1905, 1898; 1875/1839/1840 | #10 | **A** | BAJO | IMPORTANT |
| 12 | **Operador / recepción** (usuario Ángela, PIN) | Gateway local con PIN; usuario Odoo creado por script | `scripts/crear-usuario-angela-staging.mjs`, `reception-*.mjs`, `reception-pin-hash.mjs`. **Grupos de seguridad hotel: no existen** (README del respaldo) | #10 | **A** script existente (requiere **correo real de Ángela**, no está en el repo) | MEDIO: correo pendiente; permisos = Ventas general | CRITICAL |
| 13 | Campos de `planning.slot` (`x_hotel_block_kind` manual/external/derived, `x_channel`, `x_bloqueo_ref`, `x_bloqueo_src_id`, `x_hotel_is_test`) | Existían | **sin definición exportada**; usos en `scripts/ath-disp-001-*.mjs`, `src/hotel017-*.mjs` | `planning` | **B** o **C** (HIPÓTESIS de tipos: selection, selection, char, many2one→planning.slot, boolean) | ALTO | CRITICAL |
| 14 | **Tablero de Ángela** | Kanban sobre `sale.order` | vista Studio 6833 (XML completo en `FINAL_APPROVED.md` §XML) + acción 1909 + filtro 26 | #2, #10 | **A** (ver §4) | BAJO | CRITICAL |
| 15 | Tarifas (12) + líneas (47) + anticipos (2) | Validadas | `master-data-x_hotel_rate/_rate_line/_deposit_policy.json`; acciones 1916–1921; automatizaciones 190–194, 200–201 | #1, #4 | **A** buscar por `x_rule_code`/`x_name`; entran como DRAFT y se validan a mano (la gobernanza lo exige) | MEDIO: **precios reales; no inventar** | IMPORTANT |
| 16 | Capacidad extra gobernada | Activa | acciones 1923/1924; automatizaciones 195/196 | #2 | **A** | BAJO | IMPORTANT |
| 17 | Vistas heredadas de `sale.order` (78) y 2 act_window / 4 menús | Activas | `ir-ui-view-sale-order-inherited.json`, `ir-actions-act-window-hotel.json`, `ir-ui-menu-hotel.json` | #1, #2; IDs de `inherit_id` cambian | **A** solo las ~10 con `x_hotel`/`HOTEL`/`Kanban`; el resto son nativas de módulos (**D**) | MEDIO: `inherit_id` por XMLID, no por id | IMPORTANT |
| 18 | Acción Gateway Sofía 1967 | Parcheada 4 veces | `odoo-patches/hotel-017/action-1967-base-9b053e02.py` + `patchActionCode` | #2, #4 | **A** base + parches aplicados en orden; el id nuevo ≠ 1967 y los scripts lo exigen | ALTO | IMPORTANT |
| 19 | OTA Booking/Airbnb: `x_hotel_ota_feed`, acciones 1979–1989, crons 156–160, adjuntos iCal | HOTEL-017 PASS | `manifest.json` (sin URLs ni claves) | #18, #13, **referencias inbound secretas fuera del repo** | **A** estructura / **C** referencias (las da Marlon). **No activar** crons ni feeds sin autorización | ALTO (OTA en vivo) | IMPORTANT |
| 20 | ATH-DISP-001 (corrección Casa 21–26 dic, Booking 6388397618) | Aplicada | `ath-disp-001-apply-*.mjs` | datos de una reserva real | **D**: es un dato, no configuración. No replicar | — | OPTIONAL |
| 21 | Housekeeping (cron 85, acciones 1487/1488, automatizaciones 17/18) | Activo | `ir-cron.json`, JSON de acciones | proyecto «House Keeping» | **A** tras crear proyecto/etapas | BAJO | OPTIONAL |
| 22 | Acción 1987 huérfana, acciones `TEST …`, `ROLLBACK COPY …`, slots 40018/40159/40161, HOLD de prueba 22232 | Residuos | milestone §6 y §8 | — | **D**: no migrar | — | OPTIONAL |
| 23 | Componentes ajenos al hotel en el respaldo (CCTV, DIAN, transporte, suscripciones, NIT) | Existían en la base mixta | automatizaciones 34–163 sin prefijo HOTEL | — | **D** salvo orden expresa | — | OPTIONAL |

Conteo (23 filas): **CRITICAL 12** (1,2,3,4,5,7,8,9,10,12,13,14; las más riesgosas son 9 y 13) · **IMPORTANT 6** (11,15,16,17,18,19) · **OPTIONAL 5** (6,20,21,22,23).

Orden crítico pedido por dirección: habitaciones (4) → Casa (5) → disponibilidad (7) → HOLD (8) → exclusión Casa↔rooms (9) → reserva directa (10) → operador (12) → tablero (14). El orden real de ejecución añade antes #1, #13 y #2 porque son sus dependencias.

## 3. Referencias HOTEL-017 / HOTEL-018

- **HOTEL-017 (encontrado):** 5 habitaciones mapeadas a Booking `16559325` (cuartos 1655932502–06), Airbnb en 202/203/301/302; Casa propiedad Booking separada `16569053` (sin conectar); acción 1967 con 4 parches; 6 feeds; crons 156–160; vínculos de adopción 469/477/694. Todo reproducible **como estructura**; ids vivos no.
- **HOTEL-018 (no encontrado):** no hay documento ni código con ese nombre. No se asume contenido.

## 4. Tablero de Ángela — definición exacta

**Hoy existe** (HOTEL-009, aprobado):
- **Menú:** «Hotel v1 (Piloto)» (ir.ui.menu 1000) → «Reservas hotel» (1001) → acción `ir.actions.act_window` **1909** «Hotel v1 — Reservas hotel», modelo `sale.order`, vistas `list,form,kanban`, dominio `[('x_hotel_unit_id','!=',False)]`.
- **Vista Kanban:** `ir.ui.view` 6833 «Odoo Studio: sale.order.kanban customization», hereda `sale.order.kanban`, agrupa por `x_reservation_status`; tarjeta con unidad, check-in, check-out, adultos, saldo `x_hotel_balance` y badge de estado. XML completo recuperable en `AI/ATH-ODOO-HOTEL-009_FINAL_APPROVED.md`.
- **Filtro guardado 26:** «Operación del día (sin canceladas)», por defecto: `x_hotel_unit_id != False` y `x_reservation_status not in [cancelled, no_show]`. (Existe además el script del filtro «Operación real (oculta QA)».)
- **Capa de lectura (código, probada):** `src/operational-read-model.mjs` (`today, arrivals, departures, inHouse, holds, paymentPending, upcoming, available, buildOperationalDashboard`), `src/angela-read-model.mjs` (7 estados: DISPONIBLE, HOLD, RESERVADA, OCUPADA, CHECK-OUT, LIMPIEZA, BLOQUEADA), `scripts/angela-dashboard-live.mjs`, `scripts/manager-dashboard-live.mjs`, diseño en `AI/ATH-ODOO-HOTEL-009_ANGELA_UX.md`.
- **«Centro de Operaciones» como nombre: no aparece en ningún archivo.** Lo que hay es el Kanban «Reservas hotel». Si el nombre existe en Odoo, estaba solo en la base. HIPÓTESIS: es el mismo tablero.

**Lo pedido vs. lo que hay (brecha):**

| KPI pedido | ¿Existe? | Fuente | Brecha |
|---|---|---|---|
| Disponibles | Parcial | `available()` / Kanban por estado | no es un KPI en pantalla |
| Ocupadas | Sí | `inHouse()` | |
| HOLD | Sí (si hay `explicit_status`) | `holds()`; `x_reservation_status` | |
| Bloqueadas | **No** como KPI | slots `x_hotel_block_kind` (manual/external/derived) | hay que leer `planning.slot`, no `sale.order` |
| Llegadas hoy / Salidas hoy | Sí | `arrivals()` / `departures()` | |
| Reservas confirmadas | Sí | `x_reservation_status` | |
| Saldos reales | Sí | `x_hotel_balance`, `paymentPending()` | cuidado: `reception-booking` y `financial-model.mjs` definen «real» |
| Filtros HOY / MAÑANA / 7 DÍAS / MES | **No** (solo `referenceDate` + `upcoming(horizonDays=14)`) | | construir 4 filtros con `ir.filters` sobre `x_checkin/x_checkout` |

**Separación ocupación comercial vs. bloqueos (requisito):** ocupación comercial = reservas `sale.order` confirmadas/check-in en una unidad física (ingreso real). Bloqueadas / HOLD / disponibles = estados de inventario. Los bloques **derivados** de Casa y los bloques OTA **sin pedido** no son ocupación comercial propia; hay que contarlos aparte para no inflar la ocupación. Esto exige distinguir `x_hotel_block_kind` en el tablero. Hoy el Kanban no lo hace.

**Dependencias:** #2 (campos `x_*`), #10, #7, #13 (para «Bloqueadas»), acción 1909, vista 6833, módulo `sale_renting`/`planning`.

## 5. Estrategia de idempotencia (aplica a todo)

1. **Nunca por id viejo.** Resolver: unidades por `(x_name, x_property_id.x_name)`; recursos/roles `planning` por nombre exacto; productos por `default_code` (`MAGIA-201`…); vistas por `(name, model)` + `inherit_id` resuelto por XMLID `sale.order.kanban`; acciones de servidor por `(name, model_id)`; automatizaciones por `name`; cron por `name`; filtros por `(name, model_id)`; campos por `(model, name)`.
2. **Buscar → comparar → solo entonces escribir.** Mismo valor ⇒ `SKIP`; no existe ⇒ `CREATE`; existe distinto ⇒ `DIFF` (se reporta, **no** se sobrescribe sin `--force-diff` explícito).
3. **Por defecto DRY-RUN.** Escribir exige `--apply` + `RECOVERY_CONFIRM=<nombre exacto de la base nueva>`.
4. **Guard propio.** `RECOVERY_TARGET_DB` debe ser exactamente `atheron1-hotel-staging-20261009`; se rechaza explícitamente `...20260923` y cualquier host `atheron1.odoo.com` de producción.
5. **Bitácora de rollback** por cada CREATE (modelo+id+nombre) en un JSON local, sin credenciales.
6. **Crons y automatizaciones se crean INACTIVOS** y se activan en un paso aparte autorizado.

## 6. Plan por fases (ejecución futura, solo sobre el staging NUEVO)

| Fase | Contenido | Pre-condición | Verificación | Rollback |
|---|---|---|---|---|
| R0 | Preflight solo lectura: versión Odoo, módulos (`sale_renting`, `planning`, `web_studio`), ¿qué existe ya?, ¿hay `x_hotel_*`? | credencial técnica del staging nuevo (Marlon, fuera del chat) | informe SKIP/CREATE/DIFF sin escrituras | n/a |
| R1 | Modelos `x_hotel_*` y campos de `planning.slot` | **BLOQUEADO** hasta dump o aceptar HIPÓTESIS de tipos | `ir.model.fields` coincide con claves de `master-data-*.json` | borrar los creados (bitácora) |
| R2 | 97 campos de `sale.order` | R1 | conteo = 97, tipos = JSON | idem |
| R3 | Propiedad → 5 habitaciones → Casa (+ recursos/roles/productos) | R1, R2 | `search_count` unidades = 6 de La Magia, Casa con 5 hijas | idem |
| R4 | Motor disponibilidad + HOLD + reglas 167/168/169/189 + cron HOLD (inactivo) | R3 y código de 167/169 | prueba sintética, ver abajo | desactivar + borrar |
| R5 | Reserva directa, estados, tarifas (DRAFT), anticipos | R4 | reserva TEST en 301 y luego Casa | cancelar TEST |
| R6 | Operador: usuario de Ángela, PIN | correo real | login + ver solo Reservas hotel | desactivar usuario |
| R7 | Tablero: vista Kanban, acción 1909, filtros HOY/MAÑANA/7 DÍAS/MES | R5 | tarjeta muestra unidad/fechas/saldo | borrar vista/filtros |
| R8 | OTA (acción 1967, feeds, crons) | **autorización expresa**; referencias inbound de Marlon | replay: CREATED 0 / CONFLICT 0 | restaurar acción previa |

Pruebas sintéticas mínimas de R4/R5 (todas con huéspedes ficticios, sin OTA ni pagos): (1) reservar 301 una noche ⇒ Casa queda bloqueada y 201/202/203/302 siguen libres; (2) reservar Casa esa noche ⇒ falla/queda en conflicto; (3) HOLD expira y libera; (4) misma fecha por reserva directa dos veces ⇒ segunda rechazada.

## 7. Si aparece el dump/filestore

Restaurar **solo en PostgreSQL local, solo lectura, sin arrancar Odoo**, y extraer **únicamente** (sin partners, pagos ni adjuntos):
```
ir_model, ir_model_fields        WHERE model LIKE 'x_hotel%' OR (model='planning.slot' AND name LIKE 'x\_%') OR (model='sale.order' AND name LIKE 'x\_%')
base_automation (+ rel. acciones) WHERE model en {planning.slot, sale.order, x_hotel_*}
ir_act_server  (code)             idem  ->  incluye 167,168,169,189,71 y 1967,1979-1989
ir_cron                           WHERE cron_name ILIKE '%HOTEL%' OR '%ATHERON%iCal%'
ir_ui_view / ir_ui_menu / ir_act_window / ir_filters   los de hotel
res_groups, ir_model_access, ir_rule  WHERE name ILIKE '%hotel%'
x_hotel_ota_feed                  columnas SIN x_inbound_feed_reference
```
Esto cierra los bloqueantes 5 y 6 del §0 y convierte las HIPÓTESIS de la matriz en HECHOS.

## 8. Reparto sugerido Claude Code / Codex

| Trabajo | Dueño sugerido | Motivo |
|---|---|---|
| Análisis del dump, extracción de definiciones y código de planning (§7) | **Claude Code** | pesado, solo lectura, no compite |
| Generar scripts R1–R7 y pruebas sintéticas locales | **Claude Code** | ya preparados en `recovery/` |
| Cualquier escritura en el staging nuevo (R1 en adelante) | **Una sola parte, decidida por ChatGPT** | evitar doble escritura |
| Acceso a la máquina con `dump.sql`/filestore y a Drive `G:` | **Codex** (o Marlon) | este contenedor no los ve |
| Navegador (Studio, Booking/Airbnb) | **Codex / Claude Chrome** | no disponible en la nube |
| R8 OTA | **Nadie hasta orden de Marlon** | tráfico real |

## 9. No se hizo / límites

No se contactó a Odoo, ni a Drive, ni a Codex. No se verificó el contenido del staging nuevo (puede ya traer cosas de Codex ATH-STAGING-RECOVERY-003: **antes de R1, ejecutar R0 y reconciliar con lo que Codex haya hecho**). Tipos de los modelos `x_hotel_*` = HIPÓTESIS. No se pudo medir el rendimiento web (fuera de alcance).

## 10. Anexo (pasada 002): evidencia y fase por componente

Evidencia: **REPO** = definición completa en el repo · **PARCIAL** = hay datos o nombres pero no la definición · **DUMP** = solo en el dump. Fases en `AI/ATH-STAGING-RECOVERY-CLAUDE-002_PLAN.md`.

| # | Componente | Evidencia | Fase | Script |
|---|---|---|---|---|
| 1 | Modelos `x_hotel_*` | DUMP | R1 | `r1-models-fields.mjs` (esqueleto) |
| 2 | 97 campos `sale.order` | REPO | R2 | por adaptar |
| 3 | Propiedad | REPO | R3 | `r3-master-data.mjs` |
| 4 | Habitaciones | REPO (datos) + DUMP (modelo) | R3 | `r3-master-data.mjs` |
| 5 | Casa Completa | REPO (datos) + DUMP (modelo) | R3 | `r3-master-data.mjs` |
| 7 | Disponibilidad | REPO (código acciones 1896/1914/1922) + DUMP (campos de slot) | R4 | `r4-actions-automations.mjs` (esqueleto) |
| 8 | HOLD | REPO (1897/1930/1906/1907, cron 155) | R4 | idem |
| 9 | Exclusión Casa↔rooms | DUMP (167/168/169/189 sin código en el repo) | R4 | idem |
| 10 | Reserva directa | REPO (1899/1935/1937/1938) | R4 | idem |
| 11–16 | Estados, tarifas, capacidad extra | REPO | R4/R5 | R4 / sin script |
| 12 | Operador | PARCIAL (script de usuario, sin correo) | R6 | sin script nuevo |
| 13 | Campos de `planning.slot` | DUMP | R1 | esqueleto |
| 14 | Tablero | REPO (1909, 6832, 6833, filtro 26, menús) | R7 | `r7-angela-board.mjs` |
| 17 | Vistas heredadas | REPO (arch completo) | R7 (solo 6832/6833) | idem |
| 18–19 | Acción 1967 / OTA | REPO (base + parches) / secretos fuera | R8 | fuera de alcance |
| 20–23 | Residuos y ajenos | — | no se migran | — |
