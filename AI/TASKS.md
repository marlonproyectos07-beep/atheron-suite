# Cola de trabajo IA

## EN CURSO
### ORQ-001 — Capa base de orquestación multiagente
- Estado: EN IMPLEMENTACIÓN
- Rama: `chore/ai-orchestration-foundation`
- Objetivo: crear memoria compartida y protocolo de relevo sin tocar producción funcional.
- Responsable actual: ChatGPT

## SIGUIENTES
### ORQ-002 — Elegir e instalar agente de relevo
- Objetivo: preparar OpenCode y un motor de respaldo, priorizando opciones sin nueva suscripción.
- Candidatos: Kimi, DeepSeek, Ollama + modelo local.
- Dependencia: ORQ-001 aprobado.

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
