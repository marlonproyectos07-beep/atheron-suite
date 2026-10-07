// ATH-DISP-001 — SOLO LECTURA: código de la acción de las reglas 167 y 169 (propagación Casa <-> habitaciones).
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';

const cfg = loadGuardedConfig(process.env);
const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);
const OUT = 'C:\\Users\\HP\\AppData\\Local\\Temp\\claude\\C--Users-HP-atheron-codex\\94c22c4a-cc8e-45b1-9394-e9bbccac8688\\scratchpad\\odoo-actions';
mkdirSync(OUT, { recursive: true });

const rules = await ex('base.automation', 'read', [[167, 169]], { fields: ['name', 'action_server_ids'] });
for (const r of rules) {
  const acts = await ex('ir.actions.server', 'read', [r.action_server_ids], { fields: ['name', 'code'] });
  for (const a of acts) {
    writeFileSync(`${OUT}/rule-${r.id}-action-${a.id}.py`, a.code || '', 'utf8');
    console.log('RULE ' + JSON.stringify({ rule: r.id, name: r.name, action: a.id, lines: String(a.code || '').split('\n').length }));
  }
}
