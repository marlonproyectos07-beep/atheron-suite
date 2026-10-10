# recovery/ — paquete de migración al staging NUEVO (`atheron1-hotel-staging-20261009`)

Gate y clasificación por capa: `AI/ATH-STAGING-RECOVERY-007_PAQUETE.md` · Ejecución: `AI/RUNBOOK-CODEX-STAGING-RECOVERY.md`.
**ATH-020:** R1, R2 y R4 se alimentan ahora del cierre publicado (`AI/recovery-extract/ath012_closure.json`, `rules_current.json`, `planning_roles_current.json`): `node recovery/run.mjs close-analysis` (offline) imprime las compuertas. `MIGRATION_PACKAGE_READY = YES` **solo significa listo para una misión de ejecución controlada**, con las precondiciones de destino de `AI/ATH-STAGING-RECOVERY-020_ESTADO.md` §9; no autoriza escribir en el staging. Histórico: `AI/ATH-STAGING-RECOVERY-013_ESTADO.md`.
Dry-run por defecto; escribir exige `--apply` + `RECOVERY_CONFIRM=atheron1-hotel-staging-20261009`. Todo código de salida ≠ 0 es STOP.

| Pieza | Qué es |
|---|---|
| `run.mjs` | CLI único: `precheck`, `snapshot`, `layer R1..R7`, `verify`, `rollback`, `qa`, `qa-cleanup`, `diff`; offline: `close-analysis`, `rules-compare`, `role-plan` |
| `guard.mjs` | guardia previa (recrea la intención de la 189): base/URL, no producción, neutralizado, estructura, contrato de campos |
| `snapshot.mjs` | foto PRE/POST sin PII ni secretos + diff por clave natural |
| `engine.mjs` | bitácora append-only, `ensure` idempotente, rollback selectivo/parcial/repetible |
| `steps.mjs` | guardia → prerrequisitos verificados → capa → verify |
| `layers/r1…r7.mjs` | capas (cada una con `run`, `verify`, `inputs`) |
| `qa.mjs` | QA sintético (paso 9) y limpieza (paso 10) |
| `rules-compare.mjs` | comparador de 167/168/169: `REUSE_AS_IS` · `REUSE_WITH_ADAPTATION` · `REPLACE_REQUIRED` · `ABORT`; R4 aborta antes de modificar si no puede comparar |
| `planning-role.mjs` | mapeo idempotente de `planning.role` (`x_casa`, `x_is_a_room_offer`) por nombre; paso dentro de R3 |
| `hotel-gate.mjs` | compuerta de lógica hotelera previa a mutar R4 y estado del reemplazo de la 189 (exige `rule189_intent.json`) |
| `scope.mjs` | alcance BASE: excluye OTA (Booking/Airbnb/Beds24/NOBEDS/iCal/llamadas externas), detecta ids numéricos duros y adapta `browse(<id>)` entre acciones a búsqueda por nombre |
| `EXTRACT-CONTRACT.md`, `extract/` | contrato del extracto del dump; el extractor **no está probado y no produce aún los campos derivados** |
| `payloads/` | Kanban 6833, filtros de Ángela (borrador), contrato de la fila KPI |
| `test/` | Odoo **falso**, extracto **sintético** (solo pruebas), 87 pruebas |
| `r0-preflight-readonly.mjs`, `r1-…`, `r3-…`, `r4-…`, `r7-…`, `rollback.mjs` | envoltorios de compatibilidad hacia `run.mjs` |

Pruebas: `node --test recovery/test/*.test.mjs` (87) · suite completa: `npm test` (594).
Bitácora y snapshots: `recovery/out/` (ignorada por Git).
| `closure.mjs` | ATH-020: deriva del cierre ATH-012 los archivos del contrato (models, fields, selections, server_actions, automations, crons, rules_old, planning_roles, rule189_intent) y adapta las lecturas actuales de Codex; `loadExtract` cae a él si falta el archivo |
| `closure-analysis.mjs` | ATH-020: análisis offline R1/R2/R4/167-169/189/roles/R3-R7 y compuertas (`run.mjs close-analysis`) |
| `deps.mjs` | ATH-020: dependencias related/compute y usos de campos con modelo explícito; R1/R2/R4 no crean un campo cuya ruta no existe (`DEP_FALTA`) |
