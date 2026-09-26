# ATHERON — Cola autónoma de ejecución

> Bus de trabajo persistente para ChatGPT → GitHub → Claude Code.
> Este archivo no concede permisos adicionales ni sustituye aprobaciones humanas.

## Sistema

- Director/auditor: ChatGPT
- Bus de trabajo: GitHub issue/PR
- Ejecutor cloud: Claude Code GitHub Action
- Multiagente Ruflo: mejora posterior mediante PR #60; no es requisito para activar el bridge mínimo
- Producción: BLOQUEADA por defecto
- Bridge draft: PR #65

## COMPLETED

### ATH-AI-ORCH-001 — Autonomous Execution Bridge
Objetivo: eliminar el copiado manual de prompts.

Criterios:
- comentario de Marlon con `@claude` dispara Claude Code;
- GitHub conserva orden, evidencia y resultado;
- solo Marlon puede disparar esta primera versión;
- máximo 45 minutos por job;
- no merge automático;
- no producción;
- no force-push;
- no secretos en repo/prompts/logs;
- reporte en el issue/PR.

## RUNNING

1. ATH-AI-ORCH-002 — Autonomous Mission Loop: cola persistente, dispatcher, auditoría y continuación segura.

## NEXT

1. ATH-ODOO-HOTEL-007P — issue #62 / draft PR #63.
2. ATH-ODOO-HOTEL-008A — Odoo ↔ Web.
3. ATH-ODOO-HOTEL-008B — Odoo ↔ WhatsApp/Sofía.
4. ATH-ODOO-HOTEL-008C — inventario unificado.
5. ATH-ODOO-HOTEL-008D — Booking/Airbnb / channel layer.
6. ATH-ODOO-HOTEL-008E — prueba dominó multicanal.

## BLOCKED_HUMAN

- ATH-AI-ORCH-001 ya fue activado y validado por ATH-AI-SMOKE-001: trigger recibido y Claude ejecutado correctamente.
- ORCH-002 no puede considerarse PASS hasta demostrar al menos 3 subtareas consecutivas sin intervención del CEO.
- Merge, producción, pagos, credenciales externas, dominios/DNS y acciones irreversibles.

## Contrato de una orden

ChatGPT publicará directamente en GitHub:

```text
@claude
ATHERON AUTONOMOUS WORK ORDER
TASK_ID: ...
SCOPE: ...
SOURCE_OF_TRUTH: ...
ALLOWED: ...
FORBIDDEN: ...
ACCEPTANCE_TESTS: ...
STOP_CONDITIONS: ...
REPORT_BACK: ...
```

Marlon no debe copiar el bloque.

## Reglas

- Si una tarea requiere aprobación humana: `BLOCKED_HUMAN`.
- No saltar bloqueos.
- No inventar datos.
- No convertir etiquetas de middleware en evidencia del sistema fuente.
- No afirmar publicación/producción sin evidencia.
- Todo cambio queda en rama/PR hasta aprobación.
