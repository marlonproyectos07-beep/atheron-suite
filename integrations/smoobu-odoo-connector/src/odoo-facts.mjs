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
      'ota-adoption-action-code.mjs filtra planning.slot por state=published al buscar solapes (lineas 81, 123, 170)',
      'las reglas 167/169 solo se disparan con state=published',
    ],
    against: [
      'las reglas 167/169 comprueban solapes con search_count SIN filtro de estado: un borrador sigue impidiendo el espejo de otro turno',
      'los espejos ya creados por la regla 169 NO se limpian al despublicar el origen',
      'el motor de disponibilidad (accion 1914) no esta en el repo: no se sabe si ignora los borradores',
    ],
    verdict: 'NO_DEMOSTRADO',
  }),
  'x_checkin_state=cancelled': Object.freeze({
    inFavor: [
      'ota-adoption-action-code.mjs trata x_checkin_state==cancelled como bloque no vigente (lineas 70, 83, 125, 171)',
      'fields_get: x_checkin_state existe con el valor cancelled (campo propio del flujo de check-in)',
    ],
    against: [
      'las reglas 167/169 no miran x_checkin_state en sus comprobaciones de solape',
      'el motor de disponibilidad (accion 1914) no esta en el repo: no se sabe si lo excluye',
      'semantica pensada para el check-in del huesped, no para inventario',
    ],
    verdict: 'NO_DEMOSTRADO',
  }),
});

/** Datos que un turno creado por el conector podria necesitar y que NO se han leido todavia. */
export const UNVERIFIED_SLOT_FIELDS = Object.freeze({
  x_hotel_block_kind: 'valores existentes en turnos reales (external/manual/reservation/hold/derived) y cual cuenta el motor 1914 como ocupado',
  x_channel: 'valor para identificar el origen smoobu',
  x_bloqueo_ref: 'tipo (char) y si es escribible desde JSON-2; imprescindible para el turno de cobertura',
});
