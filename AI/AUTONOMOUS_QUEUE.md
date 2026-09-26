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

- **Merge de PR #65 a `main`.** Causa raíz confirmada (auditoría ATH-AI-ORCH-001, 26/09/2026):
  `WORKFLOW_NOT_ON_DEFAULT_BRANCH` — GitHub solo activa workflows por `issue_comment` si el
  archivo ya existe en la rama por defecto (`main`), y `claude.yml` solo existe en esta rama.
  Evidencia y detalle en `AI/ATH_AI_ORCH_001.md` § Gate humano. Requiere aprobación explícita
  de Marlon para el merge; no se ejecuta desde ninguna sesión de Claude Code.
- **BLOCKED_HUMAN_SECRET_CONFIGURATION — `CLAUDE_CODE_OAUTH_TOKEN`.**
  - Secreto requerido: `CLAUDE_CODE_OAUTH_TOKEN` (GitHub Actions Secret, no variable de repo).
  - Dónde configurarlo: Settings → Secrets and variables → Actions → Repository secrets, en
    `marlonproyectos07-beep/atheron-suite`.
  - Por qué se necesita: lo consume `claude.yml` como `with.claude_code_oauth_token` para que
    `anthropics/claude-code-action` autentique la ejecución de Claude Code dentro del runner.
  - Por qué queda `BLOCKED_HUMAN` y no verificado aquí: ninguna herramienta disponible en esta
    sesión lista o consulta GitHub Actions Secrets (ni su existencia ni su valor); esto es
    intencional — evita que un agente pueda enumerar secretos.
  - Cómo comprobarlo después: tras el merge a `main`, publicar un comentario `@claude` de
    prueba (issue #64) y revisar el run en Actions; si falla con un error de autenticación del
    step "Claude Code", el secreto falta o es inválido — recién ahí corresponde revisarlo en
    Settings, nunca pegando su valor en un chat, issue, PR o commit.
- Verificar la política de Actions del repositorio permite ejecutar `anthropics/claude-code-action`
  (acción de un tercero distinto de `actions/*`); no verificable desde esta sesión.
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
