# ATHERON — Cloud Agent Stack

## Qué recuperamos de la historia

La herramienta que Marlon recordaba como “Runflow” encaja con **Ruflo**, antes llamado **Claude Flow**.

Ruflo V3 soporta una topología `hierarchical-mesh` con `maxAgents: 15`. Es decir: el recuerdo de “unos 15 skills como 15 trabajadores” corresponde mejor a **15 agentes/trabajadores coordinados**, no a 15 paquetes independientes.

## Estado previo recuperado

- GitHub = memoria y fuente compartida.
- ChatGPT = director/orquestador/auditor.
- Claude Code = constructor/ingeniero principal.
- Codex = segundo revisor/ejecutor.
- OpenCode + Ollama = respaldo local.
- Gemini = research/contraste.
- Graphify = mapa de conocimiento del repositorio.
- Higgsfield CLI = pipeline creativo; en una sesión anterior se instalaron 8 skills: generate, brandkit, product-photoshoot, marketplace-cards, soul-id, video-explainer, youtube-thumbnail y websites.

No asumir que las instalaciones de una sesión Cloud anterior persisten en una sesión nueva: verificar antes de reinstalar.

## Stack a instalar/verificar en Claude Code Cloud

### 1. Ruflo
Objetivo: orquestación multiagente, memoria, hooks, tareas y handoffs.

Comandos oficiales usados por este proyecto. **Versión fijada a propósito**
(auditada el 2026-09-25: `ruflo v3.45.0`) — no usar `@latest` en nada que una
sesión de Cloud vaya a ejecutar sola, para que una versión nueva no auditada
no entre sin revisión:

```bash
npx skills add ruvnet/ruflo --skill ruflo --yes
npx ruflo@3.45.0 init
# 'ruflo init' ya escribe el MCP en .mcp.json (clave "claude-flow",
# versionado). NO usar ademas 'claude mcp add': crea un registro duplicado
# con otra clave que ruflo doctor marca como conflictivo.
npx ruflo@3.45.0 doctor --fix
npx ruflo@3.45.0 swarm init --topology hierarchical-mesh --max-agents 15 --strategy specialized
```

### 2. Graphify
Objetivo: evitar releer el repo completo, navegar arquitectura y dependencias por grafo.

```bash
uv tool install graphifyy
graphify install
graphify claude install
```

Si `uv` no existe:

```bash
python3 -m pip install --user -U graphifyy
graphify install
graphify claude install
```

### 3. Codex CLI
Objetivo: segundo revisor independiente y apoyo de ejecución.

```bash
npm install -g @openai/codex
codex --version
```

No autenticar automáticamente en bootstrap; hacerlo solo mediante el flujo seguro que corresponda al entorno Cloud.

### 4. Higgsfield CLI
Objetivo: skills creativos de imágenes/video/marketing.

```bash
npm install -g @higgsfield/cli
higgsfield --version
```

Primero verificar si ya existe. No generar contenido pago ni consumir créditos durante el bootstrap.

## Los 15 “trabajadores” Atheron

Ruflo será la capa de coordinación. El equipo lógico recomendado queda así:

1. Coordinador principal / anti-drift.
2. Arquitecto de plataforma.
3. Ingeniero Odoo/integraciones.
4. Ingeniero web/frontend.
5. Ingeniero backend/API.
6. Tester/QA.
7. Revisor de código.
8. Security architect.
9. Security auditor.
10. Performance engineer.
11. Memory/knowledge specialist.
12. GitHub/CI/release specialist.
13. Research/SEO/GEO specialist.
14. Data/analytics specialist.
15. Documentación/handoff/operaciones.

Estos son **roles lógicos de Atheron**. Ruflo dispone de decenas de tipos de agentes y se mapearán a los tipos incorporados más cercanos; no crear 15 frameworks separados.

## Guardrails Atheron

- Producción Odoo: NO tocar sin aprobación explícita.
- Atheron Security: NO tocar durante gates Hotel salvo autorización.
- Secretos: nunca en repo, commits, logs o prompts.
- Acciones irreversibles, dinero, despliegue productivo o publicación definitiva: aprobación previa.
- Agentes pueden investigar, codificar, probar, documentar y crear ramas/PR draft de forma autónoma.
- GitHub mantiene el handoff persistente.
- Antes de aprobar un reporte de otro agente, auditar evidencia.

## Ejecución preparada

Desde la raíz del repo:

```bash
bash scripts/bootstrap-cloud-agent-stack.sh
```

Al terminar, guardar el reporte de:
- `npx ruflo@latest doctor`
- `npx ruflo@latest agent list`
- `claude mcp list`
- `codex --version`
- `higgsfield --version`

No conectar Odoo en este bootstrap. HOTEL-007 sigue en su gate independiente.

## Estado tras la ejecución (2026-09-25)

Bootstrap ejecutado en una sesión de Claude Code Cloud sobre esta rama. Estado
verificado, no hipótesis:

- **Ruflo**: instalado (`ruflo v3.45.0`). `ruflo doctor` en verde (21 checks,
  8 warnings — normales: daemon no arrancado, encriptación en reposo apagada,
  paquetes opcionales `agentic-flow`/`@claude-flow/aidefence` no instalados).
- **Swarm**: `ruflo swarm init --topology hierarchical-mesh --max-agents 15
  --strategy specialized` ejecutado. Confirmado en `.claude-flow/config.yaml`
  y `.claude/settings.json` (`claudeFlow.swarm.topology = hierarchical-mesh`,
  `maxAgents = 15`). Sin agentes activos todavía (el daemon no se arrancó a
  propósito, para no consumir recursos ni dejar procesos de fondo corriendo
  solos).
- **MCP de Ruflo**: registrado en `.mcp.json` (project-scoped, versionado,
  reproducible) bajo la clave canónica `claude-flow` — `npx -y ruflo@latest
  mcp start`. Se detectó y eliminó un registro legado duplicado (`ruflo`) que
  `ruflo doctor` señaló como conflictivo.
  **Pendiente de aprobación humana:** Claude Code exige que una persona
  apruebe una vez, de forma interactiva (`claude` y aceptar el diálogo de
  confianza del proyecto), cualquier servidor MCP definido en `.mcp.json`
  antes de que arranque. Esto no se puede ni se debe automatizar desde un
  bootstrap — es la misma barrera de seguridad que impide que un repo
  ejecute procesos arbitrarios sin que alguien lo confirme. Cada sesión
  nueva (incluidas las de Cloud) deberá aprobarlo una vez.
- **Graphify**: instalado vía `uv tool install graphifyy` (no fue necesario
  el fallback a pip). `graphify install` y `graphify claude install`
  ejecutados: agregó una sección corta a este `CLAUDE.md` y un hook
  `PreToolUse` ligero (10 ms) sobre `Bash|Grep` y `Read|Glob` para consultar
  el grafo antes de releer el repo completo. No se generó `graphify-out/`
  todavía (se genera con `/graphify .` o `graphify update .`, bajo demanda).
- **Codex CLI**: instalado (`codex-cli 0.157.0`). Sin autenticar — no se
  tocó `~/.codex` con credenciales.
- **Higgsfield CLI**: instalado (`higgsfield 1.1.26`). Sin autenticar y sin
  consumir créditos — no se invocó ningún comando de generación.
- **Paquetes verificados en el registro antes de instalar** (nombre,
  publicador, propósito) para descartar typosquatting: `ruflo` (ruvnet),
  `skills` (vercel-labs, usado por `npx skills add`), `@openai/codex`
  (openai-publisher), `@higgsfield/cli` (higgsfield.ai), `graphifyy` (PyPI).
- **Qué se versiona y qué no**: `.mcp.json`, `skills-lock.json`,
  `.agents/skills/ruflo/SKILL.md`, `.claude/settings.json`,
  `.claude/skills/`, `.claude/agents/`, `.claude/commands/`,
  `.claude/helpers/` y `.claude-flow/config.yaml` quedan versionados porque
  son la configuración declarada y reproducible del stack. Se excluyeron
  por `.gitignore` (estado de ejecución específico de esta máquina, no
  configuración): `.swarm/` (bases sqlite de memoria), `ruvector.db`,
  `.claude-flow/data|logs|sessions|metrics|security|policy|swarm`,
  `.claude/proven-config.json` y `.claude/.proven-config-version`
  (benchmark de enrutamiento con timestamp de esta ejecución),
  `.claude/settings.json.graphify-bak` (backup transitorio de la
  instalación) y `graphify-out/` (grafo regenerable).
- **Nada tocado de**: dominio/DNS, producción, Odoo, Atheron Security,
  HOTEL-007. No se agregó ningún secreto al repo (verificado con búsqueda de
  patrones de claves/tokens sobre todo lo nuevo antes de commitear).

## Fase 1 — hardening previo a aprobación interactiva del MCP (2026-09-25)

Auditoría de ChatGPT sobre el HEAD `c88dd7f` detectó varios puntos a cerrar
antes de que Marlon acepte el diálogo de confianza de Claude Code. Cambios
aplicados, todos verificados, no hipótesis:

1. **Versión de Ruflo fijada.** `.mcp.json` y
   `scripts/bootstrap-cloud-agent-stack.sh` ya no usan `ruflo@latest`;
   usan `ruflo@3.45.0` (el bootstrap lo hace vía `RUFLO_VERSION`, para
   poder subir de versión a mano el día que corresponda, previa revisión).
   Ninguna sesión futura arrancará una versión nueva sin que alguien la
   audite primero.
2. **Catálogo MCP filtrado.** `CLAUDE_FLOW_MCP_TOOLS=memory,swarm,agent,hooks`
   en el `env` de `.mcp.json` y en `.claude/settings.json`. Medido con
   `ruflo doctor`:
   - **Antes**: 353 tools anunciadas, ≈65 835 tokens de esquema.
   - **Después**: 90 tools anunciadas, ≈18 271 tokens de esquema (−72%).
   No se habilitó github, hive-mind, browser, deployment ni herramientas
   experimentales — Claude Code ya cubre Bash/Read/Write/Edit/Git.
3. **Permisos MCP acotados.** `.claude/settings.json` ya no permite
   `mcp__claude-flow__*` en bloque; ahora son cuatro globs exactos
   (`memory_*`, `swarm_*`, `agent_*`, `hooks_*`), en línea con el filtro
   del punto 2 — doble candado, no solo el que aplica el propio servidor.
4. **Hooks automáticos auditados.** Clasificación de cada hook registrado
   en `.claude/settings.json`:
   - **(A) Locales, sin efecto real** — `pre-edit`, `post-bash`, `status`,
     `notify` en `hook-handler.cjs`: no son comandos reconocidos por ese
     script, no hacen nada. Sin cambios.
   - **(B) Locales, escriben estado local** — `pre-bash` (valida el
     comando contra una lista negra), `post-edit`/`pre-task`/`post-task`
     (métricas de sesión, sqlite local), `route` (sugerencia de
     enrutamiento, lee ficheros locales), `session-end`
     (`intelligence.consolidate`), `auto-memory-hook.mjs`, `statusline.cjs`
     (cachea 60 s, no llama a red). Se dejaron como están: son las que dan
     valor sin tocar nada fuera del proyecto.
   - **(C/D) Procesos detached / red implícita — DESACTIVADOS.** En
     `session-restore`, `hook-handler.cjs` lanzaba dos `spawn(..., {detached:
     true}).unref()` (`spawnDetachedFunnelRefresh` y
     `spawnDetachedAdvisorRefresh`) que sobreviven al propio hook y pueden
     hacer una petición HTTPS de "sponsored capacity" solo por abrir el
     proyecto. Se comentaron esas dos líneas (parche quirúrgico de 2 líneas,
     no se tocó el resto del archivo ni se reescribió lógica de terceros).
     Además se puso `RUFLO_NO_AUTO_ENABLE=1` en el `env` de
     `.claude/settings.json`, que es la propia variable de opt-out que trae
     el paquete para `firstRunAutoEnableIfEligible()` (auto-activa
     "spinner"/"announcements" la primera vez). Verificado en vivo: tras el
     cambio, `session-restore` sigue funcionando igual (restaura sesión e
     inteligencia) y ya no quedan procesos `refresh-funnel`/`refresh-advisor`
     corriendo.
   - `graphify hook-guard` (search/read) se deja igual: es un binario
     local instalado por `uv`, sin evidencia de red, con timeout de 10 ms.
5. **Graphify portable.** Las dos entradas de `.claude/settings.json` que
   apuntaban a la ruta fija `/root/.local/bin/graphify` (específica de esta
   máquina) ahora resuelven el binario por `PATH` (`command -v graphify`) y
   no hacen nada (`exit 0`) si no está instalado, sin bloquear Claude Code.
6. **Huella del init reducida.** Clasificación de los ~250 archivos que
   trajo `ruflo init`, todos regenerables con `npx ruflo@3.45.0 init` si
   hicieran falta de vuelta:
   - **Necesario para el swarm Atheron (se queda):** skills `ruflo`,
     `hooks-automation`, `swarm-advanced`, `swarm-orchestration`,
     `pair-programming`, `skill-builder`, `verification-quality` (7);
     comandos `agents/`, `coordination/`, `swarm/`, `memory/`, `hooks/` y
     los tres `claude-flow-*.md` de nivel superior; agentes
     `swarm/hierarchical-coordinator.md`, `swarm/mesh-coordinator.md`,
     `swarm/adaptive-coordinator.md`, `testing/production-validator.md`,
     `core/planner.md` (5) — corresponden a las categorías MCP aprobadas
     (memory/swarm/agent/hooks) y a roles ya definidos en la lista de 15
     trabajadores de Atheron (QA, planificación, coordinación).
   - **No necesario ahora — eliminado del repo (no del historial de git,
     recuperable con `git revert` o regenerable con `ruflo init`):**
     skills `agentdb-*` (5), `github-*` (5), `v3-*` (9), `sparc-methodology`,
     `reasoningbank-*` (2), `stream-chain`, `browser` — son herramientas
     para desarrollar el propio Claude Flow (ADRs internos, DDD, consenso
     bizantino) o para categorías que decidimos no habilitar (github,
     browser); comandos `github/`, `sparc/`, `hive-mind/`, `analysis/`,
     `automation/`, `monitoring/`, `optimization/`, `workflows/` (95
     archivos, ~9 349 líneas — la mitad eran solo `commands/github`);
     agentes `consensus/*` (7, protocolos Raft/Byzantine/gossip — no
     aplican a un sitio de 7 hospedajes), `sparc/*` (4),
     `browser/browser-agent.yaml`, `testing/tdd-london-swarm.md`.
   - No se tocaron los 44 archivos de `.claude/helpers/`: son scripts que
     solo corren si algo los invoca (no se anuncian en cada turno como
     skills/agentes/comandos), así que su costo es únicamente espacio en
     disco, no contexto. Quedan para una limpieza posterior si hace falta.
7. **autoScale y daemon.** `.claude-flow/config.yaml`:
   `swarm.autoScale` pasó de `true` a `false` (creaba agentes solo, sin
   orden explícita) y se replicó como `CLAUDE_FLOW_AUTO_SCALE=false` en el
   `env` de `.mcp.json`. `daemon.autoStart` ya estaba en `false` en
   `.claude/settings.json` y sigue así — no se arranca un daemon
   persistente. Verificado con `ruflo swarm status`: 0 agentes activos.
8. **Hallazgo para reportar, no corregido por bootstrap:** en esta misma
   sesión, al abrirse, el harness de Claude Code Cloud expuso igualmente
   los ~353 (ahora ~90, tras el filtro) `mcp__claude-flow__*` como
   herramientas disponibles para el agente, pese a que `claude mcp list`
   seguía marcando el servidor `claude-flow` como **"Pending approval"**.
   Es decir: el gate de aprobación interactiva que impide el arranque del
   proceso puede no impedir que el esquema de herramientas ya se anuncie
   en una sesión de Cloud. No se invocó ninguna herramienta `mcp__claude-flow__*`
   durante esta tarea. Esto es información para Marlon/ChatGPT, no algo que
   este bootstrap pueda arreglar por sí solo.

Validación final con la versión fijada: `ruflo@3.45.0 --version`, `doctor` y
`swarm status` — ver REPORTE PARA CHATGPT de esta tarea para los números
exactos.
