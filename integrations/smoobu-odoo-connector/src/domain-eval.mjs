/**
 * Evaluador MINIMO de dominios de automatizaciones (solo condiciones unidas por AND: ('campo','=|!=',valor)).
 * Cualquier forma que no entienda devuelve `unknown`: el precheck lo trata como bloqueo.
 */
export function parseDomain(text) {
  if (text === false || text === null || text === undefined || text === '' || text === '[]') return { terms: [] };
  const src = String(text).trim();
  if (!/^\[\s*(\(.*\)\s*,?\s*)+\]$/.test(src)) return { unknown: true };
  const terms = [];
  const re = /\(\s*'([\w.]+)'\s*,\s*'(=|!=)'\s*,\s*(False|True|'[^']*'|\d+)\s*\)/g;
  let consumed = src.slice(1, -1);
  let m;
  while ((m = re.exec(src)) !== null) {
    const raw = m[3];
    const value = raw === 'False' ? false : raw === 'True' ? true : raw.startsWith("'") ? raw.slice(1, -1) : Number(raw);
    terms.push({ field: m[1], op: m[2], value });
    consumed = consumed.replace(m[0], '');
  }
  if (consumed.replace(/[\s,]/g, '') !== '' || !terms.length) return { unknown: true };
  return { terms };
}
const truthy = (v) => !(v === false || v === null || v === undefined || v === '' || v === 0);
export function matches(domainText, record) {
  const d = parseDomain(domainText);
  if (d.unknown) return 'unknown';
  return d.terms.every((t) => {
    const v = record[t.field];
    if (t.value === false) return t.op === '=' ? !truthy(v) : truthy(v);
    if (t.value === true) return t.op === '=' ? truthy(v) : !truthy(v);
    return t.op === '=' ? v === t.value : v !== t.value;
  });
}
