#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-008 — Objetivo 3 (diagnostico gateway -> odoo staging).
 *
 * Prueba AISLADA: Gateway (en proceso, sin HTTP, sin tocar el servidor que
 * ya corre en :8787 ni el tunel) -> Odoo STAGING real, SOLO availability.
 * No crea HOLD. No cotiza. No modifica nada.
 *
 * Requiere las 5 variables ODOO_* ya cargadas en el proceso (usar
 * scripts/secure-store/load-odoo-secrets.ps1 -Command "..."). Nunca lee ni
 * imprime HOTEL_WEB_AGENT_KEY (esa es una credencial distinta, del lado
 * Vercel/gateway HTTP, no de esta prueba).
 *
 * Uso:
 *   node scripts/prueba-availability-directa.mjs
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
const rawKey = randomUUID(); // identidad LOCAL de un solo uso, nunca impresa, nunca la de Vercel
built.identityStore.register({ agentId: 'hotel008a-diag-local', actor: 'codex', rawKey });

const CHECK_IN = '2026-11-10';
const CHECK_OUT = '2026-11-12';
const GUESTS = 2;
const UNIT_ID_201 = process.env.UNIT_ID_201?.trim() || '1'; // confirmado por el CEO: 201 = unit_id 1

const r = await built.gateway.handle({
  operation: 'availability',
  agentId: 'hotel008a-diag-local',
  rawKey,
  // source_channel NO va en el body: el contrato lo bloquea si lo manda el
  // cliente (FORBIDDEN_FIELD) y lo fuerza el propio servidor a partir del
  // agente autenticado (igual que ya prueba test/odoo-live-pipeline.test.mjs).
  body: { check_in: CHECK_IN, check_out: CHECK_OUT, guests: GUESTS },
});

if (!r.envelope.ok) {
  console.log(JSON.stringify({
    overall: 'FAIL',
    gateway_error_code: r.envelope.error?.code ?? r.code ?? null,
    gateway_error_message: r.envelope.error?.message ?? null,
    note: 'Fallo directo Gateway -> Odoo, SIN pasar por HTTP/tunel/Vercel. No es un problema de web-hotel-007 ni del tunel.',
  }, null, 2));
  process.exit(1);
}

const data = r.envelope.data && typeof r.envelope.data === 'object' && r.envelope.data.data ? r.envelope.data.data : r.envelope.data;
const units = Array.isArray(data?.opciones)
  ? data.opciones.map((u) => ({ ...u, available: u.estado === 'disponible' ? true : u.estado === 'no_disponible' ? false : null }))
  : Array.isArray(data?.units) ? data.units : [];
const unit201 = units.find((u) => String(u.unit_id) === String(UNIT_ID_201)) ?? null;

console.log(JSON.stringify({
  overall: 'PASS',
  odoo_database: config.database,
  odoo_action_id: config.actionId,
  check_in: CHECK_IN,
  check_out: CHECK_OUT,
  guests: GUESTS,
  total_units_returned: units.length,
  unit_201: unit201,
  dry_run_flag_in_response: data?.dry_run ?? null,
  note: 'Prueba directa Gateway -> Odoo STAGING, sin HTTP, sin HOLD, sin cotizar.',
}, null, 2));
