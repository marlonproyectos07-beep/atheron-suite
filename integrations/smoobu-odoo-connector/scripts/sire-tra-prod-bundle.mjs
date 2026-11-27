#!/usr/bin/env node
// Paquete del procedimiento de PRODUCCION (src/sire-tra/prod-browser-entry.mjs) para la consola de atheron1.odoo.com.
// Distinto del paquete de la copia (scripts/sire-tra-bundle.mjs): no incluye el arranque de la copia ni el emisor TRA.
// Uso: node scripts/sire-tra-prod-bundle.mjs [--out ruta]. Imprime ruta y sha256 (comprobar antes de ejecutar).
// En la consola: const p = ATH_SIRE_TRA_PROD.bootProduction(window, 'si-aprobado-por-marlon'); await p.snapshot(); await p.plan(); ...
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const src = new URL('../src/', import.meta.url);
const parts = ['errors.mjs', 'sire-tra/guard.mjs', 'sire-tra/manifest.mjs', 'sire-tra/applier.mjs', 'sire-tra/delta-base-2026-11-24.mjs', 'sire-tra/delta.mjs', 'sire-tra/delta-motivo-2026-11-26.mjs', 'sire-tra/browser-entry.mjs', 'sire-tra/prod-browser-entry.mjs'];
const body = parts.map((p) => readFileSync(new URL(p, src), 'utf8').replace(/\r\n/g, '\n')
  .replace(/^import [^;]+;\n/gm, '')
  .replace(/^export (const|function|class|async function) /gm, '$1 ')).join('\n');
const out = `(() => {\n'use strict';\n${body}\nwindow.ATH_SIRE_TRA_PROD = { bootProduction, NS };\n})();\n`;
const i = process.argv.indexOf('--out');
const path = i > 0 ? process.argv[i + 1] : 'sire-tra-prod.browser.js';
writeFileSync(path, out);
console.log(JSON.stringify({ path, bytes: Buffer.byteLength(out), sha256: createHash('sha256').update(out).digest('hex') }));
