#!/usr/bin/env node
/** Genera AI/whatsapp/BLIND_GENERALIZATION_V3_100.md desde el fixture. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BLIND_V3 } from '../test/blind-v3-100.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const turn = (t) => (typeof t === 'string' ? t : `[AUDIO conf=${t.confidence}] ${t.transcript}`);
const exp = (c) => [
  c.intent ? `intent=${c.intent}` : c.intentAny ? `intent∈{${c.intentAny.join(',')}}` : null,
  c.esc !== undefined ? `esc=${c.esc}` : null, c.escAny ? 'esc(any)=true' : null,
  c.odoo !== undefined ? `odoo=${c.odoo}` : null, c.line ? `line=${c.line}` : null,
  c.must ? `must ${c.must}` : null, c.mustNot ? `mustNot ${c.mustNot}` : null,
  c.flags ? `flags ${c.flags.join('+')}` : null, c.memory ? `memoria ${JSON.stringify(c.memory)}` : null,
  c.noMemory ? `sin memoria ${c.noMemory.join(',')}` : null, c.risk ? `riesgo ${c.risk}` : null,
].filter(Boolean).join(' · ');
const esc = (s) => s.replace(/\|/g, '\\|');
const v = BLIND_V3.filter((c) => c.src === 'V').length;

let md = `# BLIND_GENERALIZATION_V3_100

Set ciego de 100 conversaciones (GOAL-WHATSAPP-BLIND-V3-100). Congelado con SHA256, commit y push **antes** de ejecutarlo.
Fecha de referencia del agente: sábado 2026-10-03. Fuente ejecutable: \`integrations/whatsapp-shadow-agent/test/blind-v3-100.mjs\`.

**Gate predefinido por Control Maestro para considerar SUPERVISED:** FIRST_PASS_PERCENT ≥ 90 % **y** HIGH_RISK_FAIL_COUNT = 0. Si falla cualquiera: SHADOW ONLY.

## Procedencia (honesta)

- **V — variante basada en lenguaje observado:** ${v}/100. Parten de patrones de chats reales anonimizados que recoge el Playbook, reformulados; **ninguno es copia literal**.
- **S — sintético:** ${100 - v}/100, para huecos que el corpus no cubre.
- **Corpus crudo de WhatsApp:** no existe en el repositorio; no se dispuso de mensajes reales literales. Por tanto 0 % son mensajes reales sin tocar.
- Sin nombres, teléfonos, cuentas ni documentos.

| ID | Categoría | Src | Turnos | Esperado |
|---|---|---|---|---|
`;
for (const c of BLIND_V3) md += `| ${c.id} | ${c.cat} | ${c.src} | ${esc(c.turns.map(turn).join(' ⏎ '))} | ${esc(exp(c))} |\n`;
writeFileSync(join(root, 'AI', 'whatsapp', 'BLIND_GENERALIZATION_V3_100.md'), md);
console.log(`ok: ${BLIND_V3.length} casos, V=${v}, S=${100 - v}`);
