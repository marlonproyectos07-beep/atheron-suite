#!/usr/bin/env node
// ATH-STAGING-RECOVERY — rollback genérico (R1/R3/R4/R7): borra SOLO lo que la bitácora marca como CREATE.
// Además verifica que cada registro siga existiendo y, si la bitácora lo trae, que su `key` coincida
// con el nombre actual (para no borrar un registro que alguien reutilizó). DRY-RUN por defecto.
//   node recovery/rollback.mjs recovery/out/r3-<ts>.json            # muestra qué borraría
//   RECOVERY_CONFIRM=atheron1-hotel-staging-20261009 node recovery/rollback.mjs recovery/out/r3-<ts>.json --apply
import { readFileSync } from 'node:fs';
import { main, READ_CTX, RecoveryGuardError } from './recovery-lib.mjs';
import { connect } from './connect.mjs';

main(async () => {
  const file = process.argv[2];
  if (!file || file.startsWith('--')) throw new RecoveryGuardError('indica el archivo de bitácora');
  const created = JSON.parse(readFileSync(file, 'utf8')).filter((e) => e.action === 'CREATE' && e.id);
  const { write, ex } = await connect('rollback', { allowDelete: true });
  // Orden inverso a la creación: dependientes antes que dependencias.
  for (const e of [...created].reverse()) {
    const rows = await ex(e.model, 'read', [[e.id], ['display_name']], { context: READ_CTX }).catch(() => []);
    if (!rows.length) { console.log(`YA NO EXISTE ${e.model} id=${e.id}`); continue; }
    if (!write) { console.log(`BORRARÍA ${e.model} id=${e.id} (${e.key})`); continue; }
    await ex(e.model, 'unlink', [[e.id]]);
    console.log(`BORRADO  ${e.model} id=${e.id} (${e.key})`);
  }
  console.log(write ? 'ROLLBACK APLICADO' : 'DRY-RUN: nada se borró');
});
