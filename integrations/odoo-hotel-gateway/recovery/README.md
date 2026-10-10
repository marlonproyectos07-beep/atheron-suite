# recovery/ — paquete de migración al staging NUEVO (`atheron1-hotel-staging-20261009`)

Gate y clasificación por capa: `AI/ATH-STAGING-RECOVERY-007_PAQUETE.md` · Ejecución: `AI/RUNBOOK-CODEX-STAGING-RECOVERY.md`.
**`MIGRATION_PACKAGE_READY = NO`**: R1, R4 y 4 campos de R2 esperan `AI/recovery-extract/` (dump). **Nada se ha ejecutado contra un Odoo remoto.**
Dry-run por defecto; escribir exige `--apply` + `RECOVERY_CONFIRM=atheron1-hotel-staging-20261009`. Todo código de salida ≠ 0 es STOP.

| Pieza | Qué es |
|---|---|
| `run.mjs` | CLI único: `precheck`, `snapshot`, `layer R1..R7`, `verify`, `rollback`, `qa`, `qa-cleanup`, `diff` |
| `guard.mjs` | guardia previa (recrea la intención de la 189): base/URL, no producción, neutralizado, estructura, contrato de campos |
| `snapshot.mjs` | foto PRE/POST sin PII ni secretos + diff por clave natural |
| `engine.mjs` | bitácora append-only, `ensure` idempotente, rollback selectivo/parcial/repetible |
| `steps.mjs` | guardia → prerrequisitos verificados → capa → verify |
| `layers/r1…r7.mjs` | capas (cada una con `run`, `verify`, `inputs`) |
| `qa.mjs` | QA sintético (paso 9) y limpieza (paso 10) |
| `EXTRACT-CONTRACT.md`, `extract/` | contrato del extracto del dump; el extractor **no está probado y no produce aún los campos derivados** |
| `payloads/` | Kanban 6833, filtros de Ángela (borrador), contrato de la fila KPI |
| `test/` | Odoo **falso**, extracto **sintético** (solo pruebas), 51 pruebas |
| `r0-preflight-readonly.mjs`, `r1-…`, `r3-…`, `r4-…`, `r7-…`, `rollback.mjs` | envoltorios de compatibilidad hacia `run.mjs` |

Pruebas: `node --test recovery/test/*.test.mjs` (51) · suite completa: `npm test` (558).
Bitácora y snapshots: `recovery/out/` (ignorada por Git).
