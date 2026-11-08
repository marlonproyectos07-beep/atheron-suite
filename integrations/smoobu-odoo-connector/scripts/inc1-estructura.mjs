#!/usr/bin/env node
// ATH-HOTELS-SIRE-TRA-001 · Incremento 1. Por defecto SIMULA. --apply solo contra una copia de pruebas aislada.
// Variables: ODOO_TEST_BASE_URL, ODOO_TEST_DATABASE, ODOO_TEST_API_KEY (secreto, distinta de produccion);
//            ODOO_TEST_WRITES=yes-test-copy (solo con --apply).
import { runIncrement1 } from '../src/inc1-run.mjs';

const apply = process.argv.includes('--apply');
try {
  const out = await runIncrement1({ apply, log: (e) => console.error(JSON.stringify(e)) });
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error(JSON.stringify({ ok: false, code: e.code ?? 'ERROR' }));
  process.exit(1);
}
