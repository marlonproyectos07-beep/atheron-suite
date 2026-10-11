/**
 * Datos SINTÉTICOS con la forma de la API v2 de Beds24 para el caso piloto ATH-STAY-MEDICO-OCT2026-001.
 * No son reservas reales: ids 9xxxxx inventados. Los roomId sí son los reales documentados en la 031.
 */
export const STAY = 'ATH-STAY-MEDICO-OCT2026-001';
const base = { propertyId: 359051, status: 'confirmed', channel: '', numAdult: 1, numChild: 0, firstName: 'Dr. Piloto', lastName: 'Sintético' };

export const rawMedico = () => [
  { ...base, id: 900001, roomId: 740218, arrival: '2026-10-11', departure: '2026-10-17', notes: `${STAY} tramo 1`,
    invoiceItems: [{ id: 1, type: 'charge', description: '6 noches', qty: 6, amount: 55000 }, { id: 2, type: 'payment', description: 'abono 1', qty: 1, amount: 577500 }] },
  { ...base, id: 900002, roomId: 740220, arrival: '2026-10-18', departure: '2026-11-01', apiReference: STAY,
    invoiceItems: [{ id: 3, type: 'charge', description: '14 noches', qty: 14, amount: 55000 }] },
];

export const registryMedico = () => [{
  ref: STAY, guest: 'Dr. Piloto Sintético', source: 'DIRECT',
  commercial: { nights: 21, nightly_rate: 55000, total_sale: 1155000, currency: 'COP' },
  members: [
    { kind: 'BEDS24', bookingId: '900001' },
    { kind: 'EXTERNAL', label: 'Otra propiedad', checkin: '2026-10-17', checkout: '2026-10-18', charge: 55000 },
    { kind: 'BEDS24', bookingId: '900002' },
  ],
  payment_plan: [{ seq: 1, amount: 577500, due_date: null }, { seq: 2, amount: 577500, due_date: '2026-10-19' }],
}];

/** Libro de pagos confirmados (Odoo account.payment state=paid). Vacío = nada confirmado aún. */
export const ledgerFirstPaid = () => [{ id: 'ODOO-PAY-1', ref: STAY, amount: 577500, beds24PaymentId: '900001:2' }];

export function otherBookings() {
  return [
    { ...base, id: 900101, roomId: 740215, firstName: 'Ana', lastName: 'Booking', channel: 'booking', arrival: '2026-10-11', departure: '2026-10-14', price: 300000 },
    { ...base, id: 900102, roomId: 740217, firstName: 'Luis', lastName: 'Airbnb', channel: 'airbnb', arrival: '2026-10-10', departure: '2026-10-13', price: 250000 },
    { ...base, id: 900103, roomId: 740219, firstName: 'Marta', lastName: 'Directa', arrival: '2026-10-12', departure: '2026-10-13', price: 100000, notes: 'HOLD hasta 2026-10-12 18:00' },
    { ...base, id: 900104, roomId: 740219, firstName: '', lastName: '', status: 'black', arrival: '2026-10-20', departure: '2026-10-22', notes: 'mantenimiento' },
  ];
}
