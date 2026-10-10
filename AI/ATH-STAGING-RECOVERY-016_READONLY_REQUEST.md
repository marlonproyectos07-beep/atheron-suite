# ATH-STAGING-RECOVERY-016 — solicitud de lectura READ-ONLY final (para Codex)

Fecha: 2026-10-10. Destino: `atheron1-hotel-staging-20261009`. **Solo lectura**: `search_read`, `read`, `fields_get`. Sin escrituras, sin huéspedes, sin partners, sin pagos, sin OTA, sin secretos.
Con esto, y con los artefactos de ATH-015, el paquete puede cerrarse. Sin ellos no: ver `AI/ATH-STAGING-RECOVERY-016_ESTADO.md`.

## 0. Antes de leer nada del staging: los artefactos de ATH-015 no llegaron a Claude Code
`AI/ATH-STAGING-RECOVERY-015_HANDOFF_TO_CLAUDE.md` y `AI/recovery-extract/ath012_closure.json` **no existen** en el entorno de Claude Code: no están en el árbol, no están en ninguna rama de GitHub (`origin/feature/ath-odoo-hotel-017-booking-airbnb-level1` sigue en `298a92f`) y `AI/recovery-extract/` está vacío. Vías posibles, de la más cómoda a la menos: (1) subir los dos archivos a una rama de GitHub; (2) pegarlos en el chat; (3) adjuntarlos. **No contienen nada que yo deba reconstruir:** necesito el contenido, no un resumen.

## A. Reglas 167, 168 y 169 — estado ACTUAL en el staging nuevo
Emparejar **por nombre**, nunca por id. Nombres exactos (modelo `planning.slot`):

| Clave | Nombre |
|---|---|
| 167 | `ATHERON - Casa Completa bloquea Habitaciones` |
| 168 | `ATHERON - Limpiar bloques al borrar reserva (casa/hab)` |
| 169 | `ATHERON - Habitacion bloquea Casa Completa` |

Lecturas (contexto `{active_test: false}`):
1. `base.automation.search_read([['name','in',[los 3 nombres]]], fields=['name','model_id','trigger','active','filter_domain','filter_pre_domain','action_server_ids','trigger_field_ids'])`
2. `ir.model.read(<model_id de cada una>, ['model'])`
3. `ir.actions.server.read(<action_server_ids de cada una>, ['name','state','code'])`

**Entrega:** `AI/recovery-extract/rules_current.json`, un objeto por regla, así (si una regla no existe: `{"name": "…", "model": "planning.slot", "exists": false}`; **no** omitir la fila):
```json
[{ "name": "ATHERON - Casa Completa bloquea Habitaciones", "model": "planning.slot", "exists": true, "active": true,
   "trigger": "on_create_or_write", "filter_domain": "…o false", "filter_pre_domain": "…o false",
   "code": "<código de la(s) acción(es) enlazada(s), concatenado en el orden de enlace>", "action_names": ["…"] }]
```
- `filter_domain` y `filter_pre_domain` van **siempre** (usar `false` si están vacíos): si falta uno, el comparador devuelve `ABORT`.
- Si el código parece contener una credencial, **no pegarlo**: marcar la regla y avisar.

**Lo que Claude Code hará con eso** (ya implementado, sin red): `node recovery/run.mjs rules-compare AI/recovery-extract/rules_old.json AI/recovery-extract/rules_current.json` → por regla `REUSE_AS_IS`, `REUSE_WITH_ADAPTATION`, `REPLACE_REQUIRED` o `ABORT`. R4 vuelve a leer la regla real del destino antes de escribir y **aborta antes de modificar 167/168/169** si no puede comparar.

## B. `planning.role` — estructura y valores ACTUALES
1. `planning.role.fields_get(attributes=['type','relation','required','selection','string'])`, **solo** para: `x_casa`, `x_is_a_room_offer`, `x_hotel_unit_ids`. Indicar explícitamente si **no existen**.
2. `planning.role.search_read([], fields=['name','x_casa','x_is_a_room_offer','x_hotel_unit_ids','resource_ids'])` con `{active_test: false}` (si un campo no existe, pedir solo los que existan).

**Entrega:** `AI/recovery-extract/planning_roles_current.json`:
```json
{ "fields": { "x_casa": true, "x_is_a_room_offer": true },
  "roles": [ { "name": "<nombre exacto>", "x_casa": "…o false", "x_is_a_room_offer": true } ] }
```
(`fields` = qué campos existen en el destino. No se necesitan ids.)

**Lo que Claude Code hará con eso:** `node recovery/run.mjs role-plan AI/recovery-extract/planning_roles.json AI/recovery-extract/planning_roles_current.json` → por rol: `MATCH`, `FIELD_MISSING` (R1 debe crear el campo), `ROLE_ABSENT` (prerrequisito G8), `VALUES_MISSING` (se escribe el valor antiguo, idempotente), `VALUES_DIFFER` (conflicto: no se sobrescribe sin decisión), `AMBIGUO`.

## C. Del dump ANTIGUO (lectura local, ya no del staging) — lo que cierra R1, R2 y la 189
No es una lectura del staging; se pide aquí para que sea **una sola entrega**. Formato según `integrations/odoo-hotel-gateway/recovery/EXTRACT-CONTRACT.md`:
| Archivo en `AI/recovery-extract/` | Contenido imprescindible |
|---|---|
| `rules_old.json` | las mismas 3 reglas del dump: `name, model, trigger, filter_domain, filter_pre_domain, action_name, code` |
| `planning_roles.json` | `[{name, x_casa, x_is_a_room_offer}]` de los roles de La Magia y Casa Completa en el dump |
| `models.json`, `fields.json`, `selections.json` | por cada modelo `x_hotel_*` necesario (+ `x_guests_line`) y los campos de `planning.slot`, `planning.role` y `account.payment`: `ttype, relation, relation_field, required, readonly, store, compute, default, domain, on_delete, index, size`, y las opciones de cada `selection` |
| los **4 campos de R2** | `x_guest_line_ids` y `x_hotel_payment_ids` (necesitan `relation_field`); `x_regimen_cliente` y `x_tipo_persona_cliente` (necesitan sus opciones: el respaldo del 30-sep las trae vacías) |
| `rule189_intent.json` | `[{ "intent": "<qué hacía la 189>", "conditions": ["<condiciones que debe cumplir un reemplazo>"], "source": "<dónde lo comprobó Codex>" }]` |

**Excluido por diseño** (no pedir, no enviar): modelos `x_hotel_ota_feed` y `x_hotel_api_log`, y todo lo de Booking, Airbnb, Beds24, NOBEDS, iCal o con llamadas externas.

## D. Resumen de lo único que falta
1. Los dos artefactos de ATH-015 (§0).
2. `rules_current.json` (§A) y `planning_roles_current.json` (§B): **únicas lecturas nuevas del staging**.
3. Del dump antiguo (§C): lo que cierra R1, R2 y la intención de la 189.
