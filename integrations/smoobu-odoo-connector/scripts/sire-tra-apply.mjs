#!/usr/bin/env node
// ATH-HOTELS-SIRE-TRA-001 · Aplica el manifiesto en Odoo por JSON-2.
// Por defecto SIMULA. --apply escribe. --rollback revierte (simula sin --apply).
// Destino por defecto: copia de pruebas (ODOO_TEST_BASE_URL, ODOO_TEST_DATABASE, ODOO_TEST_API_KEY) con aislamiento verificado.
// --snapshot respaldo de configuracion (sin datos personales). --verify validacion posterior. --disable reversion suave (no borra).
// --rollback reversion dura; si hay datos exige --export <carpeta local> (contiene datos personales: no subir al repositorio).
// --production exige ATH_DEPLOY_PRODUCTION=si-aprobado-por-marlon y ATH_PRODUCTION_BACKUP_CONFIRMED=yes (NO se usa en esta mision).
import { mkdirSync, writeFileSync } from 'node:fs';
import { applyManifest, checkIsolation, disableManifest, rollbackManifest, snapshotConfig, verifyDeployment } from '../src/sire-tra/applier.mjs';
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
  const ix = process.argv.indexOf('--export');
  const exportDir = ix > 0 ? process.argv[ix + 1] : null;
  const preserve = exportDir ? async (present) => {
    mkdirSync(exportDir, { recursive: true });
    for (const p of present) {
      const fields = p.field === '*' ? [] : ['id', p.field];
      const rows = await odoo.searchRead(p.model, p.field === '*' ? [] : [[p.field, '!=', false]], fields);
      writeFileSync(`${exportDir}/${p.model}__${p.field === '*' ? 'todo' : p.field}.json`, JSON.stringify(rows));
    }
  } : null;
  let out;
  if (has('--snapshot')) out = await snapshotConfig(odoo);
  else if (has('--verify')) out = await verifyDeployment(odoo);
  else if (has('--disable')) out = await disableManifest(odoo, { apply });
  else if (has('--rollback')) out = await rollbackManifest(odoo, { apply, log, preserve });
  else out = await applyManifest(odoo, { apply, log });
  console.log(JSON.stringify({ ok: true, database: target.database, ...out }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ ok: false, code: e.code ?? 'ERROR', detail: e.detail ?? null }));
  process.exit(1);
}
