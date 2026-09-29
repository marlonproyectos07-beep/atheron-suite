/**
 * Workstream D - adaptador de datos para Sofia/WhatsApp.
 *
 * Separa DATOS (esta funcion) de PRESENTACION (capa conversacional aparte).
 * No genera texto comercial ni envia WhatsApp real -- solo transforma una
 * peticion ya estructurada ("habitacion 201, 2 personas, fechas X-Y") en el
 * resultado de disponibilidad/alternativas que la capa conversacional usara
 * para redactar la respuesta.
 */
import { requestAccommodationAlternatives } from './alternatives-engine.mjs';

/**
 * @param {{unit: string, checkIn: string, checkOut: string, guests: number}} request
 * @param {{checkAvailability: Function}} deps
 * @returns {Promise<{requested_unit: string, available: boolean, alternatives: Array}>}
 */
export async function sofiaAvailabilityQuery({ unit, checkIn, checkOut, guests }, { checkAvailability }) {
  const result = await requestAccommodationAlternatives(
    { requestedUnit: unit, checkIn, checkOut, guests },
    { checkAvailability },
  );
  return {
    requested_unit: result.requested_unit,
    available: result.requested_available,
    alternatives: result.alternatives,
  };
}

/**
 * Capa de presentacion, deliberadamente separada y opcional: convierte el
 * resultado de datos en un mensaje en espanol. No se usa para decidir
 * disponibilidad -- solo redacta lo que sofiaAvailabilityQuery ya calculo.
 */
export function presentAvailabilityMessage(result) {
  if (result.available) {
    return `La habitacion ${result.requested_unit} esta disponible para esas fechas.`;
  }
  if (result.alternatives.length === 0) {
    return `La ${result.requested_unit} no esta disponible para esas fechas y no tengo otras opciones que encajen.`;
  }
  const opciones = result.alternatives.map((a) => a.unit).join(', ');
  return `La ${result.requested_unit} no esta disponible para esas fechas. Tengo estas opciones: ${opciones}.`;
}
