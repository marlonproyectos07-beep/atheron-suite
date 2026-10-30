/**
 * ATH-DEV-029 — contraste de la semantica de `from`/`to` de GET /api/reservations con datos YA OBSERVADOS (ATH-DEV-028).
 * Una sola ventana de un dia (2026-10-20). Hipotesis a contrastar:
 *   H_solape: devuelve estancias que se solapan con [from, to] (extremos inclusivos).
 *   H_llegada / H_salida: solo filtran por fecha de llegada / de salida.
 * Observado antes: la reserva 160905511 (llegada 2026-10-18, salida 2026-11-01) se devolvio para la ventana 26..27
 * (llegada y salida FUERA de ella), lo que descarta H_llegada y H_salida; queda H_solape u otra basada en fechas de
 * modificacion/creacion. Este contraste: el dia 20 esta DENTRO de 160905511 y fuera de las estancias del 25..28.
 */
export const PROBE_DAY = '2026-10-20';
export const KNOWN_SPANNING_ID = 160905511;
export const KNOWN_OUTSIDE_IDS = Object.freeze([161419736, 161558916, 161538491, 161556506, 160829161, 160906566, 161376576]); // estancias que empiezan el 26-27
const d = (v) => (typeof v === 'string' ? v.slice(0, 10) : null);

export function analyzeSemantics(data, { day = PROBE_DAY } = {}) {
  const bookings = Array.isArray(data?.bookings) ? data.bookings : [];
  const rows = bookings.map((b) => ({ id: Number(b.id), type: typeof b.type === 'string' ? b.type : null, arrival: d(b.arrival), departure: d(b.departure), apartmentId: Number(b?.apartment?.id) || null,
    overlapsInclusive: d(b.arrival) <= day && d(b.departure) >= day, arrivalIsDay: d(b.arrival) === day, departureIsDay: d(b.departure) === day }));
  const ids = new Set(rows.map((r) => r.id));
  const spansStrictly = rows.filter((r) => r.arrival < day && r.departure > day);
  const checks = {
    knownSpanningReturned: ids.has(KNOWN_SPANNING_ID),
    outsideIdsAbsent: KNOWN_OUTSIDE_IDS.every((id) => !ids.has(id)),
    everyReturnedOverlapsDay: rows.length > 0 && rows.every((r) => r.overlapsInclusive),
    someReturnedSpanDayStrictly: spansStrictly.length > 0,
  };
  const ok = checks.knownSpanningReturned && checks.outsideIdsAbsent && checks.everyReturnedOverlapsDay;
  return {
    result: 'LECTURA_OK', page: data?.page ?? null, pageCount: data?.page_count ?? null, totalItems: data?.total_items ?? null, returned: rows.length,
    listed: rows.slice(0, 60), checks,
    semantics: ok ? 'SOLAPAMIENTO_CONFIRMADO_EMPIRICAMENTE' : 'NO_CONFIRMADA',
    scope: ok ? 'Contraste de una sola ventana; la documentacion oficial NO se pudo leer. No se prueba el tratamiento de los extremos ni de modifiedAt.' : 'Los datos no permiten afirmar la semantica.',
  };
}
