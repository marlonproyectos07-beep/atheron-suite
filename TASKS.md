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
- [x] **Decisiones CEO 1-4 APROBADAS (2026-09-30)** — ver
  `AI/ATH-ODOO-HOTEL-012_SAFE_WRITE_PLAN.md`:
  1. Etapa housekeeping: secuencia de 5 pasos aprobada conceptualmente
     (`POR LIMPIAR → EN LIMPIEZA → LISTA PARA REVISAR → LISTA`,
     `INCIDENCIA` como rama lateral). No creada en Odoo todavía.
  2. Incidencias — Regla v1 aprobada: cualquier incidencia abierta
     bloquea el paso automático a LISTA, siempre `decision_required`.
  3. Creación de tareas — prioridad a automatización nativa de Odoo;
     auditar las 3 existentes antes de crear nada nuevo.
  4. Algarra/Neusa — sin housekeeping en v1, queda como mejora
     incremental.
- [x] SAFE WRITE PLAN preparado (no ejecutado) — ver
  `AI/ATH-ODOO-HOTEL-012_SAFE_WRITE_PLAN.md`: cambios propuestos,
  objetos afectados, riesgos de duplicación, rollback, orden de
  ejecución, pruebas, qué es seguro hacer solo en código, separación de
  HOTEL-011.
- [ ] **BLOQUEADO (reproducible, no aleatorio) — sesión de
  automatización de navegador inestable**: auditar a fondo dominio/
  proyecto/etapa/registro creado por cada una de las 3 automatizaciones
  encontradas (`Crear Tarea al Confirmar Reserva Atheron Suite`,
  `Limpieza: Al entrar`, `Limpieza: Al salir`). 3 intentos de esta
  sesión abrieron consistentemente el registro equivocado. Condición de
  salida obligatoria antes de tocar cualquier automatización real (ver
  SAFE WRITE PLAN, sección "Auditoría").
- [ ] **BLOQUEADO — requiere sesión Odoo STAGING con Studio habilitado**:
  ejecutar el SAFE WRITE PLAN (crear etapa `LISTA PARA REVISAR`, ajustar
  automatización si hace falta) y construir la vista real del tablero
  (requiere Marlon o aprobación explícita por cada edición de recurso
  compartido, igual que la tarjeta Kanban de HOTEL-009).
- [ ] **BLOQUEADO**: ejecutar los 15 escenarios de QA obligatorio contra
  STAGING real.
- [ ] Disponible para la siguiente autorización, SIN necesitar sesión
  Odoo: activar `LISTA_PARA_REVISAR` y la Regla v1 de incidencias en
  `src/housekeeping-model.mjs` (código puro, reversible, testeable) —
  ver SAFE WRITE PLAN, sección 9.

## HOTEL-012 V2 — Control Center (EN CURSO, parcial: sin sesión Odoo)

Detalle: `AI/ATH-ODOO-HOTEL-012_V2_CONTROL_CENTER.md`.

- [x] Auditoría de HOTEL-009/012 y reutilización (sin dashboard nuevo).
- [x] Read-model `control-center-model.mjs`: 8 estados, CASA COMPLETA ↔ habitaciones,
  ocupación por unidades y por personas, housekeeping, KPI gerenciales, canales,
  filtros/horizonte, alertas, Revenue Intelligence (DATA NOT READY sin costos).
- [x] Lector paginado (corrige truncado a 300) y `saldos-audit` reproducible.
- [x] 376 pruebas PASS (310 previas + 66 nuevas), 0 regresiones.
- [ ] **PENDIENTE (Marlon, sesión local):** `TARGET_COUNT=357 TARGET_AMOUNT=37202549 node scripts/saldos-audit-live.mjs` para demostrar el origen del KPI.
- [ ] **BLOQUEADO (sin sesión Odoo):** reflejar el contrato en la vista Studio, verificar en STAGING, revisar ACL real.
- [ ] Decisión CEO: costos para tarifa piso (lista en el doc §6); capacidad Algarra/Neusa; alinear `alternatives-engine` con capacidades reales (hallazgo F4).

## GOAL-WHATSAPP-AGENT-001 — agente SHADOW (CERRADO en SHADOW; Odoo live PENDING_EXTERNAL_AUTHENTICATED_TEST)

Detalle: `AI/whatsapp/ATH-WHATSAPP-AGENT-001_SHADOW.md`. Código: `integrations/whatsapp-shadow-agent/`.

- [x] Playbook v0.1 versionado en `AI/whatsapp/` (sha256) y 100 casos T01-T100 ejecutados: 100/100 PASS (17 con desviaciones documentadas).
- [x] Agente SHADOW: nunca envía, nunca HOLD; anticipo 50 %; horarios reales (sin 00:00); grupos y STRATEGIC_GROUP_LEAD; B2B y Atheron Security.
- [x] 12 requisitos CEO del mensaje (CEO-D01..D12) PASS. 180 pruebas.
- [x] CEO_CASES_V1.md canónico (12 casos) + política de cancelación oficial: 12/12 PASS. Ver `AI/whatsapp/ATH-WHATSAPP-AGENT-001_CIERRE.md`.
- [ ] **DECISIÓN:** implementación duplicada en rama `claude/atero-whatsapp-shadow-agent-0v0yho` (mismo directorio): elegir canónica antes de cualquier merge.
- [ ] Confirmar errata «Hoteles Atero».
- [ ] **BLOQUEADO (sin sesión Odoo):** corregir 30 % -> 50 % en STAGING (`AI/whatsapp/ODOO_DEPOSIT_50_RUNBOOK.md`); completar UNIT_ID_MAP/capacidades (solo Atheron Suite verificada).
- [ ] Medir con conversaciones reales (generalización en ciego: 53-77 % a la primera).

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
