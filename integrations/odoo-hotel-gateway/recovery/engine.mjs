// ATH-STAGING-RECOVERY-007 — motor común: bitácora append-only, ensure idempotente con registro de lo previo, rollback selectivo.
// Nada se ejecuta al importar. No sabe nada de Odoo real: solo usa `ex(model, method, args, kw)` (ver makeExecutor).
import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { differs, READ_CTX, WRITE_CTX } from './recovery-lib.mjs';

/**
 * Bitácora JSONL, UNA por base destino. Cada línea se escribe y se vacía a disco antes de continuar, así un fallo a mitad
 * de capa deja rastro exacto. Operaciones:
 *   INTENT   antes de crear (con el dominio de búsqueda que NO encontró nada => lo que aparezca después lo creamos nosotros)
 *   CREATE   id creado (ref = seq del INTENT)
 *   UPDATE   {before, after} SOLO de los campos escritos (únicamente con --force-diff)
 *   ROLLBACK resultado de deshacer una entrada (ref = seq): DELETED | RESTORED | GONE | CONFLICT | ERROR
 */
export class Journal {
  constructor(path) { this.path = path; this.seq = this.read().length; }
  read() {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }
  append(entry) {
    mkdirSync(dirname(this.path), { recursive: true });
    const e = { seq: ++this.seq, ts: new Date().toISOString(), ...entry };
    appendFileSync(this.path, JSON.stringify(e) + '\n');
    return e;
  }
  /** Entradas aplicadas y aún no deshechas. Clave de una entrada = seq del INTENT (CREATE) o su propio seq. */
  pending({ layer = null } = {}) {
    const all = this.read();
    const target = (e) => (e.op === 'CREATE' ? e.ref : e.seq);
    const done = new Set(all.filter((e) => e.op === 'ROLLBACK' && ['DELETED', 'RESTORED', 'GONE'].includes(e.result)).map((e) => e.ref));
    const created = new Set(all.filter((e) => e.op === 'CREATE').map((e) => e.ref));
    return all.filter((e) => (layer ? e.layer === layer : true)
      && ((e.op === 'CREATE') || (e.op === 'UPDATE') || (e.op === 'INTENT' && !created.has(e.seq)))
      && !done.has(target(e)));
  }
}

const isCmd = (v) => Array.isArray(v) && v.length > 0 && v.every((c) => Array.isArray(c) && typeof c[0] === 'number');
/** [[6,0,ids]] -> ids  (para guardar en la bitácora) */
const cmdToIds = (v) => (isCmd(v) && v.length === 1 && v[0][0] === 6 ? [...v[0][2]] : v);
/** Restaura x2many como comandos: Odoo no acepta listas de ids crudas al escribir. */
export const toWrite = (vals, x2many = []) => Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, x2many.includes(k) ? [[6, 0, v]] : v]));

/** ¿existe el registro? Un modelo que ya no existe (p. ej. borrado por el rollback de R1) cuenta como "no existe". */
async function recordExists(ex, model, id) {
  try { return (await ex(model, 'search', [[['id', '=', id]]], { limit: 1, context: READ_CTX })).length > 0; }
  catch (e) { if (/doesn't exist|does not exist|Unknown model|KeyError/i.test(String(e?.diagnostic?.message || e?.message || e))) return false; throw e; }
}
const trimErr = (e) => String(e?.diagnostic?.message || e?.message || e).slice(0, 300);

/**
 * Buscar -> comparar -> (crear | omitir | informar diferencia). Nunca sobrescribe sin --force-diff.
 * Lo que ya existía NO entra en la bitácora de creaciones: el rollback no lo toca jamás.
 * Devuelve el id existente/creado, o null (dry-run, ambiguo).
 */
export function makeEnsure({ ex, write, args, log, journal, layer }) {
  return async function ensure(model, domain, payload, label, { compareFields, intentDomain } = {}) {
    const keys = compareFields ?? Object.keys(payload);
    const found = await ex(model, 'search_read', [domain], { fields: keys, limit: 3, context: READ_CTX });
    if (found.length > 1) { log.add('AMBIGUO', model, label, { note: `${found.length} coincidencias; no se escribe` }); return null; }
    if (found.length === 0) {
      if (!write) { log.add('CREATE?', model, label); return null; }
      const intent = journal.append({ op: 'INTENT', layer, model, key: label, domain: intentDomain ?? domain }); // intentDomain: versión sin PII para guardar en la bitácora
      const id = await ex(model, 'create', [payload], { context: WRITE_CTX });
      journal.append({ op: 'CREATE', layer, model, key: label, id, ref: intent.seq });
      log.add('CREATE', model, label, { id });
      return id;
    }
    const cur = found[0];
    const diff = keys.filter((k) => k in payload && differs(cur[k], payload[k]));
    if (diff.length === 0) { log.add('SKIP', model, label, { id: cur.id }); return cur.id; }
    if (write && args.forceDiff) {
      const x2many = diff.filter((k) => isCmd(payload[k]));
      const before = Object.fromEntries(diff.map((k) => [k, cur[k]]));
      const after = Object.fromEntries(diff.map((k) => [k, x2many.includes(k) ? cmdToIds(payload[k]) : payload[k]]));
      journal.append({ op: 'UPDATE', layer, model, key: label, id: cur.id, before, after, x2many });
      await ex(model, 'write', [[cur.id], after], { context: WRITE_CTX });
      log.add('UPDATE', model, label, { id: cur.id, fields: diff });
    } else log.add('DIFF', model, label, { id: cur.id, fields: diff });
    return cur.id;
  };
}

const sameVal = (a, b) => !differs(a, b);

/**
 * Deshace lo que la bitácora marca como aplicado, en orden inverso. Seguro de re-ejecutar: lo ya deshecho se omite,
 * y lo que falla queda como ERROR/CONFLICT sin detener el resto (soporta ejecución parcial y fallo a mitad de capa).
 *  - CREATE/INTENT: se borra solo ese registro; si ya no existe => GONE.
 *  - UPDATE: se restaura solo si el valor actual sigue siendo el que escribimos; si alguien lo cambió después => CONFLICT.
 * `write=false` solo informa.
 */
export async function rollback({ ex, write, journal, log, layer = null }) {
  const out = { DELETED: 0, RESTORED: 0, GONE: 0, CONFLICT: 0, ERROR: 0, WOULD: 0 };
  const entries = journal.pending({ layer }).sort((a, b) => b.seq - a.seq);
  for (const e of entries) {
    const mark = (result, extra = {}) => { out[result]++; if (write) journal.append({ op: 'ROLLBACK', layer: e.layer, ref: e.op === 'CREATE' ? e.ref : e.seq, model: e.model, key: e.key, result, ...extra }); };
    try {
      if (e.op === 'UPDATE') {
        const [cur] = await ex(e.model, 'read', [[e.id], Object.keys(e.after)], { context: READ_CTX }).catch(() => []);
        if (!cur) { log.add('GONE', e.model, e.key); mark('GONE'); continue; }
        if (!Object.keys(e.after).every((k) => sameVal(cur[k], e.after[k]))) { log.add('CONFLICT', e.model, e.key, { note: 'valor cambiado después; no se restaura' }); out.CONFLICT++; continue; }
        if (!write) { log.add('RESTAURARÍA', e.model, e.key); out.WOULD++; continue; }
        await ex(e.model, 'write', [[e.id], toWrite(e.before, e.x2many ?? [])], { context: WRITE_CTX });
        log.add('RESTORED', e.model, e.key); mark('RESTORED');
        continue;
      }
      let id = e.id;
      if (e.op === 'INTENT') {
        const hits = await ex(e.model, 'search', [e.domain], { limit: 3, context: READ_CTX }).catch((err) => { if (/doesn't exist|does not exist|Unknown model/i.test(String(err?.diagnostic?.message || err?.message))) return []; throw err; });
        if (hits.length === 0) { log.add('GONE', e.model, e.key, { note: 'nunca llegó a crearse' }); mark('GONE'); continue; }
        if (hits.length > 1) { log.add('CONFLICT', e.model, e.key, { note: 'varios candidatos; no se borra' }); out.CONFLICT++; continue; }
        id = hits[0];
      }
      if (!(await recordExists(ex, e.model, id))) { log.add('GONE', e.model, e.key); mark('GONE'); continue; }
      if (!write) { log.add('BORRARÍA', e.model, e.key, { id }); out.WOULD++; continue; }
      await ex(e.model, 'unlink', [[id]]);
      log.add('DELETED', e.model, e.key, { id }); mark('DELETED');
    } catch (err) {
      log.add('ERROR', e.model, e.key, { note: trimErr(err) }); out.ERROR++;
      if (write) journal.append({ op: 'ROLLBACK', layer: e.layer, ref: e.seq, model: e.model, key: e.key, result: 'ERROR', note: trimErr(err) });
    }
  }
  return out;
}

/** ¿Sigue vigente lo que la bitácora dice aplicado? (verify del apply) */
export async function verifyApplied({ ex, journal, layer = null }) {
  const checks = [];
  for (const e of journal.pending({ layer })) {
    if (e.op === 'CREATE') checks.push({ name: `${e.model}:${e.key}`, ok: await recordExists(ex, e.model, e.id) });
    if (e.op === 'UPDATE') { const [cur] = await ex(e.model, 'read', [[e.id], Object.keys(e.after)], { context: READ_CTX }).catch(() => []); checks.push({ name: `${e.model}:${e.key}`, ok: !!cur && Object.keys(e.after).every((k) => sameVal(cur[k], e.after[k])) }); }
  }
  return { ok: checks.every((c) => c.ok), checks };
}

/** ¿Quedó realmente deshecho? Cada CREATE ya no existe y cada UPDATE volvió a su valor previo. */
export async function verifyRolledBack({ ex, journal, layer = null }) {
  const all = journal.read().filter((e) => (layer ? e.layer === layer : true));
  const rolled = new Set(all.filter((e) => e.op === 'ROLLBACK' && ['DELETED', 'RESTORED', 'GONE'].includes(e.result)).map((e) => e.ref));
  const checks = [];
  for (const e of all) {
    if (e.op === 'CREATE' && rolled.has(e.ref)) checks.push({ name: `${e.model}:${e.key}`, ok: !(await recordExists(ex, e.model, e.id)) });
    if (e.op === 'UPDATE' && rolled.has(e.seq)) { const [cur] = await ex(e.model, 'read', [[e.id], Object.keys(e.before)], { context: READ_CTX }).catch(() => []); // si el registro ya no existe (lo borró el rollback de su CREATE), el UPDATE ya no tiene nada que restaurar
      checks.push({ name: `${e.model}:${e.key}`, ok: !cur || Object.keys(e.before).every((k) => sameVal(cur[k], e.before[k])) }); }
  }
  return { ok: checks.every((c) => c.ok), checks };
}
