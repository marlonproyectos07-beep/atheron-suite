import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureSystem, cal } from './phase-b-fixtures.mjs';

const booking201 = { source: 'booking', unit: 'AHS-201' };
const airbnbCasa = { source: 'airbnb', unit: 'AHS-CASA' };

for (const source of ['booking', 'airbnb']) {
  test(`${source} caido: P1 ADAPTER_DOWN, sin liberar ni inventar disponibilidad`, async () => {
    const f = fixtureSystem();
    f.down[source] = true;
    const unit = source === 'booking' ? 'AHS-201' : 'AHS-CASA';
    const runner = f.createRunner({ jobs: [{ source, unit }] });
    const result = await runner.tick();
    assert.equal(result.status, 'DEGRADED');
    assert.equal(f.blocks.size, 0);
    assert.equal(runner.health().adapter_health[source], 'DOWN');
    assert.ok(f.alerts.some((alert) => alert.severity === 'P1' && alert.code === 'ADAPTER_DOWN'));
  });
}

test('iCal corrupto se rechaza sin borrar bloqueo existente', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1' }));
  const runner = f.createRunner({ jobs: [booking201] });
  await runner.tick();
  f.feeds.set('booking:AHS-201', 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:broken');
  const result = await runner.tick();
  assert.equal(result.status, 'DEGRADED');
  assert.equal(f.blocks.size, 1);
  assert.equal(f.writes.filter(([op]) => op === 'release').length, 0);
});

test('VEVENT sin cierre dentro de VCALENDAR no se interpreta como feed vacio', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1' }));
  const runner = f.createRunner({ jobs: [booking201] });
  await runner.tick();
  f.feeds.set('booking:AHS-201', ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:b-1',
    'DTSTART;VALUE=DATE:20270110', 'DTEND;VALUE=DATE:20270112', 'END:VCALENDAR'].join('\r\n'));
  assert.equal((await runner.tick()).status, 'DEGRADED');
  assert.equal(f.blocks.size, 1);
});

test('mismo UID con fechas contradictorias en un feed se rechaza sin escritura', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1' },
    { uid: 'b-1', start: '20270115', end: '20270116' }));
  const runner = f.createRunner({ jobs: [booking201] });
  const result = await runner.tick();
  assert.equal(result.status, 'DEGRADED');
  assert.equal(result.inbound[0].error, 'CONFLICTING_DUPLICATE_UID');
  assert.equal(f.blocks.size, 0);
});

test('rechazo atomico del puerto Odoo escala como CRITICAL', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1' }));
  f.odoo.applyBlock = async () => { throw Object.assign(new Error('CONFLICT'), { code: 'CONFLICT' }); };
  const runner = f.createRunner({ jobs: [booking201] });
  const result = await runner.tick();
  assert.equal(result.status, 'DEGRADED');
  assert.equal(f.blocks.size, 0);
  assert.equal(runner.health().conflict_count, 1);
  assert.ok(f.alerts.some((alert) => alert.severity === 'CRITICAL' && alert.code === 'UNCLASSIFIED_CONFLICT'));
});

test('evento duplicado dentro del feed y replay no crean doble bloqueo', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1' }, { uid: 'b-1' }));
  const runner = f.createRunner({ jobs: [booking201] });
  await runner.tick();
  await runner.tick();
  assert.equal(f.blocks.size, 1);
  assert.equal(f.writes.filter(([op]) => op === 'apply').length, 1);
});

test('evento fuera de orden se pone en cuarentena y no revierte fechas', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1', start: '20270115', end: '20270116',
    updated: '20270102T000000Z' }));
  const runner = f.createRunner({ jobs: [booking201] });
  await runner.tick();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1', start: '20270110', end: '20270112',
    updated: '20270101T000000Z' }));
  const result = await runner.tick();
  assert.equal(result.status, 'DEGRADED');
  assert.equal([...f.blocks.values()][0].check_in, '2027-01-15');
  assert.equal(f.journal.quarantined().at(-1).reason, 'STALE_EVENT');
  assert.equal(runner.health().stale_event_count, 1);
});

test('cancelacion tardia con version vieja no libera el bloqueo', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1', updated: '20270102T000000Z' }));
  const runner = f.createRunner({ jobs: [booking201] });
  await runner.tick();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1', status: 'CANCELLED', updated: '20270101T000000Z' }));
  const result = await runner.tick();
  assert.equal(result.status, 'DEGRADED');
  assert.equal(f.blocks.size, 1);
  assert.equal(f.writes.filter(([op]) => op === 'release').length, 0);
});

test('release duplicado libera una sola vez', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1', updated: '20270101T000000Z' }));
  const runner = f.createRunner({ jobs: [booking201] });
  await runner.tick();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1', status: 'CANCELLED', updated: '20270102T000000Z' }));
  await runner.tick();
  await runner.tick();
  assert.equal(f.blocks.size, 0);
  assert.equal(f.writes.filter(([op]) => op === 'release').length, 1);
});

test('reinicio del runner conserva snapshot/journal y replay no duplica', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1' }));
  await f.createRunner({ jobs: [booking201] }).tick();
  await f.createRunner({ jobs: [booking201] }).tick();
  assert.equal(f.blocks.size, 1);
  assert.equal(f.writes.filter(([op]) => op === 'apply').length, 1);
});

test('fallo despues de aplicar en Odoo: siguiente ciclo reconstruye salida sin doble apply', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1' }));
  f.failOutboundOnce.airbnb = true;
  const runner = f.createRunner({ jobs: [booking201], outboundTargets: [airbnbCasa] });
  assert.equal((await runner.tick()).status, 'DEGRADED');
  assert.equal(f.blocks.size, 1);
  assert.equal(f.otaBlocks.has('airbnb:AHS-CASA'), false);
  assert.equal((await runner.tick()).status, 'OK');
  assert.deepEqual(f.otaBlocks.get('airbnb:AHS-CASA'), [{ start: '2027-01-10', end: '2027-01-12' }]);
  assert.equal(f.writes.filter(([op]) => op === 'apply').length, 1);
});

test('Odoo temporalmente caido: lote tecnico queda pendiente y se recupera sin duplicar', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-1' }));
  f.down.odoo = true;
  const runner = f.createRunner({ jobs: [booking201] });
  assert.equal((await runner.tick()).status, 'DEGRADED');
  assert.equal(f.journal.list('booking:AHS-201').length, 1);
  assert.equal(f.blocks.size, 0);
  assert.equal(runner.health().adapter_health.odoo, 'DOWN');
  assert.ok(f.alerts.some((alert) => alert.code === 'SYNC_BACKEND_DOWN'));
  f.down.odoo = false;
  assert.equal((await runner.tick()).status, 'OK');
  assert.equal(f.journal.list('booking:AHS-201').length, 0);
  assert.equal(f.blocks.size, 1);
  assert.equal(f.writes.filter(([op]) => op === 'apply').length, 1);
});

test('salud: sync_lag_seconds refleja frescura local y P1 tras caida', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal());
  const runner = f.createRunner({ jobs: [booking201], staleAfterSeconds: 300 });
  await runner.tick();
  f.setNow('2027-01-01T00:10:00Z');
  f.down.booking = true;
  await runner.tick();
  assert.equal(runner.health().sync_lag_seconds['booking:AHS-201'], 600);
  assert.equal(runner.health().adapter_health.booking, 'DOWN');
  assert.ok(f.alerts.some((alert) => alert.code === 'SYNC_STALE' && alert.severity === 'P1'));
});
