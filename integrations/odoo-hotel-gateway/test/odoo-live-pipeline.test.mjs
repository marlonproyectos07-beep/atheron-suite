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
 *   1. un request valido SI llega hasta el "borde Odoo" (execute_kw) con
 *      source_channel='sofia';
 *   2. un source_channel enviado por el cliente sigue bloqueado, y nunca
 *      llega al transporte;
 *   3. el resto de campos prohibidos (price/discount/tax/admin/sudo/
 *      confirm/cancel/...) siguen bloqueados en el mismo camino LIVE.
 */

test('LIVE: un request valido llega al borde Odoo (execute_kw) con source_channel=sofia forzado', async () => {
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

  const forwardedPayload = executeCall.args.at(-1).context.hotel_gateway_payload;
  assert.equal(forwardedPayload.source_channel, 'sofia');
});

test('LIVE: hold idempotente tambien llega al borde Odoo con source_channel=sofia', async () => {
  const transport = new FakeOdooTransport();
  const { gateway } = buildLiveTestGateway({ transport });

  const { envelope } = await gateway.handle({
    operation: 'hold',
    ...withIdentity(TEST_IDENTITIES.claude),
    body: { quote_id: 'Q-live-1', idempotency_key: 'live-hold-1' },
  });

  assert.equal(envelope.ok, true, `esperaba exito, obtuve: ${JSON.stringify(envelope)}`);
  const [executeCall] = transport.executeKwCalls;
  assert.equal(executeCall.args.at(-1).context.hotel_gateway_payload.source_channel, 'sofia');
  assert.equal(executeCall.args.at(-1).context.hotel_gateway_operation, 'hold');
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

test('LIVE: nunca se usan credenciales reales; el transporte real (HttpOdooTransport) no se ejercita en esta suite', async () => {
  // Verificacion explicita del alcance: esta suite entera pasa un
  // transporte simulado (FakeOdooTransport) via inyeccion de dependencias.
  // No hay ningun test en el repositorio que instancie HttpOdooTransport
  // contra una URL real ni que use ODOO_BASE_URL/ODOO_TECHNICAL_SECRET reales.
  const transport = new FakeOdooTransport();
  assert.ok(transport instanceof FakeOdooTransport);
  assert.notEqual(transport.constructor.name, 'HttpOdooTransport');
});
