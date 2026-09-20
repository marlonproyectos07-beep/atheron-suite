# Configuración de Claude Code — Atheron Suite

Esta carpeta hace **reproducible** el entorno de Claude Code. Sin ella, cada
sesión en la nube arranca sin plugins ni Skills, y hay que reinstalarlo todo a
mano cada vez.

No contiene código del sitio. No afecta al build, ni a Vercel, ni a producción.

## Qué hay versionado

| Archivo | Qué es |
|---|---|
| `settings.json` | Marketplaces aprobados + plugins habilitados |
| `scripts/bootstrap-graphify.sh` | Instalador **opcional** de Graphify (no se ejecuta solo) |
| `README.md` | Este archivo |

## Qué NO se versiona, y por qué

| No versionado | Motivo |
|---|---|
| `settings.local.json` | Preferencias de cada máquina. En `.gitignore`. |
| `launch.json` | Ya estaba en `.gitignore` desde antes. |
| `graphify-out/` | Artefactos generados (~800 KB por build) con rutas absolutas de la máquina. En `.gitignore`. |
| `~/.claude/` | Config de usuario del contenedor. Efímera y con datos del entorno. |
| Cualquier clave, token o `.env` | **Jamás.** Ver "Secretos" abajo. |

## Plugins aprobados

### superpowers

- **Origen:** `github.com/obra/superpowers-marketplace` → `github.com/obra/superpowers.git`
- **Autor:** Jesse Vincent (`jesse@fsck.com`), Prime Radiant
- **Coste:** ~838 tokens siempre activos por sesión. Sin MCP, sin LSP, sin agentes.
- **Aporta 15 Skills:** planificación, TDD, depuración sistemática, verificación
  antes de dar algo por terminado, revisión de código, worktrees de Git.

> ⛔ **`superpowers:finishing-a-development-branch` NO se usa en este repositorio.**
> Esa Skill empuja a cerrar y fusionar ramas. Aquí `main` sirve producción y el
> merge exige orden expresa de Marlon (regla 1 del `CLAUDE.md`). Se fusiona a
> mano, nunca por Skill.

### Marketplace oficial de Anthropic

`anthropic-agent-skills` (`github.com/anthropics/skills`) queda **registrado pero
sin instalar nada**, para poder consultar el catálogo.

> ⛔ **`document-skills` NO se instala.** Las Skills `pdf`, `docx`, `xlsx` y
> `pptx` ya llegan sincronizadas desde la cuenta de claude.ai. Se comparó
> `skills/pdf/SKILL.md` del repositorio oficial contra la versión ya activa:
> **son byte-idénticos**. Instalarlo crearía dos Skills con la misma descripción,
> lo que confunde al selector y duplica el coste en tokens.

## Graphify

Graphify (`github.com/Graphify-Labs/graphify`, PyPI `graphifyy`, Apache-2.0/MIT)
convierte el repositorio en un grafo de conocimiento consultable.

**No se instala solo, y es deliberado.** `graphify install` escribe en
`~/.claude/skills/graphify/` — ámbito de usuario, no del proyecto — así que no
se puede versionar de forma útil: la Skill que dejaría en el repositorio
llamaría a un binario que en la nube no existe.

Para instalarlo en una sesión nueva, de forma explícita:

```bash
bash .claude/scripts/bootstrap-graphify.sh
```

Verificado el 2026-09-20 en Claude Code 2.1.278 sobre este repositorio: extrae
783 nodos y 1206 aristas, **sin clave de API**, en un contenedor sin escritorio.

No se ha conectado a un hook `SessionStart` automático a propósito: eso
ejecutaría una instalación por red en cada arranque de sesión, con el coste y la
superficie de riesgo que eso implica. Es una decisión pendiente de Marlon.

## Secretos

Nada de esta carpeta contiene claves, tokens, cookies ni credenciales, y nada
debe contenerlas nunca. Graphify funciona sin clave en modo solo-código; las
variables opcionales que reconoce (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
`GOOGLE_API_KEY`) se pasan por entorno, **jamás por archivo versionado**.
