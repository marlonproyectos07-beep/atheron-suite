# Atheron AI Orchestration — Reglas para agentes

Este repositorio puede ser trabajado por varios agentes IA. GitHub es la fuente única de verdad.

## Regla de relevo
Ningún agente depende de la conversación anterior. Antes de trabajar, leer:
1. `AI/PROJECT_STATE.md`
2. `AI/TASKS.md`
3. `AI/HANDOFF.md`
4. `AI/DECISIONS.md`
5. `docs/CONTINUIDAD-PROYECTO.md` cuando la tarea afecte arquitectura, publicación, CMS, SEO o producción.

## Seguridad
- No tocar DNS, secretos, credenciales, OAuth, Cloudflare ni dominios sin autorización explícita.
- No pegar secretos en chats, issues, commits ni archivos.
- No publicar direcciones privadas de hospedajes aliados.
- No quitar `noindex` ni cambiar reglas SEO sin validación.
- No hacer cambios directos en `main` para tareas de desarrollo. Trabajar en rama y PR.

## Calidad mínima antes de entregar
- Ejecutar `npm run comprueba`
- Ejecutar `npm run build`
- No introducir errores de contenido.
- Mantener mobile-first.
- Mantener PageSpeed/SEO como requisitos de calidad.
- Documentar qué cambió, qué falta y cómo verificarlo.

## Jerarquía de agentes
- Director/auditor: ChatGPT.
- Constructor principal: Claude Code.
- Constructor de relevo cloud: Kimi u otro agente aprobado.
- Constructor local/económico: OpenCode + Ollama/modelo local.
- Cualquier agente puede relevar a otro si el estado está actualizado en GitHub.

## Política de coste
Reservar modelos premium para:
- arquitectura
- bugs difíciles
- migraciones sensibles
- decisiones SEO/comerciales
- auditoría final

Usar agentes económicos/locales para:
- CSS/HTML rutinario
- cambios mecánicos
- tests
- builds
- búsqueda/reemplazo
- documentación
- refactors pequeños

## Cierre obligatorio de turno
Antes de abandonar una tarea por límite de cuota, error o cambio de agente, actualizar `AI/HANDOFF.md` con:
- tarea
- rama
- último commit
- hecho
- pendiente
- pruebas ejecutadas
- riesgos
- siguiente acción exacta
