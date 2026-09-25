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
