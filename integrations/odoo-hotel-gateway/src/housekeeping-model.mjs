/**
 * ATH-ODOO-HOTEL-012, Fase 2 - housekeeping.
 *
 * Fuente real confirmada (AI/ATH-ODOO-HOTEL-009_HANDOFF.md, Gate 009-A):
 * cada propiedad tiene un `project.project` ("Proyecto housekeeping:
 * Limpieza") con 4 etapas reales: LISTA / POR_LIMPIAR / EN_LIMPIEZA /
 * INCIDENCIA. Este modulo reutiliza esos 4 nombres como fuente de verdad
 * y SOLO documenta, sin inventar, el hueco frente al diseno UX pedido por
 * el CEO (ver `UX_LABEL` y la nota `LISTA_PARA_REVISAR_PENDIENTE_CEO`).
 *
 * No escribe en Odoo: son transiciones puras sobre un objeto `task` en
 * memoria, con las mismas guardas de transicion invalida que Odoo ya usa
 * en el flujo de reserva (ver hallazgo real Gate 009 punto 3: Odoo
 * rechazo CHECKOUT->CHECKOUT con mensaje claro). Conectar esto a
 * `project.task` real requiere sesion STAGING (bloqueo documentado en
 * AI/ATH-ODOO-HOTEL-012_DIAGNOSTICO.md).
 */

export const ODOO_HOUSEKEEPING_STAGES = Object.freeze(['LISTA', 'POR_LIMPIAR', 'EN_LIMPIEZA', 'INCIDENCIA']);

/**
 * Etiqueta que el CEO pidio para la experiencia de aseo (HOTEL-012).
 * LISTA_PARA_REVISAR no tiene etapa real en Odoo todavia: se deja
 * explicito como pendiente, nunca se inventa una 5ta etapa por cuenta
 * propia (eso es "Modify Shared Resources", requiere a Marlon en Studio,
 * igual que ya paso con la tarjeta Kanban de HOTEL-009).
 */
export const UX_LABEL = Object.freeze({
  LISTA: 'LISTA PARA HUÉSPED',
  POR_LIMPIAR: 'POR LIMPIAR',
  EN_LIMPIEZA: 'EN ASEO',
  INCIDENCIA: 'INCIDENCIA',
});

export const LISTA_PARA_REVISAR_PENDIENTE_CEO =
  'No existe una etapa real en Odoo equivalente a "LISTA PARA REVISAR" (paso intermedio entre terminar el aseo y declarar la unidad lista para huesped). Decision CEO pendiente: agregar una 5ta etapa en el proyecto "Limpieza" de Studio, o fusionar ese paso dentro de EN_LIMPIEZA/LISTA ya existentes.';

const VALID_TRANSITIONS = Object.freeze({
  LISTA: ['POR_LIMPIAR'],
  POR_LIMPIAR: ['EN_LIMPIEZA', 'INCIDENCIA'],
  EN_LIMPIEZA: ['LISTA', 'INCIDENCIA'],
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

/** Termina el aseo. Hoy cae directo en LISTA (ver LISTA_PARA_REVISAR_PENDIENTE_CEO). */
export function finishCleaning(task) {
  return transition(task, 'LISTA');
}

export const INCIDENT_CATEGORIES = Object.freeze(['BAÑO', 'DUCHA', 'LENCERÍA', 'ELECTRICIDAD', 'DAÑO', 'OTRO']);

/**
 * Reporta una incidencia. NO decide por su cuenta si bloquea la entrega
 * al huesped -- esa es una regla comercial que el CEO no ha definido
 * (instruccion explicita de HOTEL-012: "no inventar reglas comerciales").
 * Si el llamador no indica `blocksDelivery`, queda `null` con la bandera
 * `decision_required`.
 */
export function reportIncident(task, category, { note = null, blocksDelivery = null } = {}) {
  if (!INCIDENT_CATEGORIES.includes(category)) {
    throw new Error(`UNKNOWN_INCIDENT_CATEGORY: ${category}`);
  }
  const next = transition(task, 'INCIDENCIA');
  return {
    ...next,
    incident: {
      category,
      note,
      blocks_delivery: blocksDelivery,
      decision_required: blocksDelivery === null ? 'CEO_DEBE_DEFINIR_SI_ESTA_CATEGORIA_BLOQUEA_ENTREGA' : null,
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
