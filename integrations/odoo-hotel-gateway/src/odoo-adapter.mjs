import { ContractError, assertSafeUpstreamPayload } from './contract.mjs';
import {
  buildAvailabilityFixture,
  buildQuoteFixture,
  buildHoldFixture,
} from '../fixtures/dry-run-fixtures.mjs';
import { HttpOdooTransport } from './odoo-transport.mjs';

/**
 * OdooHotelAdapter (Fase 4).
 *
 * Traduce el contrato externo del gateway hacia la puerta Odoo YA APROBADA
 * (accion 1967, ver AI/ODOO_HOTEL_STATE.md / HOTEL-006). No reimplementa
 * tarifas, disponibilidad, capacidad ni anti-overbooking: eso vive en Odoo.
 *
 * Dos modos:
 *  - DRY_RUN (dryRun=true, default seguro): usa fixtures locales
 *    deterministas. `hold` NUNCA escribe en Odoo real en este modo.
 *  - LIVE (dryRun=false): llama a Odoo via JSON-RPC reutilizando la accion
 *    1967 como `ir.actions.server`. Requiere ODOO_BASE_URL/ODOO_DATABASE/
 *    ODOO_TECHNICAL_USER/ODOO_TECHNICAL_SECRET reales (fuera del repo). Este
 *    camino esta escrito pero NO probado contra un Odoo real en esta sesion
 *    porque no existen credenciales reales disponibles aqui
 *    (PENDIENTE_CREDENCIAL_SEGURA): antes de usarlo en staging real hay que
 *    validarlo contra la accion 1967 real.
 */
const ODOO_BUSINESS_ERROR_CODES = new Set([
  'UNKNOWN_OP',
  'FORBIDDEN_PARAM',
  'UNKNOWN_PARAM',
  'RATE_LIMITED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'NOT_FOUND',
  'QUOTE_EXPIRED',
  'NOT_QUOTED',
  'UNAVAILABLE',
  'INSUFFICIENT_CAPACITY',
  'REQUIRES_MANUAL_CONFIRMATION',
]);

/**
 * HOTEL-006 no usa el contrato HTTP externo directamente dentro de Odoo.
 * La accion 1967 recibe `op + payload` y, para disponibilidad/cotizacion,
 * usa los nombres comerciales en espanol que quedaron aprobados:
 * `fecha_entrada`, `fecha_salida`, `personas`.
 *
 * `source_channel` NO se reenvia dentro del payload: 1967 lo fuerza a
 * `sofia` del lado Odoo. Aun asi, assertSafeUpstreamPayload exige que el
 * request validado llegue aqui con source_channel='sofia', como defensa
 * fail-closed frente a llamadas directas al adapter.
 */
function toOdooPayload(operation, payload) {
  if (operation === 'availability' || operation === 'quote') {
    return {
      fecha_entrada: payload.check_in,
      fecha_salida: payload.check_out,
      personas: payload.guests,
      ...(payload.property_id !== undefined ? { property_id: payload.property_id } : {}),
      ...(payload.correlation_id ? { correlation_id: payload.correlation_id } : {}),
      ...(operation === 'quote' && payload.idempotency_key
        ? { idempotency_key: payload.idempotency_key }
        : {}),
    };
  }

  if (operation === 'hold') {
    return {
      quote_id: payload.quote_id,
      idempotency_key: payload.idempotency_key,
      ...(payload.correlation_id ? { correlation_id: payload.correlation_id } : {}),
    };
  }

  if (operation === 'status') {
    return {
      operation_id: payload.operation_id,
      ...(payload.correlation_id ? { correlation_id: payload.correlation_id } : {}),
    };
  }

  throw new ContractError('OPERATION_NOT_ALLOWED', `Unsupported operation: ${operation}`);
}

function unwrapOdoo1967Response(raw) {
  let result = raw;

  if (
    raw &&
    typeof raw === 'object' &&
    raw.type === 'ir.actions.client' &&
    raw.tag === 'display_notification' &&
    raw.params &&
    typeof raw.params === 'object'
  ) {
    result = raw.params;
  }

  if (result && typeof result === 'object' && result.ok === false) {
    const upstreamCode =
      typeof result.error_code === 'string' && ODOO_BUSINESS_ERROR_CODES.has(result.error_code)
        ? result.error_code
        : 'INTERNAL_ERROR';
    const upstreamMessage =
      typeof result.message === 'string' && result.message.trim() !== ''
        ? result.message
        : `Odoo HOTEL API rejected operation (${upstreamCode})`;
    throw new ContractError(upstreamCode, upstreamMessage);
  }

  return result;
}

export class OdooHotelAdapter {
  #dryRun;
  #config;
  #clock;
  #transport;
  #quotes = new Map(); // quote_id -> { ...quote, createdAt, expiresAt }
  #holds = new Map(); // hold_id -> { ...hold, createdAt }

  /**
   * @param {object} [options.transport] - transporte JSON-RPC inyectable
   *   (debe exponer `call(service, method, args)`). Si no se pasa, se
   *   construye un `HttpOdooTransport` real a partir de `config.baseUrl`
   *   la primera vez que se necesita (modo LIVE). Los tests inyectan aqui
   *   un transporte simulado para probar el pipeline LIVE sin red ni
   *   credenciales reales.
   */
  constructor({ dryRun = true, config = {}, clock = () => Date.now(), transport = null } = {}) {
    this.#dryRun = dryRun;
    this.#config = config;
    this.#clock = clock;
    this.#transport = transport;
  }

  get isDryRun() {
    return this.#dryRun;
  }

  async availability(request) {
    if (this.#dryRun) {
      return buildAvailabilityFixture(request);
    }
    return this.#callOdooAction1967('availability', request);
  }

  async quote(request) {
    if (this.#dryRun) {
      const fixture = buildQuoteFixture(request);
      const createdAt = this.#clock();
      const expiresAt = createdAt + fixture.expires_at_offset_minutes * 60_000;
      this.#quotes.set(fixture.quote_id, {
        ...fixture,
        createdAt,
        expiresAt,
        status: 'QUOTED',
      });
      return { ...fixture, expires_at: new Date(expiresAt).toISOString() };
    }
    return this.#callOdooAction1967('quote', request);
  }

  async hold(request) {
    if (this.#dryRun) {
      const existingQuote = this.#quotes.get(request.quote_id);
      if (!existingQuote) {
        throw new ContractError('NOT_QUOTED', `No active quote for quote_id ${request.quote_id}`);
      }
      if (this.#clock() > existingQuote.expiresAt) {
        throw new ContractError('QUOTE_EXPIRED', `quote_id ${request.quote_id} expired`);
      }

      const fixture = buildHoldFixture(request);
      const createdAt = this.#clock();
      const holdRecord = {
        ...fixture,
        createdAt,
        expiresAt: createdAt + fixture.hold_duration_minutes * 60_000,
      };
      this.#holds.set(fixture.hold_id, holdRecord);
      existingQuote.status = 'HELD';
      existingQuote.hold_id = fixture.hold_id;
      return fixture;
    }
    return this.#callOdooAction1967('hold', request);
  }

  async status(request) {
    if (this.#dryRun) {
      const quote = this.#quotes.get(request.operation_id);
      if (quote) {
        return {
          dry_run: true,
          operation_id: request.operation_id,
          type: 'quote',
          status: quote.status,
          quote_id: quote.quote_id,
          hold_id: quote.hold_id ?? null,
        };
      }
      const hold = this.#holds.get(request.operation_id);
      if (hold) {
        return {
          dry_run: true,
          operation_id: request.operation_id,
          type: 'hold',
          status: this.#clock() > hold.expiresAt ? 'EXPIRED' : hold.status,
          hold_id: hold.hold_id,
          quote_id: hold.quote_id,
        };
      }
      throw new ContractError('NOT_FOUND', `No operation found for ${request.operation_id}`);
    }
    return this.#callOdooAction1967('status', request);
  }

  /**
   * Camino LIVE. Reutiliza la accion 1967 ya aprobada como
   * `ir.actions.server`, pasando la operacion y el payload validado por
   * contexto real aprobado por HOTEL-006: `{ op, payload }`. La accion 1967
   * fuerza internamente `source_channel='sofia'`; el gateway no permite que
   * el cliente lo controle y tampoco necesita reenviarlo dentro del payload.
   *
   * `assertSafeUpstreamPayload` es la ultima barrera fail-closed antes de
   * salir del proceso: bloquea cualquier campo prohibido que intentara
   * colarse, y ADEMAS exige que `source_channel` sea exactamente 'sofia'
   * (si no lo es, es señal de un bug o de un llamador que se salto
   * `validateRequest`, y se corta ahi mismo en vez de dejarlo pasar).
   *
   * Contra un Odoo real esto sigue sin probarse en este repositorio
   * (PENDIENTE_CREDENCIAL_SEGURA); lo que si esta probado end-to-end es el
   * pipeline completo hasta el borde del transporte, con un transporte
   * simulado inyectado (ver test/odoo-live-pipeline.test.mjs).
   */
  async #callOdooAction1967(operation, payload) {
    assertSafeUpstreamPayload(payload);

    const { baseUrl, database, technicalUser, technicalSecret, actionId = 1967 } = this.#config;

    const transport = this.#transport ?? (baseUrl ? new HttpOdooTransport({ baseUrl }) : null);
    if (!transport || !database || !technicalUser || !technicalSecret) {
      throw new ContractError(
        'INTERNAL_ERROR',
        'Odoo LIVE mode misconfigured: missing transport/ODOO_DATABASE/ODOO_TECHNICAL_USER/ODOO_TECHNICAL_SECRET'
      );
    }

    let uid;
    try {
      uid = await transport.call('common', 'login', [database, technicalUser, technicalSecret]);
    } catch {
      throw new ContractError('INTERNAL_ERROR', 'Odoo upstream error during login');
    }
    if (!uid) {
      throw new ContractError('UNAUTHORIZED', 'Odoo technical login failed');
    }

    const odooPayload = toOdooPayload(operation, payload);

    try {
      const raw = await transport.call('object', 'execute_kw', [
        database,
        uid,
        technicalSecret,
        'ir.actions.server',
        'run',
        [[actionId]],
        { context: { op: operation, payload: odooPayload } },
      ]);
      return unwrapOdoo1967Response(raw);
    } catch (error) {
      if (error instanceof ContractError) throw error;
      throw new ContractError('INTERNAL_ERROR', 'Odoo upstream error');
    }
  }
}
