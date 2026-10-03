/** Solo archivos de prueba locales. No carga credenciales ni abre red. */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { summarizeCoverage } from '../src/phase-a-inventory.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tests = readdirSync(resolve(root, 'test'))
  .filter((name) => name.endsWith('.test.mjs') && !name.startsWith('phase-b-')).sort()
  .map((name) => resolve(root, 'test', name));
process.stdout.write(`PHASE_A_COVERAGE ${JSON.stringify(summarizeCoverage())}\n`);
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
