import { closeSync, openSync, readFileSync, appendFileSync, existsSync, writeSync, unlinkSync } from 'node:fs';
import { ConnectorError } from './errors.mjs';

/**
 * ATH-DEV-116 — Diario de operaciones (write-ahead log) y cerrojo de ejecucion.
 *
 * Cada operacion deja, EN ESTE ORDEN: INTENT (antes de escribir) -> DONE | FAILED | AMBIGUOUS | VERIFY_FAILED.
 * Una entrada INTENT o AMBIGUOUS sin cierre = operacion INCOMPLETA: la siguiente ejecucion NO sigue hasta resolverla
 * (recuperacion por lectura en sync-apply.mjs). El diario no guarda datos personales: solo clave, ID de Smoobu,
 * operacion, fase, ids de Odoo y codigos.
 */
export const PHASES = Object.freeze({ INTENT: 'INTENT', DONE: 'DONE', FAILED: 'FAILED', AMBIGUOUS: 'AMBIGUOUS', VERIFY_FAILED: 'VERIFY_FAILED', RECOVERED_DONE: 'RECOVERED_DONE', RECOVERED_NOT_APPLIED: 'RECOVERED_NOT_APPLIED' });
const TERMINAL = new Set([PHASES.DONE, PHASES.FAILED, PHASES.RECOVERED_DONE, PHASES.RECOVERED_NOT_APPLIED]);
const ALLOWED_KEYS = new Set(['key', 'smoobuId', 'op', 'phase', 'at', 'orderId', 'partnerId', 'code', 'steps']);

export class Journal {
  constructor({ entries = [], sink = null, now = () => new Date().toISOString() } = {}) { this.entries = [...entries]; this.sink = sink; this.now = now; }
  static fromFile(path) {
    const entries = existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    return new Journal({ entries, sink: (e) => appendFileSync(path, `${JSON.stringify(e)}\n`) });
  }
  record(e) {
    for (const k of Object.keys(e)) if (!ALLOWED_KEYS.has(k)) throw new ConnectorError('SYNC_JOURNAL_FIELD_FORBIDDEN');
    const entry = { at: this.now(), ...e };
    this.entries.push(entry); if (this.sink) this.sink(entry);
    return entry;
  }
  lastOf(key) { for (let i = this.entries.length - 1; i >= 0; i -= 1) if (this.entries[i].key === key) return this.entries[i]; return null; }
  isDone(key) { const l = this.lastOf(key); return !!l && (l.phase === PHASES.DONE || l.phase === PHASES.RECOVERED_DONE); }
  /** Operaciones abiertas: su ultima fase no es terminal (INTENT, AMBIGUOUS o VERIFY_FAILED). */
  incomplete() {
    const last = new Map(); for (const e of this.entries) last.set(e.key, e);
    return [...last.values()].filter((e) => !TERMINAL.has(e.phase));
  }
}

/** Cerrojo exclusivo (archivo creado con 'wx'): dos ejecuciones simultaneas no pueden convivir. */
export class FileLock {
  constructor(path) { this.path = path; this.held = false; }
  acquire(owner = 'sync') {
    let fd;
    try { fd = openSync(this.path, 'wx'); } catch (e) { if (e.code === 'EEXIST') throw new ConnectorError('SYNC_LOCKED'); throw e; }
    writeSync(fd, JSON.stringify({ owner, at: new Date().toISOString() })); closeSync(fd); this.held = true;
  }
  release() { if (this.held) { unlinkSync(this.path); this.held = false; } }
}

/** Cerrojo en memoria para pruebas. */
export class MemoryLock {
  constructor(shared = { held: false }) { this.shared = shared; this.held = false; }
  acquire() { if (this.shared.held) throw new ConnectorError('SYNC_LOCKED'); this.shared.held = true; this.held = true; }
  release() { if (this.held) { this.shared.held = false; this.held = false; } }
}
