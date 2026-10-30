import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAllowedId, summarizeReservation, ALLOWED_RESERVATION_IDS } from '../src/reservation-probe.mjs';

// reserva SINTETICA con la forma de la API publica de Smoobu y datos personales inventados
const sample = {
  id: 160829171, 'reference-id': '5046108535', type: 'reservation', arrival: '2027-01-04', departure: '2027-01-05',
  'created-at': '2026-10-20 15:40', modifiedAt: '2026-10-20 15:41', apartment: { id: 3557521, name: 'UNIDAD_PRIVADA' },
  channel: { id: 7208046, name: 'Booking.com' }, 'is-blocked-booking': false, adults: 2, children: 0,
  'guest-name': 'NOMBRE_PRIVADO', firstname: 'NOMBRE', lastname: 'PRIVADO', email: 'privado@example.invalid', phone: '+57 300 000 0000',
  address: { street: 'CALLE PRIVADA 1' }, notice: 'NOTA PRIVADA 1014198033', price: 80000, 'guest-app-url': 'https://privado.invalid/x',
  status: 'overbooking', 'is-overbooking': true, 'cancellation-reason': 'TEXTO LARGO DE MOTIVO QUE PODRIA TENER DATOS PERSONALES 1014198033',
};

test('lista blanca: solo ids permitidos y con formato numerico', () => {
  assert.deepEqual(parseAllowedId('160829171'), { ok: true, id: 160829171 });
  assert.equal(parseAllowedId('160827596').code, 'RESERVATION_ID_NOT_ALLOWED');
  assert.equal(parseAllowedId('160829171; rm -rf /').code, 'RESERVATION_ID_INVALID');
  assert.equal(parseAllowedId('').code, 'RESERVATION_ID_INVALID');
  assert.deepEqual([...ALLOWED_RESERVATION_IDS], [160829171]);
});

test('resumen: campos tecnicos y de estado visibles; id y referencia OTA enmascarados', () => {
  const s = summarizeReservation(sample);
  assert.equal(s.smoobuRef, 'SM*...9171'); assert.equal(s.otaRef, 'OTA*...8535'); assert.equal(s.hasOtaRef, true);
  assert.deepEqual([s.apartmentId, s.channelId, s.channelName], [3557521, 7208046, 'Booking.com']);
  assert.deepEqual(s.technical, { type: 'reservation', arrival: '2027-01-04', departure: '2027-01-05', 'created-at': '2026-10-20 15:40', modifiedAt: '2026-10-20 15:41', 'is-blocked-booking': false, adults: 2, children: 0 });
  assert.equal(s.statusLikeFields.status, 'overbooking'); assert.equal(s.statusLikeFields['is-overbooking'], true);
  assert.equal(s.statusLikeFields['cancellation-reason'], '<string>');
  assert.ok(s.fieldNames.includes('guest-name') && s.fieldNames.includes('email'), 'los nombres de campo si se listan');
});

test('resumen: nunca valores personales, notas, precios, enlaces ni numeros largos', () => {
  const text = JSON.stringify(summarizeReservation(sample));
  for (const banned of ['PRIVADO', 'privado@', '+57', 'CALLE', 'NOTA', '1014198033', '80000', 'https://', '160829171', '5046108535', 'TEXTO LARGO']) assert.ok(!text.includes(banned), banned);
});

test('script y workflow: una sola lectura, id por entorno, barrera de privacidad y sin escrituras', () => {
  const src = readFileSync(new URL('../scripts/smoobu-reservation-once.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('parseAllowedId(process.env.RESERVATION_ID)') && src.includes('assertPublicSafe(') && src.includes('getReservation(parsed.id)'));
  assert.equal((src.match(/client\.\w+\(/g) || []).length, 1, 'una sola llamada al cliente');
  assert.ok(!/odoo/i.test(src.replace(/sin Odoo/g, '')), 'no usa Odoo');
  const wf = readFileSync(new URL('../../../.github/workflows/smoobu-odoo-diagnose.yml', import.meta.url), 'utf8');
  assert.ok(wf.includes('RESERVATION_ID: ${{ inputs.reservation_id }}') && wf.includes('run: npm run --silent smoobu-reservation-once'));
  assert.ok(!/run:.*inputs\.reservation_id/.test(wf));
});
