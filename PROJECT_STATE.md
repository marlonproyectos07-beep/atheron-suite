# PROJECT_STATE — Atheron Suite / Integración Odoo Hotel

> No existía este archivo en la raíz (ya lo habían notado los relevos de
> HOTEL-009 y HOTEL-011: "`PROJECT_STATE.md` y `TASKS.md` no existen en
> la raíz"). Este documento llena ese hueco resumiendo el estado vivo;
> la referencia autoritativa y detallada de cada gate sigue siendo su
> propio archivo en `AI/ATH-ODOO-HOTEL-0XX_*.md` — no se duplica aquí,
> se apunta.

## Frentes activos en paralelo (mismo repo, worktrees separados)

| Frente | Rama | Worktree | Estado |
|---|---|---|---|
| HOTEL-011 (WhatsApp piloto controlado) | `feature/ath-odoo-hotel-011-whatsapp-controlled-pilot` | `C:\Users\HP\atheron-codex` | EN CURSO (Codex), draft PR #73 hacia HOTEL-009 |
| HOTEL-012 (tablero maestro + housekeeping) | `feature/ath-odoo-hotel-012-master-board-housekeeping` | `C:\Users\HP\atheron-hotel-012` | EN CURSO, base HOTEL-009, ver `AI/ATH-ODOO-HOTEL-012_HANDOFF.md` |

Ambos frentes parten de la misma base aprobada (HOTEL-009, `cd824a6`) y
no dependen uno del otro. Ninguno debe tocar la rama del otro.

> **HOTEL-012 V2 (2026-10-03):** Control Center evolucionado como read-model + pruebas
> (376 PASS). No verificado contra Odoo (sin sesión). Ver `AI/ATH-ODOO-HOTEL-012_V2_CONTROL_CENTER.md`.

## Historial de gates (más reciente primero)

| Gate | Estado | Referencia |
|---|---|---|
| HOTEL-012 | EN CURSO, bloqueado por falta de sesión Odoo STAGING para lo que requiere Odoo real | `AI/ATH-ODOO-HOTEL-012_HANDOFF.md`, `AI/ATH-ODOO-HOTEL-012_DIAGNOSTICO.md` |
| HOTEL-011 | EN CURSO (Codex, rama separada) | `integrations/odoo-hotel-gateway/HANDOFF.md` en esa rama |
| HOTEL-009 | **APROBADO** (FINAL_GATE: PASS, 2026-09-30) | `AI/ATH-ODOO-HOTEL-009_FINAL_APPROVED.md` |
| HOTEL-008 / 008A | APROBADO | `AI/ATH-ODOO-HOTEL-008_FINAL_APPROVED.md` |
| HOTEL-007 | Gateway base, implementado y probado | `integrations/odoo-hotel-gateway/README.md` |

## Entorno Odoo

- **Producción**: `atheron1` — nunca tocada por ningún gate de esta
  integración.
- **Staging (único ambiente usado)**: `atheron1-hotel-staging-20260923`.
- Las credenciales reales de conexión a Odoo solo han existido, según el
  propio README del gateway, en el equipo local de Marlon — nunca en
  este repositorio ni en la nube. Cualquier sesión de Claude/Codex que
  necesite datos reales de Odoo depende de que Marlon abra esa sesión.

## Reglas transversales (ver `AGENTS.md` / `CLAUDE.md` para el detalle completo)

Sitio web (Astro) y la integración Odoo Hotel comparten CEO (Marlon) y
las mismas reglas base: no producción sin autorización, no inventar
datos, no exponer secretos, punto de restauración antes de cambios
estructurales, reutilizar en vez de reconstruir.
