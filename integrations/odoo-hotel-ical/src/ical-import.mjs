/**
 * Importador iCal Nivel 1 (Workstream G). Parsea eventos VEVENT de un feed
 * iCal externo (Booking/Airbnb) y los normaliza en BLOQUEOS DE CALENDARIO
 * puros -- nunca en "reservas comerciales". Un iCal externo no trae precio,
 * comision, payout, telefono ni email: si algun feed real los trajera, este
 * modulo los descarta a proposito para no mezclar CALENDAR BLOCK con
 * COMMERCIAL RESERVATION (esa distincion es la que ya causo confusion
 * financiera real, ver AI/ATH-ODOO-HOTEL-008_OTA_MAP.md).
 *
 * No conecta a Booking/Airbnb todavia: fetchAndImport recibe el fetcher
 * inyectado para poder probarse sin red real.
 */

function unfoldLines(text) {
  // RFC 5545: una linea que continua empieza con espacio o tab.
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.trim() !== '') {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcsDate(value) {
  // Soporta VALUE=DATE (YYYYMMDD) y DATE-TIME (YYYYMMDDTHHMMSSZ).
  const digits = value.replace(/[^0-9TZ]/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return digits; // se deja crudo si trae hora; quien lo use decide como truncarlo.
}

/** Parsea el texto iCal en eventos crudos {uid, dtstart, dtend, summary, description, status}. */
export function parseIcal(icsText) {
  const lines = unfoldLines(icsText);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const rawKey = line.slice(0, sep);
    const value = line.slice(sep + 1);
    const key = rawKey.split(';')[0];

    switch (key) {
      case 'UID':
        current.uid = value;
        break;
      case 'DTSTART':
        current.dtstart = parseIcsDate(value);
        break;
      case 'DTEND':
        current.dtend = parseIcsDate(value);
        break;
      case 'SUMMARY':
        current.summary = value;
        break;
      case 'DESCRIPTION':
        current.description = value;
        break;
      case 'STATUS':
        current.status = value;
        break;
      default:
        break;
    }
  }
  return events;
}

/** Normaliza un evento crudo a un CALENDAR BLOCK, sin datos comerciales. */
export function normalizeEvent(rawEvent, { source, unit }) {
  if (!rawEvent.uid) throw new Error('EVENT_WITHOUT_UID');
  if (!rawEvent.dtstart || !rawEvent.dtend) throw new Error('EVENT_WITHOUT_DATES');
  return {
    uid: rawEvent.uid,
    source,
    unit,
    start: rawEvent.dtstart,
    end: rawEvent.dtend,
    summary: rawEvent.summary ?? null,
    description: rawEvent.description ?? null,
    cancelled: rawEvent.status === 'CANCELLED',
  };
}

/**
 * Store idempotente en memoria (pluggable: puede respaldarse en otra
 * persistencia despues, hoy solo se usa en tests/fixtures).
 */
export class IcalImportStore {
  constructor() {
    this.blocks = new Map(); // key: `${source}:${unit}:${uid}` -> block
    this.log = [];
    this.lastSyncAt = new Map(); // key: `${source}:${unit}` -> ISO timestamp
    this.errorState = new Map(); // key: `${source}:${unit}` -> {message, at}
  }

  _key(block) {
    return `${block.source}:${block.unit}:${block.uid}`;
  }

  _record(action, block) {
    this.log.push({ at: new Date().toISOString(), action, key: this._key(block) });
  }

  /** Inserta o actualiza un bloque. Nunca duplica por (uid + source). */
  upsert(block) {
    const key = this._key(block);
    const existing = this.blocks.get(key);

    if (!existing) {
      this.blocks.set(key, block);
      this._record(block.cancelled ? 'created_cancelled' : 'created', block);
      return 'created';
    }

    const changed = existing.start !== block.start || existing.end !== block.end || existing.cancelled !== block.cancelled;
    if (!changed) {
      this._record('unchanged', block);
      return 'unchanged';
    }

    this.blocks.set(key, block);
    this._record(block.cancelled && !existing.cancelled ? 'tombstoned' : 'updated', block);
    return block.cancelled && !existing.cancelled ? 'tombstoned' : 'updated';
  }

  /** Bloques activos (no cancelados) de una unidad/fuente. */
  getActive(source, unit) {
    return [...this.blocks.values()].filter((b) => b.source === source && b.unit === unit && !b.cancelled);
  }

  markSynced(source, unit, at = new Date().toISOString()) {
    this.lastSyncAt.set(`${source}:${unit}`, at);
    this.errorState.delete(`${source}:${unit}`);
  }

  markError(source, unit, message, at = new Date().toISOString()) {
    this.errorState.set(`${source}:${unit}`, { message, at });
  }

  getSyncState(source, unit) {
    return {
      lastSyncAt: this.lastSyncAt.get(`${source}:${unit}`) ?? null,
      error: this.errorState.get(`${source}:${unit}`) ?? null,
    };
  }
}

/**
 * Importa un lote de eventos ya parseados a un store, y reconcilia contra
 * lo que ya habia: cualquier bloque activo previo que NO vino en este lote
 * se marca cancelado (tombstone implicito) -- asi se limpia un fantasma si
 * la OTA lo elimino y el feed ya no lo trae, sin borrar el historial.
 */
export function reconcileImport(store, source, unit, incomingRawEvents) {
  const incomingUids = new Set();
  for (const raw of incomingRawEvents) {
    const block = normalizeEvent(raw, { source, unit });
    incomingUids.add(block.uid);
    store.upsert(block);
  }
  for (const existing of store.getActive(source, unit)) {
    if (!incomingUids.has(existing.uid)) {
      store.upsert({ ...existing, cancelled: true });
    }
  }
}

/**
 * Importa con reintentos. `fetcher` es inyectable (nunca red real desde
 * aqui) para poder probarse con fixtures y simular fallos.
 */
export async function importWithRetry(fetcher, { source, unit, store, maxRetries = 2 }) {
  let attempts = 0;
  let lastError = null;
  while (attempts <= maxRetries) {
    attempts += 1;
    try {
      const icsText = await fetcher();
      const events = parseIcal(icsText);
      reconcileImport(store, source, unit, events);
      store.markSynced(source, unit);
      return { status: 'PASS', attempts, imported: events.length };
    } catch (error) {
      lastError = error;
    }
  }
  store.markError(source, unit, String(lastError?.message ?? lastError));
  return { status: 'FAIL', attempts, error: String(lastError?.message ?? lastError) };
}
