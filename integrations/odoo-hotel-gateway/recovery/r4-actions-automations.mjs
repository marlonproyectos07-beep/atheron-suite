#!/usr/bin/env node
// Compatibilidad: ahora todo pasa por run.mjs (guardia, prerrequisitos, verify). Equivale a: node recovery/run.mjs layer R4 [--apply]
process.argv.splice(2, 0, 'layer', 'R4');
await import('./run.mjs');
