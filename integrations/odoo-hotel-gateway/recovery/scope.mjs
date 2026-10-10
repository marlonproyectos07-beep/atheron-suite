// ATH-STAGING-RECOVERY-013 — ALCANCE de la recuperación BASE (HOTEL-017/018): lógica hotelera INTERNA únicamente.
// Queda FUERA todo lo relacionado con OTA / canales externos: Booking, Airbnb, Beds24, NOBEDS, feeds iCal, crons de sincronización,
// y cualquier llamada o escritura externa. La exclusión es conservadora: si un nombre, un modelo o el CÓDIGO apuntan a un canal
// externo, el componente NO se crea y queda registrado como EXCLUYE_OTA con su motivo. Nada se borra ni se oculta.
// Evidencia en el repo (AI/staging-backup/base-automation.json): 51 «NOBEDS → Odoo — Recibir Reserva», 164 «Anti-duplicado NOBEDS»,
// 170 «Orden borrador desde reserva OTA», 171 «Cancelar orden al cancelar reserva OTA»; acción 1815 (código con x_nobeds_id).

/** Modelos propios que pertenecen a la capa OTA y NO forman parte de la recuperación base. */
export const OTA_MODELS = Object.freeze({
  x_hotel_ota_feed: 'configuración de feeds iCal por canal/unidad (Booking/Airbnb)',
  x_hotel_api_log: 'bitácora del Gateway/importador OTA (snapshots por UID); uso genérico dudoso, se excluye hasta que dirección decida',
});

const NAME_RX = /nobeds|\bOTA\b|airbnb|beds24|\bical\b|booking\.com|\bbooking\b(?![ _]engine)(?!_source)/i;
const CODE_RX = /x_hotel_ota_feed|x_hotel_api_log|x_nobeds|beds24|nobeds|airbnb|booking\.com|BEGIN:VCALENDAR|\bical\b|urlopen|requests\.(get|post|put|delete|patch)|https?:\/\//i;
const FIELD_RX = /nobeds|beds24|airbnb|\bical\b|_ical|inbound/i;

/**
 * ¿Es OTA/externo? Devuelve {ota, reasons[]}. Se mira (1) el modelo, (2) el nombre, (3) el código de la acción.
 * `booking` solo cuenta como canal si no es «Booking Engine» (módulo nativo de Odoo) ni el selector `x_booking_source`.
 */
export function classifyOta({ name = '', model = '', code = '' } = {}) {
  const reasons = [];
  if (OTA_MODELS[model]) reasons.push(`modelo OTA ${model}`);
  const nm = String(name).match(NAME_RX); if (nm) reasons.push(`nombre contiene «${nm[0]}»`);
  const cm = String(code).match(CODE_RX); if (cm) reasons.push(`código referencia «${cm[0]}»`);
  return { ota: reasons.length > 0, reasons };
}

export function classifyOtaField(f) {
  const reasons = [];
  if (OTA_MODELS[f.model]) reasons.push(`campo de modelo OTA ${f.model}`);
  if (f.relation && OTA_MODELS[f.relation]) reasons.push(`relación a modelo OTA ${f.relation}`);
  if (FIELD_RX.test(f.name ?? '')) reasons.push(`nombre de campo «${f.name}»`);
  return { ota: reasons.length > 0, reasons };
}

/**
 * Números enteros escritos a mano (>= 4 dígitos) en el código, fuera de comentarios y de cadenas: son ids de la base ANTIGUA
 * (p. ej. product.product 57850…). En la base nueva no valen. El detector anterior solo conocía ids de recurso/rol/producto-plantilla.
 */
export function hardcodedIds(code) {
  const stripped = String(code ?? '')
    .replace(/#.*$/gm, '')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
  return [...new Set((stripped.match(/(?<![\w.])\d{4,}(?![\w.])/g) ?? []).map(Number))].sort((a, b) => a - b);
}

/**
 * ADAPTACIÓN MECÁNICA de referencias entre acciones: `env['ir.actions.server'].sudo().browse(1914)` apunta a un id de la base
 * ANTIGUA; en la nueva ese id es otra acción o ninguna. Se reescribe a una búsqueda por NOMBRE y MODELO, que sigue siendo un
 * recordset y por tanto admite `.with_context(...)` y `.run()` igual que antes. `.ensure_one()` hace que, si la acción destino
 * no existe (o está duplicada), falle de inmediato en vez de ejecutar un recordset vacío en silencio.
 * Solo se reescribe lo que `resolve(id)` conoce ({name, model}); el resto queda intacto y lo detecta hardcodedIds().
 */
const ACTION_BROWSE_RX = /env\[(['"])ir\.actions\.server\1\](?:\.sudo\(\))?\.browse\(\s*(\d+)\s*\)/g;
const pyStr = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
export function adaptActionRefs(code, resolve) {
  const adapted = []; const unresolved = [];
  const out = String(code ?? '').replace(ACTION_BROWSE_RX, (all, _q, id) => {
    const ref = resolve(Number(id));
    if (!ref?.name || !ref?.model) { unresolved.push(Number(id)); return all; }
    adapted.push({ id: Number(id), name: ref.name, model: ref.model });
    return `env['ir.actions.server'].sudo().search([('name', '=', ${pyStr(ref.name)}), ('model_id.model', '=', ${pyStr(ref.model)})], limit=1).ensure_one()`;
  });
  return { code: out, adapted, unresolved };
}
