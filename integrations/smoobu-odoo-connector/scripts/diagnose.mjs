#!/usr/bin/env node
// Diagnostico de solo lectura Smoobu + Odoo. Credenciales solo desde variables de entorno.
import { runDiagnosis } from '../src/diagnose.mjs';
const report = await runDiagnosis();
console.log(JSON.stringify(report, null, 2));
process.exit(report.overall === 'OK' ? 0 : report.overall === 'BLOCKED' ? 2 : 1);
