#!/usr/bin/env node
// ATH-HOTELS-SIRE-TRA-001 · Emisor TRA. DESACTIVADO por defecto.
// Sin --send: solo lista (ids) las reservas con TRA pendiente; no reclama, no contacta al MinCIT.
// --send: modo real; exige TRA_ENABLED=yes-real, TRA_TOKEN, catalogo verificado (tra-catalog.json "verified": true)
//         y establecimiento con modo API y configuracion verificada. Lee/escribe Odoo con ODOO_BASE_URL/ODOO_DATABASE/ODOO_API_KEY.
import { readFileSync } from 'node:fs';
import { EmitterRpc } from '../src/sire-tra/odoo-rpc-node.mjs';
import { TRA_CATALOG_UNVERIFIED, emitStay, emissionGates } from '../src/sire-tra/tra-emitter.mjs';
import { createTraHttp } from '../src/sire-tra/tra-http.mjs';

const send = process.argv.includes('--send');
const env = process.env;
const log = (e) => console.error(JSON.stringify(e));
try {
  let catalog = TRA_CATALOG_UNVERIFIED;
  try { catalog = JSON.parse(readFileSync(new URL('../tra-catalog.json', import.meta.url), 'utf8')); } catch { /* sin archivo: catalogo no verificado */ }
  const odoo = new EmitterRpc({ baseUrl: env.ODOO_BASE_URL, database: env.ODOO_DATABASE, apiKey: env.ODOO_API_KEY });
  const pending = await odoo.searchRead('x_guests_line', [['x_tra_state', '=', 'pendiente'], ['x_arrived_at', '!=', false]], ['x_sale_order_id', 'x_establishment_id']);
  const orders = [...new Set(pending.map((l) => l.x_sale_order_id && l.x_sale_order_id[0]).filter(Boolean))];
  if (!send) { console.log(JSON.stringify({ ok: true, mode: 'dry-run', orders_with_pending_tra: orders })); process.exit(0); }
  const runRef = `gha-${env.GITHUB_RUN_ID || 'local'}-${Date.now()}`;
  const tra = createTraHttp({ token: env.TRA_TOKEN });
  const results = [];
  for (const orderId of orders) {
    const estId = pending.find((l) => l.x_sale_order_id[0] === orderId)?.x_establishment_id?.[0];
    const [est] = estId ? await odoo.searchRead('x_establishment', [['id', '=', estId]], ['x_name', 'x_rnt_number', 'x_tra_mode', 'x_tra_config_verified', 'x_tra_accommodation_type', 'x_tra_cost_basis']) : [];
    const gate = emissionGates({ mode: 'real', env, catalog, est });
    if (!gate.ok) { results.push({ orderId, stop: 'BLOQUEADO', reasons: gate.reasons }); continue; }
    results.push(await emitStay({ odoo, tra, orderId, est, catalog, mode: 'real', runRef, env, log }));
  }
  console.log(JSON.stringify({ ok: true, mode: 'real', runRef, results }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, code: e.code ?? 'ERROR' }));
  process.exit(1);
}
