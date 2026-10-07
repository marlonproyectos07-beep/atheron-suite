/**
 * ATH-DISP-001 — disponibilidad para recepción, sin catálogo de capacidades.
 *
 * Fuente: la respuesta real del gateway (acción 1967 -> motor 1914). La
 * capacidad sale de `capacidad_comercial` de cada opción, nunca de una
 * tabla fija en código. Sin límite global de bloques: el gateway resuelve
 * solo el rango pedido.
 *
 * Fail-closed: solo `disponible` se muestra como DISPONIBLE. Cualquier
 * duda (unidad ausente, estado desconocido, inconsistencia, error del
 * gateway) se muestra como VERIFICAR o DATOS NO CONFIABLES. Nunca LIBRE.
 */

import { findOpciones } from './gateway-response-utils.mjs';

/** Unidades que recepción consulta. `odooUnitId` es el id de x_hotel_unit en Odoo. */
export const RECEPTION_UNITS = Object.freeze([
  { key: '201', label: '201', odooUnitId: '1' },
  { key: '202', label: '202', odooUnitId: '2' },
  { key: '203', label: '203', odooUnitId: '3' },
  { key: '301', label: '301', odooUnitId: '4' },
  { key: '302', label: '302', odooUnitId: '5' },
  { key: 'CASA_COMPLETA', label: 'Casa Completa', odooUnitId: '6' },
]);

export const STATUS = Object.freeze({
  DISPONIBLE: 'DISPONIBLE',
  NO_DISPONIBLE: 'NO DISPONIBLE',
  VERIFICAR: 'VERIFICAR DISPONIBILIDAD',
  DATOS_NO_CONFIABLES: 'DATOS NO CONFIABLES',
});

export const MAX_NIGHTS = 60;
export const MAX_GUESTS = 60;

// Estados que devuelve la acción 1914. Cualquier otro valor se trata como VERIFICAR.
const ESTADO_MAP = Object.freeze({
  disponible: { status: STATUS.DISPONIBLE, motivo: null },
  no_disponible: { status: STATUS.NO_DISPONIBLE, motivo: 'RESERVADA_O_BLOQUEADA' },
  capacidad_insuficiente: { status: STATUS.NO_DISPONIBLE, motivo: 'CAPACIDAD_INSUFICIENTE' },
  requiere_aprobacion: { status: STATUS.VERIFICAR, motivo: 'REQUIERE_APROBACION' },
});

/**
 * Clasifica una opción del gateway. Nunca devuelve DISPONIBLE si hay
 * cualquier señal de inconsistencia.
 * @param {object|undefined} opcion
 */
export function classifyOption(opcion) {
  if (!opcion || typeof opcion !== 'object') {
    return { status: STATUS.VERIFICAR, motivo: 'UNIDAD_NO_RECIBIDA', capacidad_comercial: null };
  }
  const capacidad = Number.isInteger(opcion.capacidad_comercial) ? opcion.capacidad_comercial : null;
  const mapped = ESTADO_MAP[opcion.estado];
  if (!mapped) {
    return { status: STATUS.VERIFICAR, motivo: 'ESTADO_DESCONOCIDO', capacidad_comercial: capacidad };
  }
  if (mapped.status === STATUS.DISPONIBLE) {
    // Inconsistencia: el motor dice disponible pero trae motivos de bloqueo o no trae capacidad.
    if (Array.isArray(opcion.motivos) && opcion.motivos.length > 0) {
      return { status: STATUS.VERIFICAR, motivo: 'INCONSISTENCIA_MOTIVOS', capacidad_comercial: capacidad };
    }
    if (capacidad === null) {
      return { status: STATUS.VERIFICAR, motivo: 'CAPACIDAD_NO_RECIBIDA', capacidad_comercial: null };
    }
  }
  return { status: mapped.status, motivo: mapped.motivo, capacidad_comercial: capacidad };
}

/**
 * Valida fechas y huéspedes antes de consultar.
 * @param {{checkin: string, checkout: string, guests: number, todayIso: string}} input
 * @returns {{error: string} | {checkin: string, checkout: string, guests: number}}
 */
export function validateReceptionQuery({ checkin, checkout, guests, todayIso }) {
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof checkin !== 'string' || !DATE_RE.test(checkin)) return { error: 'INVALID_CHECKIN' };
  if (typeof checkout !== 'string' || !DATE_RE.test(checkout)) return { error: 'INVALID_CHECKOUT' };
  if (checkout <= checkin) return { error: 'CHECKOUT_MUST_BE_AFTER_CHECKIN' };
  if (checkin < todayIso) return { error: 'CHECKIN_IN_PAST' };
  const nights = (Date.parse(checkout) - Date.parse(checkin)) / 86_400_000;
  if (nights > MAX_NIGHTS) return { error: 'TOO_MANY_NIGHTS' };
  if (!Number.isInteger(guests) || guests < 1 || guests > MAX_GUESTS) return { error: 'INVALID_GUESTS' };
  return { checkin, checkout, guests };
}

/**
 * Construye el resultado para las seis unidades a partir de la respuesta del gateway.
 * Ignora cualquier unidad que no sea una de RECEPTION_UNITS (otras propiedades).
 * @param {object} gatewayResponse respuesta cruda del gateway
 * @param {{checkin: string, checkout: string, guests: number}} query
 */
export function buildReceptionAvailability(gatewayResponse, query) {
  const opciones = findOpciones(gatewayResponse);
  const inventoryCheckedAt = gatewayResponse?.data?.inventory_checked_at ?? null;
  const units = RECEPTION_UNITS.map((unit) => {
    const opcion = opciones.find((o) => String(o?.unit_id) === unit.odooUnitId);
    return { key: unit.key, label: unit.label, ...classifyOption(opcion) };
  });
  return { ...query, inventory_checked_at: inventoryCheckedAt, units };
}

/**
 * Resultado cuando el gateway falla, no responde o la respuesta es incompleta:
 * nada se muestra como libre. Estado pedido por el CEO: VERIFICAR DISPONIBILIDAD.
 */
export function dataUnavailableResult(query) {
  return {
    ...query,
    inventory_checked_at: null,
    units: RECEPTION_UNITS.map((unit) => ({
      key: unit.key,
      label: unit.label,
      status: STATUS.VERIFICAR,
      motivo: 'GATEWAY_NO_DISPONIBLE',
      capacidad_comercial: null,
    })),
  };
}
