# ATH-AI-ORCH-002 — Especificación técnica del mission loop

> Estado: ESPECIFICACIÓN. Ningún archivo de `.github/workflows/` fue modificado
> por este documento. Ver `AI/ORCH-002_DISPATCHER_PATCH.md` para el patch
> exacto propuesto al dispatcher, pendiente de auditoría por ChatGPT Director
> y aprobación de Marlon antes de aplicarse.

## 1. Objetivo

Encadenar subtareas de una misma misión sin que el CEO tenga que comentar
`@claude` en cada paso, manteniendo los mismos límites de seguridad que ya
rigen `AI/AUTONOMOUS_QUEUE.md` y `CLAUDE.md`: nada de producción, nada de
merge, nada de secretos, nada de escalamiento de privilegios.

Criterio de PASS de ORCH-002 (fijado por Marlon en el PR #66): al menos 3
subtareas consecutivas ejecutadas sin intervención del CEO.

## 2. Modelo de datos

Cada misión vive en un único archivo JSON: `AI/queue/<mission_id>.json`.
Ejemplo ilustrativo (no es un archivo de estado real, ver
`AI/queue/ORCH-002.example.json`).

### 2.1 Mission (nivel misión)

| Campo | Tipo | Descripción |
|---|---|---|
| `mission_id` | string | Identificador estable, ej. `ORCH-002`. |
| `created_by` | string | Usuario de GitHub que abrió la misión (debe ser Marlon). |
| `created_at` | ISO 8601 | Momento de creación. |
| `objective` | string | Copia del objetivo tal como lo dio el CEO. |
| `source_of_truth` | string | Dónde vive la verdad del encargo (issue/PR). |
| `allowed` / `forbidden` | string[] | Copiados del contrato de orden de `AUTONOMOUS_QUEUE.md`. |
| `tasks` | string[] | Lista ordenada de `task_id` que componen la misión. |
| `current_task_id` | string \| null | Puntero a la subtarea activa o siguiente. |
| `max_auto_continuations` | integer | Techo de subtareas encadenadas sin comentario humano. Default: `3` (coincide con el criterio de PASS). |
| `auto_continuations_used` | integer | Contador de continuaciones automáticas consumidas desde el último comentario humano. |
| `status` | string | `RUNNING` \| `PASS` \| `BLOCKED_HUMAN` \| `HUMAN_CHECKPOINT` \| `FAILED`. |

### 2.2 Task (nivel subtarea)

| Campo | Tipo | Descripción |
|---|---|---|
| `task_id` | string | `<mission_id>-T<n>`, ej. `ORCH-002-T1`. Determinístico: nunca se reutiliza ni se regenera. |
| `mission_id` | string | Misión a la que pertenece. |
| `state` | string | Ver §3. |
| `owner` | string | `claude-code-action` (o futuro ejecutor). |
| `branch` | string | Rama donde corre/corrió la subtarea. |
| `depends_on` | string[] | `task_id` de los que depende. Vacío = independiente. |
| `attempts` | integer | Reintentos consumidos (empieza en 0). |
| `max_attempts` | integer | Techo antes de `BLOCKED_TECHNICAL` automático. Default: `2`. |
| `evidence` | object[] | Lista append-only: `{type, ref, note, at}`. Nunca se borra ni se sobreescribe una entrada existente. |
| `next_action` | string \| null | Instrucción completa y autocontenida para la siguiente subtarea. `null` si no hay continuación (misión terminada o bloqueada). |
| `blockers` | string[] | Motivos concretos si `state` es `BLOCKED_*`. |
| `created_at` / `started_at` / `completed_at` | ISO 8601 \| null | Timestamps de ciclo de vida. |

## 3. Estados y transiciones válidas

```
QUEUED --(claim)--> RUNNING --(éxito)--> PASS
RUNNING --(bloqueo técnico recuperable)--> BLOCKED_TECHNICAL
RUNNING --(requiere aprobación/dato/producción/etc.)--> BLOCKED_HUMAN
RUNNING --(error no recuperable, agotó attempts)--> FAILED
BLOCKED_TECHNICAL --(reintento manual o automático si attempts < max_attempts)--> QUEUED
BLOCKED_TECHNICAL --(attempts >= max_attempts)--> BLOCKED_HUMAN
```

No hay transición directa `PASS -> RUNNING`: una vez en `PASS`, esa `task_id`
queda cerrada para siempre (ver idempotencia, §4). La continuación es una
`task_id` **nueva**, no una repetición de la anterior.

## 4. Idempotencia

- Una `task_id` sólo puede pasar de `QUEUED` a `RUNNING` **una vez por
  intento**. El "claim" (el commit que hace ese cambio de estado y suma 1 a
  `attempts`) debe ser la **primera** acción de cualquier ejecución que toque
  esa tarea.
- Antes de hacer nada más, el ejecutor relee el archivo de la misión. Si
  `state` ya no es `QUEUED` (porque otra ejecución ya la reclamó, o porque ya
  se resolvió), la ejecución aborta sin efectos: no vuelve a commitear, no
  vuelve a correr el prompt. Esto cubre reintentos accidentales de GitHub
  Actions (re-run de un job, doble entrega de webhook, etc.).
- El `concurrency.group` del workflow debe usar `mission_id` (no sólo el
  número de PR) como clave, para serializar todas las ejecuciones de una
  misma misión aunque lleguen por rutas distintas (comentario humano vs.
  continuación automática).
- `task_id` es determinístico y nunca se recicla: si `ORCH-002-T2` termina en
  `FAILED`, la siguiente subtarea es `ORCH-002-T3`, nunca un `T2` regenerado.

## 5. Evidencia

Ningún cambio de `state` es válido sin al menos una entrada nueva en
`evidence` con un `ref` verificable (URL de comentario, SHA de commit, URL de
run de Actions). Esto aplica la regla de `CLAUDE.md`: "no afirmar que algo
está publicado sin comprobarlo contra el sitio real" — aquí generalizado a
"ningún estado sin prueba".

## 6. `next_action`

Es el campo que permite encadenar sin al CEO: lo escribe la propia ejecución
de Claude como último paso antes de marcar `PASS`. Debe ser una instrucción
completa y autosuficiente (mismo nivel de detalle que un `ATHERON AUTONOMOUS
WORK ORDER` de `AUTONOMOUS_QUEUE.md`), porque se va a inyectar en una
invocación *nueva* de Claude Code que no tiene memoria de la conversación
anterior. Si la subtarea no genera una continuación segura (misión
terminada, o el siguiente paso requiere humano), `next_action` debe ser
`null` explícito, nunca un string vacío ambiguo.

## 7. Aislamiento de `BLOCKED_TECHNICAL`

Por defecto las subtareas de una misión son una cadena lineal
(`depends_on` implícito en el elemento anterior de `tasks`). Pero una
subtarea puede declarar `depends_on: []` (independiente) o apuntar a otra
`task_id` específica. El dispatcher sólo debe detener la cadena que depende
del nodo bloqueado:

- Si `ORCH-002-T2` (independiente) entra en `BLOCKED_TECHNICAL`, y
  `ORCH-002-T3` no tiene `T2` en su `depends_on`, `T3` puede seguir su curso
  normal.
- `mission.status` sólo pasa a `BLOCKED_HUMAN` si **todas** las tareas activas
  quedan bloqueadas, o si la que se bloqueó era condición de humano (§8).
- Un `BLOCKED_TECHNICAL` nunca detiene la misión completa por sí solo; sólo
  detiene su propia rama de dependencia.

## 8. Criterio `BLOCKED_HUMAN`

Una subtarea (o la misión completa) pasa a `BLOCKED_HUMAN`, nunca se
reintenta sola, cuando:

1. Toca producción, DNS o configuración de dominio.
2. Requiere merge a `main`, force-push, o cualquier operación destructiva de
   git listada como riesgosa.
3. Requiere secretos, tokens, credenciales o pagos.
4. Escribe en Odoo, Atheron Security, Booking/Airbnb o WhatsApp/Sofía.
5. Falta un dato real y la única forma de continuar sería inventarlo (regla 4
   de `CLAUDE.md`).
6. `attempts >= max_attempts` en `BLOCKED_TECHNICAL` (el bloqueo técnico no se
   resolvió solo).
7. Se llega a `auto_continuations_used == max_auto_continuations` (ver §9):
   esto no es un fallo, es el límite de autonomía diseñado a propósito.

## 9. Límite de autonomía (`max_auto_continuations`)

El criterio de PASS pide "al menos 3 subtareas consecutivas sin intervención
del CEO", no "infinitas". Por eso `max_auto_continuations` (default 3) actúa
como techo: al alcanzarlo, `mission.status` pasa a `HUMAN_CHECKPOINT` (estado
distinto de `BLOCKED_HUMAN`: no es un bloqueo, es una pausa de diseño) y el
dispatcher de continuación se niega a lanzar más subtareas automáticas hasta
que Marlon comente `@claude` de nuevo (lo que resetea
`auto_continuations_used` a 0). Esto evita loops de gasto/tiempo no
supervisados, en línea con "no elevación de privilegios" y con el espíritu de
control de horas de `CLAUDE.md`.

## 10. Prueba de aceptación: 3 subtareas consecutivas

Procedimiento manual/documentado (no requiere script adicional; usa el
propio historial de GitHub como evidencia):

1. **Setup**: Marlon (o ChatGPT Director en su nombre, con su aprobación)
   comenta `@claude` en un issue/PR con una misión de prueba de bajo riesgo
   que produzca naturalmente 3 pasos independientes verificables (ej. crear 3
   archivos de documentación separados, uno por subtarea). El comentario
   inicial crea `AI/queue/<mission_id>.json` con `tasks: [T1, T2, T3]`,
   `current_task_id: T1`, todas en `QUEUED`.
2. **T1**: el dispatcher humano-gated (`claude.yml`, sin cambios) corre T1,
   la deja en `PASS` con `next_action` apuntando a T2, y hace commit/push.
   Evidencia esperada: comentario del job + commit con el cambio de estado.
3. **Continuación automática 1**: el nuevo workflow de continuación (ver
   `AI/ORCH-002_DISPATCHER_PATCH.md`) se dispara por `workflow_run` al
   terminar el job de T1, sin ningún comentario nuevo de Marlon. Reclama T2
   (`QUEUED -> RUNNING`, `attempts: 1`), la ejecuta, la deja en `PASS` con
   `next_action` para T3. `auto_continuations_used: 1`.
4. **Continuación automática 2**: mismo mecanismo dispara T3 sin comentario
   humano. `auto_continuations_used: 2`.
5. **Verificación de PASS**: si T3 termina en `PASS`, ya hay 3 subtareas
   (T1 manual + T2 y T3 automáticas) — pero para satisfacer estrictamente "3
   consecutivas **sin** intervención del CEO" el caso de prueba debe tener
   como mínimo 4 subtareas (T1 manual + T2, T3, T4 automáticas), o bien
   contar T1 como el disparo humano legítimo que arranca la cadena y exigir
   que T2, T3 y T4 corran solas. Se deja explícito aquí para que el Director
   audite el conteo exacto antes de declarar PASS.
6. **Evidencia a recolectar**: para cada subtarea, el `ref` de su entrada en
   `evidence` (URL del comentario/commit/run) más el `auto_continuations_used`
   final. Sin estos refs verificables no se declara PASS (regla de evidencia,
   §5).
7. **Corte de autonomía**: repetir un paso más (una 4ª o 5ª subtarea
   automática, según se resuelva el punto 5) para confirmar que
   `HUMAN_CHECKPOINT` se activa exactamente en `max_auto_continuations` y que
   el sistema *no* sigue solo después de eso.

Este PASS sólo puede declararse después de que el patch de
`AI/ORCH-002_DISPATCHER_PATCH.md` sea auditado y aplicado por el Director;
este documento no ejecuta la prueba, la deja lista para ejecutarse.
