// ATH-DISP-001 — SOLO LECTURA: regla 71 (mínimo de personas-noche en Casa La Magia) y si existe un bloque creado tras el intento.
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const OUT = 'C:\\Users\\HP\\AppData\\Local\\Temp\\claude\\C--Users-HP-atheron-codex\\94c22c4a-cc8e-45b1-9394-e9bbccac8688\\scratchpad\\odoo-actions';
mkdirSync(OUT, { recursive: true });

const r = (await ex('base.automation', 'read', [[71]], { fields: ['name', 'action_server_ids', 'filter_domain'] }))[0];
const acts = await ex('ir.actions.server', 'read', [r.action_server_ids], { fields: ['name', 'code'] });
for (const a of acts) { writeFileSync(`${OUT}/rule-71-action-${a.id}.py`, a.code || '', 'utf8'); console.log('R71 ' + JSON.stringify({ name: r.name, domain: String(r.filter_domain || '').slice(0, 160), action: a.id, head: String(a.code || '').split('\n').slice(0, 14).join(' | ').slice(0, 700) })); }
const created = await ex('planning.slot', 'search_read', [[['start_datetime', '=', '2026-12-21 20:00:00'], ['resource_id', '=', 79]]], { fields: ['id', 'x_channel'], limit: 10, context: { active_test: false } });
console.log('CASA_SLOTS_AT_21DEC ' + JSON.stringify(created));
