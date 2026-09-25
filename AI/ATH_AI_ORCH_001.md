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

1. confirmar/instalar Claude GitHub App;
2. guardar el token de autenticación como GitHub Actions Secret;
3. aprobar merge de este pequeño workflow a `main`.

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
