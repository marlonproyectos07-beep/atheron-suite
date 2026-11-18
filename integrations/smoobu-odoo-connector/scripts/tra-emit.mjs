#!/usr/bin/env node
// ATH-HOTELS-SIRE-TRA-001 · Emisor TRA. DESACTIVADO por defecto. El recorrido vive en src/sire-tra/tra-run.mjs.
// Manual (workflow_dispatch o local): exige TRA_ONLY_ORDER (id del pedido) en simulacion y en envio real; si falta,
//   esta mal escrito, fuera de rango o el pedido no tiene TRA pendiente, termina en error sin tocar Odoo ni el MinCIT.
// Programado (TRA_TRIGGER=schedule): sin --send solo lista ids; --send exige ademas TRA_AUTO_SEND=yes.
// --send exige TRA_ENABLED=yes-real, TRA_TOKEN, catalogo verificado (tra-catalog.json "verified": true)
//   y establecimiento con modo API y configuracion verificada. Lee/escribe Odoo con ODOO_BASE_URL/ODOO_DATABASE/ODOO_API_KEY.
import { readFileSync } from 'node:fs';
import { EmitterRpc } from '../src/sire-tra/odoo-rpc-node.mjs';
import { TRA_CATALOG_UNVERIFIED } from '../src/sire-tra/tra-emitter.mjs';
import { createTraHttp } from '../src/sire-tra/tra-http.mjs';
import { runEmitter } from '../src/sire-tra/tra-run.mjs';

const send = process.argv.includes('--send');
const env = process.env;
const log = (e) => console.error(JSON.stringify(e));
try {
  let catalog = TRA_CATALOG_UNVERIFIED;
  try { catalog = JSON.parse(readFileSync(new URL('../tra-catalog.json', import.meta.url), 'utf8')); } catch { /* sin archivo: catalogo no verificado */ }
  let odoo = null;
  const lazyOdoo = new Proxy({}, { get: (_, k) => (...a) => { odoo ??= new EmitterRpc({ baseUrl: env.ODOO_BASE_URL, database: env.ODOO_DATABASE, apiKey: env.ODOO_API_KEY }); return odoo[k](...a); } });
  const { exitCode, out } = await runEmitter({ send, env, catalog, odoo: lazyOdoo, makeTra: () => createTraHttp({ token: env.TRA_TOKEN }), log });
  console.log(JSON.stringify(out));
  process.exit(exitCode);
} catch (e) {
  console.log(JSON.stringify({ ok: false, code: e.code ?? 'ERROR' }));
  process.exit(1);
}
