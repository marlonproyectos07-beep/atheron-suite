#!/usr/bin/env node
// ATH-STAGING-RECOVERY-CLAUDE-001 — rollback de R3: borra SOLO lo que la bitácora marca como CREATE.
// DRY-RUN por defecto. Uso: node recovery/r3-rollback.mjs recovery/out/r3-<ts>.json [--apply]
import { readFileSync } from 'node:fs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { loadRecoveryConfig, parseArgs, assertMayWrite } from './recovery-lib.mjs';

const file = process.argv[2];
if (!file || file.startsWith('--')) { console.error('indica el log de r3'); process.exit(1); }
const args = parseArgs(process.argv.slice(3));
const cfg = loadRecoveryConfig();
const write = assertMayWrite(args);
const created = JSON.parse(readFileSync(file, 'utf8')).filter((e) => e.action === 'CREATE' && e.id);
const t = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await t.call('common', 'login', [cfg.db, cfg.user, cfg.secret]);
const ex = (model, method, a, kw = {}) => t.call('object', 'execute_kw', [cfg.db, uid, cfg.secret, model, method, a, kw]);
// Orden inverso a la creación: Casa y habitaciones antes que la propiedad.
for (const e of created.reverse()) {
  if (!write) { console.log(`BORRARÍA ${e.model} id=${e.id} (${e.key})`); continue; }
  await ex(e.model, 'unlink', [[e.id]]);
  console.log(`BORRADO  ${e.model} id=${e.id} (${e.key})`);
}
