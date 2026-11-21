// ATH-MOBILE-001 — Estado por habitacion desde informe anonimizado, no disponibilidad certificada.
import { isIsoDate } from './window.mjs';
export const MOBILE_ROOMS = Object.freeze(['201','202','203','301','302']);
export function summarizeMobileNight(report, date, queriedAt) {
  if (!isIsoDate(date) || !report || report.result !== 'CONCILIACION_POR_IDS_EN_MEMORIA' ||
      !Array.isArray(report.perReservation) || typeof queriedAt !== 'string' ||
      report.window?.from !== date || report.window?.to !== date ||
      report.safety?.writesEnabled !== false || report.safety?.releaseUnlocked !== false) return null;
  const active = report.perReservation.filter((r) =>
    r.smoobuStatus === 'ACTIVE' && r.arrival <= date && date < r.departure &&
    (MOBILE_ROOMS.includes(r.unit) || r.unit === 'CASA'));
  const wholeHouse = active.some((r) => r.unit === 'CASA');
  const units = MOBILE_ROOMS.map((room) => {
    const bookings = active.filter((r) => r.unit === room);
    const warnings = bookings.some((r) => !['MATCH', 'MATCH_DRAFT'].includes(r.verdict));
    const status = wholeHouse ? 'CASA_RESERVADA_REVISAR' :
      bookings.length > 1 ? 'RESERVAS_SIMULTANEAS_REVISAR' :
      bookings.length === 1 ? 'RESERVA_ACTIVA' : 'SIN_RESERVA_ACTIVA_EN_LISTADO';
    return { habitacion: room, estado: status, revisarOdoo: warnings };
  });
  return {
    fecha: date, horaConsultaUTC: queriedAt, origen: 'SMOOBU_ODOO_API_LECTURA',
    modo: 'SOLO_LECTURA', escrituras: 0, disponibilidadCertificada: false,
    observacion: 'Verificar bloqueos de calendario y disponibilidad oficial en Smoobu antes de vender.',
    unidades: units, bloqueosActivosEnVentana: report.counts?.blocksActive ?? null,
    conflictosOdooEnVentana: report.summary?.CONFLICT ?? null,
    overbookingDetectado: (report.smoobuOverbooking ?? []).length > 0,
  };
}
