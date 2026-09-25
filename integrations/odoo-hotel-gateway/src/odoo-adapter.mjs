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
   * contexto -- incluyendo `source_channel: 'sofia'`, que Odoo necesita
   * para aplicar las reglas ya aprobadas en HOTEL-006 para ese canal.
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

    try {
      return await transport.call('object', 'execute_kw', [
        database,
        uid,
        technicalSecret,
        'ir.actions.server',
        'run',
        [[actionId]],
        { context: { hotel_gateway_operation: operation, hotel_gateway_payload: payload } },
      ]);
    } catch {
      throw new ContractError('INTERNAL_ERROR', 'Odoo upstream error');
    }
  }
}
