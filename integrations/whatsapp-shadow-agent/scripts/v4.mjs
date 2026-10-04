#!/usr/bin/env node
/**
 * Flujo del corpus V4 (mensajes reales ANONIMIZADOS). Solo orquestacion: no toca la logica del agente.
 *
 *   node scripts/v4.mjs import   <corpus.json>   valida (estructura + privacidad) y, si es aceptado, lo copia a AI/whatsapp/v4/
 *   node scripts/v4.mjs freeze                   recalcula SHA256, escribe V4_FREEZE.json y muestra los comandos git (no los ejecuta)
 *   node scripts/v4.mjs rules                    RULES_ONLY sobre el corpus CONGELADO (se niega si no esta congelado)
 *   node scripts/v4.mjs provider --provider <p>  HYBRID con un proveedor (hoy todos DISABLED; solo mocks para probar el cableado)
 *   node scripts/v4.mjs compare                  informe comparativo con los resultados presentes
 *
 * Opcion: --dir <carpeta>  (por defecto AI/whatsapp/v4). Codigos de salida: 0 ok · 2 privacidad · 3 invalido ·
 *   4 falta archivo/congelacion · 5 proveedor deshabilitado · 6 el corpus cambio despues de congelar · 64 uso.
 * Nunca imprime texto del corpus. Nunca envia nada a ningun lado.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadCorpusFile, validateCorpus, corpusToBlindCases } from '../src/hybrid/corpus.mjs';
import { createSession, processMessage } from '../src/agent.mjs';
import { guardPort } from '../src/odoo-port.mjs';
import { makeFakeOdoo } from '../test/fake-odoo.mjs';
import { evaluateCase } from '../src/hybrid/evaluate.mjs';
import { benchmarkProvider } from '../src/hybrid/benchmark.mjs';
import { evaluateProviders } from '../src/hybrid/decision.mjs';
import { runCaseBothModes } from '../src/hybrid/dual-run.mjs';
import { buildShadowReport } from '../src/hybrid/shadow-report.mjs';
import { ProviderDisabledError } from '../src/hybrid/provider.mjs';
import { benignMock, adversarialMock } from '../test/hybrid-mocks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
// posicionales = argumentos que no son opciones (--dir X, --provider X)
const positional = argv.filter((a, i) => !a.startsWith('--') && !['--dir', '--provider'].includes(argv[i - 1]));
const dir = resolve(flag('--dir') ?? join(root, 'AI', 'whatsapp', 'v4'));
const F = { corpus: join(dir, 'corpus.v4.json'), freeze: join(dir, 'V4_FREEZE.json'), sha: join(dir, 'corpus.v4.sha256'), privacy: join(dir, 'V4_PRIVACY_REPORT.json'), rules: join(dir, 'V4_RULES_ONLY_RESULT.json'), compare: join(dir, 'V4_BENCHMARK_COMPARISON.json'), compareMd: join(dir, 'V4_BENCHMARK_COMPARISON.md') };
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const say = (o) => console.log(JSON.stringify(o, null, 1));
const die = (code, msg) => { console.error(msg); process.exit(code); };

function requireFrozen() {
  if (!existsSync(F.corpus) || !existsSync(F.freeze)) die(4, 'No hay corpus congelado: ejecutar import y freeze primero.');
  const fr = JSON.parse(readFileSync(F.freeze, 'utf8'));
  if (sha256(F.corpus) !== fr.sha256) die(6, 'El corpus cambio despues de congelarlo (SHA256 distinto). No se mide.');
  const r = loadCorpusFile(F.corpus);
  if (r.verdict !== 'CORPUS_ACCEPTED') die(r.verdict === 'CORPUS_REJECTED_FOR_PRIVACY' ? 2 : 3, `Corpus no aceptado: ${r.verdict}`);
  return { corpus: JSON.parse(readFileSync(F.corpus, 'utf8')), freeze: fr };
}

const cmd = positional[0];
if (cmd === 'import') {
  const file = positional[1];
  if (!file || !existsSync(file)) die(4, 'uso: v4.mjs import <corpus.json>');
  const r = loadCorpusFile(file);
  say({ verdict: r.verdict, sha256: r.sha256, errors: r.errors.length, privacy_findings: r.privacy_report?.findings.length ?? null, stats: r.stats });
  if (r.verdict !== 'CORPUS_ACCEPTED') {
    if (r.privacy_report) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'V4_PRIVACY_REPORT.rejected.json'), JSON.stringify({ verdict: r.verdict, errors: r.errors, privacy_report: r.privacy_report }, null, 2)); }
    die(r.verdict === 'CORPUS_REJECTED_FOR_PRIVACY' ? 2 : 3, `${r.verdict}: NO se importa nada (el informe no contiene valores).`);
  }
  if (existsSync(F.corpus)) die(4, 'Ya existe un corpus V4 en el destino: sobrescribir requiere autorizacion de Control Maestro.');
  mkdirSync(dir, { recursive: true });
  copyFileSync(file, F.corpus);
  writeFileSync(F.privacy, JSON.stringify({ verdict: r.verdict, sha256: r.sha256, stats: r.stats, privacy_report: r.privacy_report }, null, 2));
  console.error(`Importado en ${F.corpus}. Siguiente: node scripts/v4.mjs freeze`);
} else if (cmd === 'freeze') {
  if (!existsSync(F.corpus)) die(4, 'No hay corpus importado.');
  if (existsSync(F.freeze)) die(4, 'Ya esta congelado. Un corpus congelado no se vuelve a congelar sin autorizacion.');
  const r = loadCorpusFile(F.corpus);
  if (r.verdict !== 'CORPUS_ACCEPTED') die(r.verdict === 'CORPUS_REJECTED_FOR_PRIVACY' ? 2 : 3, `Corpus no aceptado: ${r.verdict}`);
  if (existsSync(F.rules)) die(4, 'Existe un resultado previo: congelar siempre va ANTES de medir.');
  const digest = sha256(F.corpus);
  writeFileSync(F.sha, `${digest}  AI/whatsapp/v4/corpus.v4.json\n`);
  writeFileSync(F.freeze, JSON.stringify({ frozen: true, sha256: digest, corpus_version: 'v4.0', cases: r.stats.total, by_source: r.stats.by_source, by_risk_class: r.stats.by_risk_class, real_observed_percent: r.stats.real_observed_percent, privacy_verdict: r.verdict }, null, 2));
  say({ frozen: true, sha256: digest, cases: r.stats.total });
  console.error('\nCongelar en Git (NO ejecutado por este script):\n  git add AI/whatsapp/v4/corpus.v4.json AI/whatsapp/v4/corpus.v4.sha256 AI/whatsapp/v4/V4_FREEZE.json AI/whatsapp/v4/V4_PRIVACY_REPORT.json\n  git commit -m "test(whatsapp-v4): congelar corpus V4 anonimizado (sha256 ' + digest + ')"\n  git push -u origin feature/ath-whatsapp-shadow-agent-canonical\n  # anotar el hash del commit; recien despues medir.');
} else if (cmd === 'rules') {
  const { corpus, freeze } = requireFrozen();
  const cases = corpusToBlindCases(corpus);
  const out = [];
  for (const c of cases) {
    const fake = makeFakeOdoo();
    const deps = { odoo: guardPort(fake), humanAvailable: true };
    const session = createSession({ id: c.id });
    const decisions = [];
    for (const t of c.turns) decisions.push(await processMessage(session, typeof t === 'string' ? { type: 'text', text: t } : { type: 'audio', transcript: t.transcript, confidence: t.confidence }, deps));
    const ev = evaluateCase(c, decisions, { odoo_calls: fake.calls.length, odooCalls: fake.calls.length, guestsQueried: Math.max(0, ...fake.calls.map((x) => x.req.guests ?? 0)) });
    out.push({ id: c.id, source: c.src, pass: ev.pass, fails: ev.fails, high_risk: ev.high_risk, escalated_last: decisions.at(-1).escalate, primary_intent: decisions.at(-1).primary_intent });
  }
  const pass = out.filter((o) => o.pass).length;
  const summary = { mode: 'RULES_ONLY', corpus_sha256: freeze.sha256, FIRST_PASS_TOTAL: out.length, FIRST_PASS_PASS: pass, FIRST_PASS_FAIL: out.length - pass, FIRST_PASS_PERCENT: Math.round((pass / out.length) * 1000) / 10, HIGH_RISK_FAIL_COUNT: out.filter((o) => o.high_risk).length };
  writeFileSync(F.rules, JSON.stringify({ summary, cases: out }, null, 2));
  say(summary);
} else if (cmd === 'provider') {
  const name = flag('--provider');
  if (!name) die(64, 'uso: v4.mjs provider --provider <openai|anthropic|gemini|local_ollama|other|mock-benign|mock-adversarial>');
  const mocks = { 'mock-benign': benignMock, 'mock-adversarial': adversarialMock };
  if (!mocks[name]) { console.error(`PROVIDER_DISABLED: ${name}. Todos los proveedores reales estan DISABLED; habilitar uno requiere autorizacion de Control Maestro.`); process.exit(5); }
  const { corpus, freeze } = requireFrozen();
  const cases = corpusToBlindCases(corpus);
  const provider = mocks[name]();
  const bench = await benchmarkProvider({ provider, cases, makeOdoo: () => makeFakeOdoo(), privacyMode: 'redacted' });
  const rows = [];
  for (const c of cases) rows.push(buildShadowReport(await runCaseBothModes(c, { makeOdoo: () => makeFakeOdoo(), provider: mocks[name]() }), { provider: name }));
  const file = join(dir, `V4_PROVIDER_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_RESULT.json`);
  writeFileSync(file, JSON.stringify({ provider: name, corpus_sha256: freeze.sha256, benchmark: bench, shadow_reports: rows }, null, 2));
  say({ provider: name, ACCURACY: bench.ACCURACY, HIGH_RISK_FAILS: bench.HIGH_RISK_FAILS, SCHEMA_VALIDITY: bench.SCHEMA_VALIDITY, ESTIMATED_COST: bench.ESTIMATED_COST });
} else if (cmd === 'compare') {
  const { freeze } = requireFrozen();
  if (!existsSync(F.rules)) die(4, 'Falta V4_RULES_ONLY_RESULT.json: ejecutar rules primero.');
  const rules = JSON.parse(readFileSync(F.rules, 'utf8'));
  const providers = [];
  for (const n of ['MOCK_BENIGN', 'MOCK_ADVERSARIAL']) { const f = join(dir, `V4_PROVIDER_${n}_RESULT.json`); if (existsSync(f)) providers.push(JSON.parse(readFileSync(f, 'utf8'))); }
  const decision = providers.length ? evaluateProviders(providers.map((p) => ({ name: p.provider, benchmark: p.benchmark, privacy_profile: { kind: 'external' } }))) : null;
  const report = { corpus_sha256: freeze.sha256, rules_only: rules.summary, providers: providers.map((p) => p.benchmark), decision, note: 'Los mocks solo prueban el cableado; no son un LLM. Proveedores reales: DISABLED.' };
  writeFileSync(F.compare, JSON.stringify(report, null, 2));
  const md = ['# V4 — comparativo', '', `Corpus SHA256: \`${freeze.sha256}\``, '', '| Modo | Acierto 1ª pasada | HIGH_RISK |', '|---|---|---|', `| RULES_ONLY | ${rules.summary.FIRST_PASS_PERCENT} % (${rules.summary.FIRST_PASS_PASS}/${rules.summary.FIRST_PASS_TOTAL}) | ${rules.summary.HIGH_RISK_FAIL_COUNT} |`, ...providers.map((p) => `| HYBRID ${p.provider} | ${p.benchmark.ACCURACY} % | ${p.benchmark.HIGH_RISK_FAILS} |`), '', `Ganador (solo elegibles): ${decision?.winner ?? 'ninguno'}`, ''].join('\n');
  writeFileSync(F.compareMd, md);
  say({ rules_only: rules.summary, providers: providers.length, winner: decision?.winner ?? null });
} else die(64, 'uso: v4.mjs <import|freeze|rules|provider|compare> ...');
