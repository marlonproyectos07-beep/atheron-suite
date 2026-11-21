// ATH-MOBILE-001 — Contrato de lectura móvil. NUNCA transmite datos personales ni saldos bancarios.
import { createHash, timingSafeEqual } from 'node:crypto';

const RESULTADOS = new Set(['OK', 'ATENCION']);
const METRICAS = Object.freeze([
  'MATCH', 'MATCH_DRAFT', 'MISSING_IN_ODOO', 'CONFLICT', 'CANCELLED', 'AMBIGUOUS',
]);

function coincide(tokenEsperado, recibido) {
  if (typeof tokenEsperado !== 'string' || tokenEsperado.length < 32 || typeof recibido !== 'string') return false;
  const a = createHash('sha256').update(tokenEsperado).digest();
  const b = createHash('sha256').update(recibido).digest();
  return timingSafeEqual(a, b);
}

function autorizado(header, token) {
  if (typeof header !== 'string') return false;
  const m = /^Bearer ([^\s]+)$/.exec(header);
  return Boolean(m && coincide(token, m[1]));
}

const resp = (status, body) => ({ status, body });

/** Proyeccion blanca del reporte YA anonimizado por runDaily; evita PII en respuestas del servidor. */
export function vistaPublica(informe) {
  if (informe?.exitCode !== 0 || !RESULTADOS.has(informe?.stdout?.result)) return null;
  const s = informe.stdout;
  if (typeof s.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(s.at)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.window?.from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(s.window?.to ?? '')) return null;
  const totales = {};
  for (const k of METRICAS) {
    const n = s.summary?.[k];
    if (Number.isSafeInteger(n) && n >= 0) totales[k] = n;
  }
  const alertas = {};
  for (const [key, value] of Object.entries({
    sinPedido: s.missing?.length,
    conflictos: s.conflicts?.length,
    ambiguos: s.ambiguous?.length,
    sobreventas: s.overbooking?.length,
  })) if (Number.isSafeInteger(value) && value >= 0) alertas[key] = value;
  return {
    fuente: 'conciliacion-smoobu-odoo',
    consultaUTC: s.at,
    estado: s.result,
    ventana: { desde: s.window.from, hasta: s.window.to },
    totales,
    alertas,
    alcance: 'SOLO_LECTURA_SIN_SALDOS_BANCARIOS_NI_DISPONIBILIDAD_CERTIFICADA',
  };
}

/** Pura excepto la inyeccion de snapshot. Nunca escribe en Odoo o Smoobu. */
export async function atenderConsulta({ method, path, authorization }, { token, obtenerInforme }) {
  if (typeof token !== 'string' || token.length < 32) return resp(503, { error: 'SERVICIO_NO_CONFIGURADO' });
  if (!autorizado(authorization, token)) return resp(401, { error: 'NO_AUTORIZADO' });
  if (method !== 'GET') return resp(405, { error: 'METODO_NO_PERMITIDO' });
  if (path !== '/v1/status') return resp(404, { error: 'RUTA_NO_ENCONTRADA' });
  try {
    const data = vistaPublica(await obtenerInforme());
    return data ? resp(200, data) : resp(503, { error: 'FUENTE_NO_VERIFICABLE' });
  } catch {
    return resp(503, { error: 'FUENTE_NO_VERIFICABLE' });
  }
}
