#!/usr/bin/env node
// Compatibilidad: equivale a: node recovery/run.mjs rollback [--layer R3] [--apply]
process.argv.splice(2, 0, 'rollback');
await import('./run.mjs');
