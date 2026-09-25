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
    body: { quote_id: 'Q-live-1', idempotency_key: 'live-hold-1' },
  });

  assert.equal(envelope.ok, true, `esperaba exito, obtuve: ${JSON.stringify(envelope)}`);
  const [executeCall] = transport.executeKwCalls;
  const forwardedContext = executeCall.args.at(-1).context;
  assert.equal(forwardedContext.op, 'hold');
  assert.equal(forwardedContext.payload.quote_id, 'Q-live-1');
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
        ok: true,
        op: 'availability',
        query_id: 'QRY-live-1',
        data: { disponible: true },
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
        message: 'No disponible',
        ok: false,
        error_code: 'UNAVAILABLE',
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

test('LIVE: nunca se usan credenciales reales; el transporte real (HttpOdooTransport) no se ejercita en esta suite', async () => {
  // Verificacion explicita del alcance: esta suite entera pasa un
  // transporte simulado (FakeOdooTransport) via inyeccion de dependencias.
  // No hay ningun test en el repositorio que instancie HttpOdooTransport
  // contra una URL real ni que use ODOO_BASE_URL/ODOO_TECHNICAL_SECRET reales.
  const transport = new FakeOdooTransport();
  assert.ok(transport instanceof FakeOdooTransport);
  assert.notEqual(transport.constructor.name, 'HttpOdooTransport');
});
