import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOMS, renderRefresh, renderWrapper, fingerprint } from '../src/hotel017-outbound.mjs';
import { patchActionCode, sha256 } from '../src/ota-adoption-action-code.mjs';

const BASE_1967 = readFileSync(new URL('../odoo-patches/hotel-017/action-1967-base-9b053e02.py', import.meta.url), 'utf8');

for (const [number, room] of Object.entries(ROOMS)) {
  test(`salida ${room.canonical}: el codigo reproducido coincide con el desplegado en Odoo`, () => {
    const code = renderRefresh(number);
    assert.equal(fingerprint(code), room.deployedSha16, `hash distinto para ${room.canonical}`);
  });
}

test('203 y 301 filtran: fin >= hoy, externos/derivados/NOBEDS fuera, Casa solo con pedido', () => {
  for (const number of ['203', '301']) {
    const code = renderRefresh(number);
    assert.match(code, /s\.end_datetime\.date\(\) >= today_utc/);
    assert.match(code, /s\.x_hotel_block_kind not in \('external', 'derived'\)/);
    assert.match(code, /not s\.x_nobeds_id/);
    assert.match(code, /s\.x_hotel_order_id and s\.x_hotel_order_id\.state != 'cancel'/);
    assert.doesNotMatch(code, /\bdel\s/m, 'Odoo rechaza `del` en codigo de accion');
  }
});

test('202, 201 y 302 mantienen el codigo sin filtro de fecha (residual documentado)', () => {
  for (const number of ['201', '202', '302']) {
    assert.doesNotMatch(renderRefresh(number), /today_utc/);
  }
});

test('301 excluye exactamente 40159 y 40161 por ID y solo en 301', () => {
  assert.match(renderRefresh('301'), /and s\.id not in \(40159, 40161\)/);
  assert.doesNotMatch(renderRefresh('203'), /s\.id not in/);
});

test('SUMMARY neutro y sin PII en todas las salidas', () => {
  for (const number of Object.keys(ROOMS)) {
    const code = renderRefresh(number);
    assert.match(code, /SUMMARY_PUBLIC = 'ODOO - Not available'/);
    // Solo se admite el dominio tecnico de los UID de salida; ningun correo personal ni URL.
    assert.doesNotMatch(code, /https?:\/\/|[\w.+-]+@(?!atheron1\.odoo\.com)/);
  }
});

test('envoltorio apunta a la accion de refresco del mismo numero', () => {
  assert.equal(renderWrapper(1985), "env['ir.actions.server'].browse(1985).run()");
});

test('accion 1967 reproducible desde la base versionada con el hash instalado (c0b1eb15)', () => {
  const code = patchActionCode(BASE_1967);
  assert.equal(sha256(BASE_1967), '9b053e02f123bc8879192e7758367fae1146ab4b0510567c06567f5a05785e25');
  assert.equal(sha256(code).slice(0, 8), 'c0b1eb15');
});
