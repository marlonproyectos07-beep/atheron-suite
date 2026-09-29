import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanFiles } from '../scripts/secure-store/scan-for-secret-leak.mjs';

function withTempFile(content, name = 'sample.env') {
  const dir = mkdtempSync(path.join(tmpdir(), 'secret-scan-test-'));
  const filePath = path.join(dir, name);
  writeFileSync(filePath, content, 'utf8');
  return { dir, filePath };
}

test('no marca nada en un .env.example de plantilla (valores vacios)', () => {
  const { dir, filePath } = withTempFile('ODOO_BASE_URL=\nODOO_DATABASE=\nODOO_TECHNICAL_USER=\nODOO_TECHNICAL_SECRET=\n');
  try {
    assert.deepEqual(scanFiles([filePath]), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detecta ODOO_TECHNICAL_SECRET con un valor no vacio', () => {
  const { dir, filePath } = withTempFile('ODOO_TECHNICAL_SECRET=esto-no-deberia-estar-aqui\n');
  try {
    const findings = scanFiles([filePath]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].variable, 'ODOO_TECHNICAL_SECRET');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detecta el patron aunque este entre comillas o en formato yaml', () => {
  const { dir, filePath } = withTempFile('odoo:\n  ODOO_TECHNICAL_USER: "sofia.staging"\n');
  try {
    const findings = scanFiles([filePath]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].variable, 'ODOO_TECHNICAL_USER');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ignora una linea comentada', () => {
  const { dir, filePath } = withTempFile('# ODOO_TECHNICAL_SECRET=ejemplo-en-un-comentario\n');
  try {
    assert.deepEqual(scanFiles([filePath]), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un archivo que no existe simplemente se ignora (no revienta el scan)', () => {
  assert.deepEqual(scanFiles(['C:/ruta/que/no/existe.env']), []);
});

test('no marca una referencia a variable/codigo como si fuera un secreto literal', () => {
  const { dir, filePath } = withTempFile(
    [
      '$env:ODOO_BASE_URL = $payload.ODOO_BASE_URL',
      'ODOO_TECHNICAL_USER = $technicalUser',
      'const cfg = { ODOO_TECHNICAL_SECRET: process.env.ODOO_TECHNICAL_SECRET };',
    ].join('\n'),
    'loader-like.ps1',
  );
  try {
    assert.deepEqual(scanFiles([filePath]), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detecta multiples variables sensibles en un solo archivo', () => {
  const { dir, filePath } = withTempFile(
    'ODOO_TECHNICAL_USER=sofia\nODOO_TECHNICAL_SECRET=algo\nODOO_BASE_URL=https://odoo.example\n',
  );
  try {
    const findings = scanFiles([filePath]);
    assert.equal(findings.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
