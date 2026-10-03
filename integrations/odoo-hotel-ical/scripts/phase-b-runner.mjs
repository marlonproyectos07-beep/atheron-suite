/** Demo finita y reproducible: solo fixtures locales, sin transporte de red. */
import { fixtureSystem, cal } from '../test/phase-b-fixtures.mjs';

const intervalMs = Number(process.env.PHASE_B_LOCAL_INTERVAL_MS ?? 100);
const cycles = Number(process.env.PHASE_B_LOCAL_CYCLES ?? 3);
if (!Number.isInteger(intervalMs) || intervalMs < 1 || !Number.isInteger(cycles) || cycles < 1 || cycles > 100) {
  throw new Error('INVALID_LOCAL_RUNNER_OPTIONS');
}

const fixture = fixtureSystem();
fixture.feeds.set('booking:AHS-201', cal({ uid: 'LOCAL-BOOKING-201' }));
const runner = fixture.createRunner({ jobs: [{ source: 'booking', unit: 'AHS-201' }],
  outboundTargets: [{ source: 'airbnb', unit: 'AHS-CASA' }], intervalMs });

for (let cycle = 1; cycle <= cycles; cycle += 1) {
  if (cycle === 2) fixture.feeds.set('booking:AHS-201', cal());
  const result = await runner.tick();
  process.stdout.write(`${JSON.stringify({ cycle, status: result.status,
    odoo_blocks: fixture.blocks.size,
    casa_blocked_in_airbnb_fixture: (fixture.otaBlocks.get('airbnb:AHS-CASA') ?? []).length > 0,
    pending_batches: fixture.journal.list('booking:AHS-201').length,
    alerts: fixture.alerts.map((alert) => alert.code) })}\n`);
  if (cycle < cycles) await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
