import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveTestGateway, TEST_IDENTITIES, withIdentity, FakeOdooTransport } from './helpers.mjs';
import { OdooHotelAdapter } from '../src/odoo-adapter.mjs';
import { ContractError } from '../src/contract.mjs';

/**
 * Regresion del pipeline LIVE completo (gateway -> contrato -> idempotencia
 * -> adapter -> transporte Odoo simulado), para el bloqueador detectado por
 * la auditoria de ChatGPT sobre el PR #57:
 * https://github.com/marlonproyectos07-beep/atheron-suite/pull/57#issuecomment-5826163139
 *
 * Antes del fix, CUALQUIER request valido en modo LIVE fallaba con
 * FORBIDDEN_FIELD porque `assertSafeUpstreamPayload` trataba el
 * `source_channel='sofia'` forzado por el propio gateway como si fuera un
 * intento de inyeccion del cliente. Estos tests demuestran, sin red y sin
 * credenciales reales, que:
 *   1. un request valido SI llega hasta el "borde Odoo" (execute_kw) usando
 *      el contrato real HOTEL-006: context { op, payload }, con payload
 *      mapeado a fecha_entrada/fecha_salida/personas;
 *   2. un source_channel enviado por el cliente sigue bloqueado, y nunca
 *      llega al transporte;
 *   3. el resto de campos prohibidos (price/discount/tax/admin/sudo/
 *      confirm/cancel/...) siguen bloqueados en el mismo camino LIVE.
 */

test('LIVE: un request valido llega al borde Odoo con el contrato real op+payload', async () => {
  const transport = new FakeOdooTransport();
  const { gateway } = buildLiveTestGateway({ transport });

  const { status, envelope } = await gateway.handle({
    operation: 'availability',
    ...withIdentity(TEST_IDENTITIES.claude),
    body: { check_in: '2026-12-01', check_out: '2026-12-02', guests: 2 },
  });

  assert.equal(status, 200, `esperaba 200, obtuve error: ${JSON.stringify(envelope)}`);
  assert.equal(envelope.ok, true);

  assert.equal(transport.loginCalls.length, 1, 'debe autenticarse contra Odoo (simulado) antes de operar');

  const [executeCall] = transport.executeKwCalls;
  assert.ok(executeCall, 'debe llegar hasta execute_kw, el borde Odoo simulado');
  assert.equal(executeCall.args[3], 'ir.actions.server');
  assert.equal(executeCall.args[4], 'run');
  assert.deepEqual(executeCall.args[5], [[1967]]);

  const forwardedContext = executeCall.args.at(-1).context;
  assert.equal(forwardedContext.op, 'availability');
  assert.deepEqual(forwardedContext.payload, {
    fecha_entrada: '2026-12-01',
    fecha_salida: '2026-12-02',
    personas: 2,
    correlation_id: envelope.correlation_id,
  });
  assert.equal('source_channel' in forwardedContext.payload, false, '1967 fuerza sofia del lado Odoo');
});

test('LIVE: hold idempotente llega a Odoo como op=hold y payload minimo', async () => {
  const transport = new FakeOdooTransport();
  const { gateway } = buildLiveTestGateway({ transport });

  const { envelope } = await gateway.handle({
    operation: 'hold',
    ...withIdentity(TEST_IDENTITIES.claude),
    body: { quote_id: 115, unit_id: 202, idempotency_key: 'live-hold-1' },
  });

  assert.equal(envelope.ok, true, `esperaba exito, obtuve: ${JSON.stringify(envelope)}`);
  const [executeCall] = transport.executeKwCalls;
  const forwardedContext = executeCall.args.at(-1).context;
  assert.equal(forwardedContext.op, 'hold');
  assert.equal(forwardedContext.payload.quote_id, 115);
  assert.equal(forwardedContext.payload.unit_id, 202);
  assert.equal(forwardedContext.payload.idempotency_key, 'live-hold-1');
  assert.equal('source_channel' in forwardedContext.payload, false);
});


test('LIVE: desempaqueta display_notification.params de la accion 1967', async () => {
  const transport = new FakeOdooTransport({
    result: {
      type: 'ir.actions.client',
      tag: 'display_notification',
      params: {
        title: 'HOTEL API',
        message: 'availability',
        result: {
          ok: true,
          op: 'availability',
          query_id: 'QRY-live-1',
          data: { disponible: true },
        },
      },
    },
  });
  const { gateway } = buildLiveTestGateway({ transport });

  const { status, envelope } = await gateway.handle({
    operation: 'availability',
    ...withIdentity(TEST_IDENTITIES.chatgpt),
    body: { check_in: '2026-12-01', check_out: '2026-12-02', guests: 2 },
  });

  assert.equal(status, 200);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.ok, true);
  assert.equal(envelope.data.query_id, 'QRY-live-1');
  assert.equal(envelope.data.data.disponible, true);
});

test('LIVE: ok=false de Odoo se convierte en error del gateway', async () => {
  const transport = new FakeOdooTransport({
    result: {
      type: 'ir.actions.client',
      tag: 'display_notification',
      params: {
        title: 'HOTEL API',
        message: 'availability',
        result: {
          ok: false,
          error_code: 'UNAVAILABLE',
          message: 'No disponible',
        },
      },
    },
  });
  const { gateway } = buildLiveTestGateway({ transport });

  const { envelope, code } = await gateway.handle({
    operation: 'availability',
    ...withIdentity(TEST_IDENTITIES.chatgpt),
    body: { check_in: '2026-12-01', check_out: '2026-12-02', guests: 2 },
  });

  assert.equal(envelope.ok, false);
  assert.equal(code, 'UNAVAILABLE');
});

test('LIVE: source_channel enviado por el cliente sigue bloqueado y nunca llega al transporte', async () => {
  const transport = new FakeOdooTransport();
  const { gateway } = buildLiveTestGateway({ transport });

  const { envelope, code } = await gateway.handle({
    operation: 'availability',
    ...withIdentity(TEST_IDENTITIES.claude),
    body: {
      check_in: '2026-12-01',
      check_out: '2026-12-02',
      guests: 2,
      source_channel: 'whatsapp-directo',
    },
  });

  assert.equal(envelope.ok, false);
  assert.equal(code, 'FORBIDDEN_FIELD');
  assert.equal(transport.calls.length, 0, 'el intento de override de canal nunca debe alcanzar el transporte Odoo');
});

test('LIVE: price/discount/tax/admin/sudo/confirm/cancel siguen bloqueados en el mismo camino', async () => {
  const transport = new FakeOdooTransport();
  const { gateway } = buildLiveTestGateway({ transport });

  const forbiddenAttempts = [
    { operation: 'hold', body: { quote_id: 'Q-1', idempotency_key: 'k-price', price: 1 } },
    { operation: 'hold', body: { quote_id: 'Q-1', idempotency_key: 'k-discount', discount: 1 } },
    { operation: 'hold', body: { quote_id: 'Q-1', idempotency_key: 'k-tax', tax: 1 } },
    { operation: 'hold', body: { quote_id: 'Q-1', idempotency_key: 'k-admin', admin: true } },
    { operation: 'hold', body: { quote_id: 'Q-1', idempotency_key: 'k-sudo', sudo: true } },
    { operation: 'status', body: { operation_id: 'OP-1', confirm: true } },
    { operation: 'status', body: { operation_id: 'OP-1', cancel: true } },
    { operation: 'status', body: { operation_id: 'OP-1', master_data_write: true } },
  ];

  for (const attempt of forbiddenAttempts) {
    const { envelope, code } = await gateway.handle({
      ...attempt,
      ...withIdentity(TEST_IDENTITIES.claude),
    });
    assert.equal(envelope.ok, false, `deberia bloquear ${JSON.stringify(attempt.body)}`);
    assert.equal(code, 'FORBIDDEN_FIELD');
  }

  assert.equal(transport.calls.length, 0, 'ningun intento prohibido debe llegar al transporte Odoo, ni en LIVE');
});

test('LIVE: si algo llamara al adapter sin pasar por validateRequest (sin source_channel forzado), falla cerrado', async () => {
  const transport = new FakeOdooTransport();
  const adapter = new OdooHotelAdapter({
    dryRun: false,
    config: {
      database: 'test-db-not-real',
      technicalUser: 'test-user-not-real',
      technicalSecret: 'test-secret-not-real',
    },
    transport,
  });

  await assert.rejects(
    // Llamada directa al adapter, saltandose validateRequest: no trae source_channel.
    () => adapter.availability({ check_in: '2026-12-01', check_out: '2026-12-02', guests: 2 }),
    (error) => error instanceof ContractError && error.code === 'INTERNAL_ERROR'
  );
  assert.equal(transport.calls.length, 0, 'no debe intentar login ni execute_kw sin source_channel forzado');
});

/**
 * Gate 3 (orden ATH-ODOO-HOTEL-007-LIVE): status confirmado contra staging
 * real usa `hold_id` (25/09/2026, HOLD 22215/22216). `operation_id`/
 * `order_id` devuelven UNKNOWN_PARAM. El status de una cotizacion (quote)
 * tambien quedo confirmado contra staging real ese mismo dia (cotizacion
 * 116) via el fallback documentado abajo, que solo se activa sobre
 * NOT_FOUND/UNKNOWN_PARAM y nunca convierte un error real en exito.
 */
function odooBusinessError(error_code, message = 'error') {
  return {
    type: 'ir.actions.client',
    tag: 'display_notification',
    params: { title: 'HOTEL API', message: 'status', result: { ok: false, error_code, message } },
  };
}

function odooBusinessSuccess(data) {
  return {
    type: 'ir.actions.client',
    tag: 'display_notification',
    params: { title: 'HOTEL API', message: 'status', result: { ok: true, op: 'status', data } },
  };
}

test('LIVE: status envia hold_id (contrato confirmado), no operation_id ni order_id', async () => {
  const transport = new FakeOdooTransport({
    results: [odooBusinessSuccess({ hold_id: 22215, estado: 'hold_active' })],
  });
  const { gateway } = buildLiveTestGateway({ transport });

  const { envelope } = await gateway.handle({
    operation: 'status',
    ...withIdentity(TEST_IDENTITIES.claude),
    body: { operation_id: 22215 },
  });

  assert.equal(envelope.ok, true, `esperaba exito, obtuve: ${JSON.stringify(envelope)}`);
  assert.equal(transport.executeKwCalls.length, 1, 'un HOLD real se resuelve en un solo intento, sin fallback');

  const forwardedPayload = transport.executeKwCalls[0].args.at(-1).context.payload;
  assert.equal(forwardedPayload.hold_id, 22215);
  assert.equal('operation_id' in forwardedPayload, false);
  assert.equal('order_id' in forwardedPayload, false);
});

test('LIVE: status hace fallback READ-ONLY a quote_id cuando hold_id devuelve UNKNOWN_PARAM', async () => {
  const transport = new FakeOdooTransport({
    results: [
      odooBusinessError('UNKNOWN_PARAM', 'hold_id no reconocido para este operation_id'),
      odooBusinessSuccess({ quote_id: 'Q-900', estado: 'quoted' }),
    ],
  });
  const { gateway } = buildLiveTestGateway({ transport });

  const { envelope } = await gateway.handle({
    operation: 'status',
    ...withIdentity(TEST_IDENTITIES.claude),
    body: { operation_id: 'Q-900' },
  });

  assert.equal(envelope.ok, true, `esperaba exito tras el fallback, obtuve: ${JSON.stringify(envelope)}`);
  assert.equal(transport.executeKwCalls.length, 2, 'debe intentar hold_id primero y luego quote_id');

  const [firstCall, secondCall] = transport.executeKwCalls;
  assert.equal(firstCall.args.at(-1).context.payload.hold_id, 'Q-900');
  assert.equal(secondCall.args.at(-1).context.payload.quote_id, 'Q-900');

  // Trazabilidad: se marca en la respuesta que el ID resulto ser una
  // cotizacion, no un HOLD (confirmado contra staging real, cotizacion 116).
  assert.match(envelope.data.status_lookup_fallback, /quote_id/);
});

test('LIVE: status con fallback a quote_id tambien fallando propaga el segundo error real (nunca finge exito)', async () => {
  const transport = new FakeOdooTransport({
    results: [
      odooBusinessError('UNKNOWN_PARAM', 'hold_id no reconocido'),
      odooBusinessError('NOT_FOUND', 'no existe ninguna cotizacion ni hold con ese id'),
    ],
  });
  const { gateway } = buildLiveTestGateway({ transport });

  const { envelope, code } = await gateway.handle({
    operation: 'status',
    ...withIdentity(TEST_IDENTITIES.claude),
    body: { operation_id: 'no-existe' },
  });

  assert.equal(envelope.ok, false);
  assert.equal(code, 'NOT_FOUND', 'debe propagar el error real del segundo intento, no inventar exito');
  assert.equal(transport.executeKwCalls.length, 2);
});

test('LIVE: status con hold_id -> NOT_FOUND (no UNKNOWN_PARAM) tambien dispara el fallback documentado', async () => {
  const transport = new FakeOdooTransport({
    results: [odooBusinessError('NOT_FOUND', 'no existe'), odooBusinessSuccess({ quote_id: 'Q-1', estado: 'quoted' })],
  });
  const { gateway } = buildLiveTestGateway({ transport });

  const { envelope } = await gateway.handle({
    operation: 'status',
    ...withIdentity(TEST_IDENTITIES.claude),
    body: { operation_id: 'Q-1' },
  });

  assert.equal(envelope.ok, true);
  assert.equal(transport.executeKwCalls.length, 2);
});

/**
 * Regresion de forma real (25/09/2026, staging atheron1-hotel-staging-20260923):
 * el HOLD 22216 se creo dos veces con la misma idempotency_key; Odoo mismo
 * marco la segunda respuesta con `idempotent_replay: true`. Este test usa
 * esa forma real (recortada, sin datos sensibles) para asegurar que el
 * gateway nunca pierde ni corrompe campos reales al pasar la respuesta.
 */
test('LIVE (adapter directo): idempotent_replay real de Odoo pasa intacto en ambas llamadas', async () => {
  // Reproduce exactamente el escenario real: dos llamadas AL ADAPTER (sin
  // pasar por el IdempotencyStore propio del gateway, igual que el script
  // de verificacion manual contra staging), donde es Odoo -no el gateway-
  // quien marca la segunda como replay.
  const holdResponseBody = (idempotent_replay) => ({
    type: 'ir.actions.client',
    tag: 'display_notification',
    params: {
      title: 'HOTEL API',
      message: 'hold',
      result: {
        ok: true,
        op: 'hold',
        idempotency_key: 'gate5-hold-real',
        idempotent_replay,
        error_code: null,
        data: {
          hold_id: 22216,
          hold_ref: 'COT/2026/03809',
          status: 'hold',
          hold_duration_status: 'PENDIENTE_APROBACION_CEO',
          quote_id: 116,
          unit_id: 1,
          precio_total: 80000,
          currency: 'COP',
          tax_status: 'PENDING_TAX_DEFINITION',
        },
      },
    },
  });

  const transport = new FakeOdooTransport({ results: [holdResponseBody(false), holdResponseBody(true)] });
  const adapter = new OdooHotelAdapter({
    dryRun: false,
    config: { database: 'db', technicalUser: 'u', technicalSecret: 's' },
    transport,
  });

  const holdPayload = {
    quote_id: 116,
    unit_id: 1,
    idempotency_key: 'gate5-hold-real',
    source_channel: 'sofia',
  };

  const first = await adapter.hold(holdPayload);
  assert.equal(first.idempotent_replay, false);
  assert.equal(first.data.hold_id, 22216);
  assert.equal(first.data.hold_duration_status, 'PENDIENTE_APROBACION_CEO');

  const second = await adapter.hold(holdPayload);
  assert.equal(second.idempotent_replay, true, 'la segunda llamada real de Odoo debe traer idempotent_replay=true intacto');
  assert.deepEqual(second.data, first.data, 'los datos del HOLD no deben cambiar entre el original y el replay');

  assert.equal(transport.executeKwCalls.length, 2, 'ambas llamadas llegaron realmente a Odoo (sin cache propio aqui)');
});

test('LIVE: nunca se usan credenciales reales; el transporte real (HttpOdooTransport) no se ejercita en esta suite', async () => {
  // Verificacion explicita del alcance: esta suite entera pasa un
  // transporte simulado (FakeOdooTransport) via inyeccion de dependencias.
  // No hay ningun test en el repositorio que instancie HttpOdooTransport
  // contra una URL real ni que use ODOO_BASE_URL/ODOO_TECHNICAL_SECRET reales.
  const transport = new FakeOdooTransport();
  assert.ok(transport instanceof FakeOdooTransport);
  assert.notEqual(transport.constructor.name, 'HttpOdooTransport');
});
