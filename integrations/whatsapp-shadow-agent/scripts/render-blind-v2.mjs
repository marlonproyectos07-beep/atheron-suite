#!/usr/bin/env node
/** Genera AI/whatsapp/BLIND_GENERALIZATION_V2_50.md desde el fixture (misma fuente, sin duplicar a mano). */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BLIND_V2 } from '../test/blind-v2-50.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const turn = (t) => (typeof t === 'string' ? t : `[AUDIO conf=${t.confidence}] ${t.transcript}`);
const exp = (c) => [
  c.intent ? `intent=${c.intent}` : c.intentAny ? `intent∈{${c.intentAny.join(',')}}` : null,
  c.esc !== undefined ? `esc=${c.esc}` : c.escAny ? 'esc(any turn)=true' : null,
  c.odoo !== undefined ? `odoo=${c.odoo}` : null,
  c.line ? `line=${c.line}` : null,
  c.must ? `must ${c.must}` : null,
  c.mustNot ? `mustNot ${c.mustNot}` : null,
  c.flags ? `flags ${c.flags.join('+')}` : null,
  c.memory ? `memoria ${JSON.stringify(c.memory)}` : null,
  c.risk ? `riesgo ${c.risk}` : null,
].filter(Boolean).join(' · ');

let md = `# BLIND_GENERALIZATION_V2_50

Set ciego de 50 mensajes/conversaciones nuevos (GOAL-WHATSAPP-CANONICAL-002, gate de generalización SHADOW).
Congelado con hash y commit **antes** de ejecutarlo. Fecha de referencia del agente: sábado 2026-10-03.
Fuente ejecutable: \`integrations/whatsapp-shadow-agent/test/blind-v2-50.mjs\` (este archivo se genera con \`scripts/render-blind-v2.mjs\`).

| ID | Tema | Turnos | Esperado |
|---|---|---|---|
`;
for (const c of BLIND_V2) md += `| ${c.id} | ${c.theme} | ${c.turns.map(turn).join(' ⏎ ').replace(/\|/g, '\\|')} | ${exp(c).replace(/\|/g, '\\|')} |\n`;
writeFileSync(join(root, 'AI', 'whatsapp', 'BLIND_GENERALIZATION_V2_50.md'), md);
console.log(`ok: ${BLIND_V2.length} casos`);
