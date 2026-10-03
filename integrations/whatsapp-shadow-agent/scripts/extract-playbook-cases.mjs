#!/usr/bin/env node
/**
 * Extrae los TEST_CASES T01-T100 del Playbook v0.1 SIN retipearlos:
 * lee las tablas markdown de la seccion 12 y conserva los IDs y las 8
 * columnas tal cual (solo se quitan los ** de enfasis). Falla si no hay
 * exactamente 100 casos contiguos T01..T100.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const md = join(root, 'AI', 'whatsapp', 'ATHERON_WHATSAPP_PLAYBOOK_v0.1.md');
const out = join(root, 'AI', 'whatsapp', 'playbook-cases.v0.1.json');

const text = readFileSync(md, 'utf8');
const COLS = ['id', 'input', 'context', 'expected_intent', 'data_required', 'odoo', 'expected_behavior', 'esc'];
const clean = (s) => s.replace(/\*\*/g, '').trim();

const cases = [];
let section = null;
for (const line of text.split('\n')) {
  const h = line.match(/^### (12\.\d+) (.+)$/);
  if (h) section = `${h[1]} ${h[2]}`;
  if (!/^\| T\d{2,3} \|/.test(line)) continue;
  const cells = line.split('|').slice(1, -1).map(clean);
  if (cells.length !== COLS.length) throw new Error(`Fila con ${cells.length} columnas: ${line.slice(0, 60)}`);
  cases.push({ ...Object.fromEntries(COLS.map((c, i) => [c, cells[i]])), section });
}
const ids = cases.map((c) => c.id);
const expected = Array.from({ length: 100 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);
if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error('Los IDs no son exactamente T01..T100 contiguos');

writeFileSync(out, JSON.stringify({ source: 'ATHERON_WHATSAPP_PLAYBOOK_v0.1.md', sha256: createHash('sha256').update(text).digest('hex'), count: cases.length, cases }, null, 2) + '\n');
console.log(JSON.stringify({ written: out, count: cases.length, first: ids[0], last: ids.at(-1) }));
