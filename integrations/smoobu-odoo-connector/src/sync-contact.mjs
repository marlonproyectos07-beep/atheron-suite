/**
 * ATH-DEV-117 — Resolucion de CONTACTOS para la sincronizacion (incluye reservas de Airbnb SIN correo). Puro.
 *
 * Reglas:
 *  - El ID de Smoobu es obligatorio y queda en `res.partner.ref` = `SMOOBU-<id>` del contacto creado. Asi una segunda
 *    ejecucion (o una recuperacion tras un fallo) encuentra el contacto que ella misma creo y no lo duplica.
 *  - El correo NO es obligatorio ni es la unica llave. Llaves fuertes: ref de Smoobu, correo exacto, telefono normalizado.
 *  - El nombre debe ser real e identificable (minimo nombre y apellido, sin cifras ni notas como "OCUPADA 301 — ...").
 *  - Nunca se inventan datos: el contacto nuevo lleva SOLO lo que trae Smoobu (nombre; correo y telefono si existen).
 *  - Identidad ambigua = BLOQUEO (revision humana): varias coincidencias por una llave fuerte, coincidencias fuertes que
 *    apuntan a contactos distintos, coincidencia fuerte con un nombre que no comparte ningun apellido, o coincidencia SOLO
 *    por nombre (dos personas pueden llamarse igual).
 */
export const CONTACT_BLOCKS = Object.freeze({
  SIN_ID_SMOOBU: 'SIN_ID_SMOOBU', NOMBRE_NO_IDENTIFICABLE: 'NOMBRE_NO_IDENTIFICABLE', CONTACTOS_DUPLICADOS: 'CONTACTOS_DUPLICADOS',
  IDENTIDAD_AMBIGUA: 'IDENTIDAD_AMBIGUA', COINCIDENCIA_SOLO_POR_NOMBRE: 'COINCIDENCIA_SOLO_POR_NOMBRE',
});
const GENERIC = new Set(['airbnb', 'booking', 'guest', 'huesped', 'cliente', 'reserva', 'reservation', 'blocked', 'bloqueo', 'bloqueado', 'ocupada', 'ocupado', 'na', 'n/a', 'test', 'prueba', 'sin', 'nombre', 'grupo', 'habitacion', 'hab', 'suite', 'casa', 'adicional', 'dayuse']);

export const normalizeName = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
export const normalizePhone = (s) => { const d = String(s ?? '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-10) : null; };
export const normalizeEmail = (s) => { const e = String(s ?? '').trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null; };

/** ¿El nombre identifica a una persona? Al menos dos palabras de 2+ letras, sin cifras, separadores de notas ni palabras genericas. */
export function assessGuestName(raw) {
  const s = String(raw ?? '').trim();
  if (!s || /\d/.test(s) || /[—|@#/\\()[\]{}:;]/.test(s) || /\s-\s/.test(s)) return { ok: false };
  const words = normalizeName(s).split(' ').filter(Boolean);
  if (words.length < 2) return { ok: false };
  if (words.filter((w) => w.length >= 2).length < 2) return { ok: false };
  if (words.some((w) => GENERIC.has(w))) return { ok: false };
  return { ok: true, name: s.replace(/\s+/g, ' '), tokens: words };
}

const sharesToken = (a, b) => { const A = new Set(normalizeName(a).split(' ').filter((w) => w.length >= 3)); return normalizeName(b).split(' ').some((w) => w.length >= 3 && A.has(w)); };

/**
 * @param {object} p
 * @param {number} p.smoobuId
 * @param {{name?:string,email?:string,phone?:string}} p.guest
 * @param {{byRef:object[], byEmail:object[], byPhone:object[], byName:object[]}} p.candidates contactos leidos de Odoo ({id,name,email,phone,ref})
 * @returns {{action:'REUSE',partnerId:number,matchedBy:string} | {action:'CREATE',vals:object} | {block:string}}
 */
export function resolveContact({ smoobuId, guest, candidates }) {
  if (!Number.isSafeInteger(Number(smoobuId)) || Number(smoobuId) <= 0) return { block: CONTACT_BLOCKS.SIN_ID_SMOOBU };
  const name = assessGuestName(guest?.name);
  if (!name.ok) return { block: CONTACT_BLOCKS.NOMBRE_NO_IDENTIFICABLE };
  const email = normalizeEmail(guest?.email); const phone = normalizePhone(guest?.phone);
  const ref = `SMOOBU-${Number(smoobuId)}`;
  // 1) el contacto que esta misma reserva ya creo (recuperacion / ejecucion repetida)
  const byRef = (candidates.byRef ?? []).filter((c) => c.ref === ref);
  if (byRef.length > 1) return { block: CONTACT_BLOCKS.CONTACTOS_DUPLICADOS };
  if (byRef.length === 1) return { action: 'REUSE', partnerId: byRef[0].id, matchedBy: 'REF_SMOOBU' };
  // 2) llaves fuertes: correo exacto y telefono normalizado
  const byEmail = email ? (candidates.byEmail ?? []).filter((c) => normalizeEmail(c.email) === email) : [];
  const byPhone = phone ? (candidates.byPhone ?? []).filter((c) => normalizePhone(c.phone) === phone) : [];
  if (byEmail.length > 1 || byPhone.length > 1) return { block: CONTACT_BLOCKS.CONTACTOS_DUPLICADOS };
  const strong = [...new Map([...byEmail, ...byPhone].map((c) => [c.id, c])).values()];
  if (strong.length > 1) return { block: CONTACT_BLOCKS.IDENTIDAD_AMBIGUA }; // correo y telefono apuntan a personas distintas
  if (strong.length === 1) {
    if (!sharesToken(strong[0].name, name.name)) return { block: CONTACT_BLOCKS.IDENTIDAD_AMBIGUA }; // mismo correo/telefono, otro nombre
    return { action: 'REUSE', partnerId: strong[0].id, matchedBy: byEmail.length ? 'CORREO' : 'TELEFONO' };
  }
  // 3) solo nombre: nunca basta para reutilizar; si existe alguien con el mismo nombre normalizado, revision humana
  const same = (candidates.byName ?? []).filter((c) => normalizeName(c.name) === normalizeName(name.name));
  if (same.length) return { block: CONTACT_BLOCKS.COINCIDENCIA_SOLO_POR_NOMBRE };
  return { action: 'CREATE', vals: { name: name.name, ...(email ? { email } : {}), ...(guest?.phone && phone ? { phone: String(guest.phone).trim() } : {}), ref } };
}

/** Dominios de lectura para obtener candidatos (solo lectura; los usa el ejecutor en la prevalidacion). */
export function contactQueries({ smoobuId, guest }) {
  const name = assessGuestName(guest?.name);
  const email = normalizeEmail(guest?.email); const phone = normalizePhone(guest?.phone);
  return {
    byRef: [['ref', '=', `SMOOBU-${Number(smoobuId)}`]],
    byEmail: email ? [['email', '=ilike', email]] : null,
    // Odoo guarda el telefono con espacios o guiones: se buscan los 4 ultimos digitos y se compara normalizado en memoria
    byPhone: phone ? [['phone', 'ilike', phone.slice(-4)]] : null,
    byName: name.ok ? [['name', 'ilike', name.tokens[name.tokens.length - 1]]] : null,
  };
}
