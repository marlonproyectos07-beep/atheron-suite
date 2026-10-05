/**
 * HOTEL-017 — generador reproducible de las acciones de salida iCal por habitacion (Odoo STAGING).
 *
 * Cada habitacion tiene tres piezas en Odoo: una accion de refresco (escribe SOLO su adjunto
 * iCal), una accion envoltorio que la ejecuta y un cron de 5 minutos que ejecuta el envoltorio.
 * Este modulo reproduce el codigo desplegado a partir de una plantilla versionada (la accion
 * del 202, sin filtro) y de los cambios que se aplicaron a 203 y 301.
 *
 * Los hashes `deployedSha16` son los leidos de Odoo STAGING el 2026-10-05; los prueba
 * test/hotel017-outbound.test.mjs. No contiene URLs, tokens ni datos de huespedes.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const TEMPLATE_202 = readFileSync(
  new URL('../odoo-patches/hotel-017/outbound-refresh-202-template.py', import.meta.url), 'utf8');

const sha16 = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);

/** Configuracion publica por habitacion (IDs de Odoo STAGING). */
export const ROOMS = Object.freeze({
  '201': { canonical: 'AHS-201', odooUnit: 1, resource: 28, role: 29, attachment: 26982,
    refreshAction: 1981, wrapperAction: 1982, cron: 157, filtered: false, deployedSha16: '3e24a7e204f7cea0' },
  '202': { canonical: 'AHS-202', odooUnit: 2, resource: 29, role: 19, attachment: 26984,
    refreshAction: 1983, wrapperAction: 1984, cron: 158, filtered: false, deployedSha16: '7c06f81f3d390afa' },
  '203': { canonical: 'AHS-203', odooUnit: 3, resource: 30, role: 30, attachment: 26986,
    refreshAction: 1985, wrapperAction: 1986, cron: 159, filtered: true, deployedSha16: '335da327de5a427c' },
  '301': { canonical: 'AHS-301', odooUnit: 4, resource: 31, role: 37, attachment: 26985,
    refreshAction: 1988, wrapperAction: 1989, cron: 160, filtered: true,
    excludeSlotIds: [40159, 40161],
    // Texto desplegado en 1988. Sus etiquetas (40159/40161) estan INVERTIDAS respecto a lo confirmado;
    // se reproduce tal cual hasta que se despliegue una correccion autorizada.
    excludeNote: '# 301: excluye 40159 (bloqueo importado de Airbnb) y 40161 (reserva real de Booking), verificados en OTA; slots sin modificar.',
    deployedSha16: '8b54cb81ca914fc4' },
  '302': { canonical: 'AHS-302', odooUnit: 5, resource: 32, role: 18, attachment: 26981,
    refreshAction: 1979, wrapperAction: 1980, cron: 156, filtered: false, deployedSha16: '47b2e254e3d406cb' },
});

const FILTER_ANCHOR = `slots = cand.filtered(lambda s: s.start_datetime and s.end_datetime
                      and s.x_hotel_block_kind not in ('external', 'derived')
                      and not s.x_nobeds_id
                      and s.x_channel not in OTA_CH)`;
const FILTER_NOTE = '# Filtro 2026-10-05 (CEO): solo fin >= hoy; Casa Completa solo con pedido de venta no cancelado.';

function replaceOnce(code, from, to) {
  if (code.split(from).length !== 2) throw new Error(`ANCHOR_NOT_UNIQUE: ${from.slice(0, 60)}`);
  return code.replace(from, to);
}

/** Codigo de la accion de refresco de una habitacion. */
export function renderRefresh(number, { filtered, excludeSlotIds, excludeNote } = {}) {
  const room = ROOMS[number];
  if (!room) throw new Error('ROOM_UNKNOWN');
  const isFiltered = filtered ?? room.filtered;
  const excl = excludeSlotIds ?? room.excludeSlotIds ?? [];
  const note = excludeNote ?? room.excludeNote;
  const role = room.role;
  const att = room.attachment;
  const header202 = '# ATHERON iCal — REFRESH SOLO 202 (rol 19). Escribe SOLO el adjunto 26984. SUMMARY neutro.';
  let code = TEMPLATE_202;
  code = replaceOnce(code, header202, `# ATHERON iCal — REFRESH SOLO ${number} (rol ${role}). Escribe SOLO el adjunto ${att}. SUMMARY neutro.`);
  code = replaceOnce(code, 'ROLE_ID = 19\n', `ROLE_ID = ${role}\n`);
  code = replaceOnce(code, 'ATTACH_ID = 26984\n', `ATTACH_ID = ${att}\n`);
  code = replaceOnce(code, "raise UserError('Rol 19 invalido')", `raise UserError('Rol ${role} invalido')`);
  code = replaceOnce(code, "'ical_atheron_role_19.ics'", `'ical_atheron_role_${role}.ics'`);
  code = replaceOnce(code, "raise UserError('Adjunto 26984 no coincide con el rol 19')", `raise UserError('Adjunto ${att} no coincide con el rol ${role}')`);
  code = replaceOnce(code, "log('iCal 202: '", `log('iCal ${number}: '`);
  code = replaceOnce(code, "' eventos -> adjunto 26984 (SUMMARY neutro)'", `' eventos -> adjunto ${att} (SUMMARY neutro)'`);

  // Lineas de nota justo despues de la cabecera (mismo orden que en Odoo: exclusion y luego filtro).
  const notes = [];
  if (isFiltered) {
    const exclLine = excl.length ? `                      and s.id not in (${excl.join(', ')})\n` : '';
    const replacement = `today_utc = datetime.datetime.utcnow().date()
slots = cand.filtered(lambda s: s.start_datetime and s.end_datetime
                      and s.end_datetime.date() >= today_utc
                      and s.x_hotel_block_kind not in ('external', 'derived')
                      and not s.x_nobeds_id
                      and s.x_channel not in OTA_CH
${exclLine}                      and (s.role_id.id == ROLE_ID or (s.x_hotel_order_id and s.x_hotel_order_id.state != 'cancel')))`;
    code = replaceOnce(code, FILTER_ANCHOR, replacement);
    if (excl.length && note) notes.push(note);
    notes.push(FILTER_NOTE);
  }
  const headerRe = /^(# ATHERON iCal — REFRESH SOLO \d+ \(rol \d+\)\. Escribe SOLO el adjunto \d+\. SUMMARY neutro\.)\n/m;
  if (!headerRe.test(code)) throw new Error('HEADER_NOT_FOUND');
  code = code.replace(headerRe, (m, h) => (notes.length ? `${h}\n${notes.join('\n')}\n` : `${h}\n`));
  const leftovers = code.split('\n').filter((l) => /\b(19|202|26984)\b/.test(l) && !/^\s*#/.test(l) && number !== '202');
  if (leftovers.length) throw new Error('LEFTOVER_TEMPLATE_TOKENS ' + leftovers[0].slice(0, 80));
  return code;
}

/** Codigo de la accion envoltorio: ejecuta la accion de refresco. */
export function renderWrapper(refreshActionId) {
  return `env['ir.actions.server'].browse(${refreshActionId}).run()`;
}

/** Huella corta de un codigo, para comparar con los hashes desplegados. */
export const fingerprint = sha16;
