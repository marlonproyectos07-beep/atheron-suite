/**
 * ATH-ODOO-HOTEL-012, Fase 2 - housekeeping.
 *
 * Fuente real confirmada (AI/ATH-ODOO-HOTEL-009_HANDOFF.md, Gate 009-A):
 * cada propiedad tiene un `project.project` ("Proyecto housekeeping:
 * Limpieza") con 4 etapas reales: LISTA / POR_LIMPIAR / EN_LIMPIEZA /
 * INCIDENCIA. `ODOO_HOUSEKEEPING_STAGES` documenta esas 4 tal como
 * existen HOY en Odoo -- no se toca, no se inventa una 5ta ahi.
 *
 * El CEO aprobo (2026-09-30, ver AI/ATH-ODOO-HOTEL-012_SAFE_WRITE_PLAN.md,
 * Decision 1) un flujo LOGICO de 5 pasos para este modulo:
 * POR_LIMPIAR -> EN_LIMPIEZA -> LISTA_PARA_REVISAR -> LISTA, con
 * INCIDENCIA como rama lateral desde cualquier etapa activa. Esa 5ta
 * etapa vive SOLO aqui, en memoria: todavia no existe como etapa real en
 * Odoo (`LISTA_PARA_REVISAR_PENDIENTE_ODOO` documenta ese hueco, ya no
 * es una decision pendiente del CEO sino un paso de escritura en Odoo
 * pendiente de autorizacion, ver SAFE WRITE PLAN seccion 1).
 *
 * No escribe en Odoo: son transiciones puras sobre un objeto `task` en
 * memoria, con las mismas guardas de transicion invalida que Odoo ya usa
 * en el flujo de reserva (ver hallazgo real Gate 009 punto 3: Odoo
 * rechazo CHECKOUT->CHECKOUT con mensaje claro). Conectar esto a
 * `project.task` real requiere sesion STAGING (bloqueo documentado en
 * AI/ATH-ODOO-HOTEL-012_DIAGNOSTICO.md).
 */

export const ODOO_HOUSEKEEPING_STAGES = Object.freeze(['LISTA', 'POR_LIMPIAR', 'EN_LIMPIEZA', 'INCIDENCIA']);

/** Flujo logico de 5 pasos aprobado por el CEO (Decision 1). No es (todavia) el de Odoo. */
export const LOGICAL_HOUSEKEEPING_STAGES = Object.freeze([
  'POR_LIMPIAR',
  'EN_LIMPIEZA',
  'LISTA_PARA_REVISAR',
  'LISTA',
  'INCIDENCIA',
]);

export const UX_LABEL = Object.freeze({
  LISTA: 'LISTA PARA HUÉSPED',
  POR_LIMPIAR: 'POR LIMPIAR',
  EN_LIMPIEZA: 'EN ASEO',
  LISTA_PARA_REVISAR: 'LISTA PARA REVISAR',
  INCIDENCIA: 'INCIDENCIA',
});

export const LISTA_PARA_REVISAR_PENDIENTE_ODOO =
  'LISTA_PARA_REVISAR existe como etapa logica aprobada por el CEO (Decision 1, 2026-09-30), pero todavia no como etapa real en el proyecto "Limpieza" de Odoo. Crearla ahi es un cambio de Studio (SAFE WRITE PLAN, cambio A) que requiere autorizacion y sesion STAGING aparte -- este modulo no lo asume hecho.';

const VALID_TRANSITIONS = Object.freeze({
  LISTA: ['POR_LIMPIAR'],
  POR_LIMPIAR: ['EN_LIMPIEZA', 'INCIDENCIA'],
  EN_LIMPIEZA: ['LISTA_PARA_REVISAR', 'INCIDENCIA'],
  LISTA_PARA_REVISAR: ['LISTA', 'INCIDENCIA'],
  INCIDENCIA: ['POR_LIMPIAR', 'EN_LIMPIEZA'],
});

export class InvalidHousekeepingTransition extends Error {
  constructor(from, to) {
    super(`HOUSEKEEPING: transicion no permitida ${from} -> ${to}`);
    this.name = 'InvalidHousekeepingTransition';
    this.from = from;
    this.to = to;
  }
}

function transition(task, to) {
  const from = task.stage;
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidHousekeepingTransition(from, to);
  }
  return { ...task, stage: to, updated_at: new Date().toISOString() };
}

/** CHECK-OUT completado -> tarea de limpieza pasa (o se crea) en POR_LIMPIAR. */
export function onCheckout(unit) {
  return { unit, stage: 'POR_LIMPIAR', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

export function startCleaning(task) {
  return transition(task, 'EN_LIMPIEZA');
}

/** Termina el aseo -> queda pendiente de revision humana, nunca directo a LISTA. */
export function finishCleaning(task) {
  return transition(task, 'LISTA_PARA_REVISAR');
}

/**
 * Paso humano explicito: confirma que la revision paso y la unidad
 * queda lista para huesped. Solo alcanzable desde LISTA_PARA_REVISAR
 * (la maquina de estados nunca permite saltar de EN_LIMPIEZA o
 * INCIDENCIA directo a LISTA).
 */
export function confirmReadyForGuest(task) {
  return transition(task, 'LISTA');
}

export const INCIDENT_CATEGORIES = Object.freeze(['BAÑO', 'DUCHA', 'LENCERÍA', 'ELECTRICIDAD', 'DAÑO', 'OTRO']);

/**
 * Regla v1 de incidencias, aprobada por el CEO (2026-09-30, ver
 * AI/ATH-ODOO-HOTEL-012_SAFE_WRITE_PLAN.md, Decision 2): toda incidencia
 * abierta bloquea el paso automatico a estado entregable/LISTA, siempre
 * con `decision_required: true`. Ninguna categoria (ni BAÑO, DUCHA,
 * LENCERÍA, ELECTRICIDAD, DAÑO u OTRO) se asume irrelevante por su
 * cuenta -- no hay severidad automatica todavia. `severity` queda como
 * campo preparado (hoy siempre `null`) para que una regla futura por
 * categoria/severidad no requiera rediseñar este contrato.
 */
export function reportIncident(task, category, { note = null, severity = null } = {}) {
  if (!INCIDENT_CATEGORIES.includes(category)) {
    throw new Error(`UNKNOWN_INCIDENT_CATEGORY: ${category}`);
  }
  const next = transition(task, 'INCIDENCIA');
  return {
    ...next,
    incident: {
      category,
      note,
      severity,
      decision_required: true,
      resolved_by: null,
      resolution_note: null,
    },
  };
}

/**
 * Libera una incidencia. NUNCA automatico: exige `authorizedBy` (quien
 * decide) y a donde vuelve el ciclo (`releaseTo`, POR_LIMPIAR o
 * EN_LIMPIEZA -- nunca directo a LISTA_PARA_REVISAR ni LISTA, la unidad
 * siempre debe volver a pasar por aseo/revision tras una incidencia).
 * Sin `authorizedBy` explicito, falla cerrado -- no hay liberacion
 * silenciosa posible.
 */
export function resolveIncident(task, releaseTo, { authorizedBy, resolutionNote = null } = {}) {
  if (task.stage !== 'INCIDENCIA') {
    throw new Error('CANNOT_RESOLVE_INCIDENT_OUTSIDE_INCIDENCIA_STAGE');
  }
  if (!authorizedBy) {
    throw new Error('INCIDENT_RESOLUTION_REQUIRES_EXPLICIT_HUMAN_AUTHORIZATION');
  }
  const next = transition(task, releaseTo);
  return {
    ...next,
    incident: {
      ...task.incident,
      decision_required: false,
      resolved_by: authorizedBy,
      resolution_note: resolutionNote,
    },
  };
}

export const PRIORITY_TIERS = Object.freeze(['ALTA', 'MEDIA', 'NORMAL']);

/**
 * Prioridad de aseo por proxima llegada, sin que Angela/housekeeping
 * tengan que calcular nada:
 * - ALTA: llega el mismo dia de referencia.
 * - MEDIA: llega al dia siguiente.
 * - NORMAL: sin llegada conocida en ese horizonte (o mas lejana).
 *
 * @param {{unit: string, nextArrivalDate: string|null}[]} units
 * @param {string} referenceDate - ISO yyyy-mm-dd
 */
export function computeHousekeepingPriority(units, referenceDate) {
  const tomorrow = (() => {
    const d = new Date(`${referenceDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const withTier = units.map((u) => {
    let tier = 'NORMAL';
    if (u.nextArrivalDate === referenceDate) tier = 'ALTA';
    else if (u.nextArrivalDate === tomorrow) tier = 'MEDIA';
    return { ...u, priority: tier };
  });

  const rank = { ALTA: 0, MEDIA: 1, NORMAL: 2 };
  return withTier.sort((a, b) => rank[a.priority] - rank[b.priority]);
}
