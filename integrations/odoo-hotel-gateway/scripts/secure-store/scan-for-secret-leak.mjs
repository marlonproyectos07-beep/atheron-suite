#!/usr/bin/env node
/**
 * ATH-ODOO-STAGING — proteccion defensiva contra secretos entrando a Git.
 * No reemplaza guardar los secretos fuera del repositorio (esa es la
 * proteccion real); esto es una segunda capa: revisa el contenido de los
 * archivos indicados (por defecto, lo que este en stage de Git) buscando
 * una asignacion con valor no vacio de cualquiera de las variables Odoo
 * sensibles, y falla si encuentra alguna.
 *
 * Uso:
 *   node scripts/secure-store/scan-for-secret-leak.mjs            # escanea git diff --cached
 *   node scripts/secure-store/scan-for-secret-leak.mjs <archivo...>  # escanea archivos puntuales
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SENSITIVE_VARS = ['ODOO_TECHNICAL_SECRET', 'ODOO_TECHNICAL_USER', 'ODOO_BASE_URL'];

// admite VAR=valor, VAR = "valor", VAR: valor (yaml/json), pero no VAR= (vacio)
// ni un valor que sea claramente un placeholder de plantilla.
const PLACEHOLDER_VALUES = new Set(['', '""', "''", '<...>', '...', 'null', 'undefined']);

function buildPattern(varName) {
  return new RegExp(`${varName}\\s*[:=]\\s*(.+)`, 'g');
}

function findLeaksInContent(content, filePath) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (line.trim().startsWith('#') || line.trim().startsWith('//')) return;
    for (const varName of SENSITIVE_VARS) {
      const pattern = buildPattern(varName);
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const rawValue = match[1].trim();
        const cleanValue = rawValue.replace(/^["']|["']$/g, '').trim();
        const looksLikeCodeReference =
          rawValue.startsWith('$') || // PowerShell: $baseUrl, $payload.ODOO_BASE_URL, $env:X
          /^(process\.)?env(\.|\[)/i.test(cleanValue); // JS: process.env.X, env.X, env['X']
        if (
          !looksLikeCodeReference &&
          !PLACEHOLDER_VALUES.has(rawValue) &&
          !PLACEHOLDER_VALUES.has(cleanValue) &&
          cleanValue.length > 0
        ) {
          findings.push({ file: filePath, line: idx + 1, variable: varName });
        }
      }
    }
  });
  return findings;
}

function getStagedFiles() {
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], { encoding: 'utf8' });
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function scanFiles(filePaths) {
  const findings = [];
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue;
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue; // binario u otro problema de lectura: fuera de alcance de este scanner de texto
    }
    findings.push(...findLeaksInContent(content, filePath));
  }
  return findings;
}

function main() {
  const argFiles = process.argv.slice(2);
  const targets = argFiles.length > 0 ? argFiles : getStagedFiles();
  const findings = scanFiles(targets);

  if (findings.length === 0) {
    console.log(`OK: 0 hallazgos en ${targets.length} archivo(s) revisado(s). Ningun secreto detectado.`);
    return;
  }

  console.error(`BLOQUEADO: posible secreto Odoo en ${findings.length} lugar(es):`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line} -> ${f.variable} tiene un valor no vacio`);
  }
  console.error('\nNo se muestra el valor encontrado. Corrige antes de commitear.');
  process.exitCode = 1;
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  main();
}
