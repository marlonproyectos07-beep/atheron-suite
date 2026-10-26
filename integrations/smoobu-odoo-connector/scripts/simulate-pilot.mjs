#!/usr/bin/env node
// Simulacion offline del piloto 161419736 (301, 26-27 oct 2026) contra turnos REALES anonimizados de Odoo. Sin red ni escrituras.
import { readFileSync } from 'node:fs';
import { reconcile } from '../src/reconcile.mjs';
const fx = JSON.parse(readFileSync(new URL('../fixtures/pilot-161419736.json', import.meta.url)));
const real = JSON.parse(readFileSync(new URL('../fixtures/real-calibration-2026-10-26.json', import.meta.url)));
const r = reconcile({ bookings: [fx.booking], slots: real.slots });
console.log(JSON.stringify(r, null, 2));
