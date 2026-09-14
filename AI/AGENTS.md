# Atheron AI Orchestration — Reglas para agentes

Este repositorio puede ser trabajado por varios agentes IA. GitHub es la
fuente única de verdad y Vercel despliega y valida la aplicación.

## Roles del equipo (formalizados el 13/09/2026)
- **Marlon**: propietario del proyecto y aprobador final.
- **Claude Code = Agente A**: constructor principal.
- **ChatGPT Plus = Agente B**: director técnico, auditor y orquestador.
- **OpenCode = Agente C**: constructor de relevo y continuidad.
- Los modelos conectados a OpenCode (Kimi, DeepSeek, Ollama/modelo local u
  otros aprobados) son **motores intercambiables**, no nuevas fuentes de
  verdad.
- **GitHub**: memoria compartida y fuente única de verdad.
- **Vercel**: despliegue y validación de la aplicación.

## Idioma
- Comunicación con Marlon siempre en español.
- Código, comandos, rutas y términos técnicos pueden conservarse en inglés.
- Los reportes entre agentes deben ser concisos para ahorrar tokens.

## Regla de relevo
Ningún agente depende de la conversación anterior. Antes de trabajar, leer:
1. `AI/PROJECT_STATE.md` — memoria operativa, estado actual
2. `AI/TASKS.md`
3. `AI/HANDOFF.md`
4. `AI/DECISIONS.md`
5. `docs/CONTINUIDAD-PROYECTO.md` — memoria histórica, cuando la tarea afecte
   arquitectura, publicación, CMS, SEO o producción.

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