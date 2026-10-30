/**
 * ESPECIFICACION EXACTA del unico piloto P0 autorizado por el CEO (ATH-DEV-018). Cualquier desviacion, STOP.
 * Una sola escritura de creacion y una sola de borrado, ambas sobre UN planning.slot ficticio en borrador.
 */
export const P0_AUTH_PHRASE = 'ATH-DEV-018-P0-UNICO-2026-10-15';
export const P0_MARKER_NAME = 'ATH-DEV-018 PRUEBA P0 (ficticio, retirar)';
export const P0_FICTIONAL_RESERVATION = 900000001;
export const P0_VALS = Object.freeze({
  role_id: 37, resource_id: 31, company_id: 5, state: 'draft',
  start_datetime: '2026-10-15 20:00:00', end_datetime: '2026-10-16 16:00:00', name: P0_MARKER_NAME,
});
export const P0_WINDOW = Object.freeze({ start: P0_VALS.start_datetime, end: P0_VALS.end_datetime, night: '2026-10-15', nextDay: '2026-10-16' });
export const SIX_ROLE_IDS = Object.freeze([29, 19, 30, 37, 18, 69]);
export const SIX_RESOURCE_IDS = Object.freeze([28, 29, 30, 31, 32, 79]);
export const EXPECTED_SLOT_AUTOMATIONS = Object.freeze([12, 22, 23, 51, 55, 157, 158, 164, 167, 168, 169, 170, 171]);
export const EXPECTED_FIRE_ON_CREATE_DRAFT = Object.freeze([12, 22]);
export const EXPECTED_FIRE_ON_UNLINK = Object.freeze([23, 158, 168]);
export const PRODUCTION = Object.freeze({ host: 'atheron1.odoo.com', database: 'atheron1' });
/** Campos que el conector NUNCA escribe en este piloto. */
export const FORBIDDEN_FIELDS = Object.freeze(['x_guest_id', 'x_nobeds_id', 'x_bloqueo_ref', 'sale_line_id', 'x_channel', 'x_checkin_state', 'employee_id']);

/** Recuperacion del turno 39686 creado por la ejecucion P0 (ATH-DEV-018): requiere una frase NUEVA y explicita del CEO. */
export const P0_RECOVERY_ID = 39686;
export const P0_RECOVERY_MIRROR_ID = 39687;
export const P0_RECOVERY_PHRASE = 'ATH-DEV-018-RETIRAR-39686-Y-SU-ESPEJO';
