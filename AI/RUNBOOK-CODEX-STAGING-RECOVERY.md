# RUNBOOK CODEX — recuperación selectiva al staging NUEVO (`atheron1-hotel-staging-20261009`)

**Estado del paquete:** `MIGRATION_PACKAGE_READY = NO` (ver `AI/ATH-STAGING-RECOVERY-007_PAQUETE.md`). Este runbook queda **listo para ejecutarse por pasos**, pero **R1, R2 (4 campos) y R4 no pueden completarse hasta que llegue `AI/recovery-extract/`** (extracto del dump). No ejecutar `--apply` mientras el paquete no esté READY sin autorización expresa de Marlon.

## Reglas de oro
1. **Un solo escritor.** Si Claude Code o cualquier otra sesión está escribiendo en el staging nuevo, no ejecutar.
2. **STOP ante cualquier código de salida distinto de 0.** Nunca continuar automáticamente después de una verificación fallida. Reportar el paso, el código y la salida; esperar instrucción.
3. **Dry-run primero, siempre.** Cada paso se corre sin `--apply`, se revisa, y solo entonces con `--apply`.
4. **Nada de `--force-diff`** sin autorización expresa (sobrescribe algo que ya existía).
5. **No se activa ninguna automatización ni cron** dentro de este runbook (R4 los crea inactivos). Única excepción autorizable: la guardia anti-solapamiento, solo para el paso 9 (ver abajo).
6. **Producción, Booking, Airbnb, Beds24, WhatsApp, pagos y reservas reales: fuera de alcance.**
7. **Ningún secreto en el chat ni en archivos.** Las variables las pone Marlon en la sesión.

## Preparación (una vez)
Desde `integrations/odoo-hotel-gateway/` con Node 22. Variables de entorno (las define Marlon, sin pegarlas en el chat):
```
RECOVERY_TARGET_DB=atheron1-hotel-staging-20261009
ODOO_BASE_URL=https://atheron1-hotel-staging-20261009.odoo.com
ODOO_TECHNICAL_USER=…   ODOO_TECHNICAL_SECRET=…
RECOVERY_CONFIRM=atheron1-hotel-staging-20261009      # SOLO al ejecutar --apply
RECOVERY_ANGELA_EMAIL=…                                 # SOLO para R6 (correo real de Ángela, lo da Marlon)
RECOVERY_TEST_ENV_ATTESTATION=atheron1-hotel-staging-20261009   # SOLO si G4 no encuentra la marca de neutralizado y Marlon atestigua que es un entorno de pruebas
```
Antes de empezar: `npm test` debe dar todo en verde (hoy 558/558 en el gateway; solo el paquete: `node --test recovery/test/*.test.mjs`, 51 pruebas).

**Códigos de salida:** `0` ok · `1` error · `2` guardia o permiso · `3` bloqueado por falta de insumo (extracto, correo) · `4` parcial o verificación fallida. **Todo ≠ 0 es STOP.**

La bitácora de todo lo creado es `recovery/out/journal-atheron1-hotel-staging-20261009.jsonl` (conservarla; es lo que usa el rollback).

---

## STEP 0 — PRECHECK  · STOP si falla
```
node recovery/run.mjs precheck
```
Comprueba: base y URL exactas; que el servidor **no** sea producción ni el staging viejo (`web.base.url`); entorno neutralizado (`database.is_neutralized`) o atestación; módulos (`sale_management`, `planning`, `base_automation`); modelos; **contrato de campos** de cada modelo que se va a tocar (incluye el renombre `groups_id`/`group_ids`); que existan los recursos, roles y productos de Planning de La Magia (G8, aviso).
- `FALLA` en cualquier `G*` ⇒ **STOP**. `WARN` ⇒ anotar y seguir solo si Marlon lo acepta (G8 sí bloquea R3 más adelante).
- Todo ítem marcado `(REMOTE)` es la **primera vez** que se comprueba contra Odoo real: reportar el texto completo de la salida.

## STEP 1 — SNAPSHOT PRE  · STOP si falla
```
node recovery/run.mjs snapshot --tag pre
```
Lee (solo lectura) `ir.model`, `ir.model.fields`, `ir.actions.server`, `base.automation`, `ir.cron`, `ir.ui.view`, `ir.ui.menu`, `ir.filters`, `ir.actions.act_window` y los datos maestros del hotel. **Sin PII ni secretos** (de partners, usuarios, reservas y pagos solo cuenta filas; el código y las vistas van como SHA-256).
- Sale con `4` si alguna acción parece contener una credencial ⇒ **STOP y avisar a Marlon** (no copiar el contenido).
- Guardar la ruta `recovery/out/snapshot-pre-<ts>/`.

## STEP 2 — R1 modelos y campos  · VERIFY · STOP si falla
```
node recovery/run.mjs layer R1                 # dry-run
node recovery/run.mjs layer R1 --apply         # solo si el dry-run no mostró BLOQUEA/FALTA/AMBIGUO/DIFF
```
`--apply` ya incluye el VERIFY (cada modelo y campo existe con el mismo tipo). Salida `status: OK` ⇒ siguiente. Cualquier otra ⇒ **STOP**.
Requiere `AI/recovery-extract/{models,fields,selections}.json`; sin ellos sale con `3`.

## STEP 3 — R2 campos de `sale.order`  · VERIFY · STOP si falla
```
node recovery/run.mjs layer R2 [--apply]
```
Crea los **80** campos `x_*` propios (los otros 17 del respaldo son de módulos estándar y no se tocan). **4 campos requieren el dump** (`x_guest_line_ids`, `x_hotel_payment_ids`, `x_regimen_cliente`, `x_tipo_persona_cliente`): hasta entonces la capa termina `PARTIAL` ⇒ **STOP**.

## STEP 4 — R3 datos maestros  · VERIFY · STOP si falla
```
node recovery/run.mjs layer R3 [--apply]
```
Propiedad → 201, 202, 203, 301, 302 → Casa Completa (con sus 5 hijas) → 2 políticas de anticipo. Verify: propiedad única, 5 habitaciones, Casa única con 5 hijas. `FALTA` de recurso/rol/producto de Planning ⇒ **STOP** (R3 no los crea). **No se cargan tarifas.**

## STEP 5 — R4 reglas  · VERIFY · STOP si falla
```
node recovery/run.mjs layer R4 [--apply]
```
Acciones, automatizaciones y crons de `planning.slot`/`sale.order`: disponibilidad, HOLD, exclusión Casa↔habitaciones y **guardia anti-solapamiento**. Todo **inactivo**. Verify: el código de cada acción coincide por SHA-256 con el extracto y cada automatización está inactiva y enlazada. Requiere el extracto completo (incluidos los campos derivados); sin él sale con `3`.

> **Reglas 167/168/169 (016):** R4 las relee del destino y las compara con `rules_old.json`. Verás `REUSA` (se dejan como están), `REEMPLAZO_REQUERIDO` (STOP: difieren o no existen; nunca se sobrescriben) o `BLOCKED` si no se pueden comparar (se aborta antes de escribir). En R3 verás además `ROLE_*` por los atributos de `planning.role`.

## STEP 6 — R5 reserva directa  · VERIFY · STOP si falla
```
node recovery/run.mjs layer R5 [--apply]
```
24 acciones «HOTEL v1 — …» (CONFIRMAR, HOLD, CHECKIN…, cotizar, motor tarifario…). Código idéntico al respaldo (SHA-256). Una línea `REVISAR` (números iguales a ids del staging viejo dentro del código) ⇒ **STOP** y mostrarla.

> **Alcance base (013):** en los pasos 2, 5 y 6 verás líneas `EXCLUYE_OTA` (componentes de Booking/Airbnb/Beds24/NOBEDS/iCal o con llamadas externas que **no** se crean; informativas), `ADAPTA` (referencias entre acciones convertidas de id a nombre; revisar el texto) y `ID_DURO` (código con ids numéricos de la base antigua; **no se crea y es STOP**).

## STEP 7 — R6 operador  · VERIFY · STOP si falla
```
node recovery/run.mjs layer R6 [--apply]
```
Usuario de Ángela con `base.group_user` + `sales_team.group_sale_salesman_all_leads`; el verify comprueba además que **no** tenga `base.group_system` ni `base.group_no_one`. Sin contraseña (Marlon define el acceso desde el panel). Requiere `RECOVERY_ANGELA_EMAIL`.

## STEP 8 — R7 tablero de Ángela  · VERIFY · STOP si falla
```
node recovery/run.mjs layer R7 [--apply]            # añadir --with-filters solo tras validar el XML en dry-run
node recovery/run.mjs snapshot --tag post
node recovery/run.mjs diff recovery/out/snapshot-pre-<ts> recovery/out/snapshot-post-<ts>   # solo informativo: debe mostrar solo lo creado
```
Vistas Kanban 6833 y formulario 6832 (botones reescritos al id nuevo de cada acción), acción «Reservas hotel», menús, filtro «Operación del día». Si la vista padre no se llama como se espera, **aborta** (BLOCKED).

## STEP 9 — QA TESTS
**Antes:** Marlon autoriza activar **solo** la automatización «HOTEL v1 — Guardia anti-solapamiento Planning v3 (002/003)» (desde la interfaz de Odoo). Sin ella activa, el QA se niega a crear nada.
```
node recovery/run.mjs verify all                    # R1–R7 en verde
node recovery/run.mjs qa --date 2027-03-01          # dry-run: lista los 4 escenarios
node recovery/run.mjs qa --date 2027-03-01 --apply
```
Escenarios (huéspedes ficticios «QA-RECOVERY-…», fecha lejana): Q1 reservar 301 (debe aceptar) · Q2 repetir 301 (debe rechazar) · Q3 Casa Completa esa noche (debe rechazar) · Q4 reservar 201 esa noche (debe aceptar). Cualquier resultado distinto del esperado ⇒ **STOP** y **no** activar nada más.

## STEP 10 — QA CLEANUP
```
node recovery/run.mjs qa-cleanup --apply
```
Deshace lo creado por el QA. Si Odoo no deja borrar una orden confirmada, la deja **cancelada** y la lista como residuo (queda etiquetada «QA-RECOVERY»; los tableros la excluyen). Reportar los residuos a Marlon.
Después: la guardia puede quedar activa; **no** activar el resto de automatizaciones ni crons sin una nueva autorización.

---

## ROLLBACK
```
node recovery/run.mjs rollback --layer R7            # dry-run: qué borraría / restauraría
node recovery/run.mjs rollback --layer R7 --apply
```
- Borra **solo** lo que la bitácora marca como creado por la recuperación; **restaura** solo lo modificado con `--force-diff`; **no toca nada preexistente**.
- Orden: capas de arriba abajo (`R7 → R1`), o todo con `rollback --apply`. Es seguro repetirlo.
- Si una entrada sale `CONFLICT` (alguien cambió el valor después) o `ERROR`, **no forzar**: reportar y esperar.
- Tras el rollback, `snapshot --tag post` y `diff` contra el PRE: debe quedar sin diferencias (el diff compara por clave natural, no por id).
- Rollback de una capa parcial (fallo a mitad) funciona igual: la bitácora registra la intención antes de crear.

## Qué reportar a ChatGPT/Marlon después de cada paso
Paso, comando, código de salida, `status`, líneas `BLOQUEA/FALTA/DIFF/REVISAR/AMBIGUO`, y la lista de `FAILED` del verify. **Sin** URLs con credenciales, correos ni contenido de acciones.
