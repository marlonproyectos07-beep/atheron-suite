// ATH-DISP-001 — SOLO LECTURA: código vivo de la acción 1914 (inventario de disponibilidad usada por availability).
// Imprime el código completo a un archivo local en scratchpad. Sin escrituras.
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const OUT = 'C:\\Users\\HP\\AppData\\Local\\Temp\\claude\\C--Users-HP-atheron-codex\\94c22c4a-cc8e-45b1-9394-e9bbccac8688\\scratchpad\\odoo-actions';
mkdirSync(OUT, { recursive: true });

for (const id of [1914, 1922]) {
  const a = (await ex('ir.actions.server', 'read', [[id]], { fields: ['name', 'code', 'write_date'] }))[0];
  writeFileSync(`${OUT}/action-${id}.py`, a.code || '', 'utf8');
  const code = a.code || '';
  const tokens = ['planning.slot', 'x_availability', 'sale.order', 'x_hotel_unit', 'x_stay_offer', 'hold', 'x_hotel_block', 'limit', 'x_booked', 'estado', 'Casa', 'CASA', 'x_to_recompute', 'x_hold', 'resource', 'search('];
  const hits = tokens.filter((t) => code.includes(t)).map((t) => t + ':' + code.split(t).length);
  console.log('ACTION ' + JSON.stringify({ id, name: a.name, write_date: a.write_date, lines: code.split('\n').length, chars: code.length, tokens: hits }));
}
