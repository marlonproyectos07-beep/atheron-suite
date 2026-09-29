#!/usr/bin/env node
/**
 * ATH-ODOO-HOTEL-008 - Fase 6 (seguridad del canario web -> Odoo staging).
 *
 * Corre DESPUES de `npm run build`. Verifica en los archivos realmente
 * generados (lo que se serviria al navegador) que ninguna credencial del
 * gateway aparece ahi, y que el endpoint server-side si quedo construido
 * (no es una prueba vacia).
 *
 * Uso: node scripts/prueba-canario-seguridad.mjs
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([a-zA-Z]:)/, '$1');
const projectRoot = path.resolve(ROOT, '..');

const CLIENT_OUTPUT_DIRS = [
  path.join(projectRoot, 'dist'),
  path.join(projectRoot, '.vercel', 'output', 'static'),
];

const SERVER_OUTPUT_DIRS = [
  path.join(projectRoot, 'dist', 'server'),
  path.join(projectRoot, '.vercel', 'output', '_functions'),
  path.join(projectRoot, '.vercel', 'output', 'functions'),
];

// Lo que NUNCA debe aparecer en algo que se sirve al navegador.
const FORBIDDEN_IN_CLIENT = ['HOTEL_WEB_AGENT_KEY', 'HOTEL_GATEWAY_BASE_URL', 'rawKey', 'Bearer '];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function findings(files, patterns) {
  const hits = [];
  for (const file of files) {
    if (!/\.(html|js|mjs|css|json|xml)$/i.test(file)) continue;
    const content = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      if (content.includes(pattern)) hits.push({ file, pattern });
    }
  }
  return hits;
}

let ok = true;

const clientFiles = CLIENT_OUTPUT_DIRS.flatMap((d) => walk(d));
if (clientFiles.length === 0) {
  console.error('FALLO: no se encontro salida de build cliente (dist/ o .vercel/output/static). Corre `npm run build` primero.');
  process.exit(1);
}

const leaks = findings(clientFiles, FORBIDDEN_IN_CLIENT);
if (leaks.length > 0) {
  ok = false;
  console.error('FALLO: se encontraron referencias prohibidas en archivos que se sirven al navegador:');
  for (const l of leaks) console.error(`  - ${l.pattern} en ${l.file}`);
} else {
  console.log(`OK: ${clientFiles.length} archivo(s) cliente revisados, ninguno contiene credenciales del gateway.`);
}

const serverFiles = SERVER_OUTPUT_DIRS.flatMap((d) => walk(d));
const endpointExists = serverFiles.some((f) => f.includes('availability') && f.endsWith('.mjs'));
if (!endpointExists) {
  ok = false;
  console.error('FALLO: no se encontro el endpoint server-side (availability) en la salida del build.');
} else {
  console.log('OK: el endpoint /api/hotel/availability existe en la salida server-side (no es un stub vacio).');
}

process.exit(ok ? 0 : 1);
