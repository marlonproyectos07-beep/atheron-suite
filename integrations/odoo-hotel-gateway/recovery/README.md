# recovery/ — recuperación selectiva al staging NUEVO

Plan: `AI/ATH-STAGING-RECOVERY-CLAUDE-002_PLAN.md`. Matriz: `AI/ATH-STAGING-RECOVERY-CLAUDE-001_MATRIZ.md`.
**Nada de esto se ha ejecutado contra un Odoo remoto.** Dry-run por defecto; escribir exige `--apply` + `RECOVERY_CONFIRM=atheron1-hotel-staging-20261009`.

| Script | Estado | Escribe |
|---|---|---|
| `recovery-lib.mjs`, `connect.mjs`, `pure.mjs` | utilidades (guard, lista blanca de métodos, ensure idempotente) | — |
| `r0-preflight-readonly.mjs` | listo | nunca |
| `r1-models-fields.mjs` | esqueleto: espera `AI/recovery-extract/{models,fields,selections}.json` | con `--apply` |
| `r3-master-data.mjs` | listo (`--plan` sin red) | con `--apply` |
| `r4-actions-automations.mjs` | esqueleto: espera `{server_actions,automations,crons}.json`; todo se crea INACTIVO | con `--apply` |
| `r7-angela-board.mjs` | preparado: vistas 6832/6833, acción 1909, menús, filtro 26; `--with-filters` = borrador | con `--apply` |
| `rollback.mjs` | genérico, sobre la bitácora de cualquier fase | con `--apply` |
| `extract/extract.sh`, `extract/discover.sql` | para el dump local; NO probado, incompleto | no toca Odoo |

Sin el extracto, R1 y R4 terminan en `BLOCKED` (código 3) sin tocar la red. Contrato: `EXTRACT-CONTRACT.md`. Pruebas: `node --test recovery/test/recovery.test.mjs`.
Bitácoras en `recovery/out/` (ignorada por Git).
