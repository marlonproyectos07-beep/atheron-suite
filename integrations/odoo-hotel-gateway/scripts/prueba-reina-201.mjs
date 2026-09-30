#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-009, Gate 009-D — "prueba reina" REAL contra Odoo STAGING,
 * paso de verificacion (disponibilidad antes/despues). Solo LEE (operacion
 * `availability`), nunca crea HOLD por si solo -- eso lo hace
 * live-hotel-008a-runner.mjs (fase inverse-gate), ya probado.
 *
 * Uso (requiere las 5 variables ODOO_* ya inyectadas via
 * scripts/secure-store/load-odoo-secrets.ps1):
 *   PRUEBA_REINA_CHECK_IN=2027-01-28 PRUEBA_REINA_CHECK_OUT=2027-01-29 \
 *   node scripts/prueba-reina-201.mjs
 */
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { buildGatewayFromEnv } from '../src/bootstrap.mjs';
import { randomUUID } from 'node:crypto';

let config;
try {
  config = loadGuardedConfig(process.env);
} catch (error) {
  console.error(JSON.stringify({ overall: 'BLOCKED_CREDENTIALS', reason: error.message }, null, 2));
  process.exit(2);
}

const built = buildGatewayFromEnv({ ...process.env, DRY_RUN: 'false' });
const rawKey = randomUUID();
built.identityStore.register({ agentId: 'hotel009-queen-test-local', actor: 'claude-code', rawKey });

const CHECK_IN = process.env.PRUEBA_REINA_CHECK_IN;
const CHECK_OUT = process.env.PRUEBA_REINA_CHECK_OUT;
if (!CHECK_IN || !CHECK_OUT) {
  console.error(JSON.stringify({ overall: 'MISSING_DATES', reason: 'PRUEBA_REINA_CHECK_IN/CHECK_OUT son obligatorias (no se inventan).' }, null, 2));
  process.exit(2);
}

const r = await built.gateway.handle({
  operation: 'availability',
  agentId: 'hotel009-queen-test-local',
  rawKey,
  body: { check_in: CHECK_IN, check_out: CHECK_OUT, guests: 1, property_id: 1 },
});

if (!r.envelope.ok) {
  console.log(JSON.stringify({ overall: 'FAIL', gateway_error_code: r.envelope.error?.code ?? r.code ?? null }, null, 2));
  process.exit(1);
}

const data = r.envelope.data?.data ?? r.envelope.data;
const units = Array.isArray(data?.opciones)
  ? data.opciones.map((u) => ({ nombre: u.nombre, unit_id: u.unit_id, estado: u.estado }))
  : [];

console.log(JSON.stringify({ overall: 'PASS', check_in: CHECK_IN, check_out: CHECK_OUT, units }, null, 2));
