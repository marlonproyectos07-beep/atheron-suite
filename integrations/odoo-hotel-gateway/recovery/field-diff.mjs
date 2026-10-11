// Comparación estructural de campos antes de cualquier creación. Las etiquetas traducidas no son identidad.
import { READ_CTX } from './recovery-lib.mjs';

const STRUCTURE = ['ttype', 'relation', 'relation_field', 'required', 'readonly', 'store', 'related', 'compute', 'depends'];
const empty = (v) => v === false || v === null || v === undefined || v === '';
const equal = (a, b) => (empty(a) && empty(b)) || a === b;

export async function inspectFields(ex, model, wanted) {
  if (!wanted.length) return [];
  const names = wanted.map((f) => f.name);
  const rows = await ex('ir.model.fields', 'search_read', [[['model', '=', model], ['name', 'in', names]]],
    { fields: ['name', ...STRUCTURE], context: READ_CTX });
  const byName = new Map();
  for (const row of rows) byName.set(row.name, [...(byName.get(row.name) ?? []), row]);
  return wanted.map((f) => {
    const matches = byName.get(f.name) ?? [];
    if (!matches.length) return { name: f.name, status: 'CREATE_MISSING', differences: [] };
    const differences = matches.length === 1
      ? STRUCTURE.filter((k) => f[k] !== undefined && !equal(matches[0][k], f[k]))
      : ['duplicate_field_name'];
    return { name: f.name, status: differences.length ? 'DIFFERENT_BLOCKING' : 'REUSE_EXISTING', differences, id: matches[0]?.id };
  });
}

export function assertNoFieldConflict(classified, model) {
  const bad = classified.filter((f) => f.status === 'DIFFERENT_BLOCKING');
  if (bad.length) return `${model}: campos existentes incompatibles: ${bad.map((f) => `${f.name}(${f.differences.join(',')})`).join('; ')}`;
  return null;
}
