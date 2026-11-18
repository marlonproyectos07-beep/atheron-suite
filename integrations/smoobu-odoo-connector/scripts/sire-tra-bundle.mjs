#!/usr/bin/env node
// Construye el paquete para ejecutar el MISMO codigo en la consola de una copia de pruebas (sesion propia).
// Uso: node scripts/sire-tra-bundle.mjs [--out ruta]. Imprime la ruta y el sha256 (para comprobar que se ejecuto este archivo).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const src = new URL('../src/', import.meta.url);
const parts = ['errors.mjs', 'sire-tra/guard.mjs', 'sire-tra/manifest.mjs', 'sire-tra/applier.mjs', 'sire-tra/tra-emitter.mjs', 'sire-tra/browser-entry.mjs'];
const body = parts.map((p) => readFileSync(new URL(p, src), 'utf8')
  .replace(/^import [^;]+;\n/gm, '')
  .replace(/^export (const|function|class|async function) /gm, '$1 ')).join('\n');
const names = ['NS', 'MODELS', 'FIELDS', 'SERVER_ACTIONS', 'applyManifest', 'rollbackManifest', 'checkIsolation', 'emitStay', 'createTraSimulator', 'TRA_CATALOG_UNVERIFIED', 'boot', 'assertBrowserTarget'];
const out = `(() => {\n'use strict';\n${body}\nwindow.ATH_SIRE_TRA = { ${names.join(', ')} };\n})();\n`;
const i = process.argv.indexOf('--out');
const path = i > 0 ? process.argv[i + 1] : '/tmp/sire-tra.browser.js';
writeFileSync(path, out);
console.log(JSON.stringify({ path, bytes: Buffer.byteLength(out), sha256: createHash('sha256').update(out).digest('hex') }));
