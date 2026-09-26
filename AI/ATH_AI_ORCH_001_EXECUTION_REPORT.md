# ATH-AI-ORCH-001 — Informe de ejecución

Auditoría y cierre documental de por qué los comentarios `@claude` en PR #63 e Issue #62
nunca dispararon una ejecución verificable de Claude Code. Todo lo descrito aquí es
HECHO/VERIFICADO contra el estado real de GitHub el 26/09/2026, con las herramientas de
lectura disponibles en esta sesión. No se hizo ninguna acción irreversible, ni merge, ni
force-push, ni se tocó `main`, ni se leyó/expuso ningún secreto.

## 1. Causa raíz

**`WORKFLOW_NOT_ON_DEFAULT_BRANCH`.**

`issue_comment` es un evento de repositorio sin ref propio (no está atado a una rama/commit
concretos, a diferencia de `push` o `pull_request`). Por eso GitHub solo activa workflows para
ese tipo de evento si el archivo del workflow ya existe en la **rama por defecto** del
repositorio. El dispatcher (`.github/workflows/claude.yml`) fue creado en la rama
`chore/ath-ai-orch-001-main` (PR #65, sin fusionar) y nunca llegó a `main`. Resultado: GitHub
nunca registró ni disparó ese workflow, ni una sola vez, para ningún comentario `@claude` en
todo el repositorio — no solo en PR #63/Issue #62.

Las reacciones 👀 de `claude[bot]` que Marlon vio en PR #57 y PR #63 vienen de la app oficial
de Claude para GitHub (mención nativa), un mecanismo separado e independiente de este Action
personalizado. Esa reacción confirma que la app está instalada y escuchando menciones; no
demuestra que el Action del dispatcher se haya ejecutado. Ambos hechos son compatibles, no se
contradicen.

## 2. Evidencia (verificada esta sesión, no asumida)

| Comprobación | Resultado |
|---|---|
| `default_branch` real del repositorio (API GitHub) | `main` |
| Contenido de `.github/workflows/` en `ref=main` | Solo `lighthouse-atheron-suite.yml` y `redespliegue-programado.yml`. **No existe `claude.yml`.** |
| `actions_list` (`list_workflows`), repo completo | 3 workflows registrados; ninguno es el dispatcher de Claude |
| `actions_list` (`list_workflow_runs`), sin filtro | 37 runs totales; **100% `schedule` o `push`; 0% `issue_comment`** |
| PR #65 — comentarios | Solo ruido de Vercel bot; ningún run de Actions asociado |
| PR #63 — comentarios | 2 órdenes `@claude` de Marlon (incl. una preguntando explícitamente "¿recibiste la orden anterior?"); cero respuesta/commit de Claude Code |
| Issue #62 — comentarios | 1 orden `@claude` de Marlon; cero respuesta/commit de Claude Code |
| Sintaxis YAML de `claude.yml` | Parsea sin error (`yaml.safe_load`); la clave `on:` se interpreta como booleano por parsers YAML estrictos (PyYAML), pero es la **misma sintaxis exacta** que usan `lighthouse-atheron-suite.yml` y `redespliegue-programado.yml`, que sí generan runs reales — descartado como causa |
| `mergeable_state` de PR #65 contra `main` | `clean` (sin conflictos) |
| Existencia de Issue #64 (smoke test) | Ya existe, con contenido completo, creado por Marlon el 25/09/2026; se autobloquea explícitamente ("no debe activarse hasta que ATH-AI-ORCH-001 supere su gate humano") |

## 3. Arquitectura implementada

Sin cambios de arquitectura: se confirma y se refuerza la ya diseñada en PR #65
(`AI/ATH_AI_ORCH_001.md`, `AI/AUTONOMOUS_QUEUE.md`, `.github/workflows/claude.yml`), por
instrucción explícita de la orden de preferir fortalecer el trabajo existente sobre construir
infraestructura paralela. No se creó ningún workflow, dispatcher ni cola nuevos.

## 4. Archivos modificados

- `AI/ATH_AI_ORCH_001.md` — se añadió la causa raíz confirmada con su evidencia, y se
  precisaron los pendientes del gate humano (secreto no verificable desde esta sesión; política
  de Actions del repo para acciones de terceros, también no verificable desde esta sesión).
- `AI/AUTONOMOUS_QUEUE.md` — se reescribió `BLOCKED_HUMAN` con el formato
  `BLOCKED_HUMAN_SECRET_CONFIGURATION` exigido por la orden (secreto, dónde, por qué, cómo
  comprobar) y se ligó el bloqueo de merge a la causa raíz confirmada.
- `AI/ATH_AI_ORCH_001_EXECUTION_REPORT.md` — este informe (nuevo).

No se modificó `.github/workflows/claude.yml`: no se encontró ningún defecto funcional en él
(ver §2, fila de sintaxis YAML) que justificara tocarlo.

## 5. Commits

Todos sobre la rama existente `chore/ath-ai-orch-001-main` (PR #65), sin merge, sin
force-push, sin tocar `main`.

## 6. HEAD inicial

`dfd1b116fe8ce5f4776bc86860141d059dc95be2` (verificado con `git ls-remote` antes de escribir
cualquier archivo).

## 7. HEAD final

Ver el commit de este mismo cambio en el historial de `chore/ath-ai-orch-001-main` — mensaje
`docs(ai): confirma causa raiz WORKFLOW_NOT_ON_DEFAULT_BRANCH y cierra auditoria ATH-AI-ORCH-001`.

## 8. Tests

No aplica ejecución de suite automatizada: este cambio es documental (no toca código de
`integrations/odoo-hotel-gateway` ni ningún otro código ejecutable). Verificación aplicada en
su lugar: `python3 -c "yaml.safe_load(...)"` sobre `claude.yml` (parsea correctamente) y
comparación de sintaxis contra los dos workflows ya activos del repositorio (§2).

## 9. Smoke test

**No ejecutado — y no debía ejecutarse en esta sesión.** El Issue #64 (smoke test
`ATH-AI-ORCH-001-SMOKE`) ya existe, ya está completo, y se autobloquea explícitamente hasta
que el gate humano de ATH-AI-ORCH-001 se supere (merge a `main` + secreto confirmado). Activar
ese issue o cualquier vía alternativa (por ejemplo, añadir un trigger `workflow_dispatch` para
ejecutar el dispatcher sin mergear) habría sido exactamente el tipo de rodeo que la orden
prohíbe: "Claude nunca debe interpretar BLOCKED_HUMAN como permiso para saltarse el gate." No
se reutiliza ni se duplica el issue: se deja tal cual, listo para dispararse en cuanto el gate
humano se apruebe.

## 10. Evidencia GitHub

- PR #65: https://github.com/marlonproyectos07-beep/atheron-suite/pull/65
- PR #63: https://github.com/marlonproyectos07-beep/atheron-suite/pull/63
- Issue #62: https://github.com/marlonproyectos07-beep/atheron-suite/issues/62
- Issue #64: https://github.com/marlonproyectos07-beep/atheron-suite/issues/64
- Comentario ejecutivo de esta auditoría: publicado en PR #65.

## 11. Bloqueos / elementos BLOCKED_HUMAN

1. **Merge de PR #65 a `main`** — requiere aprobación explícita de Marlon; es la única acción
   que resuelve la causa raíz.
2. **`BLOCKED_HUMAN_SECRET_CONFIGURATION` — `CLAUDE_CODE_OAUTH_TOKEN`** — ver el detalle
   completo (dónde, por qué, cómo comprobar) en `AI/AUTONOMOUS_QUEUE.md` § BLOCKED_HUMAN. No
   verificable desde ninguna herramienta disponible en esta sesión.
3. **Política de Actions del repositorio para acciones de terceros** (`anthropics/claude-code-action`
   no pertenece a la organización `actions`) — no verificable desde esta sesión; a revisar en
   Settings → Actions → General antes o junto con el merge.
4. **Ejecución del smoke test (Issue #64)** — bloqueada por diseño hasta que 1 y 2 se resuelvan.

## 12. Siguiente paso recomendado

Cuando Marlon apruebe: (a) confirmar en Settings que `CLAUDE_CODE_OAUTH_TOKEN` existe como
GitHub Actions Secret; (b) confirmar que la política de Actions permite
`anthropics/claude-code-action`; (c) mergear PR #65 a `main`; (d) publicar un comentario
`@claude` en Issue #64 y verificar en la pestaña Actions que aparece un run real disparado por
`issue_comment`; (e) solo si ese run termina en verde, declarar el bridge operativo y recién
entonces disparar Issue #62 / PR #63 (ATH-ODOO-HOTEL-007P) como primera tarea real.
