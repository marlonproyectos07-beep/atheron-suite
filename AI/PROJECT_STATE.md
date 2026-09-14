# Estado del proyecto — Hoteles Atheron

## Identidad
- Repositorio: `marlonproyectos07-beep/atheron-suite`
- Sitio: `https://hotelesatheron.com`
- Stack principal: Astro 7.2.4
- Publicación: Vercel
- Rama de producción: `main`

## Estado REAL al 13/09/2026 (comprobable desde git; ver "Cómo verificar")
- `main` es la rama de producción y el sitio ya está publicado en
  `https://hotelesatheron.com`.
- `public/admin/config.yml` línea 45 apunta a `branch: main`: el panel
  escribirá directamente sobre producción.
- PR #29 de prelanzamiento fusionado a `main` (merge `3f4b00d`).
- El dominio migró a `hotelesatheron.com` (commit `481b45a`) y su conexión
  quedó marcada como completada (commit `1524122`).
- Existen checkpoints de seguridad recientes:
  `checkpoint/main-2026-09-13` y `checkpoint/main-2026-09-13-poscasa`.
- Rama de orquestación multiagente: `chore/ai-orchestration-foundation`,
  creada desde `main` (base: merge `3f4b00d`). Solo documentación, sin tocar
  la web.
- Hay ramas de contenido activas de agosto a septiembre (casas en Neusa y
  Casa Colonial Centro, edificio aliado Algarra, Gallina Amor y Amistad
  septiembre 20, entre otras).
- `AI/PROJECT_STATE.md` es la memoria **operativa**.
  `docs/CONTINUIDAD-PROYECTO.md` es **histórica** (estado al 23/08/2026):
  leer su aviso al inicio antes de usar sus datos operativos.

## Cómo verificar el estado (sin preguntar a nadie)
```bash
git branch --show-current
git status --short
git log --oneline main -5
git rev-list --left-right --count main...origin/main
grep -n "^  branch:" public/admin/config.yml
```

En GitHub, la fuente única de verdad, se puede además revisar el estado de
despliegues de Vercel con su API pública (el repositorio es público).

## Objetivo de esta carpeta AI
Permitir que Claude Code (Agente A), ChatGPT (Agente B), OpenCode (Agente C)
u otro agente aprobado continúen una tarea sin depender del historial de chat
de otro agente.

## Principio operativo
La memoria operativa del proyecto vive en GitHub, no en una conversación.