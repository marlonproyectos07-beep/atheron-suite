#!/usr/bin/env node
// Genera el CENTRO DE OPERACIONES (HTML) a partir de Beds24 en SOLO LECTURA o de datos sintéticos.
//   node scripts/ops-dashboard.mjs --fixture medico --as-of 2026-10-12 --out /ruta/salida.html
//   BEDS24_TOKEN=... node scripts/ops-dashboard.mjs --live --as-of 2026-10-12 --registry registro.json --out salida.html
// --live solo ejecuta GET (ver src/ops/beds24-readonly.mjs). El token se lee SOLO del entorno; nunca se imprime.
import fs from 'node:fs';
import { addDays } from '../src/ops/dates.mjs';
import { buildOps } from '../src/ops/ops-board.mjs';
import { renderDashboardHtml } from '../src/ops/render-html.mjs';
import { Beds24ReadOnlyClient, createReadOnlyTransport, normalizeBeds24Booking } from '../src/ops/beds24-readonly.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]] : a), []));
const asOf = args['as-of'];
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '')) { console.error('Falta --as-of AAAA-MM-DD'); process.exit(2); }

let raw; let registry = []; let confirmedPayments = [];
if (args.fixture === 'medico') {
  const f = await import('../test/fixtures/ops-medico.mjs');
  raw = [...f.rawMedico(), ...f.otherBookings()]; registry = f.registryMedico(); confirmedPayments = f.ledgerFirstPaid();
} else if (args.live) {
  const client = new Beds24ReadOnlyClient({ transport: createReadOnlyTransport({ token: process.env.BEDS24_TOKEN }) });
  raw = await client.listBookings({ from: addDays(asOf, -7), to: addDays(asOf, 120) });
  if (args.registry) registry = JSON.parse(fs.readFileSync(args.registry, 'utf8'));
  if (args.ledger) confirmedPayments = JSON.parse(fs.readFileSync(args.ledger, 'utf8'));
} else { console.error('Use --fixture medico o --live'); process.exit(2); }

const ops = buildOps({ bookings: raw.map((r) => normalizeBeds24Booking(r)), registry, confirmedPayments, asOf });
const html = renderDashboardHtml(ops);
if (args.out && args.out !== true) fs.writeFileSync(args.out, html); else process.stdout.write(html);
console.error(`OK ${ops.stays.length} estadías · ${ops.anomalies.length} avisos · sobreventas ${ops.answers.sobreventas.length}`);
