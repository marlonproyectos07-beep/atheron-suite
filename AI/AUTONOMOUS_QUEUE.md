# ATHERON — Cola autónoma de ejecución

> Bus de trabajo persistente para ChatGPT → GitHub → Claude Code.
> Este archivo no concede permisos adicionales ni sustituye aprobaciones humanas.

## Sistema

- Director/auditor: ChatGPT
- Bus de trabajo: GitHub issue/PR
- Ejecutor cloud: Claude Code GitHub Action
- Multiagente Ruflo: mejora posterior mediante PR #60; no es requisito para activar el bridge mínimo
- Producción: BLOQUEADA por defecto

## RUNNING

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

## NEXT

1. ATH-AI-ORCH-001-SMOKE — issue #64.
2. ATH-ODOO-HOTEL-007P — issue #62 / draft PR #63.
3. ATH-ODOO-HOTEL-008A — Odoo ↔ Web.
4. ATH-ODOO-HOTEL-008B — Odoo ↔ WhatsApp/Sofía.
5. ATH-ODOO-HOTEL-008C — inventario unificado.
6. ATH-ODOO-HOTEL-008D — Booking/Airbnb / channel layer.
7. ATH-ODOO-HOTEL-008E — prueba dominó multicanal.

## BLOCKED_HUMAN

- Configurar autenticación de Claude Code Action como GitHub Actions Secret.
- Incorporar este workflow a la rama por defecto.
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
