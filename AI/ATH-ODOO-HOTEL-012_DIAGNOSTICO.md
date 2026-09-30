# ATH-ODOO-HOTEL-012 — Diagnóstico técnico (Fase 0, 2026-09-30)

> Tablero maestro de recepción + housekeeping. Rama independiente
> `feature/ath-odoo-hotel-012-master-board-housekeeping`, creada desde la
> punta de `feature/ath-odoo-hotel-009-operational-dashboard`
> (`cd824a6`, cierre formal aprobado por Marlon) en un worktree aislado
> (`C:\Users\HP\atheron-hotel-012`). **No toca** `feature/ath-odoo-hotel-011-whatsapp-controlled-pilot`
> (en curso en paralelo, otro worktree, mismo HEAD antes y después de
> este trabajo).

## 1. Qué ya existe (reutilizar, no reconstruir)

Todo esto está **confirmado con evidencia real** contra
`atheron1-hotel-staging-20260923` en `AI/ATH-ODOO-HOTEL-009_HANDOFF.md`
(Gate 009-A/D/E) y `AI/ATH-ODOO-HOTEL-009_FINAL_APPROVED.md`:

| Pieza | Dónde vive | Estado |
|---|---|---|
| Modelo de reservas (`sale.order` extendido, pestaña "Hotel v1") | Odoo | REAL, 234+ registros, 10 valores reales de `x_reservation_status` |
| Inventario / unidades | Odoo (`Hotel v1 — Unidades`, 8 registros) | REAL: 201/202/203/301/302 + 3 CASA COMPLETA (una por propiedad) |
| Exclusión Casa Completa ↔ habitaciones | Odoo, acción 1967 | REAL, relación padre-hijo ya modelada, probada en ambas direcciones (Gate 009-E) |
| Anti-overbooking / HOLD / idempotencia | Gateway (`src/odoo-adapter.mjs`, `idempotency-store.mjs`) + Odoo | REAL, probado con doble intento simultáneo (Gate 009, Prioridad 3) |
| Tarifa / anticipo / saldo automáticos | Odoo (calcula al agregar el producto de habitación) | REAL, probado de punta a punta (Gate 009 #2): Ángela nunca calcula nada |
| Check-in / Check-out con guardas de transición inválida | Odoo (botones de workflow reales) | REAL, probado (Gate 009 #3) |
| Kanban operativo agrupado por estado | Odoo Studio, vista `ir.ui.view` id 6833 | REAL, ya enriquecida (unidad/check-in/check-out/personas/saldo/badge) |
| Reserva manual desde recepción (disponibilidad→cotización→HOLD, sin bypass) | `integrations/odoo-hotel-gateway/src/reception-booking.mjs` | Código ya existe, probado con fixtures |
| Read-model operativo (TODAY/ARRIVALS/DEPARTURES/IN_HOUSE/HOLDS/PAYMENT_PENDING/UPCOMING/AVAILABLE) | `src/operational-read-model.mjs`, `src/angela-read-model.mjs` | Código ya existe, probado con fixtures; conectado a datos reales vía `odoo-reporting-reader.mjs` |
| **Housekeeping** | Odoo, `project.project` "Limpieza" por propiedad, 4 etapas reales: **LISTA / POR_LIMPIAR / EN_LIMPIEZA / INCIDENCIA** | REAL (campo de propiedad confirmado), pero el `project.task` en sí (asignación, vínculo a unidad/reserva) **no se auditó a fondo todavía** |
| Canal de lectura agregada (reportería) | `src/odoo-reporting-reader.mjs`, solo lectura, dominio fijo `x_order_involves_room=true` | Decisión de arquitectura YA TOMADA en HOTEL-009 ("opción D"): nunca una operación HTTP nueva del Gateway para esto — expondría lectura masiva al mismo nivel de privilegio que availability/quote/hold a canales de IA externos |

**Conclusión:** no hay que construir un segundo motor de disponibilidad,
tarifas, anticipo, saldo, ni reimplementar la exclusión Casa Completa.
Housekeeping como concepto tampoco es nuevo: ya tiene una fuente de
verdad real en Odoo (proyecto "Limpieza"), no hay que inventarla.

## 2. Bloqueo real (igual al que ya tuvo HOTEL-009)

No hay sesión ni credencial de Odoo STAGING cargada en este entorno
(`atheron1-hotel-staging-20260923`). Verificado: sin `.env` en el
gateway, sin variables `ODOO_*` en el shell. La conexión real solo se ha
cargado, según el propio README del gateway, **en el equipo local de
Marlon**, nunca en este repositorio ni en la nube.

Esto bloquea, igual que documentó HOTEL-009 (`ODOO_STAGING_UI_BLOCKED`):

1. Auditar a fondo el `project.task` de housekeeping (campos reales,
   quién lo crea, si ya se auto-genera al check-out).
2. Verificar contra Odoo real las unidades de CASA ALGARRA y CASA NEUSA
   (hoy solo se confirmó su "casa completa" propia, `unit_id 7` y `8`;
   ninguna habitación suelta de esas dos propiedades está documentada
   todavía — no se inventan filas para el tablero que no estén
   verificadas).
3. Construir o editar cualquier vista/Studio dentro de Odoo (la tarjeta
   Kanban de HOTEL-009 mostró que el clasificador automático de riesgo
   bloquea "Modify Shared Resources" y requiere que Marlon lo pegue él
   mismo — no es un bloqueo que se resuelva programando más).
4. Ejecutar cualquiera de los 15 escenarios de QA obligatorio pedidos
   (todos requieren Odoo STAGING real).

**Esto es exactamente el tipo de bloqueo que las reglas de autonomía del
propio CEO ya reconocen**: "detente ante una credencial/sesión que solo
Marlon pueda proporcionar". No es un bloqueo técnico.

## 3. Qué se avanzó SIN esa sesión (esta rama, ya commiteado)

Siguiendo el mismo patrón que HOTEL-009 usó para sus Frentes A/C/D/K
(diseñar y probar con fixtures todo lo que no requiere la sesión):

- `src/master-board-model.mjs` — contrato de datos del tablero (filas =
  unidades confirmadas, columnas = fechas, 5 estados pedidos por el CEO
  con texto+icono, nunca solo color). Reutiliza el motor real de
  disponibilidad por inyección (`checkAvailability`) para la exclusión
  Casa Completa — no la reimplementa.
- `src/housekeeping-model.mjs` — transiciones de limpieza sobre las 4
  etapas reales de Odoo, con las mismas guardas de transición inválida
  que Odoo ya demostró (Gate 009 #3), prioridad automática por próxima
  llegada, taxonomía de incidencias (6 categorías pedidas), y **nunca
  decide por su cuenta** si una incidencia bloquea la entrega al
  huésped (regla comercial no definida — ver §4).
- `src/housekeeping-events.mjs` — eventos desacoplados de canal
  (checkout/cleaning_started/cleaning_finished/ready_for_guest/
  incident_reported), listos para un futuro dispatcher (Odoo/PWA/
  WhatsApp/email) sin acoplar el núcleo a ninguno. WhatsApp real sigue
  sin conectarse, a propósito.
- 28 tests nuevos, 302/302 PASS en total (274 previos + 28), 0
  regresiones, 0 secretos.

## 4. Decisiones CEO pendientes (no se inventan, se documentan)

1. **`LISTA PARA REVISAR`** (paso UX pedido entre terminar aseo y
   declarar lista para huésped) no tiene etapa real en Odoo — hoy son
   4 etapas, no 5. Decidir: ¿agregar una 5ta etapa en Studio, o fusionar
   ese paso dentro de `EN_LIMPIEZA`/`LISTA`?
2. **Incidencias que bloquean entrega**: el modelo nunca asume; cada
   incidencia queda con `decision_required` hasta que el CEO defina la
   regla (¿todas bloquean? ¿solo DAÑO/ELECTRICIDAD?).
3. **Canal de escritura para crear el `project.task` real al check-out**:
   igual que HOTEL-009 con la lectura, esto es una decisión de
   arquitectura (Studio automation nativo de Odoo vs. script de
   reportería), no algo que se resuelva sin sesión STAGING.
4. **Filas de CASA ALGARRA / CASA NEUSA**: confirmar si tienen
   habitaciones individuales o solo operan como "casa completa".

## 5. Siguiente gate CEO (único paso que falta para continuar)

Igual que se resolvió en HOTEL-009: una sesión de Chrome ya autenticada
contra `atheron1-hotel-staging-20260923` (no producción `atheron1`), con
un usuario con acceso a Studio/vistas. Con eso se puede:
completar la auditoría de `project.task`, verificar Algarra/Neusa, y
empezar a construir la vista real (guiado, sin editar recursos
compartidos sin aprobación explícita en cada paso).
