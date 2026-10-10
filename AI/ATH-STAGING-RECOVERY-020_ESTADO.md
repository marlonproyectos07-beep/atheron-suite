# ATH-STAGING-RECOVERY-020 — cierre analítico final de R1 / R2 / R4 con los artefactos publicados

Fecha: 2026-10-10 · Rama `feature/ath-odoo-hotel-017-booking-airbnb-level1`, base `8e22ac2` (leída por fetch) · **Solo local**: sin Odoo remoto, sin staging, sin producción, sin Booking/Airbnb/Beds24/WhatsApp, sin push, sin merge, sin PR.

Fuentes usadas (nada más): `AI/ATH-STAGING-RECOVERY-015_HANDOFF_TO_CLAUDE.md`, `AI/recovery-extract/{ath012_closure,rules_current,planning_roles_current}.json`, `AI/ATH-STAGING-RECOVERY-016_*`, el código de `recovery/` y el respaldo del repo (`AI/staging-backup/`, solo para el modelo/binding de 12 acciones directas, emparejando por id antiguo **y** nombre). Reproducible sin red: `node integrations/odoo-hotel-gateway/recovery/run.mjs close-analysis --json`.

## 1. Fase 1 — artefactos y matriz
HECHO/VERIFICADO: los 4 artefactos existen y los 3 JSON parsean. Sin contradicciones: los SHA-256 declarados de 167/168/169/189 y de las acciones R4 coinciden con el código publicado; 6 modelos / 96 campos; ids y disparadores de `rules_current` iguales a los del cierre; 6 roles con nombre único. Las faltas que el handoff 015 declaraba (código actual de 167–169, valores de roles en destino) quedan **cubiertas** por ATH-019. Dos normalizaciones deliberadas: «[]» (lectura de Odoo 19) ≡ `null` (dump) en domain/pre-domain; los ids antiguos son anclas, nunca claves de destino.

| ITEM | OLD_DUMP | CURRENT_STAGING | REQUIRED_RECOVERY | STATUS | ACTION |
|---|---|---|---|---|---|
| R1 modelos | 6 `x_hotel_*` / 96 campos + `x_guests_line` / 21 | ausentes por prefijo (ATH-008) | crear en orden de dependencias, sin OTA ni `x_api_*` | **YES** | listo; precondiciones §9 |
| R2 campos | 81 `sale.order.x_*` (80 del respaldo + `x_hotel_is_test`) | no cotejados uno a uno | crear tras sus inversos; related sin opciones | **YES** | listo |
| `planning.role` | 6 roles con `x_casa` / `x_is_a_room_offer` | 6 roles, mismos valores y recursos | mapear por nombre/estructura/atributos | **YES** | todo `MATCH`: no hay que escribir |
| regla 167 | acción 1853, payload con `x_bloqueo_src_id` + `x_hotel_block_kind` | igual salvo esas 2 claves | adaptar payload | REUSE_WITH_ADAPTATION | actualizar código (§4) |
| regla 168 | acción 1854 | idéntica | ninguna | REUSE_AS_IS | ninguna |
| regla 169 | acción 1855, mismas 2 claves | igual salvo esas 2 claves | adaptar payload | REUSE_WITH_ADAPTATION | actualizar código (§4) |
| regla 189 | guardia anti-solapamiento v3 (acción 1915) | el id 189 del destino es otra automatización (precios) | reemplazo funcional por nombre | VALID (estático) | instalar INACTIVA (§5) |
| R4 | 11 automatizaciones + 12 acciones directas + cron 155 | 167/168/169 ya existen | solo lógica interna | **YES** | 2 diferidas con motivo (§6) |

## 2. Fase 2 — R1 (`R1_MODELS_READY = YES`)
Metadata completa en el cierre para los seis modelos (tipo, relación, inverso, obligatorio, solo lectura, defaults, selecciones con orden, dominios, `on_delete`, tabla/columnas del many2many, `related`, `compute`/`depends`). Defaults: **ninguno** (el dump no tiene filas `ir_default`; `default: null` en todos).

| Modelo | Campos | Obligatorios | Relaciones |
|---|---:|---|---|
| `x_hotel_property` | 20 | `x_name` | `res.company`, `project.project`, 4× `project.task.type`, `x_unit_ids`→`x_hotel_unit.x_property_id` |
| `x_hotel_unit` | 17 | `x_name`, `x_property_id` | property, `resource.resource`, `planning.role`, `product.template`, `x_child_ids` ↔ `x_parent_ids` (tabla `x_hotel_unit_composition_rel`, columnas cruzadas) |
| `x_hotel_deposit_policy` | 9 | `x_name` | `x_property_id` |
| `x_hotel_rate` | 33 | `x_name` | property, unit, `res.users`, `x_supersedes_id`, `x_line_ids`→`x_hotel_rate_line.x_rate_id`; 4 selecciones (8/8/6/5 valores) |
| `x_hotel_rate_line` | 5 | — | `x_rate_id` |
| `x_hotel_quote` | **10 de 12** | — | **excluidos**: `x_api_client_ref` y `x_api_user_id` (identidad del cliente API/Gateway; ninguna acción interna los usa) |
| `x_guests_line` (dependencia de R2) | 21 | — | países, partner, `resource.resource`, `sale.order` |

Orden de creación calculado: `x_guests_line, x_hotel_property, x_hotel_deposit_policy, x_hotel_quote, x_hotel_unit, x_hotel_rate, x_hotel_rate_line`; campos: escalares → many2one → one2many → many2many (el inverso many2one siempre antes del one2many). Comprobaciones automáticas, **0 fallos**: inversos coherentes, many2many autorreferente con gemelo, ningún obligatorio con `on_delete = set null`, ninguna selección vacía salvo `related`. Modelos OTA excluidos (`x_hotel_ota_feed`, `x_hotel_api_log`, **y ahora también** `x_hotel_api_lock`, `x_hotel_ext_conflict` en `scope.mjs`).

## 3. Fase 3 — R2 y `planning.role` (`R2_FIELDS_READY = YES`, `PLANNING_ROLE_MAPPING_READY = YES`)
- `x_guest_line_ids` one2many → `x_guests_line.x_sale_order_id`; `x_hotel_payment_ids` one2many → `account.payment.x_hotel_sale_order_id` (m2o a `sale.order`, `on_delete set null`, en R1); `x_regimen_cliente` y `x_tipo_persona_cliente` **selection related, 0 opciones propias, `store=false`** (`partner_id.l10n_co_edi_fiscal_regimen` / `partner_id.company_type`): se crean con `related` y **sin `selection_ids`**, nada se fabrica. `x_hotel_is_test` (boolean) entra como campo 81. Antes R2 los bloqueaba por «selection vacía / one2many sin relation_field».
- `planning.role`: clave = nombre exacto + `x_casa` + `x_is_a_room_offer` + recursos asociados + `active` + `sync_shift_rental`; **sin ids**. Resultado OLD vs CURRENT: los 6 roles `MATCH` en valores y en estructura; ningún cambio que escribir. Estados cubiertos por pruebas: `MATCH`, `VALUES_MISSING`, `VALUES_DIFFER`, `FIELD_MISSING`, `ROLE_ABSENT`, `AMBIGUO`, `STRUCTURE_DIFFERS`. Los campos `x_casa` / `x_is_a_room_offer` **ya existen** en el destino (la lectura los exporta), por lo que R1 los salta.

## 4. Fase 4 — 167 / 168 / 169

| Regla | OLD | CURRENT | DIFFERENCE | FUNCTIONAL_INTENT | ADAPTATION | Clasificación | READY |
|---|---|---|---|---|---|---|---|
| 167 | `on_create_or_write`, domain `x_bloqueo_ref=False ∧ state=published`, 22 líneas | idéntica (pre-domain `[]`) | `create({...})` sin `x_bloqueo_src_id` ni `x_hotel_block_kind` | bloque en Casa Completa → sombras derivadas en habitaciones libres | sustituir el código de la acción enlazada por el del dump (sha `db9bc81e…`), solo con `--apply --force-diff` | **REUSE_WITH_ADAPTATION** (escritura) | **YES** |
| 168 | `on_unlink` | idéntica | ninguna | al borrar el origen, borrar sus sombras | ninguna | **REUSE_AS_IS** | **YES** |
| 169 | igual que 167 | igual | mismas 2 claves | bloque en habitación → sombra en Casa; no bloquea hermanas | ídem (sha `9324ee4a…`) | **REUSE_WITH_ADAPTATION** (escritura) | **YES** |

Comparador (`rules-compare.mjs`): «[]» ≡ sin domain; nuevo `payloadExtension` (la única diferencia es que el dump añade claves `x_*` a un `create({...})`; si hay cualquier otra, `REPLACE_REQUIRED`); `write_required` y `adaptation` en cada resultado. R4: sin `--apply` y `--force-diff` la regla **no se toca** (`REGLA_ADAPTAR`, bloqueante); con ambos, `UPDATE` con `before/after` en la bitácora, una sola acción enlazada, código con SHA-256 del dump y sin ids duros; el rollback lo restaura. Sin código legible de la regla actual → `ABORT` antes de escribir. Las reglas 167/169 están **activas** hoy en el staging: cambiarles el código afecta su comportamiento vivo, por eso solo en misión controlada con QA.

## 5. Fase 5 — 189 (`RULE_189_REPLACEMENT_READY = YES`, con residual declarado)
- **Lo preparado en ATH-016 (`guard.mjs` + `hotel-gate.mjs`) = NOT_EQUIVALENT.** Protege entorno, neutralización y estructura; no implementa disponibilidad, HOLD, sombras ni serialización. Era necesario, no suficiente. El vacío ahora se cierra con **la propia regla**, no con el gate.
- **Reemplazo (VALID, estático):** la regla se instala por **nombre**, **INACTIVA**, con el código del dump tal cual (sha `a393b815…`), sus campos disparadores por nombre y la acción enlazada; precedida por guardia de entorno + compuerta hotelera + comparación 167/168/169. Criterios, todos comprobados por código/pruebas: preserva los 4 casos (sombra derivada, HOLD visible, reserva bloqueante validada, ocupación primaria con `x_lock_touch`) · 0 ids duros y 0 `browse(N)` · rechaza producción, base antigua y origen HTTPS distinto · exige `database.is_neutralized` (G4) · estructura mínima + cierre de dependencias del código (**0 campos sin definir**) · el nombre coincide con el que exige `requireOverlapGuard` · la compuerta corre antes de la primera escritura (probado: cero escrituras).
- **Residual (no demostrable offline):** equivalencia de `safe_eval`/orden de disparo en Enterprise 19 y concurrencia real de `x_lock_touch`. Se prueban en QA de la misión de ejecución, con la regla aún inactiva; activar es una orden aparte.

## 6. Fase 6 — R4 solo lógica hotelera interna (`R4_RULES_READY = YES`, `OTA_EXCLUDED = YES`)
Incluye: calendario/reserva (151), mover/liberar bloque (165/166), Casa↔habitaciones (167–169 vía comparador), motor y guardia (187/189), HOLD (197, 1897, 1906/1907, cron 155 de 15 min), estados y reserva directa (1898–1905, 1935). Plan: 21 acciones, 9 automatizaciones, 1 cron; 18 acciones y 6 automatizaciones por el camino genérico; todo **inactivo**; `binding_model` de las acciones directas; `trigger_field_ids` / `on_change_field_ids` resueltos por **nombre** (sin ellos 187/189/197 se dispararían en cualquier escritura); `1935 → browse(1897)` se reescribe a búsqueda por nombre+modelo. Excluido y verificado (por id antiguo, nombre y texto del código): `x_hotel_ota_feed`/`api_log`/`api_lock`/`ext_conflict`, acción 1967, 1815, 1723, automatizaciones 51/53/54/55/157/158/164/170/171, crons 156–160; en el código instalable no aparece booking, airbnb, beds24, nobeds, ical, webhook, `https://` ni `requests.`.
- **DIFERIDAS (2) — decisión pendiente de Marlon/Codex:** «ATHERON - Noches desde fechas en vivo» (143) y «… al guardar» (144). Ayudante de cantidad `x_noches`, fuera de las cinco áreas del R4 pedido, y su código usa **ids de `product.category` escritos a mano** (6, 1247, 1242, 1296). Dato que falta si se las quiere dentro: nombres/XMLID de esas 4 categorías y la definición de `sale.order.line.x_noches`.
- Corregido un bug latente: el chequeo de dependencias de R4 trataba `env['x_hotel_unit']` (un **modelo**) como campo faltante y habría bloqueado la capa real.

## 7. Fase 7 — R3 / R5 / R6 / R7
| Capa | Estado | Motivo |
|---|---|---|
| R3 | **UNCHANGED_OK** | sin cambios; ahora `planning_roles.json` existe y el paso de roles deja de dar `ROLE_ATTR_PENDIENTE` (6 `SKIP`, 0 escrituras) |
| R5 | **NEEDS_UPDATE → aplicado** | R4 instala 14 acciones HOTEL v1 con código del volcado del 7-oct; R5 las armaba con el respaldo del 30-sep y habrían quedado en `DIFF` contra R4. `plan(extractDir)` toma el código del volcado cuando existe la misma acción (nombre+modelo); las otras 10 (tarifario, capacidad extra…) siguen del respaldo |
| R6 | **UNCHANGED_OK** | solo grupos por XMLID; no depende de R1/R2/R4 |
| R7 | **UNCHANGED_OK** | todos sus campos `x_*` (8 requeridos + payloads) están en R1/R2 |

## 8. Fase 8 — pruebas
Paquete `recovery/`: **117/117** (87 previas + 30 nuevas en `test/closure.test.mjs`). Suite completa del gateway: **624/624**. Cubren: derivación, R1/R2 contra el destino simulado (dry-run sin escrituras, apply, idempotencia, `DEP_FALTA`), mapeo de `planning.role` (6 estados + estructura + independencia de ids), comparación 167/168/169 con datos reales y sus variantes adversas, 189 (7 criterios y caso degradado), instalación inactiva, exclusión OTA, rechazo de ids duros, abortos antes de escribir, rollback total R1→R4 con `verifyRolledBack`, R5 sin `DIFF`, CLI offline, y que no hay credenciales ni correos. **Alcance**: Odoo falso; no valida Enterprise 19.

## 9. Fase 9 — compuerta del paquete
`ROLLBACK_READY = YES` (probado: R1→R4 con `--force-diff`, rollback total, estado idéntico al inicial). **`MIGRATION_PACKAGE_READY = YES`** — condicionado:

**Precondiciones de destino (lectura previa obligatoria, no son datos que falten en el paquete).** Si alguna no existe, la capa se detiene con `DEP_FALTA` y no la inventa; en ese caso faltaría la definición del dump de ese campo.
| # | Debe existir en el staging | Lo exige |
|---|---|---|
| P1 | `res.partner.x_identity_check` | `x_guests_line.x_guest_identity_check` (R1) |
| P2 | `sale.order.line.x_resource_id` | `x_guests_line.x_sol_resource_ids` (R1) |
| P3 | `res.partner.l10n_co_edi_fiscal_regimen` (módulo de localización) | `sale.order.x_regimen_cliente` (R2) |
| P4 | `resource.resource.x_occupancy` | CHECKIN / CHECKOUT (R4) |
| P5 | `project.task.x_resource_id` y `project.task.x_cleaning` | CHECKOUT (R4) |
| P6 | `planning.role.x_estado_limpieza` | CHECKOUT (R4) |
| P7 | los modelos y campos estándar usados (`res.country`, `res.company`, `project.project`, `project.task.type`, `account.payment`, `planning.slot.sale_line_id`) | R1/R4 |

Lectura sugerida: `fields_get` / `ir.model.fields` por (modelo, nombre) de P1–P6. Dato adicional por verificar al ejecutar R1: Odoo puede crear `x_name` al crear un modelo manual con otras propiedades (`required`); si pasa, queda como `DIFF` y requiere `--force-diff` decidido por una persona.

## 10. Límites que conviene no olvidar
HIPÓTESIS/PENDIENTE: todo se probó contra un Odoo falso; la equivalencia de la 189 y de 167/169 en Enterprise 19 se demuestra en la misión de ejecución, con QA. 143/144 diferidas. Las 10 acciones de R5 que el volcado no trae siguen del respaldo del 30-sep. `MIGRATION_PACKAGE_READY=YES` **no autoriza escribir** en el staging.
