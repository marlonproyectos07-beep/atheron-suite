#!/usr/bin/env node
// Compatibilidad: ahora todo pasa por run.mjs (guardia, prerrequisitos, verify). Equivale a: node recovery/run.mjs layer R1 [--apply]
process.argv.splice(2, 0, 'layer', 'R1');
await import('./run.mjs');
