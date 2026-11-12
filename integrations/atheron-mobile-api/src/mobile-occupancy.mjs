// ATH-MOBILE-002 — REST read-only contract for anonymous room occupancy.
import { createHash, timingSafeEqual } from 'node:crypto';
import { isIsoDate } from '../../smoobu-odoo-connector/src/window.mjs';
import { summarizeMobileNight } from '../../smoobu-odoo-connector/src/mobile-availability.mjs';

function authorized(header, token) {
  if (typeof token !== 'string' || token.length < 32 || typeof header !== 'string') return false;
  const match = /^Bearer ([^\\s]+)$/.exec(header);
  if (!match) return false;
  const expected = createHash('sha256').update(token).digest();
  const supplied = createHash('sha256').update(match[1]).digest();
  return timingSafeEqual(expected, supplied);
}

const response = (status, body) => ({ status, body });

/** Read-only, anonymous occupancy endpoint. Never returns reservation names or prices. */
export async function atenderConsultaOcupacion(
  { method, path, authorization, date },
  { token, obtenerInforme },
) {
  if (typeof token !== 'string' || token.length < 32) {
    return response(503, { error: 'SERVICIO_NO_CONFIGURADO' });
  }
  if (!authorized(authorization, token)) return response(401, { error: 'NO_AUTORIZADO' });
  if (method !== 'GET') return response(405, { error: 'METODO_NO_PERMITIDO' });
  if (path !== '/v1/occupancy') return response(404, { error: 'RUTA_NO_ENCONTRADA' });
  if (!isIsoDate(date)) return response(400, { error: 'FECHA_INVALIDA' });

  try {
    const report = await obtenerInforme(date);
    if (report?.exitCode !== 0) return response(503, { error: 'FUENTE_NO_VERIFICABLE' });
    const occupancy = summarizeMobileNight(report.report, date, report.stdout?.at);
    return occupancy ? response(200, occupancy) : response(503, { error: 'FUENTE_NO_VERIFICABLE' });
  } catch {
    return response(503, { error: 'FUENTE_NO_VERIFICABLE' });
  }
}
