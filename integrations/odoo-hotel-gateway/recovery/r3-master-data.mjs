#!/usr/bin/env node
// Compatibilidad: --plan imprime el plan sin red; lo demás equivale a: node recovery/run.mjs layer R3 [--apply]
if (process.argv.includes('--plan')) {
  const { plan } = await import('./layers/r3.mjs');
  console.log(JSON.stringify(plan(), null, 2));
} else {
  process.argv.splice(2, 0, 'layer', 'R3');
  await import('./run.mjs');
}
