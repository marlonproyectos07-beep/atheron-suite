/**
 * Carga el contrato de pruebas del Playbook (100 TEST_CASES).
 * Archivo esperado: cases/playbook-cases.json con
 *   { "playbook_version": "v0.1", "cases": [ {id,title,turns:[{say|fragments, expect}], inventory?, agent?, contacts?} x100 ] }
 * donde `expect` usa las mismas claves que test/support.mjs#check (sin funciones).
 * Si el archivo no existe, devuelve BLOCKED: nunca se inventan casos.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'playbook-cases.json');
const reviveRe = (v) => (typeof v === 'string' && /^\/.*\/[a-z]*$/.test(v) ? new RegExp(v.slice(1, v.lastIndexOf('/')), v.slice(v.lastIndexOf('/') + 1)) : v);

export function loadPlaybookCases(file = FILE) {
  if (!existsSync(file)) return { status: 'BLOCKED', reason: 'cases/playbook-cases.json no existe: el Playbook v0.1 no esta en el repo ni en la sesion', cases: [] };
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const cases = (doc.cases ?? []).map((c) => ({
    ...c,
    turns: c.turns.map((t) => ({ ...t, expect: Object.fromEntries(Object.entries(t.expect ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.map(reviveRe) : v])) })),
  }));
  return { status: 'LOADED', version: doc.playbook_version ?? 'unknown', cases };
}
