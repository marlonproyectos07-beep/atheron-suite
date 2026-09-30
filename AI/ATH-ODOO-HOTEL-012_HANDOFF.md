# ATH-ODOO-HOTEL-012 — Handoff (2026-09-30)

> Tablero maestro de recepción + housekeeping, sobre
> `atheron1-hotel-staging-20260923` exclusivamente. Continúa HOTEL-009
> (APROBADO, ver `AI/ATH-ODOO-HOTEL-009_FINAL_APPROVED.md`). Rama
> independiente `feature/ath-odoo-hotel-012-master-board-housekeeping`,
> worktree separado (`C:\Users\HP\atheron-hotel-012`), **no toca**
> HOTEL-011 (en curso en paralelo). Nada de producción, Meta/WhatsApp
> real, Booking/Airbnb/OTAs se toca en este gate.

## Estado

Ver el diagnóstico completo en
`AI/ATH-ODOO-HOTEL-012_DIAGNOSTICO.md`. Resumen:

- **BLOQUEADO** para todo lo que requiere Odoo STAGING real
  (`ODOO_STAGING_UI_BLOCKED`, mismo patrón que HOTEL-009 tuvo hasta que
  Marlon abrió una sesión autenticada): auditoría de `project.task` de
  housekeeping, verificación de unidades de Casa Algarra/Casa Neusa,
  construcción de vistas/Studio, los 15 escenarios de QA obligatorio.
- **AVANZADO sin esa sesión** (mismo patrón que los Frentes A/C/D/K de
  HOTEL-009): contrato de datos del tablero maestro
  (`src/master-board-model.mjs`), modelo de housekeeping
  (`src/housekeeping-model.mjs`), eventos de notificación desacoplados
  de canal (`src/housekeeping-events.mjs`). 28 tests nuevos, 302/302
  PASS, 0 secretos.

## Qué reutilizar (no reconstruir)

- Disponibilidad, tarifas, anticipo, saldo, HOLD, anti-overbooking,
  exclusión Casa Completa: todo real, todo en Odoo/Gateway ya aprobado
  (HOTEL-007/008/009). El nuevo código del tablero SOLO consume esto por
  inyección (`checkAvailability`), nunca lo reimplementa.
- `reception-booking.mjs` (HOTEL-009, Workstream K) ya implementa
  exactamente el flujo "clic espacio libre → huésped → teléfono →
  personas → fechas → HOLD" que pide HOTEL-012 — falta conectarlo a una
  UI real, no reescribirlo.
- El proyecto "Limpieza" de Odoo (`project.project`, 4 etapas reales:
  LISTA/POR_LIMPIAR/EN_LIMPIEZA/INCIDENCIA) es la fuente de verdad de
  housekeeping — el módulo nuevo mapea sus nombres UX 1:1 contra esas 4
  etapas, sin inventar una 5ta.

## Decisiones CEO pendientes (documentadas, no resueltas por su cuenta)

1. `LISTA PARA REVISAR` no tiene etapa real en Odoo (hoy 4, no 5) —
   decidir si se agrega en Studio o se fusiona con una existente.
2. Qué categorías de incidencia bloquean la entrega al huésped (el
   modelo nunca lo asume, ver `decision_required` en
   `reportIncident()`).
3. Canal de escritura para crear la tarea de limpieza real al
   check-out (Studio automation vs. script de reportería).
4. Confirmar si Casa Algarra / Casa Neusa tienen habitaciones
   individuales o solo "casa completa".

## Próximo gate CEO (un solo paso, igual que HOTEL-009)

Abrir una sesión de Chrome ya autenticada contra
`atheron1-hotel-staging-20260923` (NO producción `atheron1`), con un
usuario con acceso a Studio/vistas. Con eso se desbloquea: auditoría de
`project.task`, verificación de Algarra/Neusa, y construcción guiada de
la vista real (nunca editando recursos compartidos sin aprobación
explícita en cada paso, igual que se hizo con la tarjeta Kanban de
HOTEL-009).

## Restricciones respetadas en este turno

- Base Odoo: ninguna tocada (sin sesión disponible en este entorno).
- HOTEL-011: intacto — mismo HEAD antes y después, worktree separado.
- Producción: nunca tocada.
- 0 secretos (`npm run check-secrets`, revisión manual de los 3 archivos
  nuevos).
- 302/302 tests PASS (274 previos + 28 nuevos), 0 regresiones.
