// ATH-STAGING-RECOVERY — funciones puras (sin red) para poder probarlas sin Odoo.

/** Texto traducible de Odoo ({"en_US": "..."}) o cadena -> cadena. */
export const txt = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? (v.en_US ?? Object.values(v)[0] ?? null) : v ?? null);

/**
 * La vista piloto (6832) llama a las acciones de servidor por ID NUMÉRICO: <button name="1897" type="action">.
 * En la base nueva esos ids no existen. Reescribe cada uno por el id nuevo, resuelto POR NOMBRE.
 * Devuelve { arch, unresolved:[{oldId,name|null}] }. Si hay alguno sin resolver, el llamador NO debe crear la vista.
 */
export function rewriteActionButtons(arch, oldIdToName, nameToNewId) {
  const unresolved = [];
  const out = String(arch).replace(/(<button\b[^>]*?\bname=")(\d+)("[^>]*?\btype="action")/g, (all, pre, oldId, post) => {
    const name = oldIdToName.get(Number(oldId)) ?? null;
    const nid = name != null ? nameToNewId.get(name) : undefined;
    if (!nid) { unresolved.push({ oldId: Number(oldId), name }); return all; }
    return `${pre}${nid}${post}`;
  });
  return { arch: out, unresolved };
}

/** Orden de creación de campos: escalares, many2one, one2many, many2many (las relaciones inversas necesitan el m2o antes). */
const TTYPE_RANK = { many2one: 1, one2many: 2, many2many: 3 };
export const fieldOrder = (rows) => [...rows].sort((a, b) => (TTYPE_RANK[a.ttype] ?? 0) - (TTYPE_RANK[b.ttype] ?? 0) || String(a.model).localeCompare(String(b.model)) || String(a.name).localeCompare(String(b.name)));

/** selection_ids de ir.model.fields.create a partir de filas de ir_model_fields_selection. */
export const selectionCommands = (rows) => [...rows].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map((r) => [0, 0, { value: r.value, name: txt(r.name), sequence: r.sequence ?? 0 }]);

/** Atributos opcionales de un campo que se copian SOLO si el dump los trae (nada se rellena por defecto). */
export const FIELD_OPTIONAL = ['help', 'size', 'copied', 'index', 'translate', 'store', 'compute', 'depends', 'domain', 'on_delete', 'relation_field', 'readonly', 'required'];
