# Cola de trabajo IA

## COMPLETADO
### ORQ-001 — Capa base de orquestación multiagente
- Estado: COMPLETADO Y APROBADO
- Rama: `chore/ai-orchestration-foundation`
- Objetivo: crear memoria compartida y protocolo de relevo sin tocar producción funcional.
- Aprobado: ChatGPT Plus (Agente B) el 13/09/2026.
- Verificación: primera prueba formal de relevo de OpenCode (Agente C) SUPERADA. Entregables: `AI/AGENTS.md`, `AI/PROJECT_STATE.md`, `AI/TASKS.md`, `AI/DECISIONS.md`, `AI/HANDOFF.md`.

## EN CURSO
### ORQ-001B — Saneamiento de memoria multiagente
- Estado: EN IMPLEMENTACIÓN
- Rama: `chore/ai-orchestration-foundation`
- Objetivo: dejar la memoria compartida preparada para el relevo entre agentes sin información histórica desactualizada.
- Responsable actual: OpenCode (Agente C)
- Criterios de aceptación: `AI/PROJECT_STATE.md` con estado real al 13/09/2026, roles formalizados en `AI/AGENTS.md`, cola ordenada en `AI/TASKS.md`, relevo reflejado en `AI/HANDOFF.md`, aviso de documento histórico en `docs/CONTINUIDAD-PROYECTO.md`.

## SIGUIENTES
### ORQ-002 — Redundancia de motores para OpenCode
- Objetivo: diseñar/configurar redundancia de motores para OpenCode (Kimi, DeepSeek, Ollama/modelo local u otros aprobados) priorizando opciones sin nueva suscripción.
- Nota: los motores son intercambiables, no nuevas fuentes de verdad.
- Dependencia: ORQ-001B aprobado.

### ORQ-003 — Simulación de relevo
- Objetivo: iniciar una tarea pequeña con un agente y terminarla con otro usando solo GitHub como memoria.

### ORQ-004 — Automatización de handoff
- Objetivo: reducir al mínimo la escritura manual del estado y crear chequeos de consistencia.

## Regla
Cada tarea debe tener:
- ID
- objetivo
- rama
- estado
- responsable actual
- criterios de aceptación
- pruebas
- handoff