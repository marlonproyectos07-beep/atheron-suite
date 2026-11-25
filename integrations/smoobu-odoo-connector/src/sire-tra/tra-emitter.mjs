/**
 * Emisor TRA (API PMS del MinCIT, manual Res. 409 de 2022, version 02-02-2023). Nucleo puro, sin red:
 *   odoo: searchRead, create (solo x_report_attempt), claim(lineIds, system, runRef) -> ids reclamados
 *   tra:  post('one'|'two', payload) -> { status, json } | { error: 'TIMEOUT'|'NETWORK'|'BEFORE_SEND' }
 * Reglas: principal antes que acompanantes; el resultado del principal se persiste antes de seguir;
 * nunca se reenvia un principal aceptado; no se reintenta a ciegas tras timeout o resultado incierto;
 * sin configuracion oficial verificada no se envia nada. La bitacora no lleva datos personales.
 *
 * Origen de cada regla (detalle en deploy/tra-grupo1-manual-y-respuesta-2026-11-24.md, seccion 2):
 *  [OFICIAL]  MinCIT, respuesta 2-2026-039958 (23/11/2026): envio al realizar el check-out, registros completos, sin
 *             modificacion ni reenvio (solo borrado por soporte); costo del principal y acompanantes sin impuestos.
 *             Manual Grupo 1: endpoints, cabecera, claves y tipos. Manual Grupo 2 (recomendado por la respuesta):
 *             documento solo digitos salvo Pasaporte (4.2, 5.2); valor en COP, solo numeros (4.12).
 *  [VERBAL]   Asesor MinCIT, reunion del 24/11/2026 (comunicada por Marlon, sin respaldo escrito): alterar el JSON y
 *             repetir peticiones fallidas puede provocar bloqueos. Mecanismo desconocido; no se supone ninguno.
 *  [PROPIA]   Decisiones tecnicas nuestras, marcadas asi en el codigo: parar al primer fallo, esperar revision
 *             humana antes de cualquier otro envio de la estancia, no redondear ni alterar valores.
 */
export const TRA_CATALOG_UNVERIFIED = Object.freeze({
  verified: false,
  // Valores vistos en el manual oficial (ejemplos "C.C" y "Pasaporte") y en la capacitacion publica del formulario;
  // la lista completa de la API no esta publicada: verificar con MinCIT antes de habilitar.
  docTypes: { national_citizen_id: 'C.C', passport: 'Pasaporte', id_card: 'T.I', foreign_resident_card: 'C.E', civil_registration: 'Registro Civil' },
  // Manual oficial Grupo 2 (formulario web), 4.1 y 5.1: el huesped principal admite Pasaporte, T.I, C.C y C.E;
  // "Registro Civil" solo aparece para acompanantes. Un principal con otro tipo no se envia.
  mainDocTypes: ['national_citizen_id', 'passport', 'id_card', 'foreign_resident_card'],
  reasons: {},
});

export const LINE_FIELDS = ['id', 'x_is_main', 'x_doc_type_id', 'x_identity_number', 'x_given_names', 'x_surname_1', 'x_surname_2', 'x_residence_city_id', 'x_residence_text', 'x_origin_city_id', 'x_origin_text', 'x_travel_reason', 'x_tra_room', 'x_arrived_at', 'x_departed_at', 'x_tra_state', 'x_tra_external_id', 'x_data_state'];
const name = (m2o) => (Array.isArray(m2o) ? m2o[1] : '') || '';

// ------------------------------------------------------------------ JSON oficial (manual Grupo 1, PMS)
// Claves y orden EXACTOS del ejemplo del manual (incluida la grafia "cuidad_*"). El emisor construye el cuerpo
// recorriendo estas listas: no puede salir una clave de mas, de menos ni en otro orden.
// /one/ (huesped principal): todos los valores van como texto entre comillas, como en el ejemplo del manual.
export const TRA_ONE_KEYS = Object.freeze(['tipo_identificacion', 'numero_identificacion', 'nombres', 'apellidos', 'cuidad_residencia', 'cuidad_procedencia', 'numero_habitacion', 'motivo', 'numero_acompanantes', 'check_in', 'check_out', 'tipo_acomodacion', 'costo', 'nombre_establecimiento', 'rnt_establecimiento']);
// /two/ (acompanante): texto, salvo "padre", que el manual muestra sin comillas (numerico) = "code" devuelto por /one/.
export const TRA_TWO_KEYS = Object.freeze(['tipo_identificacion', 'numero_identificacion', 'nombres', 'apellidos', 'cuidad_residencia', 'cuidad_procedencia', 'numero_habitacion', 'check_in', 'check_out', 'padre']);
// [OFICIAL] Tabla de tipos del manual Grupo 1 para /one/: numero_acompanantes y rnt_establecimiento son "numerico"
// (el ejemplo los entrecomilla): texto de solo digitos.
export const TRA_ONE_DIGITS = Object.freeze(['numero_acompanantes', 'rnt_establecimiento']);
const DIGITS = /^\d+$/;
/**
 * Documento del huesped principal (/one/ numero_identificacion).
 *  [OFICIAL] Manual Grupo 1: "numerico". Manual Grupo 2, 4.2 (la respuesta 2-2026-039958 recomienda seguir el Grupo 2):
 *            solo numeros, sin puntos ni caracteres especiales; solo el Pasaporte admite letras y numeros.
 *  -> C.C, T.I y C.E: solo digitos; si no, DATO_NO_ADMITIDO (nunca se corrige el valor).
 *  -> Pasaporte con letras: el Grupo 2 lo admite pero el Grupo 1 dice "numerico" para la API. NO RESUELTO: excepcion
 *     especifica (EXCEPCION_PENDIENTE), sin alterar el valor y sin afectar a los demas casos.
 * En /two/ (acompanante) el manual Grupo 1 declara texto: no se valida aqui.
 */
export function mainDocumentStatus(docCode, value) {
  const v = String(value || '');
  if (!v) return 'falta';
  if (DIGITS.test(v)) return 'ok';
  return docCode === 'passport' && /^[A-Za-z0-9]+$/.test(v) ? 'excepcion' : 'invalido';
}

/**
 * Fecha de salida de la estancia (AAAA-MM-DD, Bogota): la mas tardia de las salidas reales. null si alguna ficha no
 * tiene salida real registrada (la estancia no ha terminado y no se reporta).
 */
export function stayDeparture(lines = []) {
  if (!lines.length) return null;
  let last = '';
  for (const l of lines) {
    const d = bogotaDate(l.x_departed_at);
    if (!d) return null;
    if (d > last) last = d;
  }
  return last;
}

/** Fecha local de Bogota (UTC-5, sin horario de verano) de un datetime UTC de Odoo "AAAA-MM-DD HH:MM:SS". */
export function bogotaDate(utc) {
  if (!utc) return '';
  const d = new Date(`${String(utc).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Espejo en JS del campo calculado x_date_gap (manifest.mjs). Solo lee: compara las fechas que TRA acepto con la
 * estancia actual (salida real en hora de Bogota si ya salio; si no, el check-out de la reserva). Nunca modifica ni reenvia.
 */
export function dateGap({ traState, reportedCheckout, departedAt, orderCheckout }) {
  if (traState !== 'aceptado' || !reportedCheckout) return false;
  const current = departedAt ? bogotaDate(departedAt) : orderCheckout;
  if (!current) return false;
  if (current > reportedCheckout) return 'prorroga';
  if (current < reportedCheckout) return 'anticipada';
  return false;
}

export function emissionGates({ mode, env = {}, catalog, est }) {
  const reasons = [];
  if (!est) reasons.push('SIN_ESTABLECIMIENTO');
  else if (est.x_tra_mode !== 'api') reasons.push('ESTABLECIMIENTO_NO_API');
  if (mode === 'real') {
    if (env.TRA_ENABLED !== 'yes-real') reasons.push('TRA_ENABLED_APAGADO');
    if (!env.TRA_TOKEN) reasons.push('SIN_TOKEN');
    if (!catalog?.verified) reasons.push('CATALOGO_NO_VERIFICADO');
    if (est && !est.x_tra_config_verified) reasons.push('CONFIG_ESTABLECIMIENTO_NO_VERIFICADA');
    if (est && !est.x_rnt_number) reasons.push('SIN_RNT');
  } else if (mode !== 'simulador') reasons.push('MODO_INVALIDO');
  return { ok: reasons.length === 0, reasons };
}

const own = (obj, key) => (obj && typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key) && typeof obj[key] === 'string' ? obj[key] : '');
function docType(line, catalog) { return own(catalog.docTypes, line.doc_code); }

// ------------------------------------------------------------------ importe confirmado (campo "costo")
// Res. 409 de 2022 (MinCIT), art. 2: "valor total pagado por el servicio de alojamiento"; manual Grupo 2, 4.12: en pesos
// colombianos. MinCIT, respuesta 2-2026-039958, punto 7: el costo total de alojamiento lo determinan el huesped
// principal y sus acompanantes y NO incluye impuestos; campo de texto, formato libre.
// La tarifa contratada (amount_total del pedido) NO lo sustituye, ni un anticipo: solo se informa como referencia.
// Fuente unica: un registro x_tra_amount del pedido, CONFIRMADO con evidencia, moneda COP, fecha de corte no anterior
// a la salida real de la estancia y constancia expresa de que excluye impuestos y cubre al principal y a todos sus
// acompanantes. El "Paid" de Smoobu u otro reporte sin evidencia se puede anotar como borrador, pero no habilita el envio.
// Reglas que la respuesta oficial NO aclara (no las decide el codigo; ver deploy/tra-grupo1-...): saldo pendiente
// (pagado vs facturado), comision o retencion de canales, descuentos y reembolsos, consumos y servicios adicionales,
// varias habitaciones o grupos con varios principales, pagos en otra moneda, decimales.
export const EST_FIELDS = ['x_name', 'x_rnt_number', 'x_tra_mode', 'x_tra_config_verified', 'x_tra_accommodation_type', 'x_tra_cost_basis', 'x_tra_establishment_name'];
export const ORDER_FIELDS = ['id', 'state', 'x_reservation_status', 'x_checkout', 'amount_total'];
export const AMOUNT_FIELDS = ['id', 'x_state', 'x_amount', 'x_currency_id', 'x_cutoff_date', 'x_evidence_kind', 'x_evidence_ref', 'x_evidence_name', 'x_excludes_taxes', 'x_covers_all_guests', 'x_confirmed_by', 'x_confirmed_at', 'write_date'];
export const EVIDENCE_KINDS = Object.freeze(['comprobante_pago', 'liquidacion_canal', 'factura_pagada', 'extracto_bancario']);
/** Sin importe: falta el dato (no es un dato invalido). IMPORTE_ESPERA_SALIDA: la estancia aun no termino. */
export const COST_MISSING = Object.freeze(['IMPORTE_AUSENTE', 'IMPORTE_SIN_CONFIRMAR', 'IMPORTE_ESPERA_SALIDA']);
/** Casos no resueltos por las fuentes oficiales: no se envian ni se alteran (decision pendiente). */
export const COST_EXCEPTIONS = Object.freeze(['EXCEPCION_IMPORTE_CON_DECIMALES']);
const utcMs = (s) => (s ? new Date(`${String(s).replace(' ', 'T')}Z`).getTime() : NaN);

/** Fecha de hoy en Bogota (AAAA-MM-DD) para una marca de tiempo en ms. */
export function bogotaToday(ms) { return new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 10); }

/**
 * @param {string|null} departure  salida de la estancia (stayDeparture). Sin ella el importe no puede ser definitivo:
 *                                  un corte anterior a la salida seria un anticipo o un pago parcial.
 */
export function confirmedCost({ amounts = [], est, order, today, departure }) {
  const rate = order && Number.isFinite(order.amount_total) ? order.amount_total : null;
  const fail = (code) => ({ ok: false, code, rate });
  if (!est || est.x_tra_cost_basis !== 'total_estancia') return fail('COSTO_BASE_NO_ADMITIDA');
  const confirmed = amounts.filter((a) => a.x_state === 'confirmado');
  // un registro sin estado o en borrador es un reporte (p. ej. el "Paid" de Smoobu) sin contrastar: no habilita el envio
  if (!confirmed.length) return fail(amounts.some((a) => a.x_state !== 'anulado') ? 'IMPORTE_SIN_CONFIRMAR' : 'IMPORTE_AUSENTE');
  if (confirmed.length > 1) return fail('IMPORTE_AMBIGUO');
  if (!departure) return fail('IMPORTE_ESPERA_SALIDA');
  const a = confirmed[0];
  if (!a.x_confirmed_by || !a.x_confirmed_at) return fail('IMPORTE_SIN_CONFIRMACION_REGISTRADA');
  const confirmedAt = utcMs(a.x_confirmed_at);
  const written = utcMs(a.write_date);
  if (!Number.isFinite(confirmedAt) || !Number.isFinite(written) || written > confirmedAt + 1000) return fail('IMPORTE_MODIFICADO_TRAS_CONFIRMAR');
  if (!EVIDENCE_KINDS.includes(a.x_evidence_kind) || !String(a.x_evidence_ref || '').trim() || !String(a.x_evidence_name || '').trim()) return fail('IMPORTE_SIN_EVIDENCIA');
  if (a.x_excludes_taxes !== true) return fail('IMPORTE_SIN_CONSTANCIA_SIN_IMPUESTOS');
  if (a.x_covers_all_guests !== true) return fail('IMPORTE_SIN_CONSTANCIA_ALCANCE');
  if (name(a.x_currency_id) !== 'COP') return fail('IMPORTE_MONEDA_NO_COP');
  if (!a.x_cutoff_date) return fail('IMPORTE_SIN_FECHA_CORTE');
  if (!today || String(a.x_cutoff_date) > today) return fail('IMPORTE_FECHA_CORTE_FUTURA');
  if (String(a.x_cutoff_date) < departure) return fail('IMPORTE_CORTE_ANTES_DE_SALIDA');
  const v = Number(a.x_amount);
  if (!Number.isFinite(v) || v <= 0) return fail('IMPORTE_INVALIDO');
  // [OFICIAL] Grupo 2, 4.12: solo numeros, en pesos. [PROPIA] un importe con decimales no se redondea: excepcion.
  if (!Number.isInteger(v)) return fail('EXCEPCION_IMPORTE_CON_DECIMALES');
  return { ok: true, code: 'OK', value: String(v), rate, differsFromRate: rate !== null && rate !== v, cutoff: String(a.x_cutoff_date), amountId: a.id };
}

// ------------------------------------------------------------------ motivo de viaje
// Se envia SOLO la equivalencia verificada (catalog.reasons) del texto que declaro el huesped (x_travel_reason, que no se
// modifica). catalog.reasonsProposed documenta propuestas con su fuente y NUNCA se usa para enviar.
export function reasonStatus(line, catalog) {
  const declared = String(line.x_travel_reason || '').trim();
  if (!declared) return 'MOTIVO_NO_DECLARADO';
  if (own(catalog.reasons, line.x_travel_reason)) return 'OK';
  if (own(catalog.reasonsProposed, line.x_travel_reason)) return 'MOTIVO_EQUIVALENCIA_NO_VERIFICADA';
  return 'MOTIVO_SIN_EQUIVALENCIA';
}

/**
 * Cuerpo de /one/ (main) o /two/ con las claves, el orden y los tipos del manual. Solo sustituye valores.
 * check_in / check_out = llegada y salida REALES de la ficha (fecha de Bogota), nunca la fecha prevista de la reserva.
 * `order` se conserva en la firma por compatibilidad; ningun valor del pedido se envia.
 */
export function buildPayload({ line, main, est, catalog, companions, padre, cost }) {
  const values = {
    tipo_identificacion: docType(line, catalog),
    numero_identificacion: String(line.x_identity_number || ''),
    nombres: line.x_given_names || '',
    apellidos: [line.x_surname_1, line.x_surname_2].filter(Boolean).join(' '),
    cuidad_residencia: name(line.x_residence_city_id) || line.x_residence_text || '', // nombre de campo tal cual en el manual oficial
    cuidad_procedencia: name(line.x_origin_city_id) || line.x_origin_text || '',
    numero_habitacion: line.x_tra_room || '',
    check_in: bogotaDate(line.x_arrived_at),
    check_out: bogotaDate(line.x_departed_at),
  };
  if (main) {
    Object.assign(values, {
      motivo: own(catalog.reasons, line.x_travel_reason),
      numero_acompanantes: String(companions),
      tipo_acomodacion: est.x_tra_accommodation_type || '',
      // importe confirmado sin impuestos; nunca la tarifa del pedido ni un anticipo
      costo: cost?.ok ? cost.value : '',
      // nombre segun el registro oficial (RNT), separado del nombre interno x_name, que nunca se envia
      nombre_establecimiento: String(est.x_tra_establishment_name || '').trim(),
      rnt_establecimiento: String(est.x_rnt_number || ''),
    });
  } else values.padre = Number(padre);
  const payload = Object.fromEntries((main ? TRA_ONE_KEYS : TRA_TWO_KEYS).map((k) => [k, values[k]]));
  let missing = Object.entries(payload).filter(([, v]) => v === '' || v === undefined || (typeof v === 'number' && !Number.isFinite(v))).map(([k]) => k);
  const invalid = [];
  const pending = []; // excepciones especificas no resueltas: no se envian, no se alteran
  if (main && payload.tipo_identificacion && Array.isArray(catalog.mainDocTypes) && !catalog.mainDocTypes.includes(line.doc_code)) invalid.push('tipo_identificacion');
  if (main) {
    const doc = mainDocumentStatus(line.doc_code, payload.numero_identificacion);
    if (doc === 'invalido') invalid.push('numero_identificacion');
    if (doc === 'excepcion') pending.push('numero_identificacion');
    for (const k of TRA_ONE_DIGITS) if (payload[k] !== '' && !DIGITS.test(payload[k])) invalid.push(k);
  }
  // [PROPIA] coherencia minima: padre entero positivo (el manual lo toma del "code" devuelto) y salida >= llegada
  if (!main && payload.padre !== undefined && Number.isFinite(payload.padre) && !(Number.isInteger(payload.padre) && payload.padre > 0)) invalid.push('padre');
  if (payload.check_in && payload.check_out && payload.check_out < payload.check_in) invalid.push('check_out');
  if (main && !cost?.ok && cost?.code && !COST_MISSING.includes(cost.code)) (COST_EXCEPTIONS.includes(cost.code) ? pending : invalid).push('costo');
  missing = missing.filter((k) => !invalid.includes(k) && !pending.includes(k));
  return { payload, missing, invalid, pending };
}

export function classify(res) {
  if (res?.error === 'BEFORE_SEND') return { result: 'error_previo', code: 'NO_ENVIADO' };
  if (res?.error) return { result: 'incierto', code: res.error };
  const s = res?.status;
  if (s >= 200 && s < 300) {
    const c = res.json?.code;
    return Number.isInteger(c) ? { result: 'aceptado', externalId: String(c) } : { result: 'incierto', code: 'RESPUESTA_SIN_CODIGO' };
  }
  if (s === 401 || s === 403) return { result: 'rechazado', code: 'TRA_AUTH_REJECTED' };
  if (s === 429 || s >= 500) return { result: 'incierto', code: `HTTP_${s}` };
  if (s >= 400) return { result: 'rechazado', code: `HTTP_${s}` };
  return { result: 'incierto', code: `HTTP_${s}` };
}

export class EmitterAbort extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail; } }

async function attachDocCodes(odoo, lines) {
  const ids = [...new Set(lines.map((l) => (Array.isArray(l.x_doc_type_id) ? l.x_doc_type_id[0] : 0)).filter(Boolean))];
  const types = ids.length ? await odoo.searchRead('l10n_latam.identification.type', [['id', 'in', ids]], ['id', 'l10n_co_document_code']) : [];
  const codeOf = new Map(types.map((t) => [t.id, t.l10n_co_document_code]));
  for (const l of lines) l.doc_code = codeOf.get(Array.isArray(l.x_doc_type_id) ? l.x_doc_type_id[0] : 0) || '';
}

const STATUS = (k, missing, invalid, pending = []) => (invalid.includes(k) ? 'no_admitido' : pending.includes(k) ? 'excepcion_pendiente' : missing.includes(k) ? 'falta' : 'ok');

/**
 * [PROPIA] Estados que exigen revision humana en el portal PMS antes de cualquier otro envio de la estancia. Nunca hay
 * reintento automatico: un rechazado o incierto solo vuelve a "pendiente" cuando Recepcion registra "Comprobado: no
 * recibido" tras mirar el portal (la respuesta oficial, punto 12, indica que la confirmacion se hace alli).
 */
export const REVIEW_STATES = Object.freeze(['en_envio', 'enviado', 'incierto', 'rechazado']);

/** Codigos de una ficha que impiden reportar la estancia (sin mirar el payload). */
function lineBlocks(l) {
  const codes = [];
  if (l.x_data_state !== 'validado') codes.push('FICHA_NO_VALIDADA');
  if (!l.x_arrived_at) codes.push('SIN_LLEGADA_REAL');
  if (!l.x_departed_at) codes.push('SIN_SALIDA_REAL'); // [OFICIAL] envio al check-out (2-2026-039958, punto 15)
  if (REVIEW_STATES.includes(l.x_tra_state)) codes.push(`TRA_${String(l.x_tra_state).toUpperCase()}_REVISAR`);
  return codes;
}

/**
 * Comprobacion completa SIN envio de una estancia: lee el pedido, todas sus fichas, el importe confirmado y el
 * establecimiento, arma el payload de cada huesped y devuelve, campo por campo, que esta listo y que lo bloquea.
 * Solo lectura: no reclama, no escribe en Odoo y no contacta al MinCIT. La salida lleva codigos, nunca valores.
 */
export async function checkStay({ odoo, orderId, catalog, env = {}, today }) {
  const out = { order: orderId, ready_data: false, ready_to_send: false, pending: 0, blocks: [], cost: null, establishment: 'desconocido', lines: [], gates: [] };
  const [order] = await odoo.searchRead('sale.order', [['id', '=', orderId]], ORDER_FIELDS);
  if (!order) { out.blocks.push('PEDIDO_NO_EXISTE'); return out; }
  if (order.state !== 'sale') out.blocks.push('PEDIDO_NO_CONFIRMADO');
  if (['cancelled', 'no_show'].includes(order.x_reservation_status)) out.blocks.push('PEDIDO_CANCELADO_O_NO_SHOW');
  const lines = await odoo.searchRead('x_guests_line', [['x_sale_order_id', '=', orderId]], [...LINE_FIELDS, 'x_establishment_id']);
  await attachDocCodes(odoo, lines);
  const estIds = [...new Set(lines.map((l) => (Array.isArray(l.x_establishment_id) ? l.x_establishment_id[0] : 0)).filter(Boolean))];
  let est = null;
  if (estIds.length > 1) out.blocks.push('VARIOS_ESTABLECIMIENTOS');
  else if (estIds.length === 1) { [est] = await odoo.searchRead('x_establishment', [['id', '=', estIds[0]]], EST_FIELDS); out.establishment = 'de_las_fichas'; }
  else {
    // sin fichas: se informa con el unico establecimiento activo, si lo hay (solo para la comprobacion; el envio exige fichas)
    const act = await odoo.searchRead('x_establishment', [['x_active', '=', true]], ['id', ...EST_FIELDS]);
    if (act.length === 1) { est = act[0]; out.establishment = 'unico_activo'; }
  }
  if (!est) out.blocks.push('SIN_ESTABLECIMIENTO');
  else {
    if (!String(est.x_tra_establishment_name || '').trim()) out.blocks.push('NOMBRE_TRA_SIN_REGISTRAR');
    if (!est.x_tra_accommodation_type) out.blocks.push('TIPO_ACOMODACION_SIN_REGISTRAR');
  }
  const amounts = await odoo.searchRead('x_tra_amount', [['x_sale_order_id', '=', orderId], ['x_state', '!=', 'anulado']], AMOUNT_FIELDS);
  const departure = stayDeparture(lines);
  if (lines.length && !departure) out.blocks.push('ESTANCIA_SIN_SALIDA_REAL');
  const cost = confirmedCost({ amounts, est, order, today, departure });
  out.cost = { code: cost.code, differs_from_rate: cost.ok ? cost.differsFromRate : null };
  if (!cost.ok) out.blocks.push(cost.code);
  const mains = lines.filter((l) => l.x_is_main);
  const companions = lines.filter((l) => !l.x_is_main);
  if (!lines.length) out.blocks.push('SIN_FICHAS');
  else if (!mains.length) out.blocks.push('SIN_PRINCIPAL');
  else if (mains.length > 1) out.blocks.push('VARIOS_PRINCIPALES');
  for (const l of lines) {
    const codes = lineBlocks(l);
    const done = l.x_tra_state === 'aceptado';
    if (!done && l.x_data_state === 'validado' && l.x_arrived_at && l.x_tra_state === 'pendiente') out.pending += 1;
    const { payload, missing, invalid, pending } = buildPayload({ line: l, main: l.x_is_main, order, est: est || {}, catalog, companions: companions.length, padre: 1, cost });
    const fields = Object.fromEntries(Object.keys(payload).filter((k) => k !== 'padre').map((k) => [k, STATUS(k, missing, invalid, pending)]));
    if (l.x_is_main) {
      const rs = reasonStatus(l, catalog);
      if (rs !== 'OK') { fields.motivo = 'falta'; codes.push(rs); }
      if (fields.costo !== 'ok') fields.costo = cost.code;
    } else fields.padre = 'tras_aceptar_principal';
    for (const [k, v] of Object.entries(fields)) if (v !== 'ok' && v !== 'tras_aceptar_principal' && !(k === 'costo' && v === cost.code && out.blocks.includes(cost.code))) codes.push(v === 'excepcion_pendiente' ? `EXCEPCION_PENDIENTE_${k}` : `CAMPO_${k}`);
    out.lines.push({ id: l.id, main: !!l.x_is_main, tra: l.x_tra_state || null, codes: done ? [] : [...new Set(codes)], fields });
  }
  out.gates = emissionGates({ mode: 'real', env, catalog, est }).reasons;
  out.ready_data = out.blocks.length === 0 && out.lines.every((x) => x.codes.length === 0) && out.pending > 0;
  out.ready_to_send = out.ready_data && out.gates.length === 0;
  out.est = est; // para el emisor; el recorrido lo quita antes de imprimir
  return out;
}

/** Emite una estancia (reserva). Devuelve un resumen sin datos personales. */
export async function emitStay({ odoo, tra, orderId, est, catalog, mode, runRef, env = {}, log = () => {}, today }) {
  const gate = emissionGates({ mode, env, catalog, est });
  if (!gate.ok) { log({ event: 'gate_closed', orderId, reasons: gate.reasons }); return { orderId, stop: 'BLOQUEADO', reasons: gate.reasons, sent: 0 }; }
  // TODAS las fichas de la estancia: si alguna no esta validada, sin llegada o sin salida real, no se envia nada
  const lines = await odoo.searchRead('x_guests_line', [['x_sale_order_id', '=', orderId]], LINE_FIELDS);
  const out = { orderId, main: null, companions: [], sent: 0 };
  const blocking = [...new Set(lines.filter((l) => l.x_tra_state !== 'aceptado').flatMap((l) => lineBlocks(l)))];
  if (!lines.length) blocking.push('SIN_FICHAS');
  if (blocking.length) { log({ event: 'stay_not_ready', orderId, reasons: blocking }); return { ...out, stop: 'ESTANCIA_NO_LISTA', reasons: blocking }; }
  await attachDocCodes(odoo, lines);
  const [order] = await odoo.searchRead('sale.order', [['id', '=', orderId]], ORDER_FIELDS);
  const amounts = await odoo.searchRead('x_tra_amount', [['x_sale_order_id', '=', orderId], ['x_state', '!=', 'anulado']], AMOUNT_FIELDS);
  const cost = confirmedCost({ amounts, est, order, today, departure: stayDeparture(lines) });
  const mains = lines.filter((l) => l.x_is_main);
  if (mains.length !== 1) return { ...out, stop: mains.length ? 'VARIOS_PRINCIPALES' : 'SIN_PRINCIPAL' };
  const main = mains[0];
  const companions = lines.filter((l) => !l.x_is_main);
  const channel = mode === 'real' ? 'api_tra' : 'simulador';

  const record = async (line, cls, status, sent) => {
    try {
      // las fechas se guardan tal como se enviaron: son la referencia para detectar cambios posteriores de la estancia
      await odoo.create('x_report_attempt', { x_name: line.x_is_main ? 'TRA principal' : 'TRA acompanante', x_guest_line_id: line.id, x_system: 'tra', x_channel: channel, x_result: cls.result, x_external_id: cls.externalId || false, x_http_status: status || 0, x_error_code: cls.code || false, x_reported_checkin: sent?.check_in || false, x_reported_checkout: sent?.check_out || false, x_run_ref: runRef, x_actor: 'emisor-tra' });
    } catch (e) {
      // El envio pudo haber ocurrido: la linea queda "en envio" (no se reenvia). Se deja rastro sin datos personales.
      log({ event: 'record_failed', lineId: line.id, result: cls.result, externalId: cls.externalId || null });
      throw new EmitterAbort('REGISTRO_RESULTADO_FALLIDO', { lineId: line.id });
    }
  };
  const sendOne = async (line, isMain, padre) => {
    const claimed = await odoo.claim([line.id], 'tra', runRef);
    if (!claimed.includes(line.id)) return { lineId: line.id, result: 'no_reclamado' };
    const { payload, missing, invalid, pending } = buildPayload({ line, main: isMain, order, est, catalog, companions: companions.length, padre, cost });
    if (missing.length || invalid.length || pending.length) {
      const code = missing.length ? `DATOS_INCOMPLETOS:${missing.join(',')}` : invalid.length ? `DATO_NO_ADMITIDO:${invalid.join(',')}` : `EXCEPCION_PENDIENTE:${pending.join(',')}`;
      const cls = { result: 'error_previo', code };
      await record(line, cls, 0, null);
      return { lineId: line.id, ...cls };
    }
    const res = await tra.post(isMain ? 'one' : 'two', payload);
    out.sent += 1;
    const cls = classify(res);
    await record(line, cls, res?.status, payload);
    log({ event: 'sent', lineId: line.id, main: isMain, result: cls.result, code: cls.code || null, externalId: cls.externalId || null });
    return { lineId: line.id, ...cls };
  };

  let code = main.x_tra_external_id;
  if (main.x_tra_state === 'pendiente') {
    out.main = await sendOne(main, true);
    if (out.main.result !== 'aceptado') return { ...out, stop: `PRINCIPAL_${out.main.result}` };
    code = out.main.externalId;
  } else if (main.x_tra_state !== 'aceptado' || !code) {
    return { ...out, stop: `PRINCIPAL_${main.x_tra_state || 'sin_estado'}` };
  }
  // [PROPIA] se detiene al primer acompanante que no quede aceptado: no se encadenan peticiones fallidas (advertencia
  // verbal); los demas esperan a que Recepcion revise el portal y lance otra ejecucion manual
  for (const c of companions.filter((l) => l.x_tra_state === 'pendiente')) {
    const r = await sendOne(c, false, code);
    out.companions.push(r);
    if (r.result !== 'aceptado') return { ...out, stop: `ACOMPANANTE_${r.result}` };
  }
  return out;
}

/** Simulador de la API TRA para pruebas: respuestas guionadas por orden de llamada. Nunca toca la red. */
export function createTraSimulator(script = []) {
  let next = 100;
  const calls = [];
  return {
    calls,
    async post(kind, payload) {
      const step = script[calls.length] ?? 'ok';
      calls.push({ kind, padre: payload.padre ?? null });
      if (step === 'ok') { next += 1; return { status: 200, json: { code: next } }; }
      if (step === 'timeout') return { error: 'TIMEOUT' };
      if (step === 'network') return { error: 'NETWORK' };
      if (step === 'no_code') return { status: 200, json: {} };
      const n = Number(step);
      return { status: Number.isInteger(n) ? n : 500, json: {} };
    },
  };
}
