/**
 * GOAL-WHATSAPP-AGENT-001 -- politica y conocimiento verificado del agente.
 *
 * Todo lo que el agente puede afirmar sobre una propiedad sale de aqui y
 * trae su fuente (Playbook v0.1 seccion 5: W = web publica, C = chat real,
 * P = plantilla del negocio, ODOO = verificado contra Odoo STAGING). Lo que
 * no esta aqui es DATA_GAP: el agente dice "lo confirmo" y escala; nunca
 * rellena. Las tarifas NO viven aqui: salen siempre de Odoo.
 */

export const POLICY = Object.freeze({
  mode: 'SHADOW',
  /** Decision CEO 2026-10-03: anticipo oficial de reservas directas. El 30 % que aun pueda tener Odoo es configuracion anterior. */
  deposit: Object.freeze({ percent: 50, source: 'CEO_DECISION_2026-10-03', legacy_odoo_percent: 30 }),
  card_surcharge_percent: 5, // plantilla de pago oficial (Playbook s4 punto 9)
  group: Object.freeze({ human_from: 11, strategic_from: 100 }),
  languages_supported: Object.freeze(['es']),
  default_property: 'AS', // la linea de WhatsApp es la de Hotel Atheron Suite (Playbook s5.1, T02)
  /**
   * Cancelacion de reservas DIRECTAS: politica oficial (AI/whatsapp/CEO_CASES_V1.md).
   * >= 48 h antes del check-in: se explica; < 48 h, no-show, OTA o sin datos verificables: humano.
   */
  cancellation: Object.freeze({
    source: 'CEO_CASES_V1 (Control Maestro 2026-10-03)',
    notice_hours: 48, // "hasta 48 horas antes del check-in": politica; menos de 48 h = humano
    credit_months: 6,
    cash_refund: false,
    ota_first: true, // Booking/Airbnb/OTA: rigen primero las condiciones de la plataforma
  }),
  automation_mode: 'shadow', // WHATSAPP_AUTOMATION_MODE
  odoo_staging_live_validation: 'PENDING_EXTERNAL_AUTHENTICATED_TEST',
  human_hours_observed: '08:00-22:00', // DATA_GAP #17: solo observado, no oficial
});

/** Orden de nombres que el agente usa al hablar. */
export const PROPERTIES = Object.freeze({
  AS: {
    key: 'AS',
    name: 'Hotel Atheron Suite',
    short: 'Atheron Suite',
    odoo_mapped: true, // UNIT_ID_MAP solo cubre Atheron Suite
    checkin: '15:00',
    checkout: '11:00',
    hours_source: 'W+C',
    address: 'Cra. 9 #10-32, centro de Zipaquirá',
    distance_catedral: 'a unos 1,4 km, unos 16 min a pie',
    adults_only: false,
    price_basis: 'por habitación, según cuántas personas',
    includes: 'aseo, ropa de cama y WiFi',
    parking: { own: false, ally: 'un parqueadero aliado a unas 2 cuadras y media', car: 'unos $15.000 la noche', moto: 'sin costo, sujeta a cupo' },
    pets: 'BAJO_CONSULTA',
    capacity_odoo: { 201: 2, 202: 4, 203: 4, 301: 7, 302: 3, CASA_COMPLETA: 22 }, // HOTEL-009 Gate 009-A (verificado en vivo)
  },
  CA: {
    key: 'CA',
    name: 'Casa Algarra',
    short: 'Casa Algarra',
    odoo_mapped: false,
    checkin: null,
    checkout: null,
    address: null,
    adults_only: false,
    parking: { own: true, text: 'parqueadero para 2 vehículos incluido' },
    pets: null,
    capacity_web: 22,
  },
  CN: {
    key: 'CN',
    name: 'Casa Neusa',
    short: 'Casa Neusa',
    odoo_mapped: false,
    checkin: '15:00',
    checkout: '11:00',
    checkin_note: 'de 15:00 a 21:00',
    checkout_note: 'antes de las 11:00',
    hours_source: 'W',
    address: null,
    adults_only: false,
    parking: { own: true, text: 'parqueadero gratuito' },
    pets: 'APROBACION_Y_COSTO',
    capacity_web: 8,
  },
  AA: {
    key: 'AA',
    name: 'Apartamentos en Algarra',
    short: 'Apartamentos Algarra',
    odoo_mapped: false,
    checkin: '15:00',
    checkout: '11:00',
    checkin_note: 'de 15:00 a 17:00',
    checkout_note: 'antes de las 11:00',
    hours_source: 'W',
    address: null,
    adults_only: false,
    parking: { own: true, text: 'parqueadero cubierto (2 carros y 3 motos), $20.000 la noche el carro y $10.000 la moto; hay que reservarlo antes' },
    pets: 'BIENVENIDAS_CARGO_ASEO',
    capacity_web: 41,
  },
  CC: {
    key: 'CC',
    name: 'Hotel Colonial Confort',
    short: 'Colonial Confort',
    odoo_mapped: false,
    checkin: '18:00',
    checkout: '10:00',
    checkin_note: 'desde las 18:00',
    checkout_note: 'hasta las 10:00',
    hours_source: 'W',
    extra_hour: '$10.000 la hora, con coordinación',
    address: null,
    adults_only: true,
    price_basis: 'por adulto',
    parking: { own: false, ally: 'un lote externo a 2 cuadras y media' },
    pets: 'NO',
    capacity_web: 28,
  },
  LM: {
    key: 'LM',
    name: 'Hotel La Margarita',
    short: 'La Margarita',
    odoo_mapped: false,
    checkin: null,
    checkout: null,
    address: null, // dos versiones en las fuentes: DATA_GAP #7
    adults_only: false,
    price_basis: 'por persona (según la web)',
    parking: null,
    pets: null,
    capacity_web: 40,
  },
});

/** Propiedad no reservable: el agente jamas la ofrece ni la cotiza. */
export const NOT_BOOKABLE = Object.freeze(['Casa Colonial Centro']);

/** Habitaciones de Atheron Suite con su baño (ficha W). */
export const AS_ROOMS = Object.freeze({
  201: { bath: 'compartido', capacity: 2 },
  202: { bath: 'compartido', capacity: 4 },
  203: { bath: 'privado', capacity: 4 },
  301: { bath: 'privado', capacity: 7 },
  302: { bath: 'privado', capacity: 3 },
});

/** Capacidad VERIFICADA contra Odoo (unica fuente aceptada para prometer cupo). */
export const VERIFIED_ODOO_CAPACITY = Object.freeze({
  properties: ['AS'],
  casa_completa_AS: 22,
  rooms_AS: 5,
  unit_ids_without_capacity: Object.freeze({ 7: 'CASA COMPLETA ALGARRA', 8: 'CASA COMPLETA NEUSA' }),
});
