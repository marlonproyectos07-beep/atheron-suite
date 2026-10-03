/**
 * Especificaciones ejecutables de T01..T100 del Playbook v0.1.
 *
 * El INPUT, EXPECTED_INTENT, ODOO y ESC se toman del Playbook (JSON
 * extraido del archivo). Aqui solo se siembra el CONTEXTO que el Playbook
 * describe en prosa ("Cotizo 2 noches", "Ya dio fecha y 4 personas") y se
 * fijan las verificaciones de comportamiento (EXPECTED_BEHAVIOR). Si una
 * spec se aparta de lo que dice el Playbook en ESC u ODOO, DEBE llevar
 * `adjust` con la razon: queda listada como desviacion en el reporte.
 *
 * HOY = sabado 2026-10-03. Los regex se evaluan sobre la respuesta
 * normalizada (minusculas, sin acentos).
 */
const SAT = '2026-10-10'; // proximo sabado
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const mem = (patch) => (s) => Object.assign(s.memory, patch);
const dates = (ci, nights = 1) => ({ checkIn: ci, nights, checkOut: addDays(ci, nights), nights_explicit: true });
const seq = (...fns) => (s) => fns.forEach((f) => f(s));
const quote = (q) => (s) => {
  s.lastQuote = q;
};
const options = (list, q = null) => (s) => {
  s.lastOptions = list;
  if (q) s.lastQuote = q;
};
const reservation = (r) => (s) => {
  s.reservation = r;
};

const OPT_SHARED = { unit: '201', label: '201', capacity: 2, bath: 'compartido', total: 105000, nights: 1 };
const OPT_PRIV = { unit: '203', label: '203', capacity: 4, bath: 'privado', total: 120000, nights: 1 };
const TWO_OPTS = options([OPT_PRIV, OPT_SHARED], { property: 'AS', checkIn: SAT, checkOut: addDays(SAT, 1), nights: 1, guests: 2, unit: '203', total: 120000 });
const Q360 = { property: 'AS', checkIn: SAT, checkOut: addDays(SAT, 3), nights: 3, guests: 2, unit: '302', total: 360000 };
const PAID_AS = { property: 'AS', source: 'DIRECT', has_payment: true, checkIn: SAT, checkOut: addDays(SAT, 1), nights: 1, guests: 2 };

export const SPECS = {
  // ---- 12.1 simples ----
  T01: { must: [/fecha/, /personas/], mustNot: [/\$/] },
  T02: { expect: { odoo: 'must' }, must: [/hab\./], mustNot: [/para que fecha/, /cuantas personas/] },
  T03: { must: [/fecha/], mustNot: [/\$/] },
  T04: { must: [/fecha/, /aseo/], mustNot: [/\$/] },
  T05: { must: [/15:00/, /11:00/] },
  T06: { seed: mem({ property: 'AS' }), must: [/1,4 km/, /16 min/] },
  T07: { must: [/fecha/], mustNot: [/\$/, /cuantas personas/] },
  T08: { must: [/en que te puedo ayudar/], maxChars: 60 },
  T09: { seed: seq(quote(Q360), (s) => { s.greeted = true; }), must: [/anticipo/], maxLines: 1 },
  T10: { must: [/cra\. 9 #10-32/] },

  // ---- 12.2 ambiguedades ----
  T11: { must: [/dia a que dia/] },
  T12: { seed: mem(dates(SAT)), must: [/2 personas o 2 habitaciones/] },
  T13: { seed: mem({ rooms: 3 }), must: [/fecha/], mustNot: [/\$/] },
  T14: { must: [/sabado 10 de octubre/] },
  T15: { seed: seq(quote(Q360), mem({ property: 'AS' })), must: [/por habitacion/] },
  T16: { must: [/fecha/, /personas/] },
  T17: { must: [/fecha/, /personas/] },
  T18: { seed: TWO_OPTS, seedAmounts: [120000, 105000], must: [/203/, /120\.000/] },

  // ---- 12.3 cambios de opinion ----
  T19: { seed: seq(mem({ ...dates(SAT, 2), guests: 2, property: 'AS' }), TWO_OPTS), expect: { odoo: 'must' }, must: [/3 noches/] },
  T20: { seed: seq(mem({ ...dates(SAT, 1), guests: 2, property: 'AS' }), TWO_OPTS), expect: { odoo: 'must' }, must: [/4 pers/] },
  T21: { seed: seq(mem({ ...dates(SAT, 1), guests: 2, property: 'AS', bath: 'compartido' }), TWO_OPTS), expect: { odoo: 'must' }, must: [/privado/] },
  T22: { must: [/sin problema/], mustNot: [/\$/] },
  T23: {
    seed: reservation(PAID_AS),
    expect: { esc: false, odoo: 'mustNot' },
    adjust: 'POLITICA OFICIAL CEO 2026-10-03 (CEO-03): reserva directa con mas de 48 h al check-in se explica (saldo a favor 6 meses, sujeto a disponibilidad/tarifa vigente) y no se escala; el Playbook decia ESC=Si. Sin nueva fecha no se consulta Odoo.',
    must: [/48 horas/, /saldo a favor/, /fecha/],
  },
  T24: { seed: TWO_OPTS, seedAmounts: [120000, 105000], must: [/201/, /105\.000/] },

  // ---- 12.4 varios huespedes ----
  T25: {
    expect: { odoo: 'mustNot' },
    adjust: 'Sin fecha no se afirma disponibilidad ni se consulta Odoo: se orienta con la capacidad verificada de las fichas (302 hasta 3, 202 hasta 4) y se pide la fecha.',
    must: [/302/, /fecha/],
  },
  T26: {
    expect: { odoo: 'mustNot' },
    adjust: 'Sin fecha no se consulta Odoo; primero se piden edades (el Playbook: no aplicar tarifa de ninos inventada).',
    must: [/edades/],
    mustNot: [/tarifa/, /\$/],
  },
  T27: {
    expect: { odoo: 'mustNot' },
    adjust: 'Hoy es sabado: "fin de semana" es ambiguo (este o el siguiente); no se consulta Odoo hasta confirmar fechas.',
    must: [/301/, /cocina/],
  },
  T28: {
    expect: { odoo: 'mustNot' },
    adjust: 'Grupo de 9 sin fechas: no hay consulta posible; se escala la cotizacion de grupo y se piden las fechas.',
    must: [/cotizacion a la medida/, /fechas/],
  },
  T29: {
    expect: { odoo: 'mustNot' },
    adjust: 'Grupo de 13 sin fechas: no hay consulta posible; pasa a humano con resumen.',
    must: [/cotizacion a la medida/],
  },
  T30: {
    expect: { odoo: 'mustNot' },
    adjust: 'Grupo de 25 sin fechas: solo se valida capacidad multipropiedad con humano (capacidad verificada en Odoo = solo Atheron Suite, 22).',
    must: [/validar capacidad entre nuestras propiedades/],
    mustNot: [/si caben/, /caben sin problema/, /no hay problema/],
  },
  T31: {
    expect: { odoo: 'mustNot' },
    adjust: 'Sin fecha no se consulta Odoo; primero se pregunta por la cuna.',
    must: [/cuna/],
  },

  // ---- 12.5 mascotas ----
  T32: { expect: { esc: false }, must: [/depende de la propiedad/], mustNot: [/\$/] },
  T33: { seed: mem({ property: 'CC' }), must: [/no se admiten mascotas/, /apartamentos algarra/] },
  T34: { seed: reservation(PAID_AS), expect: { esc: true }, must: [/equipo/] },
  T35: {
    seed: mem({ property: 'CN' }),
    expect: { esc: true, odoo: 'mustNot' },
    adjust: 'Casa Neusa no esta mapeada en Odoo (UNIT_ID_MAP solo cubre Atheron Suite): no hay consulta posible, DATA_GAP + humano.',
    must: [/aprobacion previa/, /costo adicional/],
  },
  T36: { expect: { esc: true }, must: [/cargo de aseo/], mustNot: [/\$/] },

  // ---- 12.6 parqueadero ----
  T37: { seed: mem({ property: 'AS' }), must: [/carro o moto/] },
  T38: { seed: mem({ property: 'AS' }), before: ['¿Tienen parqueadero?'], must: [/2 cuadras y media/, /15\.000/] },
  T39: { seed: mem({ property: 'AS' }), before: ['¿Tienen parqueadero?'], expect: { esc: false }, must: [/moto/, /sin costo/, /mismo dia/] },
  T40: { seed: mem({ property: 'CA' }), must: [/2 vehiculos/] },
  T41: { seed: mem({ property: 'AA' }), expect: { esc: true }, must: [/altura/] },
  T42: { seed: mem({ property: 'AS' }), must: [/2 cuadras y media/], mustNot: [/catedral/] },

  // ---- 12.7 multiples noches ----
  T43: { expect: { odoo: 'must' }, must: [/5 noches/] },
  T44: { must: [/desde que fecha/] },
  T45: { seed: quote({ ...Q360, nights: 5 }), expect: { esc: true }, mustNot: [/\d+ ?%/] },
  T46: { seed: mem({ ...dates(SAT, 3), guests: 2, property: 'AS' }), expect: { odoo: 'must' } },

  // ---- 12.8 cambio de fechas / extension ----
  T47: {
    seed: reservation(PAID_AS),
    expect: { esc: false, odoo: 'must' },
    adjust: 'POLITICA OFICIAL CEO 2026-10-03 (CEO-03): cambio de reserva directa con mas de 48 h = se explica la politica y se revisa cupo; el Playbook decia ESC=Si.',
    must: [/domingo 4 de octubre/, /48 horas/],
  },
  T48: { seed: reservation({ ...PAID_AS, in_stay: true, checkOut: '2026-10-04' }), expect: { odoo: 'must' } },
  T49: { seed: mem({ property: 'AS' }), must: [/11:00/] },
  T50: { seed: mem({ property: 'AS' }), must: [/15:00/] },

  // ---- 12.9 precio y objeciones ----
  T51: { seed: TWO_OPTS, seedAmounts: [105000, 120000], must: [/compartido/, /105\.000/] },
  T52: { must: [/incluye/], mustNot: [/descuento/, /\d+ ?%/] },
  T53: { must: [/consultar/] },
  T54: { must: [/equipo/], mustNot: [/igualamos/, /te lo dejo/] },
  T55: { seed: mem({ property: 'AS' }), must: [/por habitacion/] },
  T56: { seed: mem({ ...dates(SAT, 1), guests: 2, property: 'AS' }), expect: { odoo: 'must', esc: false }, must: [/presupuesto/] },

  // ---- 12.10 anticipo y pago ----
  T57: {
    seed: quote(Q360),
    expect: { esc: false, odoo: 'mustNot' },
    adjust: 'DECISION CEO 2026-10-03: el anticipo oficial es 50 %. El Playbook v0.1 decia "escalar hasta definir regla" (DATA_GAP #2), ya resuelto. El total sale de la cotizacion de Odoo ya hecha en la conversacion; el agente solo aplica el 50 % y no vuelve a consultar.',
    must: [/50%/, /180\.000/, /360\.000/],
  },
  T58: { must: [/datos de pago oficiales/], mustNot: [/\d{6,}/] },
  T59: { must: [/5%/], mustNot: [/\d{6,}/] },
  T60: { input: { type: 'image', caption: 'Ya pagué' }, must: [/lo valido con el equipo/], mustNot: [/reserva confirmada/, /confirmada/] },
  T61: { seed: quote(Q360), expect: { esc: false }, must: [/asegura el cupo/], mustNot: [/te lo guardo/, /te la guardo/] },
  T62: { must: [/anticipo/] },

  // ---- 12.11 mensajes cortados ----
  T63: { must: [/fecha/], mustNot: [/cuantas personas/], flags: ['RAFAGA_AGRUPADA'] },
  T64: { seed: seq(mem({ guests: 2, property: 'AS' }), (s) => { s.greeted = true; }), expect: { odoo: 'must' } },
  T65: { labels: ['ORIGEN_WEB'], must: [/llegada/, /salida/, /huespedes/] },
  T66: { must: [/ej\./] },

  // ---- 12.12 audio ----
  T67: { expect: { odoo: 'must' }, must: [/entendi: 2 personas/] },
  T68: { expect: { esc: true }, must: [/escribes/] }, // CEO 2026-10-03: confianza insuficiente -> ESCALATE_HUMAN
  T69: {
    expect: { odoo: 'mustNot' },
    adjust: 'El audio pide precio pero no trae fecha ni personas: no hay consulta posible a Odoo; se responden parqueadero y check-in y se pide la fecha.',
    input: { type: 'audio', transcript: 'hola, cuánto cuesta la noche, tienen parqueadero y a qué hora es el check in', confidence: 0.9, duration_s: 45 },
    must: [/parqueadero/, /15:00/, /fecha/],
  },
  T70: {
    expect: { odoo: 'mustNot' },
    adjust: 'Idioma no soportado (DATA_GAP): se escala a humano en vez de consultar Odoo y responder en un idioma que el equipo aun no soporta.',
    must: [/team member/],
  },
  T71: { must: [/recepcion/] },

  // ---- 12.13 cliente molesto ----
  T72: { must: [/lamento/, /ya a una persona/], mustNot: [/\$/] },
  T73: { mustNot: [/confirmada/, /ya te confirmamos/] },
  T74: { must: [/operaciones/], mustNot: [/solucionado/, /ya lo arreglamos/] },
  T75: { mustNot: [/te devolvemos/, /reembolso (total|completo)/], must: [/no puedo confirmarte devoluciones/] },

  // ---- 12.14 humano ----
  T76: { must: [/persona del equipo/] },
  T77: { expect: { esc: false }, must: [/asistente/, /persona del equipo/] },
  T78: { must: [/llame/] },

  // ---- 12.15 dato desconocido ----
  T79: { seed: mem({ property: 'AS' }), must: [/no lo tengo confirmado/], mustNot: [/si incluye/, /incluye desayuno/] },
  T80: { seed: mem({ property: 'LM' }), mustNot: [/50 ?%/, /\$/], must: [/administracion/] },
  T81: {
    expect: { esc: false },
    adjust: 'POLITICA OFICIAL CEO 2026-10-03: ya existe politica de cancelacion de reservas directas (DATA_GAP #1 del Playbook resuelto); se responde con el texto oficial en vez de escalar.',
    must: [/48 horas/, /sin devolucion en efectivo|no hay devolucion en efectivo/, /6 meses/, /plataforma/],
  },
  T82: { seed: mem({ property: 'AS' }), must: [/facturacion electronica/] },

  // ---- 12.16 disponibilidad agotada ----
  T83: {
    odoo: { available: [] },
    expect: { esc: true },
    adjust: 'Las alternativas (Colonial/La Margarita) no se pueden consultar en Odoo (UNIT_ID_MAP solo Atheron Suite): sin cupo en Atheron Suite se escala a humano para revisar otras propiedades en vez de ofrecerlas sin verificar.',
    must: [/no tengo cupo/],
  },
  T84: { odoo: { available: [] }, must: [/lista de espera/] },
  T85: {
    seed: seq(mem({ ...dates(SAT, 1), guests: 3, property: 'AS' }), options([{ unit: '201', label: '201', capacity: 2, bath: 'compartido', total: 105000, nights: 1 }])),
    odoo: { available: ['201'] },
    expect: { esc: true },
    adjust: 'Sin otra habitacion que alcance en Atheron Suite y sin consulta posible a otras propiedades, se escala a humano (el Playbook decia ESC=No porque suponia alternativas en Odoo).',
    must: [/no alcanza/],
  },
  T86: { must: [/no te lo puedo asegurar/] },

  // ---- 12.17 OTA, llegada tarde, B2B, llamadas ----
  T87: {
    expect: { esc: false, odoo: 'mustNot' },
    adjust: 'Sin nombre ni fechas no se puede ubicar la reserva; ademas la sincronizacion OTA->Odoo es DATA_GAP #10. Se piden los datos y, si no aparece, escala.',
    must: [/a nombre de quien/],
  },
  T88: {
    seed: reservation({ property: 'AS', source: 'BOOKING', has_payment: true }),
    expect: { odoo: 'mustNot' },
    adjust: 'Responder el check-in de una reserva ya ubicada no requiere Odoo: es un dato fijo verificado de la propiedad.',
    must: [/15:00/],
  },
  T89: {
    seed: reservation({ property: 'AS', source: 'BOOKING', has_payment: true }),
    expect: { odoo: 'mustNot' },
    adjust: 'La cancelacion de una reserva OTA la decide un humano; el agente no necesita leer la reserva para escalarla (shadow no escribe ni decide).',
    mustNot: [/te devolvemos/, /reembolso/],
  },
  T90: { seed: reservation(PAID_AS), must: [/23:00/] },
  T91: { seed: reservation(PAID_AS), must: [/20:00/] },
  T92: { silent: true, labels: ['B2B_ALIADO'] },
  T93: { silent: true, labels: ['B2B_ALIADO'] },
  T94: { labels: ['ATHERON_SECURITY'], must: [/atheron security/], mustNot: [/\$/] },
  T95: { humanAvailable: false, must: [/vimos tu llamada/, /8:00/], flags: ['TAREA_CALLBACK'] },

  // ---- 12.18 contexto y memoria ----
  T96: { expect: { odoo: 'must' }, mustNot: [/para que fecha/, /cuantas personas/] },
  T97: { seed: mem({ ...dates(SAT, 1), guests: 4, property: 'AS' }), must: [/carro o moto/], mustNot: [/fecha/] },
  T98: { seed: seq(mem({ ...dates('2026-10-03', 1), guests: 2, property: 'AS' }), TWO_OPTS), expect: { odoo: 'must' }, must: [/sabado 10 de octubre/] },
  T99: { seed: quote(Q360), seedAmounts: [360000], must: [/360\.000/, /3 noches/, /2 personas/] },
  T100: { must: [/sin problema/], maxLines: 1 },
};
