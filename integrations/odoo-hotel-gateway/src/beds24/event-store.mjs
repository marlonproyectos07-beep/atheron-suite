import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Beds24Error } from './errors.mjs';

const sha = (text) => createHash('sha256').update(text).digest('hex');
const copy = (value) => structuredClone(value);
const initial = () => ({ version: 1, uncertain: true, reservations: {}, events: {} });
function eventKey(eventId) {
  if (typeof eventId !== 'string' || !eventId.trim()) throw new Beds24Error('EVENT_ID_REQUIRED');
  return sha(eventId);
}

/**
 * Local single-host implementation of the Beds24EventStore port. The directory
 * must live outside Git and on one local filesystem; no guest or secret fields
 * are accepted by the processor that writes to this store.
 */
export class FileBeds24EventStore {
  #directory;
  #statePath;
  #locksPath;
  #held = new Map();
  #clock;
  #beforeReplace;

  constructor({ directory, clock = () => new Date().toISOString(), beforeReplace = null } = {}) {
    if (typeof directory !== 'string' || !directory.trim()) {
      throw new Beds24Error('STORE_DIRECTORY_REQUIRED');
    }
    this.#directory = resolve(directory);
    this.#statePath = join(this.#directory, 'events.json');
    this.#locksPath = join(this.#directory, 'locks');
    this.#clock = clock;
    mkdirSync(this.#directory, { recursive: true, mode: 0o700 });
    if (lstatSync(this.#directory).isSymbolicLink()) throw new Beds24Error('STORE_PATH_INVALID');
    mkdirSync(this.#locksPath, { recursive: true, mode: 0o700 });
    if (!existsSync(this.#statePath)) this.#write(initial());
    this.#read();
    this.#beforeReplace = beforeReplace;
  }

  get requiresOdooPort() { return true; }

  #read() {
    let envelope;
    try { envelope = JSON.parse(readFileSync(this.#statePath, 'utf8')); }
    catch { throw new Beds24Error('STORE_CORRUPT'); }
    const payload = envelope?.payload;
    if (!payload || payload.version !== 1 || typeof payload.uncertain !== 'boolean' ||
        !payload.reservations || typeof payload.reservations !== 'object' ||
        !payload.events || typeof payload.events !== 'object' ||
        envelope.checksum !== sha(JSON.stringify(payload))) {
      throw new Beds24Error('STORE_CORRUPT');
    }
    return payload;
  }

  #write(payload) {
    const temp = join(this.#directory, `events-${randomUUID()}.tmp`);
    const envelope = JSON.stringify({ payload, checksum: sha(JSON.stringify(payload)) });
    let fd;
    try {
      fd = openSync(temp, 'wx', 0o600);
      writeFileSync(fd, envelope, 'utf8');
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      this.#beforeReplace?.();
      renameSync(temp, this.#statePath);
    } catch (error) {
      if (fd !== undefined) closeSync(fd);
      if (existsSync(temp)) unlinkSync(temp);
      if (error instanceof Beds24Error) throw error;
      throw new Beds24Error('STORE_WRITE_FAILED');
    }
  }

  #mutate(change) {
    const lockPath = join(this.#directory, 'state.lock');
    let fd;
    try { fd = openSync(lockPath, 'wx', 0o600); }
    catch (error) {
      throw new Beds24Error(error?.code === 'EEXIST' ? 'STORE_LOCK_BUSY' : 'STORE_LOCK_FAILED',
        { retryable: error?.code === 'EEXIST' });
    }
    try {
      const next = copy(this.#read());
      const result = change(next);
      this.#write(next);
      return result;
    } finally {
      closeSync(fd);
      unlinkSync(lockPath);
    }
  }

  acquireIdempotencyLock(key) {
    if (typeof key !== 'string' || !key) throw new Beds24Error('LOCK_KEY_INVALID');
    const path = join(this.#locksPath, `${sha(key)}.lock`);
    let fd;
    try {
      fd = openSync(path, 'wx', 0o600);
      writeFileSync(fd, JSON.stringify({ at: this.#clock(), pid: process.pid }));
      fsyncSync(fd);
    } catch (error) {
      if (fd !== undefined) closeSync(fd);
      if (fd !== undefined && existsSync(path)) unlinkSync(path);
      throw new Beds24Error(error?.code === 'EEXIST' ? 'IDEMPOTENCY_LOCK_BUSY' : 'LOCK_WRITE_FAILED',
        { retryable: error?.code === 'EEXIST' });
    }
    const token = randomUUID();
    this.#held.set(key, { path, fd, token });
    return token;
  }

  releaseIdempotencyLock(key, token) {
    const held = this.#held.get(key);
    if (!held || held.token !== token) throw new Beds24Error('LOCK_NOT_OWNED');
    closeSync(held.fd);
    unlinkSync(held.path);
    this.#held.delete(key);
  }

  hasProcessed(eventId) { return this.#read().events[eventKey(eventId)]?.status === 'PROCESSED'; }
  getEvent(eventId) { return copy(this.#read().events[eventKey(eventId)] ?? null); }
  getReservationState(reservationId) { return copy(this.#read().reservations[reservationId] ?? null); }
  get(reservationId) { return this.getReservationState(reservationId); }
  list() { return Object.values(this.#read().reservations).map(copy); }
  upsert() { throw new Beds24Error('DURABLE_PROCESSOR_REQUIRED'); }
  isCertain() {
    const state = this.#read();
    return !state.uncertain && !Object.values(state.events).some((e) => e.status !== 'PROCESSED');
  }
  markUncertain() { this.#mutate((state) => { state.uncertain = true; }); }
  clearUncertain() {
    this.#mutate((state) => {
      if (Object.values(state.events).some((e) => e.status !== 'PROCESSED')) {
        throw new Beds24Error('RECONCILIATION_REQUIRED');
      }
      state.uncertain = false;
    });
  }

  recordReceived(eventId, metadata) {
    this.#mutate((state) => {
      const key = eventKey(eventId);
      const prior = state.events[key];
      if (prior && prior.signature !== metadata.signature) throw new Beds24Error('EVENT_ID_REUSED');
      if (prior) return;
      state.events[key] = { eventId, status: 'PENDING_RETRY', signature: metadata.signature,
        reservationId: metadata.reservationId, event: metadata.event,
        attempts: 0, errorClass: null, nextRetryAt: this.#clock(),
        createdAt: this.#clock(), updatedAt: this.#clock() };
      state.uncertain = true;
    });
  }

  recordFailure(eventId, errorClass, { retryable = false } = {}) {
    this.#mutate((state) => {
      const event = state.events[eventKey(eventId)];
      if (!event || event.status === 'PROCESSED') throw new Beds24Error('EVENT_STATE_INVALID');
      event.attempts += 1;
      event.errorClass = String(errorClass);
      event.status = retryable ? 'PENDING_RETRY' : 'FAILED';
      event.nextRetryAt = retryable
        ? new Date(Date.parse(this.#clock()) + Math.min(60_000, 1000 * 2 ** event.attempts)).toISOString()
        : null;
      event.updatedAt = this.#clock();
      state.uncertain = true;
    });
  }

  listPendingRetries() {
    return Object.values(this.#read().events).filter((event) => event.status === 'PENDING_RETRY')
      .map(copy);
  }

  markProcessed(eventId, metadata = {}) {
    this.#mutate((state) => {
      const event = state.events[eventKey(eventId)];
      if (!event) throw new Beds24Error('EVENT_STATE_INVALID');
      event.status = 'PROCESSED';
      event.result = metadata.result ?? 'PROCESSED';
      event.nextRetryAt = null;
      event.updatedAt = this.#clock();
    });
  }

  saveReservationState(reservationId, reservation) {
    this.#mutate((state) => { state.reservations[reservationId] = copy(reservation); });
  }

  /** Event acknowledgement and reservation state share one atomic replacement. */
  commitProcessed(eventId, reservationId, reservation, result) {
    this.#mutate((state) => {
      const event = state.events[eventKey(eventId)];
      if (!event || event.reservationId !== reservationId ||
          event.signature !== reservation.signature) throw new Beds24Error('EVENT_STATE_INVALID');
      state.reservations[reservationId] = copy(reservation);
      event.status = 'PROCESSED';
      event.result = result;
      event.nextRetryAt = null;
      event.updatedAt = this.#clock();
    });
  }
}
