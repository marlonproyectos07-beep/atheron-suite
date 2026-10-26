#!/usr/bin/env node
// Sonda de SOLO LECTURA: reserva 161419736 (hab. 301) vs Odoo rol 37.
// Lee credenciales solo de variables de entorno. No imprime secretos ni datos de huespedes.
import { loadSmoobuConfig, loadOdooConfig, envStatus } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { unitForSmoobuApartment } from '../src/unit-map.mjs';

const RESERVATION_ID = 161419736;
let smoobuCfg; let odooCfg;
try { smoobuCfg = loadSmoobuConfig(); odooCfg = loadOdooConfig(); } catch (e) {
  console.log(JSON.stringify({ result: 'BLOCKED', reason: e.code, missing: e.missing, env: envStatus() }, null, 2));
  process.exit(2);
}
try {
  const res = await new SmoobuClient(smoobuCfg).getReservation(RESERVATION_ID);
  const unit = unitForSmoobuApartment(res?.apartment?.id);
  const odoo = new OdooJson2Client(odooCfg);
  const slots = unit ? await odoo.listSlotsForRole(unit.odooRoleId, { from: res.arrival, to: res.departure }) : [];
  console.log(JSON.stringify({
    result: 'EXECUTED', reservationId: RESERVATION_ID, arrival: res.arrival, departure: res.departure,
    unit: unit?.unit ?? null, expectedRole: unit?.odooRoleId ?? null, expectedRoleIs37: unit?.odooRoleId === 37,
    odooSlotsFound: slots.length, odooSlotIds: slots.map((s) => s.id),
  }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ result: 'ERROR', code: e.code ?? 'UNKNOWN', status: e.status ?? null }, null, 2));
  process.exit(1);
}
