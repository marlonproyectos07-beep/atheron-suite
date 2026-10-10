#!/usr/bin/env node
// ATH-STAGING-RECOVERY-007 — CLI único del paquete de migración. SOLO contra el staging NUEVO. Dry-run por defecto.
// Variables (las pone Marlon/Codex fuera del chat): RECOVERY_TARGET_DB, ODOO_BASE_URL, ODOO_TECHNICAL_USER, ODOO_TECHNICAL_SECRET,
// y para escribir además RECOVERY_CONFIRM=<base nueva exacta>. Para G4 si la base no está neutralizada: RECOVERY_TEST_ENV_ATTESTATION.
//
//   node recovery/run.mjs precheck
//   node recovery/run.mjs snapshot --tag pre|post
//   node recovery/run.mjs layer R1 [--apply]          # guardia + prerrequisitos + run + verify (verify solo con --apply)
//   node recovery/run.mjs verify R1|all
//   node recovery/run.mjs rollback [--layer R4] [--apply]
//   node recovery/run.mjs qa --date YYYY-MM-DD [--apply]   |   node recovery/run.mjs qa-cleanup [--apply]
//   node recovery/run.mjs diff <dirPRE> <dirPOST>
//   node recovery/run.mjs rules-compare <rules_old.json> <rules_current.json>   # OFFLINE: 167/168/169 → REUSE_AS_IS | REUSE_WITH_ADAPTATION | REPLACE_REQUIRED | ABORT (salida 0/4/3)
//   node recovery/run.mjs close-analysis [--json]   # OFFLINE (ATH-020): cierre analítico R1/R2/R4 con los artefactos publicados (salida 0 = paquete listo en lo estático, 4 = no)
//   node recovery/run.mjs role-plan <planning_roles_old.json> <planning_roles_current.json>   # OFFLINE: plan de x_casa / x_is_a_room_offer
// Códigos de salida: 0 ok · 1 error · 2 guardia/permiso · 3 bloqueado por falta de insumo · 4 parcial/verificación fallida (STOP)
import { resolve } from 'node:path';
import { REPO_ROOT, TARGET_DB, BlockedError, RecoveryGuardError } from './recovery-lib.mjs';
import { connect } from './connect.mjs';
import { LAYERS, ORDER, executeLayer, verifyLayer } from './steps.mjs';
import { runGuard, renderGuard, GuardAbort } from './guard.mjs';
import { takeSnapshot, diffSnapshots } from './snapshot.mjs';
import { rollback, verifyRolledBack } from './engine.mjs';
import { runQA, cleanupQA } from './qa.mjs';
import { readFileSync } from 'node:fs';
import { compareAll } from './rules-compare.mjs';
import { planRoleMapping } from './planning-role.mjs';
import { adaptRulesCurrent, adaptRolesCurrent } from './closure.mjs';
import { analyze } from './closure-analysis.mjs';

const argv = process.argv.slice(2);
const [cmd, arg] = argv;
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const out = (o) => console.log(JSON.stringify(o, null, 2));
const OUT = resolve(REPO_ROOT, 'integrations/odoo-hotel-gateway/recovery/out');

const CMDS = new Set(['close-analysis', 'precheck', 'snapshot', 'layer', 'verify', 'rollback', 'qa', 'qa-cleanup', 'diff', 'rules-compare', 'role-plan']);

async function main() {
  if (!CMDS.has(cmd)) { console.error(`comando desconocido: ${cmd}\nBase permitida: ${TARGET_DB}`); return 1; }
  // OFFLINE (sin red, sin variables): comparar 167/168/169 y planificar planning.role a partir de archivos que entrega Codex
  // ATH-020: aceptan también la forma publicada por Codex (rules_current.json `{rules:[…]}`, planning_roles_current.json `{roles:[…]}`)
  if (cmd === 'close-analysis') { const r = await analyze(); out(r.gate); if (argv.includes('--json')) out(r); return r.static_ok ? 0 : 4; }
  if (cmd === 'rules-compare') { const c = compareAll(JSON.parse(readFileSync(resolve(argv[1]), 'utf8')), adaptRulesCurrent(JSON.parse(readFileSync(resolve(argv[2]), 'utf8')))); out(c); return c.mustAbort ? 3 : c.mayMutate ? 0 : 4; }
  if (cmd === 'role-plan') { const p = planRoleMapping(JSON.parse(readFileSync(resolve(argv[1]), 'utf8')), adaptRolesCurrent(JSON.parse(readFileSync(resolve(argv[2]), 'utf8')))); out(p); return p.closed ? 0 : 4; }
  if (cmd === 'diff') { const d = diffSnapshots(resolve(argv[1]), resolve(argv[2])); out(d); return d.identical ? 0 : 4; }
  if (cmd === 'layer' || cmd === 'verify') {
    // insumos locales primero: si faltan (extracto, correo...) se sale con BLOCKED sin abrir ninguna conexión
    for (const n of (arg === 'all' ? ORDER : [arg])) { if (!LAYERS[n]) { console.error(`capa desconocida: ${n}`); return 1; } if (cmd === 'layer') LAYERS[n].inputs?.({ env: process.env, extractDir: null }); }
  }
  const ctx = await connect(cmd === 'layer' ? arg : cmd, { allowDelete: cmd === 'rollback' || cmd === 'qa-cleanup' });
  switch (cmd) {
    case 'precheck': {
      const g = await runGuard({ ex: ctx.ex, cfg: ctx.cfg, env: ctx.env, journal: ctx.journal });
      console.log(renderGuard(g)); console.log(g.ok ? 'PRECHECK OK' : 'STOP: PRECHECK FALLÓ'); return g.ok ? 0 : 2;
    }
    case 'snapshot': {
      const tag = opt('--tag') ?? 'pre'; const dir = resolve(OUT, `snapshot-${tag}-${Date.now()}`);
      const m = await takeSnapshot({ ex: ctx.ex, cfg: ctx.cfg, dir, tag });
      console.log(`SNAPSHOT ${tag} en ${dir}`); out({ counts: m.counts, secret_like: m.secret_like, models: Object.fromEntries(Object.entries(m.models).map(([k, v]) => [k, v.count ?? v.skipped])) });
      return m.secret_like.length ? 4 : 0; // si algo parece credencial, STOP: no se continúa sin revisarlo
    }
    case 'layer': {
      const r = await executeLayer(ctx, arg);
      ctx.log.flush?.(); out({ layer: arg, status: r.status, ...(r.message ? { message: r.message } : {}), ...(r.layer ? { prerequisite: r.layer, detail: r.detail } : {}), blockers: (r.blockers ?? []).map((b) => `${b.action} ${b.model} ${b.key}`), verify: r.verify ? { ok: r.verify.ok, failed: r.verify.checks.filter((c) => !c.ok).map((c) => c.name) } : undefined });
      if (r.status === 'STOP_GUARD') { console.log(renderGuard(r.guard)); return 2; }
      return r.status === 'OK' || r.status === 'DRY_RUN' ? 0 : r.status === 'BLOCKED' ? 3 : 4;
    }
    case 'verify': {
      const names = arg === 'all' ? ORDER : [arg]; let ok = true;
      for (const n of names) { const v = await verifyLayer(ctx, n); ok = ok && v.ok; out({ layer: n, ok: v.ok, error: v.error, failed: v.checks.filter((c) => !c.ok).map((c) => c.name) }); }
      return ok ? 0 : 4;
    }
    case 'rollback': {
      const layer = opt('--layer'); const res = await rollback({ ex: ctx.ex, write: ctx.write, journal: ctx.journal, log: ctx.log, layer });
      const v = ctx.write ? await verifyRolledBack({ ex: ctx.ex, journal: ctx.journal, layer }) : null;
      out({ rollback: res, verify_rollback: v ? { ok: v.ok, failed: v.checks.filter((c) => !c.ok).map((c) => c.name) } : 'dry-run' });
      return res.ERROR || res.CONFLICT || (v && !v.ok) ? 4 : 0;
    }
    case 'qa': { const r = await runQA(ctx, { date: opt('--date') }); out(r); return r.ok === false ? 4 : 0; }
    case 'qa-cleanup': { const r = await cleanupQA(ctx, rollback); out(r); return r.ERROR || r.CONFLICT || r.residue.length ? 4 : 0; }
    default: console.error(`comando desconocido: ${cmd}\nBase permitida: ${TARGET_DB}`); return 1;
  }
}

main().then((c) => process.exit(c)).catch((e) => {
  if (e instanceof GuardAbort) { console.log(renderGuard(e.result)); console.log('STOP: GUARDIA'); process.exit(2); }
  if (e instanceof BlockedError) { console.log(`BLOCKED: ${e.message}`); process.exit(3); }
  if (e instanceof RecoveryGuardError) { console.error(`GUARD: ${e.message}`); process.exit(2); }
  console.error(`ERROR: ${String(e?.diagnostic?.message || e?.message || e).slice(0, 400)}`); process.exit(1);
});
