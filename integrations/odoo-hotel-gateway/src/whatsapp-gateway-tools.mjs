/**
 * ATH-ODOO-HOTEL-011 -- construye el objeto `tools` real que
 * whatsapp-orchestrator.mjs necesita (ver ai-tool-adapters.mjs),
 * usando el MISMO WebHotelClient HTTP ya probado en
 * src/pages/api/hotel/availability.ts (HOTEL-008), nunca XML-RPC
 * directo -- el webhook desplegado en Vercel llega a Odoo STAGING
 * exactamente por el mismo camino que ya audito HOTEL-008
 * (Gateway/HOTEL_GATEWAY_BASE_URL), no por uno nuevo.
 *
 * Mapeo real de unidades (mismo que availability.ts, no inventado --
 * ver AI/ATH-ODOO-HOTEL-008_OTA_MAP.md): 201=1 202=2 203=3 301=4 302=5
 * CASA_COMPLETA=6.
 */
import { WebHotelClient } from '../clients/web-client.mjs';
import { findOpciones, unitAvailability } from './gateway-response-utils.mjs';

export const UNIT_ID_MAP = {
  201: '1',
  202: '2',
  203: '3',
  301: '4',
  302: '5',
  CASA_COMPLETA: '6',
};
const PROPERTY_ID = 1;

/** @param {{baseUrl, agentId, rawKey, fetchImpl?}} config -- `fetchImpl` inyectable para pruebas, real `fetch` por defecto (ver base-client.mjs). */
export function buildWhatsAppGatewayTools(config) {
  const client = new WebHotelClient(config);

  return {
    checkAvailability: async ({ unit, checkIn, checkOut, guests }) => {
      const response = await client.availability({ check_in: checkIn, check_out: checkOut, guests, property_id: PROPERTY_ID });
      if (response?.ok === false) throw new Error(`GATEWAY_AVAILABILITY_ERROR:${response?.error?.code ?? 'UNKNOWN'}`);
      const opciones = findOpciones(response);
      return unitAvailability(opciones, UNIT_ID_MAP[unit]) === true;
    },

    quote: async ({ unit, checkIn, checkOut, guests }) => {
      const response = await client.quote({
        check_in: checkIn,
        check_out: checkOut,
        guests,
        property_id: PROPERTY_ID,
        idempotency_key: `wa-quote-${unit}-${Date.now()}`,
      });
      if (response?.ok === false) throw new Error(`GATEWAY_QUOTE_ERROR:${response?.error?.code ?? 'UNKNOWN'}`);
      const opciones = findOpciones(response);
      const option = opciones.find((o) => String(o.unit_id) === UNIT_ID_MAP[unit]);
      const quoteId = response?.data?.quote_id ?? response?.quote_id ?? null;
      return {
        quote_id: quoteId,
        total: option?.precio_total ?? null,
        requires_manual_confirmation: option?.requires_manual_confirmation ?? false,
      };
    },

    createHold: async ({ quoteId, unit }) => {
      const response = await client.hold({
        quote_id: quoteId,
        unit_id: UNIT_ID_MAP[unit],
        idempotency_key: `wa-hold-${unit}-${Date.now()}`,
      });
      if (response?.ok === false) throw new Error(`GATEWAY_HOLD_ERROR:${response?.error?.code ?? 'UNKNOWN'}`);
      const holdId = response?.data?.hold_id ?? response?.hold_id ?? null;
      return { hold_id: holdId };
    },

    status: async ({ operationId }) => {
      const response = await client.status({ operation_id: operationId });
      if (response?.ok === false) throw new Error(`GATEWAY_STATUS_ERROR:${response?.error?.code ?? 'UNKNOWN'}`);
      return response?.data ?? response;
    },
  };
}

// HOTEL-011: el piloto Meta TEST solo puede consultar disponibilidad.
// Omitir quote/createHold impide llegar a esos endpoints aunque cambie
// la intencion del mensaje o el estado del motor conversacional.
export function buildWhatsAppAvailabilityOnlyTools(config) {
  const { checkAvailability } = buildWhatsAppGatewayTools(config);
  return { checkAvailability };
}


/**
 * HOTEL-016: permite disponibilidad + cotizacion real desde Odoo STAGING,
 * pero mantiene HOLD/reserva DESHABILITADOS. Asi una pregunta como
 * "¿cuánto cuesta?" puede responder con tarifa real sin abrir ninguna
 * operacion comercial.
 */
export function buildWhatsAppQuoteOnlyTools(config) {
  const { checkAvailability, quote } = buildWhatsAppGatewayTools(config);
  return { checkAvailability, quote };
}
