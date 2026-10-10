# ATH-STAGING-RECOVERY-016 — cierre de R1/R2/R4 con el handoff de Codex: estado real

Fecha: 2026-10-10. Solo local: sin Odoo remoto, sin producción, sin push, sin merge, sin PR.

## 0. Los artefactos de ATH-015 NO están disponibles para Claude Code
La misión ordena leer primero `AI/ATH-STAGING-RECOVERY-015_HANDOFF_TO_CLAUDE.md` y `AI/recovery-extract/ath012_closure.json`. Los busqué en el árbol, en todo el contenedor, en `/mnt/*` y en todas las ramas remotas tras `git fetch`: **no existen** y `AI/recovery-extract/` sigue vacío. La rama remota está en `298a92f`, es decir, Codex no ha publicado nada. Por tanto:
- **HANDOFF_015_LOADED = NO · JSON_015_VALID = NO** (no se puede validar lo que no se tiene).
- No se cierran R1, R2 ni R4 con datos reales: hacerlo sería inventar, que la misión prohíbe.
- Se construyó todo lo que **no depende de esos datos**: los mecanismos de comparación, abortar-antes-de-modificar, mapeo de `planning.role`, compuerta de lógica hotelera y la solicitud de lectura final.

## 1. Matriz de la Fase 1
Columnas pedidas. «OLD_DUMP» y «NEW_STAGING_KNOWN» reflejan lo que **yo puedo ver**; lo que solo está en 015 figura como «no disponible».

| ITEM | OLD_DUMP | NEW_STAGING_KNOWN | REQUIRED_RECOVERY | EVIDENCE_COMPLETE | BLOCKER |
|---|---|---|---|---|---|
| R1 modelos `x_hotel_*` | solo en 015 / dump. Del respaldo del 30-sep: nombres de campos de 5 modelos (claves de los `master-data-*.json`), sin tipos | no leído | crear modelos y campos (sin OTA) | **NO** | atributos por campo: `ttype`, `relation`, `relation_field`, `required`, default, selección, domain, `store/compute`, orden |
| R2 4 campos de `sale.order` | solo en 015 / dump. Respaldo: `x_guest_line_ids` y `x_hotel_payment_ids` sin `relation_field`; `x_regimen_cliente` y `x_tipo_persona_cliente` con selección `[]` | no leído | crear los 4 campos | **NO** | `relation_field` (×2), opciones de selección (×2) |
| R4 HOTEL vs OTA | solo en 015. Respaldo: OTA = automatizaciones 51, 164, 170, 171; acciones 1815 y 1723 (por código) | 167–169 existen en el destino según Codex (código ACTUAL desconocido) | solo lógica hotelera interna | **PARCIAL** (separación hecha por evidencia del respaldo; falta contrastar con la lista de Codex) | lista de Codex; código de las reglas |
| 167 | nombre, modelo, trigger, intención; domain y código solo en dump | existe; código/domain/trigger actuales sin leer | comparar y reutilizar o reemplazar, nunca sobrescribir a ciegas | **NO** | `rules_old.json` + `rules_current.json` |
| 168 | ídem | ídem | ídem | **NO** | ídem |
| 169 | ídem (acción vinculada vieja: 1855) | ídem | ídem | **NO** | ídem |
| 189 | nombre, modelo, trigger; intención real solo en 015 | n/a | reemplazo funcional moderno | **NO** | `rule189_intent.json` |
| `planning.role` | solo en 015 / dump (valores de `x_casa`, `x_is_a_room_offer`) | valores actuales sin leer | mapear por nombre y completar solo lo que falte | **NO** | `planning_roles.json` + `planning_roles_current.json` |

## 2. Fases 2 y 3 — R1 y R2
**R1_MODELS_READY = NO** y **R2_FIELDS_READY = NO.** Lo que falta, exactamente, por cada modelo `x_hotel_property`, `x_hotel_unit`, `x_hotel_deposit_policy`, `x_hotel_rate`, `x_hotel_rate_line`, `x_hotel_quote`, `x_guests_line` y por cada campo suyo (más los de `planning.slot`, `planning.role` y `account.payment`): **`ttype`, `relation`, `relation_field`, `required`, valor por defecto, opciones de selección, `domain`, `store/compute`, `index/on_delete`, orden de creación.** Del repo solo salen los **nombres** de campo y algunas relaciones por nombre. Los mecanismos (`R1` y `R2` leen el extracto, ordenan m2o → o2m → m2m, excluyen OTA, detienen la capa si falta algo) están listos y probados con un extracto sintético; **falta el contenido real**.

## 3. Fase 4 — R4 solo hotel
Ya implementado y probado (ATH-013): excluye modelos y campos OTA, acciones/automatizaciones/crons de Booking, Airbnb, Beds24, NOBEDS, iCal o con llamadas externas (`https://…`, `requests.*`), y se detiene ante ids numéricos duros. **Nuevo en 016:** R4 contiene únicamente disponibilidad, HOLD, exclusión Casa↔habitaciones, liberación y dependencias de reserva directa; las reglas 167/168/169 ya **no** pasan por el camino genérico de creación.

## 4. Fase 5 — 167, 168 y 169
| Regla | EXPECTED_INTENT | OLD_IMPLEMENTATION | DESTINATION_INFORMATION_AVAILABLE | ADAPTATION_REQUIRED |
|---|---|---|---|---|
| 167 | un bloque en Casa Completa genera derivados en las habitaciones libres; no actúa si trae `x_bloqueo_ref`; localiza habitaciones por `planning.role` | trigger `on_create_or_write` (respaldo); domain y código: solo dump | **NO** (código, domain y trigger actuales sin leer) | se decide con el comparador |
| 168 | al borrar el origen, limpiar derivados | trigger `on_unlink`; resto solo dump | **NO** | ídem |
| 169 | un bloque no derivado en una habitación genera uno derivado en Casa; no bloquea a las hermanas | trigger `on_create_or_write`; acción vieja 1855; resto solo dump | **NO** | ídem |

**Mecanismo construido** (`recovery/rules-compare.mjs`, integrado en R4):
- `REUSE_AS_IS`: mismo disparador, domain, pre-domain y código (salvo comentarios y espacios).
- `REUSE_WITH_ADAPTATION`: solo cambian ids de 4+ dígitos, referencias entre acciones (`browse(N)` ↔ búsqueda por nombre) o comentarios. **Conservador:** un `69→412` o una hora `20→16` cuenta como diferencia.
- `REPLACE_REQUIRED`: difiere en disparador, domain, pre-domain o estructura del código, o la regla **no existe** en el destino. R4 **no reemplaza**: se detiene con `REEMPLAZO_REQUERIDO` hasta que haya decisión y una versión adaptada.
- `ABORT`: falta lo antiguo o lo actual, o la lectura actual no trae código/domain/disparador, o hay ambigüedad. **R4 lanza `BLOCKED` antes de escribir nada** (probado: cero escrituras).
- Emparejamiento por **(nombre, modelo)**. R4 lee la regla real del destino en vivo antes de decidir; la CLI `run.mjs rules-compare` hace lo mismo sin red con dos archivos.
- Pruebas: 8 del comparador y 5 de integración con R4 (idénticas, adaptadas, distintas, ausentes, duplicada, sin `rules_old.json`).

## 5. Fase 6 — reemplazo funcional de la 189
**RULE_189_REPLACEMENT_READY = NO.** Construido: `recovery/hotel-gate.mjs`, compuerta que R4 ejecuta **antes de mutar** lógica hotelera, además de la guardia de entorno (base exacta, no producción, neutralizado, estructura, contrato de campos, sin ids antiguos): exige modelos hoteleros base, campos de `planning.slot` (`x_hotel_block_kind`, `x_bloqueo_ref`, `x_bloqueo_src_id`) y de `planning.role` (`x_casa`, `x_is_a_room_offer`), las 5 habitaciones y la Casa con sus 5 hijas. Si falla algo, R4 se detiene sin escribir. **No declaro «equivalente a la 189»** porque no tengo la intención real que Codex extrajo: `replacement189Status()` exige `AI/recovery-extract/rule189_intent.json` con `{intent, conditions[], source}` y devuelve `ready=false` si falta o está incompleto (probado).

## 6. Fase 7 — `planning.role` (x_casa, x_is_a_room_offer)
**PLANNING_ROLE_MAPPING_READY = SÍ (mecanismo), NO (datos).** `recovery/planning-role.mjs` + paso en R3:
| Situación | Acción |
|---|---|
| el campo no existe en el destino | `ROLE_CAMPO_FALTA`: R1 debe crearlo (`fields.json` de `planning.role`); no se escribe |
| el rol no existe | `ROLE_AUSENTE`: prerrequisito G8; esta capa **no crea roles** |
| el campo existe y el rol no tiene valor, el dump sí | se escribe el valor antiguo (idempotente, queda en la bitácora con `before/after`) |
| el destino ya tiene un valor distinto | `ROLE_CONFLICTO`: no se sobrescribe sin `--force-diff` ni decisión |
| varios roles con el mismo nombre | `ROLE_AMBIGUO` |
| sin `planning_roles.json` (valores antiguos) | `ROLE_ATTR_PENDIENTE`: R3 queda `PARTIAL`, no se inventa nada |
Emparejamiento por **nombre exacto**, no por id (probado recreando los roles con ids distintos). Lectura de solo lectura que Codex debe hacer: `AI/ATH-STAGING-RECOVERY-016_READONLY_REQUEST.md` §B. CLI sin red: `run.mjs role-plan`.

## 7. Pruebas
Paquete: **87/87** (antes 66; +21) · suite completa del gateway: **594/594**. Cubren: comparador (REUSE/REPLACE/ABORT), 167/168/169 contra R4 (reutiliza, no toca, no sobrescribe, aborta antes de escribir), compuerta hotelera, gate de la 189, planning.role (6 estados, por nombre, R3 idempotente y reversible), ids duros, exclusión OTA, idempotencia, rollback y CLI offline.

## 8. Gate final
| Capa | Estado | Qué falta exactamente |
|---|---|---|
| R1_MODELS_READY | **NO** | atributos de cada modelo/campo `x_hotel_*` (§2) |
| R2_FIELDS_READY | **NO** | `relation_field` ×2 y opciones de selección ×2 (+ dependencias de `planning.slot` del dump) |
| R4_RULES_READY | **NO** | `rules_old.json`, `rules_current.json`, código real de las reglas hoteleras |
| RULE_167/168/169_READY | **NO** | comparación imposible sin el código actual y el antiguo (el mecanismo aborta, no inventa) |
| RULE_189_REPLACEMENT_READY | **NO** | `rule189_intent.json` |
| PLANNING_ROLE_MAPPING_READY | mecanismo SÍ · datos NO | `planning_roles.json` y `planning_roles_current.json` |
| OTA excluido de R4 | **SÍ** | contrastar con la lista de Codex |
| Rollback | **SÍ** en local | validación en Enterprise 19 real |
| **MIGRATION_PACKAGE_READY** | **NO** | todo lo anterior |
| READONLY_FINAL_REQUEST_READY | **SÍ** | `AI/ATH-STAGING-RECOVERY-016_READONLY_REQUEST.md` |

**El bloqueo principal no son «datos actuales del staging»**: son los artefactos de ATH-015 y el contenido del dump antiguo, que no llegaron a este entorno. Las lecturas del staging (§A y §B de la solicitud) son lo único que Codex debe pedir al Odoo; lo demás sale del dump y de 015.
