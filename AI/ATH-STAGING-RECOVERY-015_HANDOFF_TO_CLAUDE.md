# ATH-STAGING-RECOVERY-015 — handoff portable de ATH-012 para Claude Code

**Estado:** fuente antigua extraída; paquete **no apto para aplicar**. Todo el trabajo de ATH-015 fue lectura de Git/dump y creación de estos dos archivos locales. Ningún código del dump se ejecutó. No hubo acceso a Odoo remoto, producción, push, merge ni PR.

## Procedencia y ubicación de ATH-012

- Reporte: `AI/ATH-STAGING-RECOVERY-012_REPORTE_FINAL.md` (checkout local `C:\Users\HP\atheron-codex`, sin seguimiento Git).
- Evidencia previa: `AI/ATH-STAGING-RECOVERY-008_REPORTE_FINAL.md` y `AI/recovery-extract/{source-definitions.json,rule-and-ui-intent.json,staging-pre-008.json,README-ATH-008.md}`.
- Metadata del dump: `integrations/odoo-hotel-gateway/recovery/{source-metadata.json,legacy-rules.json,legacy-ui.json,source-anchors.json}`; copia PostgreSQL local `atheron_old_staging_reference`, del backup del 7-oct con SHA-256 `5BBE77E695F409F73EA464E4D74B9C4394BE14FBAA28339BF5D79CC049C307BA`.
- ATH-012 no dejó un log SQL independiente: sus hallazgos están en el reporte; las consultas puntuales adicionales de ATH-015 se incorporan al JSON, sin datos de reservas o huéspedes.
- GitHub: rama `feature/ath-odoo-hotel-017-booking-airbnb-level1` verificada en `298a92f3a00cc4274c20fb72875f9a126b5dcaeb`; `ATH-013` ya incorporó `scope.mjs`. La rama local permanece en `e0f0210`. No mezclar el paquete remoto R1–R7 con la numeración del paquete local ATH-006.

El [extracto estructurado](recovery-extract/ath012_closure.json) contiene cada definición y el código histórico **solo para cotejo**. Los IDs antiguos se incluyen como referencias, nunca como claves de destino.

## R1 — modelos internos del dump

**OLD_DUMP:** seis modelos internos `x_hotel_*` manuales, 96 campos propios. **NEW_STAGING:** ATH-008 no encontró ningún modelo ni campo con prefijo `x_hotel_`. **REQUIRED_RECOVERY:** resolver relaciones, selecciones, dominios y permisos en Enterprise 19 antes de cualquier creación. Se excluyen `x_hotel_ota_feed`, `x_hotel_api_log`, `x_hotel_api_lock` y `x_hotel_ext_conflict` del alcance mínimo; ATH-013 solo excluye automáticamente los dos primeros y debe ampliar su lista blanca.

| Modelo | Label real | Estado | Campos | Uso interno |
|---|---|---|---:|---|
| `x_hotel_deposit_policy` | Hotel v1 — Política de anticipo | manual | 9 | políticas de anticipo |
| `x_hotel_property` | Hotel v1 — Propiedad | manual | 20 | propiedad, horarios y zona horaria |
| `x_hotel_quote` | Hotel v1 — Cotización (registro auditable) | manual | 12 | cotización interna para reserva directa |
| `x_hotel_rate` | Hotel v1 — Tarifa | manual | 33 | tarifa interna de reserva directa |
| `x_hotel_rate_line` | Hotel v1 — Tarifa por ocupación (línea) | manual | 5 | líneas de tarifa |
| `x_hotel_unit` | Hotel v1 — Unidad | manual | 17 | unidades y composición Casa/habitaciones |

**Defaults:** ninguna fila de `ir_default` corresponde a estos campos en el dump. El JSON registra `default: null`; esto no prueba que no exista un valor inicial aportado por una acción o módulo. Las selecciones del JSON incluyen valor, etiqueta y orden. Los dominios, inversos, atributos de almacenamiento e índices se conservan allí.

### `x_hotel_deposit_policy`

OLD_DUMP: `manual`, Hotel v1 — Política de anticipo. NEW_STAGING: ausente por búsqueda de prefijo. REQUIRED_RECOVERY: políticas de anticipo; adaptar las relaciones y verificar permisos.

| Campo | Tipo | Relación / inverso | Obligatorio | Solo lectura | Selección (valores) | Dominio | Dependencia |
|---|---|---|---|---|---|---|---|
| `x_active` | boolean | — | no | no | — | [] | — |
| `x_date_from` | date | — | no | no | — | [] | — |
| `x_date_to` | date | — | no | no | — | [] | — |
| `x_kind` | selection | — | no | no | estandar, grupo, temporada, especial | [] | — |
| `x_min_guests` | integer | — | no | no | — | [] | — |
| `x_name` | char | — | sí | no | — | [] | — |
| `x_pct` | float | — | no | no | — | [] | — |
| `x_priority` | integer | — | no | no | — | [] | — |
| `x_property_id` | many2one | x_hotel_property | no | no | — | [] | — |

### `x_hotel_property`

OLD_DUMP: `manual`, Hotel v1 — Propiedad. NEW_STAGING: ausente por búsqueda de prefijo. REQUIRED_RECOVERY: propiedad, horarios y zona horaria; adaptar las relaciones y verificar permisos.

| Campo | Tipo | Relación / inverso | Obligatorio | Solo lectura | Selección (valores) | Dominio | Dependencia |
|---|---|---|---|---|---|---|---|
| `x_active` | boolean | — | no | no | — | [] | — |
| `x_address` | char | — | no | no | — | [] | — |
| `x_capacity_whole` | integer | — | no | no | — | [] | — |
| `x_checkin_time` | float | — | no | no | — | [] | — |
| `x_checkout_time` | float | — | no | no | — | [] | — |
| `x_city` | char | — | no | no | — | [] | — |
| `x_company_id` | many2one | res.company | no | no | — | [] | — |
| `x_contract_model` | selection | — | no | no | OPERACION_DIRECTA_ATHERON, OTRO | [] | — |
| `x_deposit_pct` | float | — | no | no | — | [] | — |
| `x_historic_name` | char | — | no | no | — | [] | — |
| `x_hk_project_id` | many2one | project.project | no | no | — | [] | — |
| `x_hk_stage_doing_id` | many2one | project.task.type | no | no | — | [] | — |
| `x_hk_stage_issue_id` | many2one | project.task.type | no | no | — | [] | — |
| `x_hk_stage_ready_id` | many2one | project.task.type | no | no | — | [] | — |
| `x_hk_stage_todo_id` | many2one | project.task.type | no | no | — | [] | — |
| `x_hold_hours` | float | — | no | no | — | [] | — |
| `x_name` | char | — | sí | no | — | [] | — |
| `x_notes` | text | — | no | no | — | [] | — |
| `x_tz` | char | — | no | no | — | [] | — |
| `x_unit_ids` | one2many | x_hotel_unit → `x_property_id` | no | no | — | [] | — |

### `x_hotel_quote`

OLD_DUMP: `manual`, Hotel v1 — Cotización (registro auditable). NEW_STAGING: ausente por búsqueda de prefijo. REQUIRED_RECOVERY: cotización interna para reserva directa; adaptar las relaciones y verificar permisos.

| Campo | Tipo | Relación / inverso | Obligatorio | Solo lectura | Selección (valores) | Dominio | Dependencia |
|---|---|---|---|---|---|---|---|
| `x_api_client_ref` | char | — | no | no | — | [] | — |
| `x_api_user_id` | many2one | res.users | no | no | — | [] | — |
| `x_approval_level` | char | — | no | no | — | [] | — |
| `x_channel` | char | — | no | no | — | [] | — |
| `x_checked_at` | datetime | — | no | no | — | [] | — |
| `x_expires_at` | datetime | — | no | no | — | [] | — |
| `x_fe` | date | — | no | no | — | [] | — |
| `x_fs` | date | — | no | no | — | [] | — |
| `x_name` | char | — | no | no | — | [] | — |
| `x_payload` | text | — | no | no | — | [] | — |
| `x_personas` | integer | — | no | no | — | [] | — |
| `x_rule_versions` | text | — | no | no | — | [] | — |

### `x_hotel_rate`

OLD_DUMP: `manual`, Hotel v1 — Tarifa. NEW_STAGING: ausente por búsqueda de prefijo. REQUIRED_RECOVERY: tarifa interna de reserva directa; adaptar las relaciones y verificar permisos.

| Campo | Tipo | Relación / inverso | Obligatorio | Solo lectura | Selección (valores) | Dominio | Dependencia |
|---|---|---|---|---|---|---|---|
| `x_active` | boolean | — | no | no | — | [] | — |
| `x_approved_at` | datetime | — | no | no | — | [] | — |
| `x_approved_by` | many2one | res.users | no | no | — | [] | — |
| `x_base_guests` | integer | — | no | no | — | [] | — |
| `x_change_reason` | text | — | no | no | — | [] | — |
| `x_commercial_status` | selection | — | no | no | VERIFICADO, VERIFICADO_WEB, CONFLICTO, CONFLICTO_CAPACIDAD, PENDIENTE_CEO, REQUIRES_QUOTE, SIN_DATO, QA_FIXTURE | [] | — |
| `x_currency` | char | — | no | no | — | [] | — |
| `x_date_from` | date | — | no | no | — | [] | — |
| `x_date_to` | date | — | no | no | — | [] | — |
| `x_extra_person_price` | float | — | no | no | — | [] | — |
| `x_gov_state` | selection | — | no | no | draft, validated, approved, published, synced, retired | [] | — |
| `x_group_price_person` | float | — | no | no | — | [] | — |
| `x_line_ids` | one2many | x_hotel_rate_line → `x_rate_id` | no | no | — | [] | — |
| `x_max_guests` | integer | — | no | no | — | [] | — |
| `x_min_group` | integer | — | no | no | — | [] | — |
| `x_min_nights` | integer | — | no | no | — | [] | — |
| `x_name` | char | — | sí | no | — | [] | — |
| `x_notes` | text | — | no | no | — | [] | — |
| `x_price_from` | float | — | no | no | — | [] | — |
| `x_price_night` | float | — | no | no | — | [] | — |
| `x_price_person_night` | float | — | no | no | — | [] | — |
| `x_pricing_model` | selection | — | no | no | per_unit, per_occupancy, per_person, base_plus_extra, group, from_price, quote, per_person_group | [] | — |
| `x_priority` | integer | — | no | no | — | [] | — |
| `x_property_code` | char | — | no | no | — | [] | — |
| `x_property_id` | many2one | x_hotel_property | no | no | — | [] | — |
| `x_reference_values` | text | — | no | no | — | [] | — |
| `x_rule_code` | char | — | no | no | — | [] | — |
| `x_source` | char | — | no | no | — | [] | — |
| `x_source_version` | char | — | no | no | — | [] | — |
| `x_supersedes_id` | many2one | x_hotel_rate | no | no | — | [] | — |
| `x_tax_mode` | selection | — | no | no | included, excluded, exempt, pending, pending_tax_definition | [] | — |
| `x_unit_id` | many2one | x_hotel_unit | no | no | — | [] | — |
| `x_version` | integer | — | no | no | — | [] | — |

### `x_hotel_rate_line`

OLD_DUMP: `manual`, Hotel v1 — Tarifa por ocupación (línea). NEW_STAGING: ausente por búsqueda de prefijo. REQUIRED_RECOVERY: líneas de tarifa; adaptar las relaciones y verificar permisos.

| Campo | Tipo | Relación / inverso | Obligatorio | Solo lectura | Selección (valores) | Dominio | Dependencia |
|---|---|---|---|---|---|---|---|
| `x_guests` | integer | — | no | no | — | [] | — |
| `x_name` | char | — | no | no | — | [] | — |
| `x_price_night` | float | — | no | no | — | [] | — |
| `x_rate_id` | many2one | x_hotel_rate | no | no | — | [] | — |
| `x_requires_approval` | boolean | — | no | no | — | [] | — |

### `x_hotel_unit`

OLD_DUMP: `manual`, Hotel v1 — Unidad. NEW_STAGING: ausente por búsqueda de prefijo. REQUIRED_RECOVERY: unidades y composición Casa/habitaciones; adaptar las relaciones y verificar permisos.

| Campo | Tipo | Relación / inverso | Obligatorio | Solo lectura | Selección (valores) | Dominio | Dependencia |
|---|---|---|---|---|---|---|---|
| `x_active` | boolean | — | no | no | — | [] | — |
| `x_cap_base` | integer | — | no | no | — | [] | — |
| `x_cap_comercial` | integer | — | no | no | — | [] | — |
| `x_cap_extra` | integer | — | no | no | — | [] | — |
| `x_cap_extra_status` | selection | — | no | no | confirmada, pendiente | [] | — |
| `x_cap_notes` | text | — | no | no | — | [] | — |
| `x_child_ids` | many2many | x_hotel_unit | no | no | — | [] | — |
| `x_lock_touch` | datetime | — | no | no | — | [] | — |
| `x_name` | char | — | sí | no | — | [] | — |
| `x_parent_ids` | many2many | x_hotel_unit | no | no | — | [] | — |
| `x_product_tmpl_id` | many2one | product.template | no | no | — | [] | — |
| `x_property_id` | many2one | x_hotel_property | sí | no | — | [] | — |
| `x_requires_approval_extra` | boolean | — | no | no | — | [] | — |
| `x_resource_id` | many2one | resource.resource | no | no | — | [] | — |
| `x_role_id` | many2one | planning.role | no | no | — | [] | — |
| `x_sequence` | integer | — | no | no | — | [] | — |
| `x_unit_type` | selection | — | no | no | fisica, compuesta | [] | — |

**Dependencias fuera de los seis modelos:** `x_guests_line` (21 campos manuales, incluyendo el inverso `x_sale_order_id` y una selección relacionada sin filas propias); `account.payment.x_hotel_sale_order_id` (`many2one` a `sale.order`); siete campos seleccionados de `planning.slot` y tres de `planning.role` constan con definición completa en `r1_dependencies` del JSON. El modelo `x_guests_line` no es OTA. `planning.role.x_hotel_unit_ids` es `one2many` hacia `x_hotel_unit` con inverso `x_role_id`; `x_casa` es `char` y `x_is_a_room_offer` es `boolean`.

**Caveat de alcance:** `x_hotel_quote` contiene `x_api_client_ref` y `x_api_user_id` como **definiciones**, sin valores. Claude debe decidir su tratamiento antes de un R1 mínimo sin API; este handoff no autoriza crearlos.

## R2 — cuatro campos pendientes identificados por ATH-009

El dump confirma los cuatro. Los dos `one2many` tienen inversos reales; las dos selecciones son **related** y tienen cero opciones propias. Claude no debe inventar opciones. `x_hotel_is_test` es un quinto desfase: existe en el dump de 7-oct y falta en el respaldo de 30-sep que usa R2.

| Campo | Tipo | Relación / inverso | Obligatorio | Solo lectura | Selección (valores) | Dominio | Dependencia |
|---|---|---|---|---|---|---|---|
| `x_guest_line_ids` | one2many | x_guests_line → `x_sale_order_id` | no | no | — | [] | — |
| `x_hotel_payment_ids` | one2many | account.payment → `x_hotel_sale_order_id` | no | no | — | [] | — |
| `x_regimen_cliente` | selection | — | no | no | — | [] | partner_id.l10n_co_edi_fiscal_regimen |
| `x_tipo_persona_cliente` | selection | — | no | no | — | [] | partner_id.company_type |

| Campo | OLD_DUMP | NEW_STAGING | Recuperación recomendada |
|---|---|---|---|
| `x_guest_line_ids` | `one2many` a `x_guests_line.x_sale_order_id`; almacenado | No cotejado individualmente en ATH-008 | Crear solo tras modelo e inverso; preservar tipo/relación. |
| `x_hotel_payment_ids` | `one2many` a `account.payment.x_hotel_sale_order_id`; almacenado | Ausente por búsqueda de prefijo `x_hotel_` en ATH-008 | Crear solo tras inverso; preservar tipo/relación. |
| `x_regimen_cliente` | `selection`, `related=partner_id.l10n_co_edi_fiscal_regimen`, `store=false`; sin opciones propias | No cotejado individualmente | Crear como relacionado si campo fuente existe en Enterprise 19; no fabricar `selection_ids`. |
| `x_tipo_persona_cliente` | `selection`, `related=partner_id.company_type`, `store=false`; sin opciones propias | No cotejado individualmente | Igual; verificar campo fuente y semántica de related. |

R2 debe pasar de 80 a **81** campos `sale.order.x_*` según el dump e incluir `x_hotel_is_test` (booleano almacenado). Debe preservar también `related`, `store`, `readonly` y cálculo de otros campos: `x_hotel_paid` viejo suma pagos `in_process` y `paid`, mientras el KPI nuevo solo considera `paid`. Esa diferencia no se resuelve en este handoff.

## Reglas 167, 168 y 169

El JSON guarda código antiguo literal, trigger, dominios, campos de disparo, enlaces y SHA-256; no se ejecutó. El código actual exacto del staging nuevo no quedó conservado en ATH-008, por lo que su equivalencia completa requiere lectura puntual posterior.

### Regla 167

- **ID / NAME / MODEL:** 167 / ATHERON - Casa Completa bloquea Habitaciones / `planning.slot`.
- **TRIGGER / DOMAIN:** `on_create_or_write` / `[('x_bloqueo_ref','=',False),('state','=','published')]`; pre-domain `null`.
- **CODE_OR_CONFIGURATION:** acción antigua 1853 `ATHERON - Casa Completa bloquea Habitaciones`; código literal en `rules.167.code` del JSON; SHA-256 `db9bc81e04f65709b8a643a06f13b93512f1933be79e363cf125c09ab2784834`.
- **DEPENDENCIES:** planning.role.x_casa / x_is_a_room_offer / resource_ids; planning.slot.x_bloqueo_ref / x_bloqueo_src_id / x_hotel_block_kind.
- **OLD_DUMP:** Casa publicada propaga sombras a habitaciones libres, con los tres metadatos explícitos.
- **NEW_STAGING_CURRENT:** ATH-008 encontró propagación con x_bloqueo_ref pero sin x_bloqueo_src_id ni x_hotel_block_kind.
- **DIFFERENCES / CLASSIFICATION:** sombras incompatibles con caso derivado de 189; **REUSE_WITH_ADAPTATION**.
- **RECOMMENDED_ADAPTATION:** Conservar regla existente; mapear roles por estructura, añadir vínculo explícito y tipo derived al payload tras crear campos, y verificar orden de disparo/QA. No sobrescribir ahora.

### Regla 168

- **ID / NAME / MODEL:** 168 / ATHERON - Limpiar bloques al borrar reserva (casa/hab) / `planning.slot`.
- **TRIGGER / DOMAIN:** `on_unlink` / `null`; pre-domain `null`.
- **CODE_OR_CONFIGURATION:** acción antigua 1854 `ATHERON - Limpiar bloques al borrar reserva (casa/hab)`; código literal en `rules.168.code` del JSON; SHA-256 `7b5217e4163e359b780fb2c6ca411b3b605e2ac044d61d5df87030dfd241035c`.
- **DEPENDENCIES:** planning.slot.x_bloqueo_ref y ciclo de borrado.
- **OLD_DUMP:** al borrar el origen elimina sombras por x_bloqueo_ref.
- **NEW_STAGING_CURRENT:** ATH-008 encontró acción visible estructuralmente equivalente; sin QA de borrado.
- **DIFFERENCES / CLASSIFICATION:** equivalencia funcional no probada; **INSUFFICIENT_EVIDENCE**.
- **RECOMMENDED_ADAPTATION:** Conservar y ensayar limpieza solo en una QA futura autorizada.

### Regla 169

- **ID / NAME / MODEL:** 169 / ATHERON - Habitacion bloquea Casa Completa / `planning.slot`.
- **TRIGGER / DOMAIN:** `on_create_or_write` / `[('x_bloqueo_ref','=',False),('state','=','published')]`; pre-domain `null`.
- **CODE_OR_CONFIGURATION:** acción antigua 1855 `ATHERON - Habitacion bloquea Casa Completa`; código literal en `rules.169.code` del JSON; SHA-256 `9324ee4a3e1255192819946c56859267b70a6c54520d9af1d43aa4ffa430e693`.
- **DEPENDENCIES:** planning.role.x_casa / x_is_a_room_offer / resource_ids; planning.slot.x_bloqueo_ref / x_bloqueo_src_id / x_hotel_block_kind.
- **OLD_DUMP:** Habitación publicada propaga sombra a Casa con los tres metadatos explícitos; no bloquea hermanas.
- **NEW_STAGING_CURRENT:** ATH-008 encontró propagación con x_bloqueo_ref pero sin x_bloqueo_src_id ni x_hotel_block_kind.
- **DIFFERENCES / CLASSIFICATION:** sombras incompatibles con caso derivado de 189; **REUSE_WITH_ADAPTATION**.
- **RECOMMENDED_ADAPTATION:** Conservar regla existente; mapear roles por estructura, añadir vínculo explícito y tipo derived al payload tras crear campos, y verificar orden de disparo/QA. No sobrescribir ahora.

## Guardia funcional 189

- **ID / NAME / MODEL / TRIGGER / DOMAIN:** 189 / HOTEL v1 — Guardia anti-solapamiento Planning v3 (002/003) / `planning.slot` / `on_create_or_write` / nulo (también pre-domain nulo), activa en el dump.
- **CODE_OR_CONFIGURATION:** acción 1915, 4.874 caracteres, SHA-256 `a393b815ad3e5c44c7a95ed7899a86078ca9cdff81df60ecf5ec948446a5684b`; código histórico íntegro en `rules.189.code` del JSON.
- **INTENT / QUÉ PROTEGÍA / CUÁNDO:** en cada creación o modificación de `planning.slot`, (1) validaba sombras derivadas con `x_bloqueo_src_id` coherente con `x_bloqueo_ref`; (2) aceptaba HOLD visible vinculado a una orden HOLD de la misma unidad; (3) aceptaba reservas bloqueantes ya validadas por motor 1896; (4) para ocupación primaria, calculaba conflicto de unidad/hijas/padres, escribía `x_lock_touch` para serializar y rechazaba solapes con Planning y `sale.order` con horarios/zona de propiedad.
- **DEPENDENCIES:** `x_hotel_unit` y su grafo, `x_lock_touch`, campos hoteleros de `planning.slot`, campos de reserva/HOLD de `sale.order`, motor 1896, `safe_eval`, orden de automatizaciones y permisos de escritura de la transacción. El ID 189 del staging nuevo es una regla de precios de producto.
- **NO EQUIVALENCIA:** `guard.mjs` de Claude protege identidad/neutralización/estructura del entorno. No implementa disponibilidad, HOLD, sombras ni serialización. ATH-013 reconoce el vacío y R4 solo contempla copiar el código viejo **inactivo**; eso tampoco acredita equivalencia en Enterprise 19.
- **Reemplazo compatible, aún no creado:** debe conservar los cuatro casos, intervalos semicerrados, Casa↔habitaciones sin contar sombras como ocupación primaria, HOLD vigente, cancelaciones, bloqueo transaccional, resolución por clave natural y compatibilidad con la versión 19. Debe probar `safe_eval` y orden de disparo en una fase posterior autorizada.

## Planning.role — valores del dump necesarios para 167/169

| ROLE_ID_OLD | ROLE_NAME | x_casa | x_is_a_room_offer | Otros campos relevantes / recurso |
|---:|---|---|---|---|
| 18 | 302 Habitación con Baño Privado  - La Magia de Zipaquirá | La Magia de Zipaquirá | sí | active=sí; sync_shift_rental=sí; 302 La magia - Baño privado (company_id antiguo 5) |
| 19 | 202 Habitación con Baño Compartido  - La Magia de Zipaquirá | La Magia de Zipaquirá | sí | active=sí; sync_shift_rental=sí; 202 La magia - Baño compartido (company_id antiguo 5) |
| 29 | 201 Habitación con Baño Compartido  - La Magia de Zipaquirá | La Magia de Zipaquirá | sí | active=sí; sync_shift_rental=sí; 201 La magia - Baño compartido (company_id antiguo 5) |
| 30 | 203 Habitación con Baño Privado  - La Magia de Zipaquirá | La Magia de Zipaquirá | sí | active=sí; sync_shift_rental=sí; 203 La magia - Baño privado (company_id antiguo 5) |
| 37 | 301 Habitación Suite - La Magia de Zipaquirá | La Magia de Zipaquirá | sí | active=sí; sync_shift_rental=sí; 301 La magia - Habitación Suite (company_id antiguo 5) |
| 69 | Casa La Magia de Zipaquirá - Completa | La Magia de Zipaquirá | sí | active=sí; sync_shift_rental=—; Casa Completa - La Magia de Zipaquirá (company_id antiguo 5) |

El enlace antiguo `x_hotel_unit.x_role_id` confirma 18→302, 19→202, 29→201, 30→203, 37→301 y 69→CASA COMPLETA. **NEW_STAGING_STATUS:** ATH-008/003 verificó los seis recursos visibles, pero no leyó los valores actuales de `planning.role.x_casa` ni `x_is_a_room_offer`; no se afirma equivalencia. **REQUIRED_RECOVERY:** mapear/confirmar seis roles por `x_casa` + nombre exacto del rol + `x_is_a_room_offer` + recurso asociado + identidad empresarial por nombre/XMLID y exigir unicidad. Los IDs viejos 18/19/29/30/37/69 y company_id 5 son solo anclas históricas. Hay roles crudos de habitación con nombres similares; el nombre aislado no basta.

## R4 interno, con exclusiones explícitas

**A. HOTEL INTERNAL LOGIC:** el JSON incluye configuración completa de 11 automatizaciones internas, código histórico de sus acciones y 12 acciones directas/HOLD, además del cron HOLD 155 (15 minutos). La selección es una **lista blanca para análisis**, no un plan de aplicación. Familias: noches/calendario (143/144/151), mover/liberar bloque (165/166), Casa↔habitaciones (167–169), motor y guardia (187/189), HOLD (197, 1897, 1906/1907 y cron 155), estados/reserva directa (1898–1905 y 1935). Todas las automatizaciones/crons futuros deben quedar inactivos hasta orden separada.

**B. EXCLUIDO:** modelos `x_hotel_ota_feed`, `x_hotel_api_log`, `x_hotel_api_lock`, `x_hotel_ext_conflict`; acción 1967 de Gateway; 1815 por lectura de `x_nobeds_id`; 1723 por llamada externa; reglas de feed/canal 51, 53–55, 157/158, 164, 170/171; crons iCal 156–160. No incluir feeds, sincronización de canales ni llamadas externas. ATH-013 ya excluye parte de esto por `scope.mjs`, pero su lista de modelos no cubre `x_hotel_api_lock`/`x_hotel_ext_conflict`. Su `extract.sh` todavía exporta filas crudas y requiere sanitización/derivados antes de alimentar capas.

## Estado y siguiente paso

| Campo | Valor |
|---|---|
| TAREA | ATH-STAGING-RECOVERY-015 |
| ATH012_SOURCE_FOUND | YES: reporte 012, extractos ATH-008 y copia PostgreSQL local; no log SQL separado |
| R1_EXTRACT_COMPLETE | YES para seis modelos internos y sus 96 campos; dependencias Guests Line/Planning/pago incluidas; no validado para apply |
| R2_4_FIELDS_COMPLETE | YES como metadata de origen; NO como código migratorio adaptado |
| RULE_167_COMPLETE | PARTIAL: OLD_DUMP completo; código actual del destino no conservado |
| RULE_168_COMPLETE | PARTIAL: OLD_DUMP completo; equivalencia funcional del destino no probada |
| RULE_169_COMPLETE | PARTIAL: OLD_DUMP completo; código actual del destino no conservado |
| RULE_189_COMPLETE | PARTIAL: intención/código antiguo completos; reemplazo compatible inexistente |
| PLANNING_ROLE_X_CASA_FOUND | YES en seis roles del dump; valor destino sin verificar |
| PLANNING_ROLE_X_IS_A_ROOM_OFFER_FOUND | YES en seis roles del dump; valor destino sin verificar |
| OTA_COMPONENTS_SEPARATED | YES en extracto; ampliar scope.mjs de Claude antes de apply |
| HANDOFF_FILE | AI/ATH-STAGING-RECOVERY-015_HANDOFF_TO_CLAUDE.md |
| JSON_EXTRACT_FILE | AI/recovery-extract/ath012_closure.json |
| JSON_VALID | YES |
| SECRETS_FOUND | NO |
| PII_FOUND | NO: solo definiciones y código, sin registros personales |
| READY_FOR_CLAUDE_R1_R2_R4_CLOSE | NO: fuente portable lista, pero falta código actual exacto 167–169, valores de roles destino, adaptación de selecciones relacionadas y validación Enterprise 19 |
| REMOTE_STAGING_CHANGED | NO |
| PRODUCTION_TOUCHED | NO |
| PUSH_EXECUTED | NO |
| MERGE_EXECUTED | NO |
| PR_OPENED | NO |
| BLOCKER | Ath-013 no tenía ATH-012; ahora tiene fuente vieja portable, pero persisten diferencias del destino y validación de aplicación/rollback. |
| NEXT_ACTION | Claude: consumir ambos archivos localmente, ajustar lista blanca y R1/R2/R4 sin apply; pedir lectura puntual del staging para cerrar equivalencia y una misión posterior para pruebas remotas. |

**STOP.** Este handoff no autoriza ninguna escritura remota.
