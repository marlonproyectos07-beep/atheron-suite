# ATH-STAGING-RECOVERY-013 — corrección de R1/R2/R4 a partir del cotejo de Codex: estado real

Fecha: 2026-10-10. Solo local: sin Odoo remoto, sin producción, sin push, sin merge.

## 0. Lo primero: la entrada que esta misión necesita NO está en mi entorno
La misión parte del reporte `AI/ATH-STAGING-RECOVERY-012*` y de «cualquier extracto generado por Codex». Busqué en el árbol de trabajo, en todo el sistema de archivos del contenedor, en `/mnt/*`, en `AI/recovery-extract/` (vacío) y, tras `git fetch origin`, en **todas** las ramas remotas: **no existe ningún archivo, rama ni mención de ATH-STAGING-RECOVERY-012**. La rama `feature/ath-odoo-hotel-017-booking-airbnb-level1` en GitHub sigue en `c85af35` (lo que yo subí). Codex no ha publicado nada que yo pueda leer.

Consecuencia: **no tengo** las diferencias de R1, R2 y R4, ni lo que difiere en 167 y 169, ni la intención real de 189 que Codex determinó, ni su lista de componentes OTA. Sin ellas, cerrar R1/R2/R4 o «adaptar» 167/169 habría sido **inventar**, que la misión prohíbe expresamente. No lo hice.

## 1. Lo que sí hice, con evidencia que ya estaba en el repo

| # | Cambio | Evidencia | Pruebas |
|---|---|---|---|
| 1 | **Alcance BASE sin OTA** (`recovery/scope.mjs`), aplicado en R1, R4 y R5 | respaldo del 30-sep: automatizaciones **51** «NOBEDS → Odoo — Recibir Reserva», **164** «Anti-duplicado NOBEDS», **170** «Orden borrador desde reserva OTA», **171** «Cancelar orden al cancelar reserva OTA»; acción **1815** con `x_nobeds_id` en su código; acción **1723** con `requests.get` | ancla de regresión: sobre el respaldo real el clasificador marca por nombre exactamente 51, 164, 170, 171 y por código exactamente 1815 y 1723 |
| 2 | **R1** excluye `x_hotel_ota_feed`, `x_hotel_api_log`, sus campos, los campos que apuntan a ellos y los de nombre NOBEDS/Beds24/iCal | `EXTRACT-CONTRACT.md`, `scope.mjs` | no se crean y se registran `EXCLUYE_OTA` |
| 3 | **R4** excluye acciones, automatizaciones y crons OTA; una automatización interna enlazada a una acción excluida **no se crea a medias** (`OMITE`, la capa se detiene); nada OTA queda creado (verify lo comprueba) | idem | 4 pruebas |
| 4 | **Ids numéricos escritos a mano** (`ID_DURO`): el detector anterior solo conocía ids de recurso/rol/producto-plantilla y **no habría marcado** la acción 1815 (ids de `product.product` 57850…). Ahora cualquier entero ≥4 dígitos fuera de comentarios y cadenas detiene la capa | acción 1815 del respaldo | 2 pruebas |
| 5 | **R5: hallazgo real.** Dos acciones de reserva directa llaman a otras **por id del staging viejo**: `COTIZAR ALOJAMIENTO` hace `browse(1914)` y `browse(1921)`; `CREAR RESERVA DESDE COTIZACIÓN` hace `browse(1897)`. Copiadas «tal cual» habrían apuntado a acciones equivocadas o inexistentes. Se adaptan mecánicamente a búsqueda por **nombre+modelo** (`1914`→«HOTEL v1 — CONSULTAR DISPONIBILIDAD (solo lectura, QA-002)»/`x_hotel_property`; `1921`→«HOTEL v1 — MOTOR TARIFARIO (solo lectura, 003)»/`x_hotel_rate`; `1897`→«HOTEL v1 — HOLD»/`sale.order`) con `.ensure_one()` para que falle fuerte si falta. Las otras 22 se copian sin tocar | `ir-actions-server-hotel.json` ids 1922 y 1935 | 4 pruebas, incluida la compilación en Python del código original y adaptado |
| 6 | **Contrato del extracto:** faltaban los campos propios de `planning.role` (`x_casa`, `x_is_a_room_offer`, `x_hotel_unit_ids`), que la regla 167 usa para encontrar los roles de habitación | `scripts/ath-disp-001-precheck-rooms-readonly.mjs` | extractor y contrato actualizados |

Pruebas: paquete 66/66 (antes 51) · suite del gateway 573/573.

## 2. Reglas 167 y 169 — qué hay y qué falta
Etiquetas pedidas por la misión. **ADAPTED no se produjo** porque falta NEW_CURRENT.

### Regla 167 — «ATHERON - Casa Completa bloquea Habitaciones»
- **RULE_167_OLD** (lo que consta en el repo): modelo `planning.slot`, `on_create_or_write`, activa. `filter_domain`, `filter_pre_domain` y código **no están en el repo** (solo en el dump). Intención por evidencia indirecta: un bloque en el recurso de Casa Completa crea bloques `derived` (`x_hotel_block_kind`, `x_bloqueo_src_id`) en las habitaciones **libres**; no se dispara si el bloque trae `x_bloqueo_ref`; encuentra los roles de habitación con `planning.role.x_casa = 'La Magia de Zipaquirá'` y `x_is_a_room_offer = True`.
- **RULE_167_NEW_CURRENT:** **DESCONOCIDO** (es lo que Codex leyó del staging nuevo en 012).
- **RULE_167_ADAPTED:** **NO PRODUCIDA.**
- **Dependencias que ya identifiqué para la adaptación:** (a) campos `x_casa`, `x_is_a_room_offer`, `x_hotel_unit_ids` en `planning.role` y **sus valores** en los 5 roles de habitación y el de Casa (hoy **ninguna capa** los crea: G8 solo comprueba que los roles existan por nombre); (b) campos de `planning.slot` `x_hotel_block_kind`, `x_bloqueo_ref`, `x_bloqueo_src_id`, `x_channel`; (c) no depender de ids de recurso/rol (28–32, 79, 69…): resolver por estructura.

### Regla 169 — «ATHERON - Habitacion bloquea Casa Completa»
- **RULE_169_OLD:** `planning.slot`, `on_create_or_write`, activa; acción vinculada en el viejo: id 1855 (único dato). Intención: un bloque **no derivado** en una habitación genera un bloque derivado en Casa; no bloquea a las demás habitaciones. Domain y código: solo en el dump.
- **RULE_169_NEW_CURRENT:** DESCONOCIDO. **RULE_169_ADAPTED:** NO PRODUCIDA.

### Regla 168 (limpieza de derivados al borrar) y 71, 170, 171
168 está en la misma situación que 167/169. Las **170 y 171** son OTA («Orden borrador desde reserva OTA», «Cancelar orden al cancelar reserva OTA»): quedan **fuera** del alcance base por el filtro.

## 3. Guardia 189 — estado
- **RULE_189_INTENT:** sin la lectura de Codex no puedo darla por determinada. Lo que consta: `planning.slot`, `on_create_or_write`, «Guardia anti-solapamiento Planning v3 (002/003)».
- **Lo que ya cubre la guardia nueva** (`precheck`, 8 pruebas + las de la cadena de prerrequisitos): base incorrecta (G1), producción (G3 y configuración), estructura incompleta (G5/G6), componentes críticos faltantes (G8 para Planning + cada capa exige que las anteriores verifiquen), ejecución fuera de staging neutralizado (G4), y **sin ids antiguos** (prueba nueva que lo comprueba sobre `guard/steps/engine/snapshot`).
- **Lo que NO puedo declarar:** que esto sea «equivalente a la 189». Si la intención real que Codex encontró es la de **solapamientos de planificación**, la equivalencia funcional sigue pendiente (la crea R4 desde el dump, inactiva). Si es la de **entorno**, ya está cubierta.

## 4. Qué necesito de ATH-STAGING-RECOVERY-012 (formato exacto)
Cualquiera de estas dos vías sirve; la segunda es la que consumen los scripts sin intervención:
1. **Informe 012** (pegado o archivo `AI/ATH-STAGING-RECOVERY-012*.md`) con, por cada diferencia: modelo/campo/regla, valor antiguo, valor en el staging nuevo, y qué decidió Codex.
2. **Extracto** en `AI/recovery-extract/` según `recovery/EXTRACT-CONTRACT.md`: `models.json`, `fields.json` (con `planning.role`), `selections.json`, `server_actions.json` (con `id`), `automations.json` (con `action_names`), `crons.json`.

Y, aparte, para 167/169/189: `trigger`, `filter_domain`, `filter_pre_domain`, `trigger_field_ids` y **código** de la acción, de la versión antigua **y** de la vigente en el staging nuevo, más la intención de 189 que Codex determinó. También la lista de componentes OTA que detectó dentro de R4, para contrastarla con la mía (§1, fila 1).

## 5. Gate
| Capa | Estado | Por qué |
|---|---|---|
| R1_MODELS_READY | **NO** | las definiciones de los modelos propios siguen solo en el dump / en 012 |
| R2_FIELDS_READY | **NO** | 76/80 campos; los 4 restantes y sus dependencias esperan el extracto |
| R4_RULES_READY | **NO** | reglas de `planning.slot` sin código; 167/169 sin NEW_CURRENT |
| R5 (reserva directa) | **PARCIAL** | 24 acciones listas, 2 adaptadas; la adaptación y el resto siguen sin probarse en Odoo real |
| Guardia | **PARCIAL** | protección de entorno lista; equivalencia funcional con la 189 sin determinar |
| OTA fuera de R4/R1/R5 | **SÍ**, por evidencia del respaldo | ver §1 |
| Rollback | SÍ en local | sin cambios; sigue sin validarse en Enterprise 19 |
| **MIGRATION_PACKAGE_READY** | **NO** | R1, R2, R4 y la equivalencia de la 189 siguen abiertos |
