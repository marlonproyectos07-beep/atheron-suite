/**
 * Fusiona una interpretacion VALIDADA con lo que ya detecto el motor de reglas.
 * Principios:
 *  - Las reglas tienen la ultima palabra: el LLM nunca quita una intencion ni una entidad detectada por reglas.
 *  - El LLM puede ANADIR intenciones de seguridad (pago, descuento, OTA, Security, reclamo...) siempre: solo restringen.
 *  - El LLM puede RESOLVER un mensaje que las reglas no entienden, solo con confianza >= resolveConfidence.
 *  - Datos (fechas/personas/propiedad) solo entran si superan validateMemoryUpdate().
 */
import { validateMemoryUpdate, LODGING_EVIDENCE } from './memory.mjs';

/** Intenciones que, al anadirse, solo pueden llevar a mas revision humana o a respuestas oficiales. */
export const SAFETY_INTENTS = Object.freeze(['ENVIO_COMPROBANTE', 'DESCUENTO', 'CANCELACION', 'NO_SHOW', 'CAMBIO_FECHAS', 'FUERA_DE_ALCANCE', 'RECLAMO', 'INCIDENCIA', 'REEMBOLSO', 'HABLAR_CON_HUMANO', 'ALIADO_CONSULTA', 'ALIADO_LIQUIDACION', 'LLEGADA_INMINENTE', 'GRUPO', 'CONFIRMAR_RESERVA_OTA']);
/** Evidencia minima en el texto para aceptar que el LLM RESUELVA (gap-fill) una intencion que las reglas no entendieron. */
const GAP_EVIDENCE = {
  CONSULTA_DISPONIBILIDAD: LODGING_EVIDENCE, CONSULTA_PRECIO: /\b(precio\w*|tarifa\w*|cuesta\w*|vale|costo\w*|cotiz\w*|valor|habitacion\w*|noche\w*)\b/, RESERVA: LODGING_EVIDENCE, ANTICIPO: LODGING_EVIDENCE, METODO_PAGO: LODGING_EVIDENCE,
  PREGUNTA_PROPIEDAD: new RegExp(`${LODGING_EVIDENCE.source}|\\b(incluye|desayuno|wifi|politica\\w*|bano\\w*)\\b`),
  POLITICA_CANCELACION: /\b(cancel\w*|politica\w*|condicion\w*|devol\w*)\b/,
  CHECKIN: /\b(hora\w*|check\w*|ingres\w*|entrar|llegar|llegam\w*|llego|maleta\w*)\b/, CHECKOUT: /\b(hora\w*|check\w*|salir|salida|desocup\w*|entregar)\b/,
  LLEGADA_TARDE: /\b(llegam\w*|llego|llegar\w*|noche|tarde)\b/, CHECKIN_TEMPRANO: /\b(entrar|ingres\w*|llegar|temprano|antes)\b/, CHECKOUT_TARDE: /\b(salir|salida|tarde|despues)\b/,
  PARQUEADERO: /\b(carro\w*|moto\w*|camioneta\w*|vehiculo\w*|parque\w*|garaje|estacion\w*)\b/, UBICACION: /\b(donde|direccion|ubic\w*|queda\w*|llegar|cerca|lejos|distancia|catedral|parque|terminal|portal|estacion\w*)\b/,
  EXTENSION: /\b(noche\w*|dia\w*|quedar\w*|extend\w*)\b/,
};
/** Vocabulario sensible: si aparece y el LLM propone una intencion comercial/informativa que las reglas no vieron, NO se resuelve: sigue en humano. */
const SENSITIVE = /\b(pag\w*|pagu\w*|transfer\w*|consign\w*|nequi|daviplata|comprobante|abon\w*|deposit\w*|plata|dinero|cobr\w*|devol\w*|reembols\w*|queja\w*|reclam\w*|sucio|sucia|pesim\w*|malisim\w*|desastre|ruido\w*|molest\w*|estafa|booking|airbnb|plataforma|alarma\w*|camara\w*|vigilancia|seguridad|cerca\w*|agencia\w*|comision\w*|liquidacion\w*|operador|proveedor|aliad\w*|convenio|grupo|excursion|evento|matrimonio|boda|empresa|convencion|colegio|estudiantes|invitados|cancel\w*|anular|no pude|no llegu\w*|no vamos|no voy|descuento\w*|rebaja\w*|especial|igual\w*)\b/;
const NON_SUBSTANTIVE = new Set(['SALUDO', 'CIERRE', 'PAREJA']);
const ACTION_TO_INTENT = { CANCEL: 'CANCELACION', CHANGE: 'CAMBIO_FECHAS', NO_SHOW: 'NO_SHOW', EXTEND: 'EXTENSION', STATUS: 'CONFIRMAR_RESERVA_OTA' };

export function applyUnderstanding({ intents, entities, interp, textNorm, today, memory, resolveConfidence = 0.75 }) {
  const out = [...intents];
  const report = { accepted: [], rejected: [], intent: interp.intent, confidence: interp.confidence };
  const add = (i, why) => { if (!out.includes(i)) { out.push(i); report.accepted.push({ field: 'intent', value: i, why }); } };
  const substantive = intents.some((i) => !NON_SUBSTANTIVE.has(i));

  if (interp.intent !== 'INTENCION_NO_ENTENDIDA' && interp.intent !== 'SALUDO' && interp.intent !== 'CIERRE') {
    if (SAFETY_INTENTS.includes(interp.intent)) add(interp.intent, 'SAFETY_ADDITION');
    else if (substantive) report.rejected.push({ field: 'intent', reason: 'RULES_HAVE_OPINION' });
    else if (interp.confidence < resolveConfidence) report.rejected.push({ field: 'intent', reason: 'CONFIDENCE_BELOW_RESOLVE_THRESHOLD' });
    else if (SENSITIVE.test(textNorm)) report.rejected.push({ field: 'intent', reason: 'SENSITIVE_VOCABULARY_STAYS_HUMAN' });
    else if (GAP_EVIDENCE[interp.intent] && !GAP_EVIDENCE[interp.intent].test(textNorm)) report.rejected.push({ field: 'intent', reason: 'NO_TEXTUAL_EVIDENCE_FOR_INTENT' });
    else add(interp.intent, 'GAP_FILL');
  }
  if (interp.payment_claim || interp.payment_state === 'CLAIMED_PAID') add('ENVIO_COMPROBANTE', 'PAYMENT_CLAIM');
  const actionIntent = ACTION_TO_INTENT[interp.reservation_action];
  if (actionIntent) add(actionIntent, 'RESERVATION_ACTION');
  if (interp.requires_human) add('HABLAR_CON_HUMANO', 'REQUIRES_HUMAN');

  const ent = { ...entities, dates: { ...entities.dates }, persons: { ...entities.persons }, property: { ...entities.property }, misc: { ...entities.misc } };
  if (interp.entities.channel === 'BOOKING' || interp.entities.channel === 'AIRBNB') { ent.misc.ota = true; ent.llm_channel = interp.entities.channel; report.accepted.push({ field: 'channel', value: interp.entities.channel }); }
  if (interp.reservation_state === 'EXISTING_OTA') { ent.misc.ota = true; ent.llm_existing_ota = true; }

  // datos: solo los que las reglas no encontraron, y solo si pasan la validacion de memoria
  const proposed = {
    dates: !entities.dates.checkIn ? interp.entities.dates : [],
    pax: entities.persons.total == null ? interp.entities.pax : null,
    property: !entities.property.key ? interp.entities.property : null,
    amount: interp.entities.amount,
  };
  const { accepted, rejected } = validateMemoryUpdate(proposed, { text: textNorm, intents: out, llmIntent: interp.intent, memory, today, ambiguities: interp.ambiguities });
  report.rejected.push(...rejected);
  if (accepted.dates) {
    const [ci, co] = accepted.dates;
    ent.dates = { ...ent.dates, checkIn: ci, relative: 'llm', ...(co ? { checkOut: co, nights: Math.round((Date.parse(`${co}T00:00:00Z`) - Date.parse(`${ci}T00:00:00Z`)) / 86400000) } : {}) };
    report.accepted.push({ field: 'dates', value: accepted.dates });
  }
  if (accepted.pax != null) { ent.persons.total = accepted.pax; report.accepted.push({ field: 'pax', value: accepted.pax }); }
  if (accepted.property) { ent.property = { key: accepted.property }; report.accepted.push({ field: 'property', value: accepted.property }); }
  return { intents: out, entities: ent, report };
}
