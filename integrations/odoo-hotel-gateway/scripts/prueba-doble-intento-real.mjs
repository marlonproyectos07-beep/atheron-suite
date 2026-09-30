#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-009, Prioridad 3 (endurecer prueba reina) -- doble
 * intento REAL: dos "clientes" distintos intentan reservar la MISMA
 * unidad/fechas en secuencia inmediata. El segundo debe fallar por
 * disponibilidad real (anti-overbooking de Odoo, no logica nuestra).
 * Limpia su propio HOLD al final via Hotel: CANCELAR sobre el registro
 * ganador (manual, ver instrucciones en el resultado).
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { buildGatewayFromEnv } from '../src/bootstrap.mjs';
import { randomUUID } from 'node:crypto';

const config = loadGuardedConfig(process.env);
const CHECK_IN = process.env.PRUEBA_REINA_CHECK_IN;
const CHECK_OUT = process.env.PRUEBA_REINA_CHECK_OUT;
const UNIT_ID = process.env.UNIT_ID || '3'; // 203 por defecto
if (!CHECK_IN || !CHECK_OUT) {
  console.error(JSON.stringify({ overall: 'MISSING_DATES' }, null, 2));
  process.exit(2);
}

const built = buildGatewayFromEnv({ ...process.env, DRY_RUN: 'false' });
const rawKey = randomUUID();
built.identityStore.register({ agentId: 'hotel009-double-attempt-local', actor: 'claude-code', rawKey });

async function call(operation, body) {
  const r = await built.gateway.handle({ operation, agentId: 'hotel009-double-attempt-local', rawKey, body });
  return r;
}

const quoteA = await call('quote', { check_in: CHECK_IN, check_out: CHECK_OUT, guests: 1, property_id: 1, idempotency_key: `double-a-${Date.now()}` });
const quoteIdA = quoteA.envelope.data?.data?.quote_id ?? quoteA.envelope.data?.quote_id;
const holdA = await call('hold', { quote_id: quoteIdA, unit_id: Number(UNIT_ID), idempotency_key: `double-a-hold-${Date.now()}` });

const quoteB = await call('quote', { check_in: CHECK_IN, check_out: CHECK_OUT, guests: 1, property_id: 1, idempotency_key: `double-b-${Date.now()}` });
const quoteIdB = quoteB.envelope.data?.data?.quote_id ?? quoteB.envelope.data?.quote_id;
const holdB = await call('hold', { quote_id: quoteIdB, unit_id: Number(UNIT_ID), idempotency_key: `double-b-hold-${Date.now()}` });

console.log(JSON.stringify({
  overall: holdA.envelope.ok && !holdB.envelope.ok ? 'PASS_NO_OVERBOOKING' : holdA.envelope.ok && holdB.envelope.ok ? 'FAIL_BOTH_HELD' : 'REVIEW',
  cliente_a: { quote_ok: quoteA.envelope.ok, hold_ok: holdA.envelope.ok, hold_id: holdA.envelope.data?.data?.hold_id ?? holdA.envelope.data?.hold_id ?? null, hold_ref: holdA.envelope.data?.data?.hold_ref ?? null },
  cliente_b: { quote_ok: quoteB.envelope.ok, hold_ok: holdB.envelope.ok, error_code: holdB.envelope.error?.code ?? null },
  note: 'Cliente A gana el HOLD; liberar manualmente con Hotel: CANCELAR sobre su hold_ref cuando termine la verificacion.',
}, null, 2));
