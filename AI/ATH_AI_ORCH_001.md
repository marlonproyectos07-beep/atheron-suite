# ATH-AI-ORCH-001 — Atheron Autonomous Execution Bridge

## Objetivo

Permitir que Marlon dé una orden en ChatGPT y que ChatGPT la entregue directamente a Claude Code mediante GitHub, sin copiar/pegar prompts entre herramientas.

## Arquitectura

```text
Marlon
  → ChatGPT (director / auditor)
    → GitHub issue o PR (bus de trabajo)
      → .github/workflows/claude.yml
        → anthropics/claude-code-action@v1
          → Claude Code
            → Ruflo / agentes permitidos cuando estén disponibles
              → código + tests + documentación
                → commit / PR / comentario de reporte
                  → ChatGPT audita
                    → Marlon aprueba únicamente gates humanos
```

## Por qué GitHub es el bus

- conserva la orden original;
- conserva evidencia y diffs;
- desacopla celular/PC de la ejecución cloud;
- permite que ChatGPT publique una orden usando la identidad GitHub de Marlon;
- Claude recibe el contexto del issue/PR;
- el resultado queda auditable aunque Marlon cierre el teléfono.

## Dispatcher inicial

El workflow usa el action oficial `anthropics/claude-code-action@v1`.

Trigger inicial:
- solo `issue_comment.created`;
- el comentario debe contener `@claude`;
- `github.actor` debe ser exactamente `marlonproyectos07-beep`.

Esto reduce la superficie de activación del repositorio público.

## Autenticación

No se guarda ningún secreto en el repositorio.

Configuración inicial prevista:
```text
CLAUDE_CODE_OAUTH_TOKEN
```

Debe existir únicamente como GitHub Actions Secret.

Si posteriormente se decide usar API directa, cambiar de forma explícita el workflow a:
```text
ANTHROPIC_API_KEY
```
y el input oficial `anthropic_api_key`.

Nunca poner cualquiera de esos valores en:
- chat;
- issue;
- PR;
- commit;
- archivo .env versionado;
- logs.

## Permisos del workflow

Se usan los permisos mínimos requeridos por el flujo interactivo oficial:
- contents: write
- pull-requests: write
- issues: write
- id-token: write
- actions: read

Adicionalmente:
- timeout: 45 minutos;
- concurrencia serial por issue/PR;
- no cancelación automática de un job anterior;
- solo actor CEO inicialmente.

## Guardrails Atheron

El dispatcher no autoriza por sí mismo:
- producción Odoo;
- Atheron Security;
- Booking/Airbnb reales;
- pagos;
- DIAN;
- DNS/dominio;
- publicación definitiva;
- merge;
- force push;
- rotación/creación de secretos;
- elevación de privilegios;
- gasto de créditos.

Esos gates siguen requiriendo aprobación humana explícita.

## Ruflo

El bridge se encadena sobre la rama que contiene PR #60.

Ruflo:
- maxAgents 15;
- autoScale false;
- daemon autoStart false;
- catálogo MCP reducido;
- debe usar el mínimo número de agentes por tarea.

El funcionamiento del dispatcher NO debe depender de que los 15 agentes estén activos. El valor está en poder escalarlos bajo demanda.

## Flujo operativo futuro

Ejemplo desde el celular:

```text
Marlon: "Avanza HOTEL-007P. No producción."
```

ChatGPT:
1. consulta estado GitHub;
2. genera la orden con guardrails y pruebas;
3. publica `@claude ...` en el issue/PR adecuado;
4. Claude Code ejecuta;
5. Claude deja commit/tests/reporte;
6. ChatGPT audita;
7. solo si existe un gate humano, vuelve a Marlon.

## Gate de activación

Preparar el workflow en una rama NO basta para activar comentarios `@claude`.
Para el flujo normal de comentarios, el workflow debe quedar incorporado a la rama por defecto y la autenticación/GitHub App debe estar configurada.

Hasta entonces, una mención `@claude` es solo texto y no debe reportarse como ejecución real.

## Plan de prueba después de activar

1. crear issue de smoke test sin Odoo;
2. ChatGPT publica una orden `@claude` de solo lectura;
3. verificar que arranca GitHub Actions;
4. verificar comentario de progreso;
5. permitir un cambio documental trivial en rama;
6. verificar commit;
7. comprobar que no hay agentes residuales;
8. cerrar smoke test;
9. habilitar ATH-ODOO-HOTEL-007P como primera tarea real.

## Rollback

Para desactivar el puente:
1. deshabilitar/eliminar el workflow en un cambio aprobado;
2. revocar/eliminar el GitHub Actions Secret si corresponde;
3. desinstalar Claude GitHub App si no se usa para otra función.

Ningún dato hotelero depende del bridge.
