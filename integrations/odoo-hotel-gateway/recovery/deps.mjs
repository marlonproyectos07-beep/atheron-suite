// ATH-STAGING-RECOVERY-020 — dependencias de campos relacionados / calculados. Dos usos:
//   • offline (analysis): qué rutas y campos x_* dependen de algo que NO define el paquete (sin red);
//   • en vivo (R1/R2): antes de crear un campo related/compute/depends se comprueba, SOLO LECTURA, que la ruta exista en el destino.
// Si la ruta no existe, el campo NO se crea (DEP_FALTA): nada se inventa para taparlo.
import { READ_CTX } from './recovery-lib.mjs';

/** Mapa modelo → (nombre → {relation}) de las definiciones del paquete (filas del contrato fields.json). */
export function knownFromRows(rows) {
  const known = new Map();
  for (const f of rows) { if (!known.has(f.model)) known.set(f.model, new Map()); known.get(f.model).set(f.name, { relation: f.relation ?? null, ttype: f.ttype }); }
  return known;
}
const split = (s) => String(s ?? '').split(/[\s,]+/).filter(Boolean);

/** Rutas `record.<cadena>.mapped('<ruta>')` dentro del código de un compute: se recorren completas (modelo a modelo), no por nombre suelto. */
export const computePaths = (f) => [...String(f.compute ?? '').matchAll(/record\.([a-z0-9_.]+?)\.mapped\('([^']+)'\)/g)].map((m) => `${m[1]}.${m[2]}`);
/** Rutas a comprobar de un campo: `related` (una), `depends` (varias) y las rutas mapped() del compute. */
export const fieldPaths = (f) => [...(f.related ? [f.related] : []), ...split(f.depends), ...computePaths(f)];
/** Campos x_* a los que accede el código de un compute (`.x_nombre`) y que NO van dentro de una ruta mapped() ya recorrida. */
export const computeTokens = (f) => {
  const inPaths = new Set(computePaths(f).flatMap((p) => p.split('.')));
  return [...new Set(String(f.compute ?? '').match(/\.(x_[a-z0-9_]+)/g)?.map((t) => t.slice(1)) ?? [])].filter((t) => !inPaths.has(t));
};
/** Relaciones estándar de Odoo que el paquete da por sabidas al recorrer rutas OFFLINE (en vivo se usa fields_get). */
const STD_REL = Object.freeze({ 'sale.order.order_line': 'sale.order.line', 'sale.order.partner_id': 'res.partner', 'planning.slot.role_id': 'planning.role', 'res.partner.company_type': null });

/**
 * Recorre `path` desde `model`. `lookup(model, name)` devuelve {relation}|null. Devuelve [] si la ruta resuelve, o el primer salto que falla.
 * Un salto intermedio debe ser relacional (traer `relation`).
 */
export async function walkPath(model, path, lookup) {
  let cur = model; const hops = path.split('.');
  for (let i = 0; i < hops.length; i++) {
    if (hops[i] === 'id' && i === hops.length - 1) continue;
    const fd = await lookup(cur, hops[i]);
    if (!fd) return [`${cur}.${hops[i]}`];
    if (i < hops.length - 1) { if (!fd.relation) return [`${cur}.${hops[i]} (no relacional)`]; cur = fd.relation; }
  }
  return [];
}

/** Lookup en vivo: primero lo que define el paquete, luego fields_get del destino (solo lectura). */
export function liveLookup(ex, known) {
  const cache = new Map();
  const fg = async (model) => {
    if (!cache.has(model)) { try { cache.set(model, await ex(model, 'fields_get', [], { attributes: ['type', 'relation'] })); } catch { cache.set(model, null); } }
    return cache.get(model);
  };
  return async (model, name) => known.get(model)?.get(name) ?? (await fg(model))?.[name] ?? null;
}

/**
 * Dependencias ausentes de UN campo en el destino. `knownNames` = nombres x_* que el paquete define (en cualquier modelo): un token de código
 * de compute que no sea de esos se busca por nombre en ir.model.fields del destino (como hace R4).
 */
export async function depIssues(ex, f, known, knownNames) {
  const lookup = liveLookup(ex, known); const out = [];
  for (const p of fieldPaths(f)) out.push(...await walkPath(f.model, p, lookup));
  const toks = computeTokens(f).filter((t) => !knownNames.has(t));
  if (toks.length) {
    const have = new Set((await ex('ir.model.fields', 'search_read', [[['name', 'in', toks]]], { fields: ['name'], context: READ_CTX })).map((r) => r.name));
    for (const t of toks) if (!have.has(t)) out.push(`campo ${t} usado por el compute`);
  }
  return [...new Set(out)];
}

/** OFFLINE: rutas/tokens que el paquete NO resuelve por sí mismo. `isStandard(name)` distingue campos de Odoo (sin prefijo x_). */
export function externalDependencies(rows) {
  const known = knownFromRows(rows); const names = new Set(rows.map((r) => r.name)); const out = [];
  const stdHint = new Set(['partner_id', 'company_type', 'order_line', 'role_id', 'start_datetime', 'end_datetime']);
  for (const f of rows) {
    for (const p of fieldPaths(f)) {
      let cur = f.model; const hops = p.split('.');
      for (let i = 0; i < hops.length; i++) {
        if (hops[i] === 'id' && i === hops.length - 1) continue;
        const fd = known.get(cur)?.get(hops[i]);
        if (fd) { if (i < hops.length - 1) cur = fd.relation; continue; }
        const std = STD_REL[`${cur}.${hops[i]}`];
        if (std && i < hops.length - 1) { cur = std; continue; }
        // el salto no lo define el paquete: dependencia externa (campo estándar o de módulo, o campo x_ de otro modelo)
        const isCustom = hops[i].startsWith('x_');
        out.push({ field: `${f.model}.${f.name}`, via: p, needs: `${cur}.${hops[i]}`, kind: isCustom ? 'CAMPO_X_NO_DEFINIDO_EN_ARTEFACTOS' : (stdHint.has(hops[i]) ? 'ESTANDAR_ODOO' : 'MODULO_O_LOCALIZACION') });
        break;
      }
    }
    for (const t of computeTokens(f)) if (!names.has(t)) out.push({ field: `${f.model}.${f.name}`, via: 'compute', needs: t, kind: 'CAMPO_X_NO_DEFINIDO_EN_ARTEFACTOS' });
  }
  return out;
}

/** Usos x_* con modelo EXPLÍCITO en el código: `V = env['m']` + `V.search/create(… 'x_…')`, y `.mapped('x_rel').sudo().write({'x_…'})` (modelo = relación del campo en el paquete). */
export function qualifiedFieldUses(code, relationOf) {
  const out = []; const vars = new Map([...code.matchAll(/(\w+)\s*=\s*env\['([\w.]+)'\](?:\.sudo\(\))?/g)].map((m) => [m[1], m[2]]));
  for (const [v, model] of vars) for (const m of code.matchAll(new RegExp(`\\b${v}\\.(?:search|create)\\(([^\\n]*)`, 'g'))) for (const t of m[1].matchAll(/'(x_[a-z0-9_]+)'/g)) out.push({ model, field: t[1] });
  for (const m of code.matchAll(/\.mapped\('(x_[a-z0-9_]+)'\)\.sudo\(\)\.write\(\{([^}]*)\}/g)) { const model = relationOf(m[1]); if (model) for (const t of m[2].matchAll(/'(x_[a-z0-9_]+)'\s*:/g)) out.push({ model, field: t[1] }); }
  return out;
}

