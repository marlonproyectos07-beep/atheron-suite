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
- [x] Verificar unidades reales de Casa Algarra / Casa Neusa — CONFIRMADO
  en sesión STAGING read-only 2026-09-30: solo tienen su propia "casa
  completa" (unit_id 7 y 8), sin habitaciones individuales. Coincide con
  el código ya escrito, sin cambios necesarios. Ver
  `AI/ATH-ODOO-HOTEL-012_DIAGNOSTICO.md` §6.
- [x] Housekeeping ("Proyecto housekeeping" + 4 etapas) — CONFIRMADO que
  solo está configurado para HOTEL ATHERON SUITE; Algarra y Neusa lo
  tienen vacío. Ver `AI/ATH-ODOO-HOTEL-012_DIAGNOSTICO.md` §6.
- [x] Automatizaciones existentes relacionadas — ENCONTRADAS 3 reglas
  (`Crear Tarea al Confirmar Reserva Atheron Suite`, `Limpieza: Al
  entrar`, `Limpieza: Al salir`), todas sobre `sale.order`. Ver
  `AI/ATH-ODOO-HOTEL-012_DIAGNOSTICO.md` §6.
- [ ] **PARCIAL, no bloqueado por permisos sino por inestabilidad de la
  sesión de automatización de navegador**: auditar a fondo los campos de
  `project.task` (asignación, vínculo a unidad/reserva) y el detalle
  completo de las 3 automatizaciones encontradas.
- [ ] **BLOQUEADO — requiere sesión Odoo STAGING con Studio habilitado**:
  construir la vista real del tablero dentro de Odoo (requiere Marlon o
  aprobación explícita por cada edición de recurso compartido, igual que
  la tarjeta Kanban de HOTEL-009).
- [ ] **BLOQUEADO**: ejecutar los 15 escenarios de QA obligatorio contra
  STAGING real.
- [ ] Decisión CEO: ¿agregar etapa "LISTA PARA REVISAR" en Studio, o
  fusionarla con una existente?
- [ ] Decisión CEO: ¿qué categorías de incidencia bloquean la entrega al
  huésped?
- [ ] Decisión CEO: canal de escritura para crear la tarea de limpieza
  real al check-out.
- [ ] Decisión CEO: configurar housekeeping (proyecto + etapas) también
  para Casa Algarra y Casa Neusa, o dejar el tablero de limpieza
  limitado a Atheron Suite por ahora.

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
