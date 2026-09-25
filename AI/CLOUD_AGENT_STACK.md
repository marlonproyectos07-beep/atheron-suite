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

Comandos oficiales usados por este proyecto:

```bash
npx skills add ruvnet/ruflo --skill ruflo --yes
npx ruflo@latest init
claude mcp add ruflo -- npx ruflo@latest mcp start
npx ruflo@latest doctor --fix
npx ruflo@latest swarm init --topology hierarchical-mesh --max-agents 15 --strategy specialized
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
