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
