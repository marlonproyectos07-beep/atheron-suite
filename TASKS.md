# TASKS — Atheron Suite / Integración Odoo Hotel

> No existía este archivo en la raíz. Lista viva de tareas abiertas por
> gate; el detalle y la evidencia de cada una vive en su
> `AI/ATH-ODOO-HOTEL-0XX_*.md` correspondiente.

## HOTEL-012 — tablero maestro + housekeeping (EN CURSO)

- [x] Fase 0: auditoría de lo que ya existe (reservas, inventario,
  exclusión Casa Completa, HOLD, housekeeping) — ver
  `AI/ATH-ODOO-HOTEL-012_DIAGNOSTICO.md`.
- [x] Contrato de datos del tablero maestro (`src/master-board-model.mjs`,
  12 tests).
- [x] Modelo de housekeeping: transiciones, prioridad automática,
  taxonomía de incidencias (`src/housekeeping-model.mjs`, 11 tests).
- [x] Eventos de notificación desacoplados de canal
  (`src/housekeeping-events.mjs`, 5 tests).
- [ ] **BLOQUEADO — requiere sesión Odoo STAGING de Marlon**: auditar
  `project.task` de housekeeping a fondo.
- [ ] **BLOQUEADO**: verificar unidades reales de Casa Algarra / Casa
  Neusa (hoy solo confirmada su "casa completa" propia).
- [ ] **BLOQUEADO**: construir la vista real del tablero dentro de Odoo
  (requiere Marlon o aprobación explícita por cada edición de recurso
  compartido, igual que la tarjeta Kanban de HOTEL-009).
- [ ] **BLOQUEADO**: ejecutar los 15 escenarios de QA obligatorio contra
  STAGING real.
- [ ] Decisión CEO: ¿agregar etapa "LISTA PARA REVISAR" en Studio, o
  fusionarla con una existente?
- [ ] Decisión CEO: ¿qué categorías de incidencia bloquean la entrega al
  huésped?
- [ ] Decisión CEO: canal de escritura para crear la tarea de limpieza
  real al check-out.

## HOTEL-011 — WhatsApp piloto controlado (EN CURSO, Codex, rama separada)

No gestionado desde este documento — ver
`integrations/odoo-hotel-gateway/HANDOFF.md` en la rama
`feature/ath-odoo-hotel-011-whatsapp-controlled-pilot`. HOTEL-012 no
depende de este frente ni lo modifica.

## Cerrados

- [x] HOTEL-009 — tablero operativo, reserva manual, tablero gerencial
  (FINAL_GATE: PASS). Ver `AI/ATH-ODOO-HOTEL-009_FINAL_APPROVED.md`.
- [x] HOTEL-008 / 008A — ver `AI/ATH-ODOO-HOTEL-008_FINAL_APPROVED.md`.
- [x] HOTEL-007 — Gateway base. Ver
  `integrations/odoo-hotel-gateway/README.md`.
