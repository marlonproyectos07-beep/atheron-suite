# ATH-STAGING-RECOVERY-009 — handoff a Codex/ChatGPT: ATH-007 + lista nominal de los 27 ítems

Fecha: 2026-10-10. Solo lectura del repositorio local: ni Odoo remoto, ni producción, ni push, ni commit de este archivo.
Destino: cerrar el cotejo READ-ONLY de ATH-STAGING-RECOVERY-008.

## 0. Advertencia de transporte (leer primero)
**ATH-007 solo existe en el contenedor de esta sesión de Claude Code y en 4 commits LOCALES.** `origin` no los tiene (`git status`: «ahead 4»). El contenedor es efímero. Mientras Marlon no autorice el push, Codex **no puede** leer estos archivos desde GitHub: por eso la lista nominal y las reglas esperadas van también pegadas en la respuesta de Claude Code.

## 1. Ubicación de ATH-STAGING-RECOVERY-007

| Dato | Valor |
|---|---|
| Repo / worktree | `/home/user/atheron-suite` (único worktree; árbol limpio antes de crear este archivo) |
| Remoto | `marlonproyectos07-beep/atheron-suite` |
| Rama | `feature/ath-odoo-hotel-017-booking-airbnb-level1` |
| **HEAD** | `b3b0b53ab173c2b5138f99a01d8463888a175926` |
| Base remota (origin) | `e0f0210` («ATH-BEDS24: checkpoint validated integration pending Beds24 support») |
| Commits locales (4) | `688acc7ef1be53b204b0b67cf249f5e9aa370e65` CLAUDE-001 · `4d0ae8f0dee88c3a87300f16c9a68917e84a28e4` CLAUDE-002 · `77041b023b83dee18c67807541203b1a16c7b7ac` CLAUDE-003 · `b3b0b53ab173c2b5138f99a01d8463888a175926` **ATH-007** |
| Alcance de ATH-007 | commit `b3b0b53`: 30 archivos (18 nuevos, 12 modificados). Acumulado de los 4 commits contra origin: 45 archivos (41 nuevos, 4 modificados), +3570/−5 líneas |
| Pruebas | paquete: 51 (`node --test recovery/test/*.test.mjs`) · suite completa del gateway: 558/558 |

### Archivos clave (git blob SHA-1 en HEAD · SHA-256 de contenido, primeros 12)
Raíz: `/home/user/atheron-suite/`

| Archivo | blob | sha256 |
|---|---|---|
| `AI/ATH-STAGING-RECOVERY-007_PAQUETE.md` | 2bcdcb5ec3a7 | fcc58d42e9be |
| `AI/RUNBOOK-CODEX-STAGING-RECOVERY.md` | 50f615072acf | 4c8440f53ee5 |
| `integrations/odoo-hotel-gateway/recovery/run.mjs` | 43b30112c3f7 | 87c03f38e833 |
| `…/recovery/guard.mjs` | 88ee42335bff | 3d0e237a73d5 |
| `…/recovery/snapshot.mjs` | 59404c9bb28a | 58901e26b76c |
| `…/recovery/engine.mjs` | 0cbabeaf014c | 00338df1eee8 |
| `…/recovery/steps.mjs` | 496add58783b | 6556df35b6f9 |
| `…/recovery/qa.mjs` | 611ca7020a24 | 70303a9cfe40 |
| `…/recovery/layers/r1.mjs` | 2035e7d26033 | 18fd0a8a60ea |
| `…/recovery/layers/r2.mjs` | 06102ed25343 | c723780b4b83 |
| `…/recovery/layers/r3.mjs` | ee9bf13cd179 | 2fe342984a63 |
| `…/recovery/layers/r4.mjs` | e25448efbe84 | cee132c517b0 |
| `…/recovery/layers/r5.mjs` | 7e1d944d8aaf | fd4112375b69 |
| `…/recovery/layers/r6.mjs` | 3a85ec179403 | 494ad9406367 |
| `…/recovery/layers/r7.mjs` | 4034ceb7fb29 | 6e221ca21b3c |
| `…/recovery/connect.mjs` | 458ea6f8642a | c3c2f4e96247 |
| `…/recovery/recovery-lib.mjs` | 2e29995fcc79 | 20477435bf04 |
| `…/recovery/pure.mjs` | 49366d1458a1 | 337991822297 |
| `…/recovery/EXTRACT-CONTRACT.md` | 1ffa54a3d81d | 82abe9001535 |
| `…/recovery/test/migration.test.mjs` | 86068f1e9a7a | c1b9df3c528a |
| `…/recovery/test/fake-odoo.mjs` | b490135874b7 | cc9587ca50c1 |
| `…/recovery/test/synthetic-extract.mjs` | 58b9415877cf | b4c0b42bdc1e |

Otros insumos que ATH-007 lee: `AI/staging-backup/*.json` (respaldo del 30-sep, **anterior** a HOTEL-017), `integrations/odoo-hotel-gateway/recovery/payloads/{view-kanban-6833.xml,search-angela-filtros.xml,kpi-row.json}`, `src/angela-board-model.mjs`.

Legado (envoltorios hacia `run.mjs`): `r0-preflight-readonly.mjs`, `r1-models-fields.mjs`, `r3-master-data.mjs`, `r3-rollback.mjs`, `r4-actions-automations.mjs`, `r7-angela-board.mjs`, `rollback.mjs`.

## 2. Lista nominal de los 27 ítems de compatibilidad Enterprise 19

**Significado de ESTADO LOCAL:** `LOCAL_PASS` = el paquete implementa la comprobación o el mecanismo y tiene prueba local (contra el Odoo **falso**; no prueba Enterprise 19) · `REMOTE_VERIFY_REQUIRED` = no hay prueba local significativa, solo Odoo real puede responder · `BLOCKED` = no puede cerrarse sin el extracto del dump · `UNKNOWN` = suposición o inferencia sin comprobación local.
Los 27 son los «RV-01…RV-27» de `AI/ATH-STAGING-RECOVERY-007_PAQUETE.md` §3. Las líneas `↳` enlazan el ítem con los hallazgos de Codex.

01 | Versión y edición de Odoo | PRECHECK | `common.version` devuelve `server_version` 19.x con sufijo `+e` (Enterprise) | UNKNOWN — `guard.mjs` **no** lo comprueba (solo el heredado `r0-preflight-readonly.mjs` imprime la versión); Codex ya midió 19.0+e en 008
02 | Entorno neutralizado | PRECHECK G4 | `ir.config_parameter` `database.is_neutralized` es legible por el usuario técnico y vale `True`; si no, exige atestación humana (`RECOVERY_TEST_ENV_ATTESTATION`) y deja ADVERTENCIA G4b | LOCAL_PASS
03 | URL del servidor no es producción | PRECHECK G3 | `ir.config_parameter` `web.base.url` es legible y no contiene `atheron1.odoo.com`, `hotelesatheron.com` ni el staging viejo | LOCAL_PASS
04 | Módulos instalados | PRECHECK G5 | `sale_management`, `planning`, `base_automation` en estado `installed`; `web_studio` y `sale_renting` presentes (ADVERTENCIA si faltan) | LOCAL_PASS
05 | Contrato de campos de 12 modelos | PRECHECK G6 | `fields_get` de `ir.model`, `ir.model.fields`, `ir.actions.server`, `base.automation`, `ir.cron`, `ir.ui.view`, `ir.ui.menu`, `ir.filters`, `ir.actions.act_window`, `planning.slot`, `sale.order`, `res.users` contiene los campos que usan las capas (alternativas `cron_name`/`name` y `groups_id`/`group_ids`) | LOCAL_PASS
06 | Crear y borrar modelos y campos manuales | R1 + ROLLBACK | el usuario técnico puede crear/borrar `ir.model` e `ir.model.fields` con `state='manual'` por XML-RPC en este entorno (permisos; ¿exige `web_studio`?) | BLOCKED
07 | Formato de selecciones | R1 / R2 | `selection_ids=[(0,0,{value,name,sequence})]` es aceptado al crear campos `selection` | REMOTE_VERIFY_REQUIRED
08 | Campos one2many | R1 / R2 | crear un `one2many` exige que el `relation_field` ya exista; el orden m2o → o2m → m2m del paquete lo satisface | REMOTE_VERIFY_REQUIRED
09 | Campo monetario | R2 | `x_total_preview` (monetary) se crea sin `currency_field` explícito y usa la moneda de `sale.order` | REMOTE_VERIFY_REQUIRED
10 | Tablas de relación many2many | R2 | los nombres de tabla/columnas autogenerados para los 3 many2many (`x_guests`, `x_paquete_cotizacion`, `x_responsabilidad_iva_cliente`) caben en el límite de 63 caracteres de PostgreSQL | UNKNOWN
11 | Campo de grupos de `res.users` | R6 | `groups_id` o `group_ids` (se detecta en ejecución) y escribir grupos al crear el usuario es válido | LOCAL_PASS
12 | Nombre de `ir.cron` | R4 | el campo es `cron_name` o `name` (se detecta en ejecución) | BLOCKED
13 | `base.automation` | R4 | existen `action_server_ids`, `trigger`, `filter_domain`; se puede crear la automatización **inactiva** y enlazarla a sus acciones | BLOCKED
14 | Código de acciones bajo `safe_eval` de la 19 | R4 / R5 / QA | el código copiado tal cual (`env[...]`, `datetime`, `UserError`, `records`) ejecuta sin cambios | REMOTE_VERIFY_REQUIRED
15 | Modelo técnico de las acciones | R5 | «Hotel v1 — Propiedad / Tarifa / Cotización (registro auditable)» ⇒ `x_hotel_property` / `x_hotel_rate` / `x_hotel_quote` | UNKNOWN
16 | XMLID de las vistas padre | R7 | `sale.sale_order_view_kanban` y `sale.view_order_form` resuelven a vistas llamadas `sale.order.kanban` y `sale.order.form` | UNKNOWN
17 | Vistas heredadas por XML-RPC | R7 | crear vistas `extension` (`arch`, `inherit_id`, `mode`, `priority`) pasa la validación de arquitectura | REMOTE_VERIFY_REQUIRED
18 | Campo `action` del menú | R7 | acepta `ir.actions.act_window,<id>` (formato leído en el respaldo del 30-sep) | REMOTE_VERIFY_REQUIRED
19 | Filtros guardados | R7 | `ir.filters` acepta `model_id` como texto, `user_ids`, `action_id`, `is_default` | REMOTE_VERIFY_REQUIRED
20 | Grupos por XMLID | R6 | existen `base.group_user` y `sales_team.group_sale_salesman_all_leads` (y se verifica que **no** se otorguen `base.group_system` ni `base.group_no_one`) | LOCAL_PASS
21 | Contextos de escritura | TODAS | `tracking_disable`, `mail_notrack`, `mail_create_nolog`, `mail_create_nosubscribe`, `no_reset_password` se aceptan y realmente evitan correos y chatter | REMOTE_VERIFY_REQUIRED
22 | Operador `like` con guion bajo | SNAPSHOT / R3 | `like 'x_hotel_'` (el `_` comodín) no arrastra modelos ajenos | REMOTE_VERIFY_REQUIRED
23 | Borrar modelo con datos/ACL/vistas | ROLLBACK | `unlink` de `ir.model` con registros, ACL o vistas que lo referencian: orden y errores | REMOTE_VERIFY_REQUIRED
24 | Borrar campos usados por vistas | ROLLBACK | `unlink` de campos manuales referenciados por vistas (R7 se deshace primero) | REMOTE_VERIFY_REQUIRED
25 | Comportamiento real del QA | QA (pasos 9–10) | Q1 reservar 301 (acepta) · Q2 repetir 301 (rechaza) · Q3 Casa esa noche (rechaza) · Q4 reservar 201 (acepta) con la guardia anti-solapamiento activa | BLOCKED
26 | Pago confirmado | TABLERO | `account.payment` con `state='paid'` equivale a `PAYMENT_CONFIRMED` (único que reduce el SALDO_REAL) | LOCAL_PASS
27 | Permiso para leer parámetros | PRECHECK G3 / G4 | el usuario técnico puede leer `ir.config_parameter`; si no, la guardia falla **cerrada** | LOCAL_PASS

Enlaces de los ítems con los hallazgos de Codex (formato pedido):

- **Ítem 05** (`planning.slot` en el contrato de campos; reglas 167/168/169/189)
  - EXPECTED_FROM_ATH007: `planning.slot` expone `resource_id, role_id, start_datetime, end_datetime, state`.
  - SOURCE_FILE: `recovery/guard.mjs` · SOURCE_FUNCTION_OR_SECTION: constante `CONTRACTS['planning.slot']`, comprobación G6 en `runGuard`.
- **Ítem 06 / 07 / 08** (modelos `x_hotel_*`, campos de `planning.slot`, 4 campos de R2)
  - EXPECTED_FROM_ATH007: R1 crea los modelos listados en `AI/recovery-extract/models.json` (patrón `x_hotel_*` o `x_guests_line`) y los campos de `fields.json` (excepto `sale.order`, que crea R2).
  - SOURCE_FILE: `recovery/layers/r1.mjs` · SOURCE_FUNCTION_OR_SECTION: `OWN_MODEL`, `run()`, `verify()`; `recovery/EXTRACT-CONTRACT.md` filas `models.json`, `fields.json`, `selections.json`.
- **Ítem 07 / 08** (los 4 campos faltantes de R2)
  - EXPECTED_FROM_ATH007: R2 **no** crea `x_guest_line_ids`, `x_hotel_payment_ids` (falta `relation_field`), `x_regimen_cliente`, `x_tipo_persona_cliente` (la selección del respaldo es `[]`); quedan `BLOQUEA` hasta el extracto. Crea los otros 76.
  - SOURCE_FILE: `recovery/layers/r2.mjs` · SOURCE_FUNCTION_OR_SECTION: `plan()` (campo `issues`), `run()`; dato de origen `AI/staging-backup/ir-model-fields-sale-order-custom.json`.
- **Ítem 12 / 13 / 14** (reglas 167, 168, 169, 189, acciones y crons)
  - EXPECTED_FROM_ATH007: R4 crea, **inactivas**, las automatizaciones y crons del extracto, con el código de cada acción copiado tal cual (SHA-256). Empareja por **(nombre, modelo)**, nunca por id.
  - SOURCE_FILE: `recovery/layers/r4.mjs` · SOURCE_FUNCTION_OR_SECTION: `run()` (acciones → automatizaciones → crons), `verify()`; `recovery/EXTRACT-CONTRACT.md` filas `server_actions.json`, `automations.json`, `crons.json`.
- **Ítem 16 / 17** (vista 6833)
  - EXPECTED_FROM_ATH007: `ir.ui.view` «Odoo Studio: sale.order.kanban customization», modelo `sale.order`, `mode=extension`, `priority=1000`, hereda `sale.order.kanban`, `arch` idéntico al respaldo (agrupa por `x_reservation_status`).
  - SOURCE_FILE: `recovery/layers/r7.mjs` · SOURCE_FUNCTION_OR_SECTION: `evidence()`, `run()` (bloque Kanban), `verify()` («vista Kanban 6833»); texto del arch en `recovery/payloads/view-kanban-6833.xml` y `AI/ATH-ODOO-HOTEL-009_FINAL_APPROVED.md` §«XML final válido del Kanban».
- **Ítem 17 / 18** (acción 1909 y menús)
  - EXPECTED_FROM_ATH007: `ir.actions.act_window` «Hotel v1 — Reservas hotel», `res_model=sale.order`, `domain=[('x_hotel_unit_id','!=',False)]`, `context={}`, `view_mode=list,form,kanban`; menús «Hotel v1 (Piloto)» (seq 90) → «Reservas hotel» (seq 10). Se empareja por nombre, no por id 1909.
  - SOURCE_FILE: `recovery/layers/r7.mjs` · SOURCE_FUNCTION_OR_SECTION: `run()` (acción y menús), `verify()`; datos en `AI/staging-backup/ir-actions-act-window-hotel.json` y `ir-ui-menu-hotel.json`.
- **Ítem 19** (filtro 26)
  - EXPECTED_FROM_ATH007: `ir.filters` «Operación del día (sin canceladas)», `sale.order`, dominio `[('x_hotel_unit_id','!=',False),('x_reservation_status','not in',['cancelled','no_show'])]`, por defecto, compartido (`user_ids=[]`), enlazado a la acción nueva.
  - SOURCE_FILE: `recovery/layers/r7.mjs` · SOURCE_FUNCTION_OR_SECTION: `run()`, `verify()` («filtro Operación del día»); dato `AI/staging-backup/ir-filters-sale-order.json` id 26.
- **Acción 1967** — **ningún ítem de los 27 la cubre.**
  - EXPECTED_FROM_ATH007: ATH-007 **no la toca** (es R8 «OTA», fuera de alcance). La base está en `odoo-patches/hotel-017/action-1967-base-9b053e02.py`; versión vigente en el staging viejo: sha256 `c0b1eb15…` (4 parches temporales).
  - SOURCE_FILE: `AI/ATH-ODOO-HOTEL-017_STAGING-MILESTONE_2026-10-05.md` · SOURCE_FUNCTION_OR_SECTION: §4 «Acción 1967»; `integrations/odoo-hotel-gateway/odoo-patches/hotel-017/manifest.json` (`action_1967`); `AI/RUNBOOK-CODEX-STAGING-RECOVERY.md` (no la incluye).
- **Dashboard de Ángela**
  - EXPECTED_FROM_ATH007: R7 crea Kanban 6833, formulario 6832 (botones reescritos al id nuevo de cada acción), acción, menús y filtro 26. **No** crea la fila KPI dentro de Odoo (portador sin decidir); solo valida el contrato `payloads/kpi-row.json` contra `src/angela-board-model.mjs`. Filtros HOY/MAÑANA/7 DÍAS/MES: borrador XML, solo con `--with-filters`.
  - SOURCE_FILE: `recovery/layers/r7.mjs` · SOURCE_FUNCTION_OR_SECTION: `run()`, `kpiContract()`; reglas funcionales en `AI/ATH-STAGING-RECOVERY-CLAUDE-003_REGLAS-TABLERO.md`.
- **Ítem 25** (guardia 189 y exclusión Casa↔habitaciones, en comportamiento)
  - EXPECTED_FROM_ATH007: con la guardia activa, Q2 y Q3 deben ser rechazadas y Q1/Q4 aceptadas.
  - SOURCE_FILE: `recovery/qa.mjs` · SOURCE_FUNCTION_OR_SECTION: `SCENARIOS`, `runQA()`.

## 3. Reglas 167, 168, 169 y guardia 189

**Qué hay realmente en el repo:** nombre, modelo, disparador y estado (vía `AI/staging-backup/base-automation.json`, lectura del 30-sep) + comentarios de los scripts `scripts/ath-disp-001-*.mjs` + la regla de negocio de `odoo-hotel-ical/src/inventory-model.mjs`. **El `filter_domain`, el `filter_pre_domain` y el código de las acciones de 167, 168, 169 y 189 NO están en el repo.** Los scripts `ath-disp-001-*-readonly.mjs` los leyeron del Odoo viejo y volcaron la salida a una carpeta temporal de la máquina Windows de Marlon (`…\scratchpad\odoo-actions\rule-169-action-1855.py`), que no está versionada.

### RULE_167_EXPECTED — «ATHERON - Casa Completa bloquea Habitaciones»
- **Modelo:** `planning.slot` (en el viejo, `model_id` 657 «Planning Shift»). **Trigger:** `on_create_or_write`. **Estado en el viejo:** activa.
- **Domain (`filter_domain` / `filter_pre_domain`):** NO DISPONIBLE en el repo. Indicio indirecto: *no se dispara si el bloque trae `x_bloqueo_ref`* (`scripts/ath-disp-001-apply-casa-block.mjs`, cabecera).
- **Intención funcional (evidencia):** un bloque en el rol/recurso de **Casa Completa** (viejo: rol 69, recurso 79) genera bloques **derivados** (`x_hotel_block_kind='derived'`, `x_bloqueo_src_id` → bloque origen) en las **habitaciones libres** 201/202/203/301/302 para el mismo tramo («la regla 167 propaga a las habitaciones libres»). Para encontrarlas busca roles de habitación de La Magia con `planning.role.x_casa = 'La Magia de Zipaquirá'` y `x_is_a_room_offer = True` (`scripts/ath-disp-001-precheck-rooms-readonly.mjs`). No actúa sobre habitaciones ya bloqueadas: por eso la «Opción C» creó antes bloques manuales en 201/202/203/301 (21 20:00 → 25 16:00) y dejó para Casa solo 25→26 (`scripts/ath-disp-001-apply-option-c.mjs`, cabecera).
- **Regla de negocio:** «Casa Completa reservada bloquea 201/202/203/301/302» (`odoo-hotel-ical/src/inventory-model.mjs`, cabecera y `occupancyReason`).
- **Código/configuración esperada:** no disponible. ATH-007 la tomará de `AI/recovery-extract/{automations,server_actions}.json` (campos `trigger`, `filter_domain`, `filter_pre_domain`, `action_names`, `code`) y la compara por SHA-256.

### RULE_168 — «ATHERON - Limpiar bloques al borrar reserva (casa/hab)»
- `planning.slot`, `on_unlink`, activa. Intención (solo por nombre y por el campo `x_bloqueo_src_id`): al borrar el bloque origen, limpiar los derivados. Sin domain ni código en el repo.

### RULE_169_EXPECTED — «ATHERON - Habitacion bloquea Casa Completa»
- **Modelo:** `planning.slot`. **Trigger:** `on_create_or_write`. **Estado en el viejo:** activa. **Acción vinculada en el viejo:** id **1855** (único dato: el nombre del archivo `rule-169-action-1855.py` en `scripts/ath-disp-001-precheck-casa-readonly.mjs`).
- **Domain:** NO DISPONIBLE en el repo.
- **Intención funcional (evidencia):** un bloque **no derivado** en una habitación genera un bloque derivado en Casa Completa («habitación → Casa»); el script de auditoría busca «bloques de habitación NO derivados sin bloque de Casa solapado (la regla 169 no reflejó)» (`scripts/ath-disp-001-pattern-audit-readonly.mjs`).
- **Regla de negocio:** «Una habitación reservada bloquea Casa Completa; NO bloquea las demás habitaciones» (`inventory-model.mjs`).
- **Código/configuración esperada:** no disponible; mismo origen que 167 (extracto del dump).

### RULE_189_INTENT — «HOTEL v1 — Guardia anti-solapamiento Planning v3 (002/003)»
- **Modelo/trigger/estado en el viejo:** `planning.slot`, `on_create_or_write`, activa. Código: no está en el repo.
- **Intención funcional:** impedir que dos bloques/reservas se solapen sobre el mismo recurso. Evidencia de que existe y rechaza: «Orden (evita solapamientos que Odoo rechaza)» (`ath-disp-001-apply-option-c.mjs`).
- **Por qué NO copiarla a ciegas:**
  1. su código no está en el repo: «copiar» sería tomarlo del dump sin saber contra qué se escribió;
  2. el sufijo «v3 (002/003)» indica parches sucesivos de las fases HOTEL-002/003, **anteriores** a HOTEL-017 (adopción OTA, bloques `external`/`derived`, reproducciones sin duplicados);
  3. puede tener ids de recurso/rol del staging viejo escritos a mano (28–32, 79, 69, 29, 19, 30, 37, 18); ATH-007 detecta números iguales a esos ids y los marca `REVISAR`;
  4. su orden respecto de 167/169 decide qué se rechaza y qué se propaga: no puede validarse sin ejecutarlo;
  5. el entorno nuevo es Enterprise 19.0+e: `safe_eval` y el ORM pueden diferir.
- **Condiciones que debe cumplir una versión equivalente** (con su fuente; las marcadas «propuesta» no tienen evidencia y deben validarse):
  - Rechazar solape de intervalos sobre el mismo `resource_id`, excluyendo el propio registro al escribir — *propuesta*.
  - Intervalos que **se tocan** (fin = inicio) deberían no ser solape: el script de la Opción C encadena fin 25 16:00 / inicio 25 16:00 («terminan donde empieza el derivado»); el repo no documenta el resultado de su ejecución, así que es *evidencia de diseño*, no de comportamiento — validar.
  - Aplica a recursos de habitación **y** de Casa Completa — *evidencia* (el solape Casa/habitación fue el problema de ATH-DISP-001).
  - Compatible con la propagación 167/169: no debe rechazar los derivados legítimos ni impedir que 167 omita habitaciones ocupadas — *evidencia indirecta*.
  - No depender de ids numéricos: resolver recursos/roles por nombre o estructura — *requisito del proyecto*.
  - Idempotente con las reproducciones del importador OTA (segundo pase `CREATED 0 / CONFLICT 0`) y con las adopciones de la acción 1967 — *evidencia*: `AI/ATH-ODOO-HOTEL-017_STAGING-MILESTONE_2026-10-05.md`.
  - Qué estados de slot cuentan (publicado/borrador) y si falla cerrada o abierta ante datos incompletos — **UNKNOWN**: sin evidencia.
- **Lo que ATH-007 llama «guardia 189 equivalente»:** (a) `precheck` = guardia de **entorno** (G1–G8); no replica la 189; (b) `requireOverlapGuard()` exige que exista **activa y enlazada** la automatización llamada exactamente «HOTEL v1 — Guardia anti-solapamiento Planning v3 (002/003)», y solo la usa el QA; (c) la automatización en sí la crea R4 **inactiva** desde el extracto. No hay, hoy, ninguna versión funcional equivalente verificada.
- **Pendiente (no se genera todavía):** definir la versión equivalente una vez cotejada la 189 viva del staging nuevo.

## 4. Qué buscar, solo lectura, en el staging nuevo

Emparejar siempre por **(nombre, modelo)**, nunca por id (los ids 167/168/169/189/1855/1909/6833/26/1967 son del staging viejo).

| Elemento | Nombre esperado | Modelo | Trigger (viejo) | Activa en el viejo | ATH-007 la deja |
|---|---|---|---|---|---|
| 167 | ATHERON - Casa Completa bloquea Habitaciones | planning.slot | on_create_or_write | sí | **inactiva** (R4) |
| 168 | ATHERON - Limpiar bloques al borrar reserva (casa/hab) | planning.slot | on_unlink | sí | inactiva |
| 169 | ATHERON - Habitacion bloquea Casa Completa | planning.slot | on_create_or_write | sí | inactiva |
| 189 | HOTEL v1 — Guardia anti-solapamiento Planning v3 (002/003) | planning.slot | on_create_or_write | sí | inactiva (la activa Marlon solo para el QA) |
| 187 | HOTEL v1 — Motor inventario compuesto / anti-doble-reserva | sale.order | on_create_or_write | sí | inactiva |
| 197 | HOTEL v1 — HOLD visible en Planning (003) | sale.order | on_create_or_write | sí | inactiva |

Por tanto, una **diferencia de `active`** entre el staging nuevo y el viejo es **esperada**; una diferencia de modelo o de disparador, no. Las diferencias de `filter_domain`, de `filter_pre_domain` y de código no se pueden cotejar contra ATH-007 (ahí no existe el valor esperado): se cotejan contra el extracto del dump cuando llegue.

## 5. Discrepancias conocidas (para que el cotejo no se confunda)
1. **Ítem 01 (versión):** `AI/ATH-STAGING-RECOVERY-007_PAQUETE.md` §3 lo ubica en el `precheck`, pero `guard.mjs` **no** llama a `common.version`. Es una inexactitud de la documentación de ATH-007, no de Odoo.
2. **Los 27 no cubren las reglas 167/168/169/189 ni la acción 1967 de forma directa.** Solo hay cobertura indirecta (ítems 13, 14 y 25). El cotejo de reglas que hizo Codex en 008 es **información que ATH-007 no tenía**.
3. **Ids vs nombres:** los números 167/168/169/189 son ids del viejo; ATH-007 nunca empareja por id.
4. **Lo que difiere en 167/169 según Codex:** ATH-007 no tiene valor esperado de `filter_domain`/código, solo nombre, modelo, trigger y estado; si «DIFIEREN» se refiere a otra cosa, el valor de referencia está en el dump.
5. **R2 incompleta:** 76 de 80 campos; los 4 restantes y todo R1/R4 esperan `AI/recovery-extract/` (hoy vacío).
6. **Falta el modelo `x_guests_line`** en el filtro original del extractor; ya corregido en ATH-007 (modelo propio de Studio «Guests Line»).
7. **Respaldo anterior a HOTEL-017:** `AI/staging-backup/` es del 30-sep; no tiene `x_hotel_ota_feed`, `x_hotel_api_log`, acciones 1979–1989, crons 156–160 ni la acción 1967 vigente.
8. **Numeración:** R0–R7 son las de ATH-007. El plan, el runbook y los «8/8 pruebas» de ATH-STAGING-RECOVERY-006 **no están en este repositorio**; si usan otra numeración hay que conciliarla antes de ejecutar ambos juegos.
9. **El extracto sintético de las pruebas** (tipos inferidos) **no** representa el dump y vive solo en un directorio temporal; las 51 pruebas no dicen nada sobre Enterprise 19.
10. **Transporte:** sin push no hay forma de que Codex lea ATH-007 desde GitHub (ver §0).
