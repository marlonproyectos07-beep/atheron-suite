#!/usr/bin/env node
// Simulacion offline del caso piloto 161419736 (301, 26-27 oct 2026). No usa red ni escribe nada.
import { readFileSync } from 'node:fs';
import { reconcile } from '../src/reconcile.mjs';
const fx = JSON.parse(readFileSync(new URL('../fixtures/pilot-161419736.json', import.meta.url)));
const r = reconcile({ bookings: [fx.booking], slots: fx.odooSlotsRole37 });
console.log(JSON.stringify(r, null, 2));
