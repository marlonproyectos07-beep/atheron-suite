#!/usr/bin/env node
/**
 * Valida un corpus V4 anonimizado ANTES de aceptarlo. Uso: node scripts/validate-corpus.mjs <corpus.json> [informe.json]
 * Sale con 0 (aceptado), 2 (CORPUS_REJECTED_FOR_PRIVACY) o 3 (invalido). No imprime ningun texto del corpus.
 */
import { writeFileSync } from 'node:fs';
import { loadCorpusFile } from '../src/hybrid/corpus.mjs';

const [file, out] = process.argv.slice(2);
if (!file) { console.error('uso: validate-corpus.mjs <corpus.json> [informe.json]'); process.exit(64); }
const r = loadCorpusFile(file);
const report = { verdict: r.verdict, sha256: r.sha256, errors: r.errors, stats: r.stats, privacy_report: r.privacy_report };
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict: r.verdict, sha256: r.sha256, errors: r.errors.length, privacy_findings: r.privacy_report?.findings.length ?? null, stats: r.stats }, null, 1));
process.exit(r.verdict === 'CORPUS_ACCEPTED' ? 0 : r.verdict === 'CORPUS_REJECTED_FOR_PRIVACY' ? 2 : 3);
