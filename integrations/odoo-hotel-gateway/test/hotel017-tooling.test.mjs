import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveRoom, resolveFeed, assertStagingOnly, parseMode, redact,
  summarizeImport, isIdempotentReplay, STAGING_DATABASE, STAGING_BASE_URL,
} from '../src/hotel017-tooling.mjs';
import { inventoryRoom } from '../scripts/hotel017-room-inventory.mjs';

test('DRY-RUN por defecto: sin flags no hay escritura', () => {
  assert.deepEqual(parseMode([]), { mode: 'DRY_RUN', write: false });
  assert.deepEqual(parseMode(['--unit', '203']), { mode: 'DRY_RUN', write: false });
});

test('escritura exige --write y --confirm-staging explicitos', () => {
  assert.throws(() => parseMode(['--write']), /WRITE_REQUIRES_CONFIRM_STAGING/);
  assert.deepEqual(parseMode(['--write', '--confirm-staging']), { mode: 'WRITE', write: true });
});

test('la herramienta de inventario rechaza --write antes de tocar credenciales', async () => {
  await assert.rejects(inventoryRoom(['--unit', '203', '--write', '--confirm-staging'], {}), /READ_ONLY_TOOL/);
});

test('resolucion de habitacion: numero, AHS-, o unidad Odoo; desconocida falla', () => {
  assert.equal(resolveRoom('203').canonical, 'AHS-203');
  assert.equal(resolveRoom('AHS-301').odooUnit, 4);
  assert.equal(resolveRoom('3').number, '203');
  assert.equal(resolveRoom('5').canonical, 'AHS-302');
  assert.throws(() => resolveRoom('999'), /ROOM_UNKNOWN/);
  assert.throws(() => resolveRoom(''), /ROOM_UNKNOWN/);
});

test('resolucion de feed: exactamente uno por canonico y fuente', () => {
  const feeds = [
    { id: 4, x_canonical_unit_id: 'AHS-202', x_source: 'booking' },
    { id: 5, x_canonical_unit_id: 'AHS-203', x_source: 'booking' },
    { id: 2, x_canonical_unit_id: 'AHS-302', x_source: 'airbnb' },
    { id: 9, x_canonical_unit_id: 'AHS-302', x_source: 'airbnb' },
  ];
  assert.equal(resolveFeed(feeds, { canonical: 'AHS-203', source: 'booking' }).id, 5);
  assert.throws(() => resolveFeed(feeds, { canonical: 'AHS-201', source: 'booking' }), /FEED_NOT_UNIQUE/);
  assert.throws(() => resolveFeed(feeds, { canonical: 'AHS-302', source: 'airbnb' }), /FEED_NOT_UNIQUE/);
});

test('rechaza Production y cualquier destino distinto de STAGING', () => {
  assert.doesNotThrow(() => assertStagingOnly({ database: STAGING_DATABASE, baseUrl: STAGING_BASE_URL }));
  assert.throws(() => assertStagingOnly({ database: 'atheron1-production', baseUrl: 'https://atheron1.odoo.com' }), /STAGING_ONLY/);
  assert.throws(() => assertStagingOnly({ database: STAGING_DATABASE, baseUrl: 'https://atheron1.odoo.com' }), /STAGING_ONLY/);
  assert.throws(() => assertStagingOnly({ database: 'otra-base', baseUrl: STAGING_BASE_URL }), /STAGING_ONLY/);
});

test('salida sin secretos: URLs, correos personales, tokens y valores conocidos se eliminan', () => {
  const raw = 'fallo en https://ical.booking.com/export?x=1 para juan.perez@gmail.com token=abc123 valor SUPER-SECRETO-99';
  const out = redact(raw, ['SUPER-SECRETO-99']);
  assert.doesNotMatch(out, /https?:\/\//);
  assert.doesNotMatch(out, /juan\.perez@gmail\.com/);
  assert.doesNotMatch(out, /abc123/);
  assert.doesNotMatch(out, /SUPER-SECRETO-99/);
});

test('el dominio tecnico de UID de Atheron no se considera correo personal', () => {
  assert.equal(redact('slot-1-r30@atheron1.odoo.com'), 'slot-1-r30@atheron1.odoo.com');
});

test('replay idempotente: CREATED 0, CONFLICT 0 y existentes como DUPLICATE', () => {
  const replay = { results: [{ status: 'OK', counts: { APPLIED: 0, DUPLICATE: 6, CONFLICT: 0 } }] };
  const s = summarizeImport(replay);
  assert.deepEqual(s, { status: 'OK', created: 0, duplicate: 6, conflict: 0 });
  assert.equal(isIdempotentReplay(s), true);
});

test('replay no idempotente cuando crea o hay conflicto, o no hay duplicados', () => {
  assert.equal(isIdempotentReplay({ created: 1, duplicate: 5, conflict: 0 }), false);
  assert.equal(isIdempotentReplay({ created: 0, duplicate: 5, conflict: 1 }), false);
  assert.equal(isIdempotentReplay({ created: 0, duplicate: 0, conflict: 0 }), false);
});

test('el codigo de la herramienta no contiene URLs de iCal ni rutas privadas', () => {
  const src = readFileSync(new URL('../scripts/hotel017-room-inventory.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /https?:\/\//);
  assert.doesNotMatch(src, /\/calendar\/ical/);
});
