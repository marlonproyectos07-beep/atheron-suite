# ATH-STAGING-RECOVERY-007 — paquete de migración: gate y clasificación

Fecha: 2026-10-10. **Solo local.** Odoo remoto sin tocar, producción intacta, sin push.

## GATE: `MIGRATION_PACKAGE_READY = NO`

No está listo porque faltan capas críticas que **no se pueden completar sin el dump**, y porque ninguna de las capas ha corrido contra Odoo Enterprise 19 real. No se declara READY con una sola capa crítica abierta.

| Condición del gate | Estado |
|---|---|
| Guardia | ✅ hecha y probada localmente; sus comprobaciones contra Odoo real quedan por verificar (§3) |
| R1–R7 | ❌ R1 y R4 **bloqueadas** (sus definiciones están solo en el dump); R2 con 4 campos bloqueados; R3, R5, R6, R7 listas pero dependen de R1/R2/R4 |
| Snapshot | ✅ hecho y ensayado en el Odoo falso (PRE → POST → tras rollback = idéntico) |
| Verify | ✅ en cada capa |
| Rollback | ✅ probado en el Odoo falso (8 escenarios); ❌ **no validado contra la estructura Enterprise 19 real** |
| Runbook | ✅ `AI/RUNBOOK-CODEX-STAGING-RECOVERY.md` (pasos 0–10, STOP en cada uno) |
| Tests locales | ✅ 51 del paquete; 558/558 en el gateway |
| Lista de verificaciones remotas | ✅ §3 (27 ítems) |

**Una nota de procedencia:** el plan, el runbook y los scripts de `ATH-STAGING-RECOVERY-006` (los «8/8 pruebas») **no están en este repositorio ni en esta rama**. Este paquete es autocontenido (R0–R7 con numeración propia, ver abajo). Si el trabajo de 006 vive en otra rama o máquina, hay que conciliar nombres y no ejecutar los dos juegos de scripts a la vez.

## 1. Clasificación por capa

`LOCAL_PASS` = la lógica pasa en el Odoo falso · `REMOTE_VERIFY_REQUIRED` = solo puede comprobarse contra Odoo Enterprise 19 real · `BLOCKED` = falta evidencia que solo trae el dump.

| Capa | Qué hace | Local | Remoto | Bloqueo |
|---|---|---|---|---|
| **GUARDIA** (`precheck`) | base/URL exactas, no producción, neutralizado, estructura, contrato de campos, prerrequisitos de Planning | LOCAL_PASS (8 pruebas) | REMOTE_VERIFY_REQUIRED (G3–G6, G8) | — |
| **SNAPSHOT** | foto PRE/POST sin PII ni secretos, diff por clave natural | LOCAL_PASS | REMOTE_VERIFY_REQUIRED (semántica de `like`, campos legibles) | — |
| **R1** modelos y campos | crea `x_hotel_*`, `x_guests_line`, campos de `planning.slot` y `account.payment` | LOCAL_PASS (mecánica, con extracto **sintético**) | REMOTE_VERIFY_REQUIRED | **BLOCKED**: `models/fields/selections.json` (dump) |
| **R2** campos `sale.order` | 80 campos `x_*` propios (17 estándar excluidos) | LOCAL_PASS 76/80 | REMOTE_VERIFY_REQUIRED | **BLOCKED** 4 campos: `x_guest_line_ids`, `x_hotel_payment_ids` (falta `relation_field`), `x_regimen_cliente`, `x_tipo_persona_cliente` (selección vacía en el respaldo) |
| **R3** datos maestros | propiedad, 5 habitaciones, Casa con 5 hijas, 2 anticipos | LOCAL_PASS | REMOTE_VERIFY_REQUIRED | depende de R1; recursos/roles/productos de Planning deben preexistir (G8) |
| **R4** reglas | acciones, automatizaciones (inactivas), crons (inactivos), **guardia anti-solapamiento** | LOCAL_PASS (mecánica, sintético) | REMOTE_VERIFY_REQUIRED | **BLOCKED**: `server_actions/automations/crons.json` con enlaces (dump). Incluye el **código** de 167/168/169/189/71 |
| **R5** reserva directa | 24 acciones «HOTEL v1 …», código idéntico (SHA-256) | LOCAL_PASS | REMOTE_VERIFY_REQUIRED | depende de R1/R2 |
| **R6** operador | usuario Ángela, grupos por XMLID, nunca admin/técnico | LOCAL_PASS | REMOTE_VERIFY_REQUIRED | insumo en tiempo de ejecución: correo real (lo da Marlon) |
| **R7** tablero | vistas 6833/6832, acción, menús, filtro, contrato KPI | LOCAL_PASS | REMOTE_VERIFY_REQUIRED | depende de R2/R5; **portador de la fila KPI sin decidir** |
| **ROLLBACK** | selectivo, parcial, repetible, respeta lo preexistente | LOCAL_PASS (8 escenarios) | REMOTE_VERIFY_REQUIRED | — |
| **QA** (9–10) | 4 escenarios sintéticos + limpieza | LOCAL_PASS (mecánica) | REMOTE_VERIFY_REQUIRED (comportamiento real) | depende de que R4 cree la guardia y de que Marlon la active |

## 2. Qué demuestran (y qué no) las pruebas locales

**Demuestran:** idempotencia (reaplicar no crea nada); dry-run sin escrituras; secuencia *apply → verify → rollback → verify rollback → re-apply → verify*; que tras el rollback el snapshot es **idéntico** al PRE; que lo preexistente jamás se borra ni se pisa; rollback de capa parcial tras un fallo inyectado a mitad; `CONFLICT` si alguien cambió un valor después; rollback repetible; STOP si una capa previa no verifica; guardia que aborta (producción, no neutralizado, módulo ausente, contrato roto, parámetro ilegible → falla cerrado); R6 sin permisos de administrador y sin dejar el correo en la bitácora; snapshot sin credenciales; CLI con rechazos previos a la red.

**No demuestran:** nada sobre Odoo Enterprise 19. El Odoo falso solo exige que existan modelos y campos y que los x2many lleguen como comandos; no valida vistas, ACL, `compute`, automatizaciones, `safe_eval` ni reglas de negocio. **El extracto usado en las pruebas es sintético** (tipos inferidos del respaldo) y solo vive en un directorio temporal; la CLI no puede apuntar a él.

**Defectos reales que las pruebas sacaron a la luz y quedaron corregidos:** (a) el rollback restauraba un many2many con una lista cruda de ids (Odoo exige comandos); (b) el extractor omitía el modelo propio `x_guests_line`; (c) el campo `account.payment.x_hotel_sale_order_id` también debe recrearse (el lector del tablero lo usa); (d) un registro preexistente que difiere de lo esperado pasaba como OK sin avisar.

## 3. Verificaciones que SOLO pueden hacerse contra Odoo Enterprise 19 real

Todas se ejecutan al correr el STEP indicado del runbook; si fallan, es STOP.

| # | Qué verificar | Dónde |
|---|---|---|
| RV-01 | Versión y edición reales (`common.version`) | precheck |
| RV-02 | `database.is_neutralized` es legible por el usuario técnico y vale `True` (si no, atestación humana) | G4 |
| RV-03 | `web.base.url` legible y no es producción | G3 |
| RV-04 | `sale_management`, `planning`, `base_automation` instalados; `web_studio` presente (R1 podría requerirlo) | G5 |
| RV-05 | Contrato de campos de los 12 modelos (nombres de campo reales en la 19) | G6 |
| RV-06 | El usuario técnico puede **crear/borrar** `ir.model` e `ir.model.fields` manuales por XML-RPC en este entorno | R1 + rollback |
| RV-07 | Formato `selection_ids=[(0,0,{value,name,sequence})]` aceptado | R1/R2 |
| RV-08 | Crear `one2many` exige el `relation_field` ya existente (el orden de creación lo respeta) | R1/R2 |
| RV-09 | Campos `monetary` (`x_total_preview`) y su `currency_field` | R2 |
| RV-10 | Nombres de tablas de relación many2many dentro del límite de PostgreSQL | R2 |
| RV-11 | `res.users`: `groups_id` o `group_ids` (se detecta) y que escribir grupos al crear es válido | R6 |
| RV-12 | `ir.cron`: `cron_name` o `name` (se detecta) | R4 |
| RV-13 | `base.automation`: `action_server_ids`, `trigger`, `filter_domain`; crear inactiva | R4 |
| RV-14 | Que el código de las acciones corra bajo el `safe_eval` de la 19 (`env[...]`, `datetime`, `UserError`) | R4/R5 + QA |
| RV-15 | Mapeo nombre mostrado → modelo técnico de las acciones (`Hotel v1 — Propiedad/Tarifa/Cotización`) | R5 |
| RV-16 | XMLID de las vistas padre (`sale.sale_order_view_kanban`, `sale.view_order_form`) — **es una suposición**; el script verifica por nombre y aborta si no coincide | R7 |
| RV-17 | Crear vistas heredadas por XML-RPC (`arch`, `inherit_id`, `mode`, `priority`) pasa la validación de arquitectura | R7 |
| RV-18 | Formato del campo `action` del menú (`ir.actions.act_window,ID`) | R7 |
| RV-19 | `ir.filters`: `model_id` como texto, `user_ids`, `action_id`, `is_default` | R7 |
| RV-20 | Grupos por XMLID (`base.group_user`, `sales_team.group_sale_salesman_all_leads`) existen | R6 |
| RV-21 | Contextos de escritura (`tracking_disable`, `mail_notrack`, …) aceptados y realmente evitan correos | todas |
| RV-22 | Operador `like` con `_` (`x_hotel_`) sobre-coincide: confirmar que no arrastra modelos ajenos | snapshot/R3 |
| RV-23 | Borrar `ir.model` con datos/ACL/vistas que lo referencian: orden y errores | rollback |
| RV-24 | Borrar campos referenciados por vistas ya borradas (R7 se deshace primero) | rollback |
| RV-25 | Comportamiento real de las 4 pruebas QA (rechazo de solapamientos) | STEP 9 |
| RV-26 | `account.payment.state='paid'` ⇒ `PAYMENT_CONFIRMED` (regla del tablero) | tablero |
| RV-27 | Permisos del usuario técnico para leer `ir.config_parameter` | G3/G4 |

## 4. Qué falta para pasar a `MIGRATION_PACKAGE_READY = YES`

1. **`AI/recovery-extract/`** completo (contrato en `recovery/EXTRACT-CONTRACT.md`), incluyendo `x_guests_line`, los campos derivados de R4 y los campos de `account.payment`. Falta construir la parte del extractor que resuelve los derivados (depende de `extract/discover.sql` sobre el dump real).
2. Con el extracto: cerrar R1, R4 y los 4 campos de R2, y repetir las pruebas con las definiciones **reales** en lugar de las sintéticas.
3. Un primer pase **solo de lectura** del `precheck` y el `snapshot` contra el staging nuevo (RV-01…RV-05, RV-27), que no escribe nada.
4. Decisiones de negocio ya listadas (criterio comercial de confirmación, política de bloques OTA, portador de la fila KPI): no bloquean la recuperación, sí el cierre del tablero.
5. Conciliar con el trabajo de `ATH-STAGING-RECOVERY-006` si existe fuera de este repo.

## 5. Archivos
`integrations/odoo-hotel-gateway/recovery/`: `run.mjs` (CLI), `guard.mjs`, `snapshot.mjs`, `engine.mjs` (bitácora, ensure, rollback), `steps.mjs`, `qa.mjs`, `layers/r1…r7.mjs`, `test/` (Odoo falso, extracto sintético, 51 pruebas), `EXTRACT-CONTRACT.md`, `extract/` (no probado). Runbook: `AI/RUNBOOK-CODEX-STAGING-RECOVERY.md`.

## 6. Actualización ATH-STAGING-RECOVERY-013 (2026-10-10)
Sigue siendo `MIGRATION_PACKAGE_READY = NO`. R1, R4 y R5 ahora aplican el **alcance base sin OTA** (`recovery/scope.mjs`); R4 y R5 se detienen con `ID_DURO` si el código trae ids numéricos de la base antigua; R5 adapta tres referencias entre acciones (`browse(1914)`, `browse(1921)`, `browse(1897)`) a búsqueda por nombre. El extracto debe incluir también los campos propios de `planning.role`. Las 66 pruebas del paquete y las 573 del gateway pasan. **Faltan** las diferencias de R1/R2/R4 y de las reglas 167/169 que Codex dejó en ATH-STAGING-RECOVERY-012, que no está disponible en este entorno. Detalle: `AI/ATH-STAGING-RECOVERY-013_ESTADO.md`.
