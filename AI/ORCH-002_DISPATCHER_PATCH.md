# ATH-AI-ORCH-002 — Patch propuesto para el dispatcher

> Este archivo vive en `AI/` a propósito: la app de GitHub de Claude Code no
> tiene permiso para escribir en `.github/workflows/`. Lo que sigue es una
> propuesta exacta para que **ChatGPT Director la audite y Marlon la
> apruebe**; nadie debe copiarla a `.github/workflows/` sin esa auditoría.
> Complementa `AI/ORCH-002_MISSION_LOOP_SPEC.md`.

## 1. Por qué hace falta un cambio

El dispatcher actual (`.github/workflows/claude.yml`, fusionado en `main` por
el PR #65) sólo se dispara así:

```yaml
on:
  issue_comment:
    types: [created]
# ...
if: >
  github.actor == 'marlonproyectos07-beep' &&
  contains(github.event.comment.body, '@claude')
```

Es decir: cada subtarea necesita un comentario nuevo de Marlon. Eso es
correcto como puerta de entrada, pero no permite encadenar subtareas sin su
intervención — que es exactamente lo que pide el criterio de PASS de
ORCH-002.

## 2. Diseño elegido: workflow separado, no aflojar la puerta actual

Se descartó ampliar el `if` de `claude.yml` para aceptar comentarios de un
bot (por ejemplo `github-actions[bot]` o `claude[bot]`), porque eso
debilitaría la única barrera que impide que un tercero dispare el dispatcher
falsificando un comentario. En su lugar: un **segundo workflow**, disparado
por `workflow_run` (evento que emite GitHub cuando un workflow nombrado
termina; no es falsificable por un comentario de terceros porque no lee el
cuerpo de ningún comentario, sólo el resultado de una ejecución que ya pasó
por la puerta humana).

`claude.yml` **no se toca en su gate de entrada**. Sólo se le añadiría, como
mucho, una línea de contexto en el prompt (§4) para que el propio Claude
sepa que debe actualizar el archivo de cola. El nuevo workflow es el único
componente nuevo.

## 3. Archivo nuevo propuesto: `.github/workflows/atheron-mission-continue.yml`

```yaml
name: Atheron Mission Continuation

on:
  workflow_run:
    workflows: ["Atheron Claude Dispatcher"]
    types: [completed]

concurrency:
  group: atheron-mission-${{ github.event.workflow_run.head_branch }}
  cancel-in-progress: false

jobs:
  continue:
    # Sólo sigue si la ejecución humano-gated terminó bien. Si el job de
    # claude.yml fue "skipped" (actor no autorizado o sin '@claude' en el
    # comentario), o si terminó en fallo/timeout, no se continúa nada.
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    timeout-minutes: 45
    permissions:
      contents: write
      pull-requests: write
      issues: write
      actions: read

    steps:
      - name: Checkout de la rama de la misión
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
        with:
          ref: ${{ github.event.workflow_run.head_branch }}
          fetch-depth: 5

      - name: Verificar que el último commit es de la automatización confiada
        id: trust
        run: |
          AUTHOR_EMAIL="$(git log -1 --format='%ae')"
          echo "author_email=$AUTHOR_EMAIL" >> "$GITHUB_OUTPUT"
          case "$AUTHOR_EMAIL" in
            *noreply.github.com|*users.noreply.github.com) echo "trusted=true" >> "$GITHUB_OUTPUT" ;;
            *) echo "trusted=false" >> "$GITHUB_OUTPUT" ;;
          esac

      - name: Leer estado de la misión y decidir si continúa
        id: queue
        if: steps.trust.outputs.trusted == 'true'
        run: |
          set -euo pipefail
          MISSION_FILE=$(git diff --name-only HEAD~1 HEAD -- 'AI/queue/*.json' | head -n1 || true)
          if [ -z "$MISSION_FILE" ]; then
            echo "should_run=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          STATUS=$(jq -r '.status' "$MISSION_FILE")
          AUTO_USED=$(jq -r '.auto_continuations_used' "$MISSION_FILE")
          AUTO_MAX=$(jq -r '.max_auto_continuations' "$MISSION_FILE")
          CURRENT=$(jq -r '.current_task_id' "$MISSION_FILE")
          NEXT_ACTION=$(jq -r --arg t "$CURRENT" '.tasks_detail[$t].next_action // empty' "$MISSION_FILE")
          TASK_STATE=$(jq -r --arg t "$CURRENT" '.tasks_detail[$t].state' "$MISSION_FILE")
          if [ "$STATUS" != "RUNNING" ] || \
             [ "$TASK_STATE" != "QUEUED" ] || \
             [ -z "$NEXT_ACTION" ] || \
             [ "$AUTO_USED" -ge "$AUTO_MAX" ]; then
            echo "should_run=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          echo "should_run=true" >> "$GITHUB_OUTPUT"
          echo "mission_file=$MISSION_FILE" >> "$GITHUB_OUTPUT"
          {
            echo 'next_action<<EOF'
            echo "$NEXT_ACTION"
            echo 'EOF'
          } >> "$GITHUB_OUTPUT"

      - name: Reclamar la subtarea (QUEUED -> RUNNING, idempotente)
        if: steps.queue.outputs.should_run == 'true'
        run: |
          set -euo pipefail
          FILE="${{ steps.queue.outputs.mission_file }}"
          CURRENT=$(jq -r '.current_task_id' "$FILE")
          jq --arg t "$CURRENT" \
             '.tasks_detail[$t].state = "RUNNING"
              | .tasks_detail[$t].attempts += 1
              | .tasks_detail[$t].started_at = (now | todate)
              | .auto_continuations_used += 1' \
             "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
          git config user.name "atheron-mission-bot"
          git config user.email "atheron-mission-bot@users.noreply.github.com"
          git add "$FILE"
          git commit -m "chore(ai): claim $CURRENT (auto continuation)"
          git push origin "HEAD:${{ github.event.workflow_run.head_branch }}"

      - name: Continuar con Claude Code
        if: steps.queue.outputs.should_run == 'true'
        uses: anthropics/claude-code-action@9171db3e57d6a3140a37ddc2ba92788584e0ead6 # v1.0.234
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          claude_args: |
            --max-turns 30
            --append-system-prompt "Atheron autonomous execution (auto-continuation, sin comentario humano). Obey CLAUDE.md and AI/AUTONOMOUS_QUEUE.md and AI/ORCH-002_MISSION_LOOP_SPEC.md. Never touch production, merge, force-push, spend money, expose secrets, or elevate privileges without explicit CEO approval. Do not assume an external system was changed unless evidence proves it. If blocked, set the task state to BLOCKED_TECHNICAL or BLOCKED_HUMAN per the spec and stop that subtask."
          direct_prompt: ${{ steps.queue.outputs.next_action }}
```

Notas de diseño de este archivo (para la auditoría):

- **No añade secretos nuevos**: reutiliza `CLAUDE_CODE_OAUTH_TOKEN`, el mismo
  que ya usa `claude.yml`.
- **No es disparable por un tercero**: `workflow_run` sólo se emite cuando
  el workflow nombrado (`Atheron Claude Dispatcher`) ya corrió y terminó; y
  ese workflow ya exige `github.actor == 'marlonproyectos07-beep'`. Un
  comentario de un tercero con `@claude` no dispara ni siquiera el primer
  workflow.
- **Doble verificación de confianza**: además de depender de que
  `claude.yml` ya filtró por actor, este workflow vuelve a comprobar que el
  último commit de la rama es de un autor con email `*noreply.github.com`
  (el patrón que usan tanto Claude Code Action como este mismo bot), antes
  de leer `next_action` y ejecutarlo. Esto evita que un commit humano
  cualquiera (que no pasó por el dispatcher) dispare una continuación.
- **Idempotencia**: el paso "Reclamar" es la única escritura antes de correr
  Claude, y sólo se ejecuta si `TASK_STATE == QUEUED`. Si dos eventos
  `workflow_run` llegaran para la misma rama (no debería pasar, pero
  `concurrency.group` ya lo serializa), el segundo encontraría el estado ya
  en `RUNNING` u otro y `should_run` daría `false`.
- **Corte de autonomía**: `auto_continuations_used >= max_auto_continuations`
  detiene la cadena sin marcar nada como fallo; sólo dice `should_run=false`.
  La misión queda esperando un comentario humano que resetee el contador
  (fuera del alcance de este patch: se documenta como paso manual en
  `AI/ORCH-002_MISSION_LOOP_SPEC.md`, §9).
- **`BLOCKED_TECHNICAL` aislado**: como este workflow lee `current_task_id`
  y su `next_action`, una tarea bloqueada simplemente no genera
  `next_action`, así que no continúa sola — pero si el propio Claude, dentro
  de la misma ejecución, decidió que otra `task_id` independiente sí puede
  seguir, la lógica de negocio de cuál es "la siguiente" vive en el archivo
  de cola (campo `tasks` ordenado + `depends_on`), no en este workflow: este
  workflow es agnóstico a esa lógica, sólo ejecuta lo que la cola dice que
  es seguro ejecutar.
- **Límite de tiempo**: mismo `timeout-minutes: 45` que el dispatcher
  original, y el `concurrency.group` con `cancel-in-progress: false` evita
  solapes.

## 4. Cambio mínimo sugerido (opcional) en `claude.yml`

No es estrictamente necesario para que el workflow nuevo funcione, pero
ayuda a que la primera ejecución (la humano-gated) sepa que debe dejar la
cola en un estado consumible. Patch de una línea al `append-system-prompt`
existente:

```diff
             --append-system-prompt "Atheron autonomous execution. Obey CLAUDE.md and AI/AUTONOMOUS_QUEUE.md. Never touch production, merge, force-push, spend money, expose secrets, or elevate privileges without explicit CEO approval. Do not assume an external system was changed unless evidence proves it. If blocked, report BLOCKED_HUMAN and stop that subtask."
+            --append-system-prompt "If this task belongs to a mission with a queue file under AI/queue/<mission_id>.json, update it per AI/ORCH-002_MISSION_LOOP_SPEC.md before finishing: set this task's state, append evidence, and write next_action for the following task (or null)."
```

Este es el único cambio propuesto a un archivo que ya existe en
`.github/workflows/`; todo lo demás es un archivo nuevo. Ambos quedan
pendientes de que el Director los aplique tras auditar.

## 5. Análisis de seguridad (resumen)

| Riesgo considerado | Mitigación en este diseño |
|---|---|
| Un tercero dispara la cadena falsificando un comentario | `workflow_run` no lee comentarios; depende de que `claude.yml` ya haya corrido bajo su propio gate de actor. |
| Loop infinito de auto-continuación | `max_auto_continuations` (default 3) corta la cadena y exige comentario humano para resetear. |
| Reintento duplicado ejecuta la misma subtarea dos veces | Idempotencia por estado (`QUEUED` es condición de disparo) + `concurrency.group` por misión. |
| El workflow nuevo obtiene permisos que no tenía antes | Mismos permisos que ya tiene `claude.yml` (`contents: write`, `pull-requests: write`, `issues: write`); no se añade `id-token` ni permisos de `admin`. |
| Se cuela una tarea de producción/merge/secretos en `next_action` | El criterio `BLOCKED_HUMAN` (spec §8) es responsabilidad de la ejecución de Claude que escribe `next_action`; este workflow no interpreta contenido, sólo lo pasa. La responsabilidad de no proponerse a sí misma una continuación insegura sigue siendo del `--append-system-prompt` de guardrails, igual que hoy. |
| Filtración de secretos en logs | No se imprime `CLAUDE_CODE_OAUTH_TOKEN`; el `next_action` es texto de trabajo, no debe contener secretos igual que cualquier prompt actual. |

## 6. Qué falta para que esto sea PASS

1. Auditoría de ChatGPT Director sobre este documento.
2. Aprobación explícita de Marlon.
3. Aplicación del archivo nuevo (y el diff opcional) en
   `.github/workflows/` por alguien con permiso de escritura ahí (Director o
   Marlon; no la app de Claude Code).
4. Ejecutar la prueba de aceptación de `AI/ORCH-002_MISSION_LOOP_SPEC.md`
   §10 contra una misión de prueba real de bajo riesgo.
