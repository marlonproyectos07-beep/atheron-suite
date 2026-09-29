#!/usr/bin/env node
/**
 * ATH-ODOO-STAGING — demuestra que el loader funciono, sin imprimir
 * ningun secreto. Pensado para correr asi:
 *   .\load-odoo-secrets.ps1 -Command "node scripts/secure-store/print-safe-status.mjs"
 */
import { assertStagingEnv, describeStagingConfigSafely, StagingGuardError } from '../../src/config/odoo-staging-guard.mjs';

try {
  const config = assertStagingEnv(process.env);
  console.log('OK: credenciales de staging validas y fail-closed superado.');
  console.log(JSON.stringify(describeStagingConfigSafely(config), null, 2));
} catch (err) {
  if (err instanceof StagingGuardError) {
    console.error(`BLOCKED_STAGING_CREDENTIALS (${err.code}): ${err.message}`);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
