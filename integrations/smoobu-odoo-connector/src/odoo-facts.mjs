/**
 * Hechos de Odoo VERIFICADOS por lectura real (ATH-DEV-012, ejecucion 40396965541 del
 * 2026-10-26). No son supuestos: cada valor sale de fields_get / search_read.
 * Si Odoo cambia, la calibracion (`npm run calibrate2`) los vuelve a medir.
 */
export const ODOO_FACTS = Object.freeze({
  // planning.role.resource_ids == recurso usado por los 409 turnos historicos de ese rol
  roleResources: Object.freeze({ 29: 28, 19: 29, 30: 30, 37: 31, 18: 32, 69: 79 }),
  companyId: 5, // ATHERON S.A.S, company_id de los 409 turnos (obligatorio en planning.slot)
  slotState: 'published', // las reglas 167/169 SOLO se disparan con state='published' y x_bloqueo_ref vacio
  mirrorMarkerField: 'x_bloqueo_ref', // los turnos espejo creados por las reglas llevan el id del turno origen
  checkinStateField: 'x_checkin_state', // pending|confirmed|checked_in|checked_out|cancelled (no se usa: sin escrituras)
});

/**
 * Liberar un turno propio (cancelacion / acortar / cambio de unidad): NO esta demostrado.
 * Analisis solo con metadatos (fields_get) y codigo existente en el repo y en Odoo (acciones 1853/1855
 * leidas en ATH-DEV-012; ota-adoption-action-code.mjs). Mientras RELEASE_UNLOCKED sea false toda
 * liberacion sale como BLOCKED_UNTIL_STAGING_PROOF.
 */
export const RELEASE_UNLOCKED = false;
export const RELEASE_MECHANISM_ANALYSIS = Object.freeze({
  'state=draft': Object.freeze({
    inFavor: [
      'ota-adoption-action-code.mjs (esquema de STAGING) filtra planning.slot por state=published al buscar solapes (lineas 81, 123, 170)',
      'las reglas 167/169 solo se disparan con state=published',
    ],
    against: [
      'las reglas 167/169 comprueban solapes con search_count SIN filtro de estado: un borrador sigue impidiendo el espejo de otro turno',
      'los espejos ya creados por la regla 169 NO se limpian al despublicar el origen',
      'el motor de disponibilidad real de produccion (Booking Engine 1493/1495 + reglas ATHERON) no se ha leido; la accion 1914 NO es ese motor',
    ],
    notes: ['en produccion existen las acciones 1844 (quitar bloque al cancelar orden) y 1854/automatizacion 168 (limpiar bloques al borrar): la via nativa de liberar parece ser cancelar la ORDEN o borrar el bloque; sin leer'],
    verdict: 'NO_DEMOSTRADO',
  }),
  'x_checkin_state=cancelled': Object.freeze({
    inFavor: [
      'ota-adoption-action-code.mjs (esquema de STAGING) trata x_checkin_state==cancelled como bloque no vigente (lineas 70, 83, 125, 171)',
      'fields_get: x_checkin_state existe con el valor cancelled (campo propio del flujo de check-in)',
    ],
    against: [
      'las reglas 167/169 no miran x_checkin_state en sus comprobaciones de solape',
      'el motor de disponibilidad real de produccion no se ha leido; en produccion x_checkin_state es false en 516 de 517 turnos (casi no se usa)',
      'la evidencia a favor viene del codigo de staging (esquema x_hotel_block_kind) que NO existe en produccion',
      'semantica pensada para el check-in del huesped, no para inventario',
    ],
    verdict: 'NO_DEMOSTRADO',
  }),
});

/**
 * ESQUEMA DE PRODUCCION (base `atheron1`) verificado por lectura real, ATH-DEV-015
 * (ejecuciones 40404188846 y 40404394738). Es lo unico demostrado; el comportamiento exige escrituras.
 */
export const PRODUCTION_SCHEMA = Object.freeze({
  x_bloqueo_ref: Object.freeze({ type: 'char', required: false, readonly: false, label: 'Bloqueo auto (ref reserva origen)',
    observed: '112 de 517 turnos de las seis unidades; todos numericos; 111 apuntan a un turno de la muestra' }),
  x_channel: Object.freeze({ type: 'selection', values: ['booking', 'airbnb', 'expedia', 'presencial', 'web', 'whatsapp', 'otro'],
    observed: 'vacio en los 517 turnos; NO existe un valor smoobu' }),
  x_checkin_state: Object.freeze({ values: ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'], observed: 'false en 516, checked_in en 1' }),
  absentInProduction: Object.freeze(['x_hotel_block_kind', 'x_bloqueo_src_id']), // existen solo en el esquema de staging antiguo
});

/**
 * Automatizaciones de produccion que se disparan sobre planning.slot (solo NOMBRES leidos; el codigo de
 * todas menos 167/169 esta SIN LEER). Pueden tener efectos laterales sobre un turno nuevo.
 */
export const PRODUCTION_SLOT_AUTOMATIONS = Object.freeze({
  12: 'Fix Slot Times (create/write)',
  22: 'Booking Engine: Mark Availabilities To Recompute: Slot Change (create/write)',
  23: 'Booking Engine: Mark Availabilities To Recompute: Slot Delete (unlink)',
  51: 'NOBEDS -> Odoo - Recibir Reserva (webhook)',
  55: 'ATHERON iCal - Actualizar feed al cambiar reserva (create/write)',
  157: 'Regenerar iCal NOBEDS al cambiar reserva (create/write)',
  158: 'Regenerar iCal NOBEDS al borrar reserva (unlink)',
  164: 'Anti-duplicado NOBEDS (create)',
  167: 'Casa Completa bloquea Habitaciones (leida)',
  168: 'Limpiar bloques al borrar reserva casa/hab (unlink)',
  169: 'Habitacion bloquea Casa Completa (leida)',
  170: 'Orden borrador desde reserva OTA (create)',
  171: 'Cancelar orden al cancelar reserva OTA (create/write)',
});

/** Lo que un turno creado por el conector podria necesitar y NO esta demostrado. */
export const UNVERIFIED_SLOT_FIELDS = Object.freeze({
  slot_triggered_automations: 'codigo sin leer de 12, 22, 23, 55, 157, 158, 164, 168, 170, 171: horarios, recalculo de disponibilidad, regeneracion de iCal hacia OTAs, ordenes borrador',
  availability_engine: 'la accion 1914 NO es el motor de disponibilidad en produccion (es una accion FSM no relacionada); el calculo real esta en los "Booking Engine" 1493/1495 y las reglas ATHERON, sin leer',
  x_channel_value: 'no existe valor smoobu; usar otro o vacio exige decision',
});
