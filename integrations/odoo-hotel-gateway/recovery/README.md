# recovery/ — recuperación selectiva al staging NUEVO

Ver la matriz y el plan en `AI/ATH-STAGING-RECOVERY-CLAUDE-001_MATRIZ.md`.

**Estado: preparado, NO ejecutado contra ningún Odoo remoto.** Ningún script se ejecutó con red.

| Script | Qué hace | Escribe |
|---|---|---|
| `recovery-lib.mjs` | Guard (solo `atheron1-hotel-staging-20261009`; rechaza la vieja y producción), argumentos, bitácora | — |
| `r0-preflight-readonly.mjs` | Informa qué existe ya en el staging nuevo (módulos, modelos, campos, acciones, unidades) | No |
| `r3-master-data.mjs` | Propiedad → 5 habitaciones → Casa Completa → anticipos, por nombre. `--plan` funciona sin red | Solo con `--apply` + `RECOVERY_CONFIRM` |
| `r3-rollback.mjs` | Borra solo lo que la bitácora marca como CREATE | Solo con `--apply` + `RECOVERY_CONFIRM` |

Reglas: dry-run por defecto; nunca ids viejos; diferencias se reportan y no se sobrescriben sin `--force-diff`; credenciales solo por variables de entorno puestas por Marlon fuera del chat; `recovery/out/` contiene bitácoras locales (no subir).

Pendiente (no hay script aún, por falta de definiciones — ver matriz §0): R1 modelos `x_hotel_*` y campos de `planning.slot`; R4 reglas 167/168/169/189; R7 tablero.
