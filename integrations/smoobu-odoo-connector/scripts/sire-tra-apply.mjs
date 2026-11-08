#!/usr/bin/env node
// ATH-HOTELS-SIRE-TRA-001 · Aplica el manifiesto en Odoo por JSON-2.
// Por defecto SIMULA. --apply escribe. --rollback revierte (simula sin --apply).
// Destino por defecto: copia de pruebas (ODOO_TEST_BASE_URL, ODOO_TEST_DATABASE, ODOO_TEST_API_KEY) con aislamiento verificado.
// --production exige ATH_DEPLOY_PRODUCTION=si-aprobado-por-marlon y ATH_PRODUCTION_BACKUP_CONFIRMED=yes (NO se usa en esta mision).
import { applyManifest, checkIsolation, rollbackManifest } from '../src/sire-tra/applier.mjs';
import { assertProductionTarget, assertTestTarget } from '../src/sire-tra/guard.mjs';
import { ApplierRpc } from '../src/sire-tra/odoo-rpc-node.mjs';

const has = (f) => process.argv.includes(f);
const apply = has('--apply');
try {
  const target = has('--production') ? assertProductionTarget() : assertTestTarget();
  if (target.kind === 'production' && apply && process.env.ATH_PRODUCTION_BACKUP_CONFIRMED !== 'yes') throw Object.assign(new Error('x'), { code: 'PRODUCTION_BACKUP_NOT_CONFIRMED' });
  const odoo = new ApplierRpc(target);
  if (target.kind === 'test') {
    const iso = await checkIsolation(odoo);
    console.error(JSON.stringify({ event: 'isolation', isolated: iso.isolated, checks: iso.checks }));
    if (!iso.isolated) { console.log(JSON.stringify({ ok: false, code: 'TEST_COPY_NOT_ISOLATED' })); process.exit(2); }
  }
  const log = (e) => console.error(JSON.stringify(e));
  const out = has('--rollback') ? await rollbackManifest(odoo, { apply, log }) : await applyManifest(odoo, { apply, log });
  console.log(JSON.stringify({ ok: true, database: target.database, ...out }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ ok: false, code: e.code ?? 'ERROR', detail: e.detail ?? null }));
  process.exit(1);
}
