#!/usr/bin/env node
// ATH-PMS-WA-058B. Solo GET /api/rates, acotado, con armado explicito. No reservar ni cambiar tarifas.
import { loadSmoobuConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { UNITS } from '../src/unit-map.mjs';
import { inspectDailyRates, validateRatesInput } from '../src/rates-readonly.mjs';
const allowed = UNITS.filter((u) => u.unit !== 'CASA').map((u) => u.smoobuApartmentId);
if (process.env.RATES_READONLY_ARM !== 'ATH-PMS-WA-058C-LECTURA') {
  console.log(JSON.stringify({ result: 'NOT_ARMED', requests: 0 }));
  process.exit(2);
}
try {
  const { from, to, ids } = validateRatesInput({ startDate: process.env.RATES_FROM, endDate: process.env.RATES_TO, apartmentIds: allowed });
  const client = new SmoobuClient({ ...loadSmoobuConfig(process.env) });
  const data = await client.getRates({ startDate: from, endDate: to, apartmentIds: ids });
  const summary = inspectDailyRates({ rates: data, arrival: from, departure: to, physicalIds: ids });
  console.log(JSON.stringify({ result: 'READ_ONLY_RATES', requests: 1, from, to, apartmentCount: ids.length, summary, warning: 'NO_BOOKING_OR_FINAL_QUOTE; CASA_MAPPING_PENDING' }));
} catch (e) {
  console.log(JSON.stringify({ result: 'READ_ONLY_RATES_FAILED', code: e.code || 'UNKNOWN', httpStatus: e.status || null }));
  process.exit(1);
}
