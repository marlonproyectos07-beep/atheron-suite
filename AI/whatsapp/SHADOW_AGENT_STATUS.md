# GOAL-WHATSAPP-AGENT-001 — estado (2026-10-03)

Módulo: `integrations/whatsapp-shadow-agent/` (rama `claude/atero-whatsapp-shadow-agent-0v0yho`).
Ver su README para arquitectura, reglas y comandos.

## Hecho y verificado (local, Gateway FALSO contractual)
- Agente shadow, kill switch, 4 modos (solo `shadow`), clasificador de 8 clases, memoria, políticas CEO, grupos/multipropiedad, eventos de llamada, puerto de audio, evidencia anonimizada.
- 59 pruebas (58 pasan, 1 omitida por falta del Playbook). 11 pruebas CEO + 20 suplementarias PASS (`evidence/summary.json`).

## BLOQUEADO
1. **Playbook v0.1 y sus 100 TEST_CASES no existen** en el repo (todas las ramas remotas), ni en disco. Se necesita el archivo (o `outputs/` de la sesión anterior). Con él: convertir sus casos a `cases/playbook-cases.json` y correr `npm run suite`.
2. **Odoo/Gateway real**: no hay credenciales ni red en esta sesión; availability/quote se probaron contra un Gateway falso que cumple el puerto. No se afirma PASS contra STAGING real.
3. `AI/AGENTS.md`, `PROJECT_STATE.md`, `TASKS.md`, `HANDOFF.md` **no existen** (solo `AI/ATH_AI_ORCH_001*.md`, `AUTONOMOUS_QUEUE.md`). HOTEL-011/016 viven en ramas `feature/ath-odoo-hotel-*`, no mergeadas.

## Contradicciones que requieren decisión del CEO
- **Anticipo**: Odoo staging (`x_hotel_deposit_policy`, `x_property.x_deposit_pct`) tiene **30%** estándar y 50% solo como “caso especial (manual)”. El agente aplica el **50%** de la regla CEO. Hay que alinear Odoo o confirmar cuál manda.
- **Capacidades**: Casa Algarra y demás propiedades tienen `x_capacity_whole=0` y checkin/out vacíos en el respaldo; sin capacidad real el reparto de grupos no puede validarse en vivo.
- **Cancelación**: el check-in se toma a las 00:00 (lectura conservadora → más casos escalan). Confirmar si se prefiere la hora real de check-in de cada propiedad.
