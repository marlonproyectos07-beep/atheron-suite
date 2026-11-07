import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceInquiry, previewAvailability } from '../src/whatsapp-pilot-shadow.mjs';
const today = '2026-11-07';
const step = (message, id='wamid.TEST01', previous=null, accountId=7) => advanceInquiry({ message, messageId:id, accountId, today, previous });
test('saluda y solicita datos que faltan (sin enviar)', () => {
  const r = step('Hola, tienen una habitación?');
  assert.equal(r.kind, 'needs_details'); assert.equal(r.missing.length,3);
  assert.equal(r.sendEnabled,false);
});
test('varios turnos reúnen fechas y personas; consulta 5 IDs, no Casa ni Carrera 19', () => {
  let r=step('Hola, somos 2 personas','wamid.TEST01');
  assert.deepEqual(r.missing,['fecha de llegada (AAAA-MM-DD)','fecha de salida (AAAA-MM-DD)']);
  r=step('Del 2026-11-09 al 2026-11-11','wamid.TEST02',r.state);
  assert.equal(r.kind,'lookup_ready'); assert.equal(r.readOnlyRequest.guests,2);
  assert.deepEqual(r.readOnlyRequest.apartmentIds,[3557506,3557511,3557516,3557521,3557526]); assert.equal(r.sendEnabled,false);
});
test('fecha relativa mañana y noche; no confirma reserva', () => {
  const r=step('Para mañana 1 noche y 2 personas');
  assert.equal(r.kind,'lookup_ready'); assert.deepEqual([r.state.arrival,r.state.departure],['2026-11-08','2026-11-09']);
  assert.equal(r.readOnlyRequest.guests,2);
});
test('duplicados jamás generan dos propuestas', () => {
  const r=step('2 personas', 'wamid.TEST01');
  const duplicate=step('2 personas','wamid.TEST01',r.state);
  assert.equal(duplicate.kind,'duplicate');
});
test('otras cuentas y otras propiedades se rechazan', () => {
  assert.equal(step('hola','wamid.TEST01',null,5).code,'NOT_HOTELS_ACCOUNT');
  assert.equal(step('quiero casa completa').kind,'handoff');
  assert.equal(step('hotel colonial').reason,'OUT_OF_SCOPE');
});
test('fechas invalidadas: ambiguas, pasadas, nocturnidad cero', () => {
  assert.equal(step('del 2026-11-02 al 2026-11-03 para 2 personas').reason,'PAST_OR_ZERO_STAY');
  assert.equal(step('del 2026-11-08 al 2026-11-08 para 2 personas').reason,'INVALID_STAY');
  assert.equal(step('para mañana el 2026-11-09').reason,'AMBIGUOUS_OR_INVALID_DATA');
  assert.equal(step('del 2026-11-08 al 2026-12-20 para 2 personas').reason,'INVALID_STAY');
});
test('mock Smoobu crea borrador, jamás cita tarifa como precio final ni envía', () => {
  const r=step('Del 2026-11-09 al 2026-11-10 para 2 personas');
  const p=previewAvailability({inquiry:r,rates:{'3557506':{'2026-11-09':{available:1,price:98000,min_length_of_stay:1}},
    '3557511':{'2026-11-09':{available:0,price:90000,min_length_of_stay:1}}}});
  assert.equal(p.kind,'review_required');
  assert.deepEqual(p.candidates.map(x=>x.room),['201']);
  assert.equal(p.sendEnabled,false);assert.equal(p.bookingEnabled,false);assert.equal(p.odooWriteEnabled,false);
  assert.ok(!p.draft.includes('98000'));
  assert.ok(p.unresolved.length>=4);
});
test('falta de disponibilidad real impide anunciar habitaciones', () => {
  const r=step('Del 2026-11-09 al 2026-11-10 para 2 personas');
  const p=previewAvailability({inquiry:r,rates:{}});
  assert.deepEqual(p.candidates,[]);assert.match(p.draft,/No podemos confirmar/);
});
