#!/usr/bin/env node
// Lectura REAL de Beds24 (solo GET) → informe SIN valores personales: inventario de campos + validaciones del caso médico.
//   BEDS24_TOKEN=<solo en el entorno> node scripts/ops-beds24-probe.mjs --from 2026-10-01 --to 2027-01-31 --out informe.json
// Sin BEDS24_TOKEN termina con código 3 y dice qué variable falta. El token nunca se imprime.
import fs from 'node:fs';
import { Beds24ReadOnlyClient, createReadOnlyTransport } from '../src/ops/beds24-readonly.mjs';
import { inventoryFields, missingExpectedFields } from '../src/ops/field-probe.mjs';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
if (!process.env.BEDS24_TOKEN) { console.error('FALTA la variable de entorno BEDS24_TOKEN (token Beds24 de SOLO LECTURA, scope read:bookings). No se pide en texto plano.'); process.exit(3); }
const from = arg('from') ?? '2026-10-01'; const to = arg('to') ?? '2027-01-31';
const client = new Beds24ReadOnlyClient({ transport: createReadOnlyTransport({ token: process.env.BEDS24_TOKEN }) });
const raw = await client.listBookings({ from, to });
const inv = inventoryFields(raw);
const report = { range: { from, to }, real_booking_count: raw.length, ...inv, missing_expected_fields: missingExpectedFields(inv) };
const text = JSON.stringify(report, null, 2);
if (arg('out')) fs.writeFileSync(arg('out'), text); else console.log(text);
console.error(`OK lectura real: ${raw.length} reservas; campos esperados ausentes: ${report.missing_expected_fields.length}`);
