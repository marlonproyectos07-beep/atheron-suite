/**
 * Emisor TRA (API PMS del MinCIT, manual Res. 409 de 2022, version 02-02-2023). Nucleo puro, sin red:
 *   odoo: searchRead, create (solo x_report_attempt), claim(lineIds, system, runRef) -> ids reclamados
 *   tra:  post('one'|'two', payload) -> { status, json } | { error: 'TIMEOUT'|'NETWORK'|'BEFORE_SEND' }
 * Reglas: principal antes que acompanantes; el resultado del principal se persiste antes de seguir;
 * nunca se reenvia un principal aceptado; no se reintenta a ciegas tras timeout o resultado incierto;
 * sin configuracion oficial verificada no se envia nada. La bitacora no lleva datos personales.
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

export const LINE_FIELDS = ['id', 'x_is_main', 'x_doc_type_id', 'x_identity_number', 'x_given_names', 'x_surname_1', 'x_surname_2', 'x_residence_city_id', 'x_residence_text', 'x_origin_city_id', 'x_origin_text', 'x_travel_reason', 'x_tra_room', 'x_arrived_at', 'x_tra_state', 'x_tra_external_id', 'x_data_state'];
const name = (m2o) => (Array.isArray(m2o) ? m2o[1] : '') || '';

/** Fecha local de Bogota (UTC-5, sin horario de verano) de un datetime UTC de Odoo "AAAA-MM-DD HH:MM:SS". */
export function bogotaDate(utc) {
  if (!utc) return '';
  const d = new Date(`${String(utc).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
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

function docType(line, catalog) { return catalog.docTypes[line.doc_code] || ''; }

export function buildPayload({ line, main, order, est, catalog, companions, padre }) {
  const common = {
    tipo_identificacion: docType(line, catalog),
    numero_identificacion: line.x_identity_number || '',
    nombres: line.x_given_names || '',
    apellidos: [line.x_surname_1, line.x_surname_2].filter(Boolean).join(' '),
    cuidad_residencia: name(line.x_residence_city_id) || line.x_residence_text || '', // nombre de campo tal cual en el manual oficial
    cuidad_procedencia: name(line.x_origin_city_id) || line.x_origin_text || '',
    numero_habitacion: line.x_tra_room || '',
    check_in: bogotaDate(line.x_arrived_at),
    check_out: order.x_checkout || '',
  };
  let payload;
  if (main) {
    payload = {
      ...common,
      motivo: catalog.reasons[line.x_travel_reason] || '',
      numero_acompanantes: String(companions),
      tipo_acomodacion: est.x_tra_accommodation_type || '',
      costo: est.x_tra_cost_basis === 'total_estancia' && order.amount_total ? String(Math.round(order.amount_total)) : '',
      nombre_establecimiento: est.x_name || '',
      rnt_establecimiento: est.x_rnt_number || '',
    };
  } else payload = { ...common, padre: Number(padre) };
  const missing = Object.entries(payload).filter(([, v]) => v === '' || (typeof v === 'number' && !Number.isFinite(v))).map(([k]) => k);
  const invalid = [];
  if (main && payload.tipo_identificacion && Array.isArray(catalog.mainDocTypes) && !catalog.mainDocTypes.includes(line.doc_code)) invalid.push('tipo_identificacion');
  return { payload, missing, invalid };
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

/** Emite una estancia (reserva). Devuelve un resumen sin datos personales. */
export async function emitStay({ odoo, tra, orderId, est, catalog, mode, runRef, env = {}, log = () => {} }) {
  const gate = emissionGates({ mode, env, catalog, est });
  if (!gate.ok) { log({ event: 'gate_closed', orderId, reasons: gate.reasons }); return { orderId, stop: 'BLOQUEADO', reasons: gate.reasons, sent: 0 }; }
  const lines = await odoo.searchRead('x_guests_line', [['x_sale_order_id', '=', orderId], ['x_data_state', '=', 'validado'], ['x_arrived_at', '!=', false]], LINE_FIELDS);
  const types = await odoo.searchRead('l10n_latam.identification.type', [['id', 'in', [...new Set(lines.map((l) => (Array.isArray(l.x_doc_type_id) ? l.x_doc_type_id[0] : 0)))]]], ['id', 'l10n_co_document_code']);
  const codeOf = new Map(types.map((t) => [t.id, t.l10n_co_document_code]));
  for (const l of lines) l.doc_code = codeOf.get(Array.isArray(l.x_doc_type_id) ? l.x_doc_type_id[0] : 0) || '';
  const [order] = await odoo.searchRead('sale.order', [['id', '=', orderId]], ['id', 'x_checkout', 'amount_total']);
  const mains = lines.filter((l) => l.x_is_main);
  const out = { orderId, main: null, companions: [], sent: 0 };
  if (mains.length !== 1) return { ...out, stop: mains.length ? 'VARIOS_PRINCIPALES' : 'SIN_PRINCIPAL' };
  const main = mains[0];
  const companions = lines.filter((l) => !l.x_is_main);
  const channel = mode === 'real' ? 'api_tra' : 'simulador';

  const record = async (line, cls, status) => {
    try {
      await odoo.create('x_report_attempt', { x_name: line.x_is_main ? 'TRA principal' : 'TRA acompanante', x_guest_line_id: line.id, x_system: 'tra', x_channel: channel, x_result: cls.result, x_external_id: cls.externalId || false, x_http_status: status || 0, x_error_code: cls.code || false, x_run_ref: runRef, x_actor: 'emisor-tra' });
    } catch (e) {
      // El envio pudo haber ocurrido: la linea queda "en envio" (no se reenvia). Se deja rastro sin datos personales.
      log({ event: 'record_failed', lineId: line.id, result: cls.result, externalId: cls.externalId || null });
      throw new EmitterAbort('REGISTRO_RESULTADO_FALLIDO', { lineId: line.id });
    }
  };
  const sendOne = async (line, isMain, padre) => {
    const claimed = await odoo.claim([line.id], 'tra', runRef);
    if (!claimed.includes(line.id)) return { lineId: line.id, result: 'no_reclamado' };
    const { payload, missing, invalid } = buildPayload({ line, main: isMain, order, est, catalog, companions: companions.length, padre });
    if (missing.length || invalid.length) {
      const cls = { result: 'error_previo', code: missing.length ? `DATOS_INCOMPLETOS:${missing.join(',')}` : `DATO_NO_ADMITIDO:${invalid.join(',')}` };
      await record(line, cls, 0);
      return { lineId: line.id, ...cls };
    }
    const res = await tra.post(isMain ? 'one' : 'two', payload);
    out.sent += 1;
    const cls = classify(res);
    await record(line, cls, res?.status);
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
  for (const c of companions.filter((l) => l.x_tra_state === 'pendiente')) out.companions.push(await sendOne(c, false, code));
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
