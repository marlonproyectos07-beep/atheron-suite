/**
 * ATH-DEV-048 — Presentacion PUBLICA del informe de conciliacion por identificadores.
 *
 * El repositorio es publico: los registros de GitHub Actions los puede leer cualquier usuario con sesion en GitHub.
 * La conciliacion compara internamente los identificadores COMPLETOS (sin cambios en la logica); este modulo solo decide
 * que se IMPRIME:
 *  - IDs de Smoobu y numeros de reserva de la OTA (Booking/Airbnb): enmascarados, solo los 3 ultimos caracteres
 *    (`SM*...781`, `OTA*...870`). Basta para que una persona con acceso a Smoobu localice la reserva junto con habitacion
 *    y fechas; no basta para buscarla en la OTA ni en Smoobu desde fuera.
 *  - Se conservan: veredictos, motivos, habitacion, fechas, ocupacion, conteos, estados y codigos de error.
 *    Habitacion + fechas revelan que una habitacion esta ocupada una noche (dato que la OTA ya publica como "no disponible"),
 *    no quien la ocupa.
 *  - IDs internos de Odoo (`sale.order.id`): se imprimen solo como conteo y estado; no identifican a un huesped fuera de Odoo,
 *    pero tampoco hacen falta en un registro publico.
 *  - Nunca: nombres, correos, telefonos, documentos, textos libres (`x_pms_reference`), ni credenciales (ya no llegan aqui).
 * Ademas `assertPublicSafe` comprueba la cadena final: si aparece cualquier identificador completo, no se imprime el detalle.
 */
const KEEP = 3;

/** Enmascara un identificador dejando visibles los ultimos 3 caracteres. Nulos y vacios quedan en null. */
export function maskId(value, prefix) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return `${prefix}*...${s.slice(-KEEP)}`;
}
export const maskSmoobu = (v) => maskId(v, 'SM');
export const maskOta = (v) => maskId(v, 'OTA');

const publicReservation = (r) => ({
  smoobuRef: maskSmoobu(r.smoobuId),
  otaRef: maskOta(r.otaRef),
  hasOtaRef: r.otaRef != null,
  channelId: r.channelId ?? null,
  unit: r.unit, arrival: r.arrival, departure: r.departure,
  smoobuStatus: r.smoobuStatus, nightsInWindow: r.nightsInWindow,
  verdict: r.verdict, reason: r.reason, matchedBy: r.matchedBy ?? null,
  odooOrderCount: (r.odooOrders ?? []).length,
  odooOrderStates: (r.odooOrders ?? []).map((o) => o.state ?? null),
  odooOccupancy: r.odooOccupancy, odooFreeNights: r.odooFreeNights ?? [],
  overbookingWith: (r.overbookingWith ?? []).map(maskSmoobu),
  manualReview: r.manualReview ?? null,
  writesEnabled: r.writesEnabled,
});

/** Convierte el informe interno (con IDs completos) en el informe imprimible. Pura. */
export function toPublicReport(out) {
  return {
    privacy: { idsMasked: true, visibleSuffix: KEEP, odooOrderIdsPrinted: false, freeTextPrinted: false, namesPrinted: false },
    reads: out.reads,
    window: out.window,
    summary: out.summary,
    counts: out.counts,
    perReservation: (out.perReservation ?? []).map(publicReservation),
    availabilityRisk: (out.availabilityRisk ?? []).map((x) => ({ smoobuRef: maskSmoobu(x.smoobuId), unit: x.unit, freeNightsInOdoo: x.freeNightsInOdoo })),
    smoobuOverbooking: (out.smoobuOverbooking ?? []).map((pair) => pair.map(maskSmoobu)),
    ordersNotReturnedBySmoobu: { count: (out.ordersNotReturnedBySmoobu ?? []).length, refKinds: (out.ordersNotReturnedBySmoobu ?? []).map((o) => o.refKinds) },
    controlCases: (out.controlCases ?? []).map((k, i) => ({
      control: `CONTROL_${i + 1}`, smoobuRef: maskSmoobu(k.smoobuId), unit: k.unit, arrival: k.arrival, departure: k.departure,
      found: k.found, consistentWithControl: k.consistentWithControl ?? null, verdict: k.verdict ?? null, reason: k.reason ?? null,
      odooOccupancy: k.odooOccupancy ?? null, manualReview: k.manualReview ?? null, overbookingWith: (k.overbookingWith ?? []).map(maskSmoobu), note: k.note ?? null,
    })),
    safety: out.safety,
  };
}

/** Identificadores completos presentes en el informe interno (para la comprobacion final). */
export function sensitiveValues(out) {
  const vals = new Set();
  const add = (v) => { if (v != null && String(v).trim().length > KEEP) vals.add(String(v).trim()); };
  for (const r of out.perReservation ?? []) { add(r.smoobuId); add(r.otaRef); for (const x of r.overbookingWith ?? []) add(x); }
  for (const k of out.controlCases ?? []) { add(k.smoobuId); add(k.otaRef); }
  for (const p of out.smoobuOverbooking ?? []) for (const x of p) add(x);
  for (const x of out.availabilityRisk ?? []) add(x.smoobuId);
  return [...vals];
}

/**
 * Ultima barrera antes de imprimir: la cadena publica no puede contener ningun identificador completo ni secreto.
 * Devuelve la lista de coincidencias (vacia = seguro). Nunca devuelve los valores, solo cuantos y de que tipo.
 */
export function assertPublicSafe(text, { identifiers = [], secrets = [] } = {}) {
  const hits = { identifiers: 0, secrets: 0 };
  for (const v of identifiers) if (v && text.includes(v)) hits.identifiers += 1;
  for (const s of secrets) if (typeof s === 'string' && s.length > 3 && text.includes(s)) hits.secrets += 1;
  return { safe: hits.identifiers === 0 && hits.secrets === 0, hits };
}
