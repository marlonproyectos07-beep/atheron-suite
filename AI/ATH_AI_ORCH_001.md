# ATH-AI-ORCH-001 — Autonomous Execution Bridge

## Meta

Que Marlon pueda escribir desde ChatGPT:

```text
Avanza ATH-ODOO-HOTEL-007P. No producción.
```

y que ChatGPT publique directamente la orden en GitHub para Claude Code, sin copiar/pegar prompts.

## Flujo

```text
Marlon
→ ChatGPT
→ GitHub issue/PR
→ Atheron Claude Dispatcher
→ Claude Code
→ rama/commit/tests/reporte
→ GitHub
→ ChatGPT audita
→ Marlon solo interviene en gates humanos
```

## Implementación mínima

El dispatcher se instala primero sin depender de Ruflo. Esto permite activar el puente con el menor cambio posible sobre `main`.

PR #60 agrega después la capa Ruflo/Graphify y el equipo lógico multiagente. Cuando esa capa se incorpore, el dispatcher puede aprovecharla sin cambiar el contrato Marlon → ChatGPT → GitHub.

## Seguridad

Trigger inicial:
- `issue_comment.created`;
- comentario contiene `@claude`;
- actor exacto: `marlonproyectos07-beep`.

El repositorio es público, por eso no se permite activación por usuarios externos en esta fase.

El workflow recibe únicamente el secreto de autenticación de Claude. No recibe:
- Odoo;
- Booking/Airbnb;
- WhatsApp/Meta;
- pagos;
- DIAN;
- Higgsfield.

Por diseño, activar este bridge no entrega credenciales productivas al runner.

## Supply chain

Las Actions se fijan por SHA auditado al crear este PR:

- `actions/checkout` v6 → `d23441a48e516b6c34aea4fa41551a30e30af803`
- `anthropics/claude-code-action` v1.0.234 → `9171db3e57d6a3140a37ddc2ba92788584e0ead6`

No se usa un tag mutable para ejecutar código de terceros.

## Autenticación

Workflow inicial:
```text
CLAUDE_CODE_OAUTH_TOKEN
```

El valor debe vivir solo en GitHub Actions Secrets.

Si se decide API directa, cambiar explícitamente a `ANTHROPIC_API_KEY` + input `anthropic_api_key`.

Nunca pegar el valor en chat, issue, PR, commit o archivo versionado.

## Gate humano único de activación

**Claude GitHub App: presencia confirmada.** El bot `claude[bot]` reaccionó con 👀 a órdenes `@claude` publicadas por Marlon en PR #57 y PR #63. Esto confirma que la App está instalada/escuchando; no demuestra por sí solo que el GitHub Action esté ejecutando trabajos.

**Causa raíz confirmada de por qué esas órdenes nunca dispararon un run (ATH-AI-ORCH-001, auditoría 26/09/2026):** `WORKFLOW_NOT_ON_DEFAULT_BRANCH`. Evidencia directa, verificada esta sesión:
- el repositorio tiene `default_branch = main` (confirmado vía API de GitHub);
- `.github/workflows/claude.yml` no existe en `main` (confirmado leyendo el árbol de `main`: solo están `lighthouse-atheron-suite.yml` y `redespliegue-programado.yml`);
- `issue_comment` es un evento de repositorio sin ref propio; GitHub solo activa workflows para ese tipo de evento si el archivo ya existe en la rama por defecto — el archivo de este PR, al vivir solo en `chore/ath-ai-orch-001-main`, nunca llegó a registrarse;
- confirmado también por el listado de workflows del repo (solo 3 registrados, ninguno es el dispatcher) y por el historial de ejecuciones (37 runs totales, todos `schedule`/`push`, cero `issue_comment`);
- se descartó como causa alternativa un problema de sintaxis YAML: la clave `on:` sin comillas se interpreta como booleano por parsers YAML estrictos (PyYAML), pero es la misma sintaxis que usan `lighthouse-atheron-suite.yml` y `redespliegue-programado.yml`, que sí generan runs reales — no es un defecto de este archivo, es una particularidad conocida de YAML que GitHub interpreta igual en los tres archivos.
- las reacciones 👀 de `claude[bot]` vienen de la app oficial de Claude (mención nativa), un mecanismo independiente de este Action; no contradicen el diagnóstico.

Pendiente (sin cambios de fondo, ahora con evidencia):
1. confirmar que existe `CLAUDE_CODE_OAUTH_TOKEN` como GitHub Actions Secret — **no verificable desde esta sesión**: ninguna herramienta disponible aquí lista o consulta GitHub Actions Secrets (por diseño, para no exponer valores). Ver `BLOCKED_HUMAN` en `AI/AUTONOMOUS_QUEUE.md`;
2. verificar la política de Actions del repositorio (Settings → Actions → General → "Allow actions and reusable workflows") permite ejecutar `anthropics/claude-code-action` — las dos acciones ya probadas en este repo (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`) son de la organización `actions`, no equivalen a probar que una acción de un tercero distinto esté permitida; esto tampoco es verificable desde esta sesión (no hay herramienta de configuración de repositorio disponible);
3. aprobar merge de este pequeño workflow a `main`;
4. ejecutar issue #64 y verificar un run real de GitHub Actions antes de declarar el bridge operativo.

Después:
- ChatGPT puede publicar la orden;
- GitHub despierta Claude Code;
- Marlon deja de transportar prompts.

## Smoke test

Issue preparado: #64.

Debe demostrar:
- trigger real;
- Claude lee el repo;
- crea solo cambio documental trivial en rama;
- reporta;
- no Odoo;
- no producción;
- no merge.

## Primera tarea real

Issue #62 / PR #63:
`ATH-ODOO-HOTEL-007P — Promotion Rehearsal`.

## Rollback

Deshabilitar el bridge:
- revertir/eliminar workflow mediante PR aprobado;
- revocar GitHub Actions Secret;
- desinstalar Claude GitHub App solo si no se usa para otras funciones.

Ninguna operación hotelera depende del bridge.
