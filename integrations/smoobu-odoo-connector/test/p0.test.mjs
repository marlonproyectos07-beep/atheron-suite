import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFake, GOOD_AUTOMATIONS } from './p0-fake.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { P0WriteClient } from '../src/odoo-json2-p0-client.mjs';
import { P0_AUTH_PHRASE, P0_VALS, P0_MARKER_NAME } from '../src/p0-spec.mjs';
import { runP0, runPrecheck } from '../src/p0-run.mjs';
import { parseDomain, matches } from '../src/domain-eval.mjs';

const cfg = { baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'TEST-KEY' };
const rig = (opts) => {
  const f = makeFake(opts);
  const reader = new OdooJson2Client({ ...cfg, fetchImpl: f.fetchImpl });
  const writer = new P0WriteClient({ ...cfg, fetchImpl: f.fetchImpl, authorization: P0_AUTH_PHRASE });
  return { ...f, reader, writer };
};
const fast = { sleep: async () => {}, settleOpts: { tries: 2, ms: 0 } };
const writes = (calls) => calls.filter((c) => /\/(create|unlink|write)$/.test(c));

test('evaluador de dominios: lee los dominios reales de las automatizaciones', () => {
  const rec = { state: 'draft', x_bloqueo_ref: false, x_nobeds_id: false, sale_line_id: false };
  assert.equal(matches("[('x_bloqueo_ref','=',False),('state','=','published')]", rec), false);
  assert.equal(matches("[('x_nobeds_id', '!=', False)]", rec), false);
  assert.equal(matches("[('state','=','draft'),('x_nobeds_id','!=',False),('sale_line_id','!=',False)]", rec), false);
  assert.equal(matches(false, rec), true); assert.equal(matches("[('state','=','draft')]", rec), true);
  assert.equal(matches("['|',('a','=',1),('b','=',2)]", rec), 'unknown'); assert.equal(parseDomain('basura').unknown, true);
});

test('precheck aprobado en un Odoo sano: SIN escrituras y con base de contadores', async () => {
  const r = rig();
  const out = await runP0({ reader: r.reader, writer: null, cfg, mode: 'precheck' });
  assert.equal(out.result, 'PRECHECK_OK_SIN_ESCRITURAS');
  const auto = out.phases.precheck.checks.find((c) => c.name === 'automations');
  assert.deepEqual([auto.fireOnCreateDraft, auto.fireOnUnlink], [[12, 22], [23, 158, 168]]);
  assert.equal(writes(r.st.calls).length, 0);
});

test('EJECUCION completa: un borrador creado, verificado y retirado; contadores restaurados; una sola creacion y un solo borrado', async () => {
  const r = rig();
  const out = await runP0({ reader: r.reader, writer: r.writer, cfg, mode: 'execute', ...fast });
  assert.equal(out.result, 'PASO', JSON.stringify(out.phases.verifyCreate ?? out));
  assert.equal(out.createdId, 5000);
  assert.equal(out.phases.verifyCreate.recordExactAsAuthorized, true);
  assert.deepEqual(out.phases.verifyCreate.diff.unexpected, []);
  assert.deepEqual(out.phases.verifyCreate.diff.availability, [{ id: 1, date: '2026-10-15', offer: 12136, bookedBefore: 0, bookedAfter: 1 }]);
  assert.equal(out.phases.verifyCreate.diff.deltas.slotsTotal, 1);
  const c = out.cleanup;
  assert.deepEqual([c.slotExists, c.slotsTotalRestored, c.role37Restored, c.windowEmpty, c.saleOrders, c.partners, c.mailMail, c.availabilityRestored, c.pendingRecompute], [false, true, true, true, true, true, true, true, true]);
  assert.deepEqual(writes(r.st.calls), ['planning.slot/create', 'planning.slot/unlink']);
  assert.equal(r.st.slots.length, 0); assert.equal(r.st.availability.find((a) => a.id === 1).booked, 0);
});

test('PRECHECK NO aprobado => ninguna escritura (ventana ocupada, marcador previo, esquema distinto, automatizacion nueva, codigo con HTTP, dominio desconocido)', async () => {
  const cases = {
    ventana: { windowSlots: [{ id: 9, role_id: 29, resource_id: 28, company_id: 5, state: 'published', start_datetime: '2026-10-15 20:00:00', end_datetime: '2026-10-16 16:00:00' }] },
    esquema: { schemaExtraRequired: true },
    cierre: { leaves: 1 },
    ordenes: { activeOrderLines: 1 },
    automatizacionNueva: { automations: [...GOOD_AUTOMATIONS, [999, 'Nueva', 'on_create', false, [1500]]] },
    codigoConHttp: { codes: { 1481: "import requests\nrequests.post('https://x.example.com/h')" } },
    codigoConCorreo: { codes: { 1500: "rec.message_post(body='x')" } },
    dominioDesconocido: { automations: GOOD_AUTOMATIONS.map((a) => (a[0] === 164 ? [164, 'Anti-dup', 'on_create', "['|',('a','=',1),('b','=',2)]", [1841]] : a)) },
    espejoDeCreate: { automations: GOOD_AUTOMATIONS.map((a) => (a[0] === 169 ? [169, 'x', 'on_create_or_write', false, [1855]] : a)) },
    automatizacionXAvailability: { xAvailabilityAutomations: [{ id: 5, name: 'x' }] },
  };
  for (const [name, o] of Object.entries(cases)) {
    const r = rig(o);
    const out = await runP0({ reader: r.reader, writer: r.writer, cfg, mode: 'execute', ...fast });
    assert.equal(out.result, 'DETENIDO', name); assert.equal(out.createdId, null, name);
    assert.equal(writes(r.st.calls).length, 0, `${name}: hubo escritura`);
  }
  const wrongTarget = await runPrecheck({ reader: rig().reader, cfg: { baseUrl: 'https://otra.odoo.com', database: 'atheron1' } });
  assert.equal(wrongTarget.approved, false);
});

test('efecto inesperado tras crear (espejo de Casa, venta, contacto, correo, feed): se detiene SIN borrar', async () => {
  for (const o of [{ createsMirror: true }, { createsSaleOrder: true }, { createsPartner: true }, { createsMail: true }, { feedGrows: true }, { noAvailabilityEffect: true }]) {
    const r = rig(o);
    const out = await runP0({ reader: r.reader, writer: r.writer, cfg, mode: 'execute', ...fast });
    assert.equal(out.result, 'REQUIERE_RECUPERACION', JSON.stringify(o));
    assert.ok(out.createdId); assert.deepEqual(writes(r.st.calls), ['planning.slot/create'], JSON.stringify(o));
    assert.match(out.note, /id \d+/);
  }
});

test('no se hace borrado ciego: si hay espejos que referencian el id o un turno ajeno en la ventana, no se borra', async () => {
  const r = rig();
  // un turno ajeno aparece en la ventana justo tras crear (carrera)
  const orig = r.fetchImpl;
  let created = false;
  const f2 = async (url, init) => { const o = await orig(url, init); if (url.endsWith('/create')) { created = true; r.st.slots.push({ id: 7777, role_id: 29, resource_id: 28, company_id: 5, state: 'published', start_datetime: '2026-10-15 20:00:00', end_datetime: '2026-10-16 16:00:00', name: false, created: false }); } return o; };
  const reader = new OdooJson2Client({ ...cfg, fetchImpl: f2 }); const writer = new P0WriteClient({ ...cfg, fetchImpl: f2, authorization: P0_AUTH_PHRASE });
  const out = await runP0({ reader, writer, cfg, mode: 'execute', ...fast });
  assert.ok(created); assert.equal(out.result, 'REQUIERE_RECUPERACION'); assert.equal(writes(r.st.calls).filter((c) => c.endsWith('unlink')).length, 0);
});

test('creacion con resultado ambiguo: se adopta el unico turno con el marcador (sin segundo intento); sin turno => DETENIDO', async () => {
  const a = rig({ networkFailAfterCreate: true });
  const out = await runP0({ reader: a.reader, writer: a.writer, cfg, mode: 'execute', ...fast });
  assert.equal(out.phases.create.adopted, true); assert.equal(writes(a.st.calls).filter((c) => c.endsWith('create')).length, 1);
  assert.equal(out.result, 'PASO');
  const b = rig({ createFails: true });
  const o2 = await runP0({ reader: b.reader, writer: b.writer, cfg, mode: 'execute', ...fast });
  assert.equal(o2.result, 'DETENIDO'); assert.equal(b.writer.createCalls, 1);
  const c = rig({ createReturnsGarbage: true });
  const o3 = await runP0({ reader: c.reader, writer: c.writer, cfg, mode: 'execute', ...fast });
  assert.equal(o3.phases.create.error, 'P0_CREATE_RESULT_UNEXPECTED'); assert.equal(o3.phases.create.adopted, true);
});

test('cliente de escritura: guardias duras (autorizacion, objetivo, valores exactos, campos prohibidos, una vez, id propio)', async () => {
  const f = makeFake();
  const mk = (over = {}) => new P0WriteClient({ ...cfg, fetchImpl: f.fetchImpl, authorization: P0_AUTH_PHRASE, ...over });
  assert.throws(() => mk({ authorization: 'si' }), { code: 'P0_NOT_AUTHORIZED' });
  assert.throws(() => mk({ authorization: undefined }), { code: 'P0_NOT_AUTHORIZED' });
  assert.throws(() => mk({ baseUrl: 'https://atheron1-hotel-staging-20260923.odoo.com' }), { code: 'P0_TARGET_NOT_AUTHORIZED' });
  assert.throws(() => mk({ database: 'otra' }), { code: 'P0_TARGET_NOT_AUTHORIZED' });
  const w = mk();
  for (const bad of [{ ...P0_VALS, state: 'published' }, { ...P0_VALS, role_id: 29 }, { ...P0_VALS, x_guest_id: 7 }, { ...P0_VALS, x_nobeds_id: 'a' }, { ...P0_VALS, x_bloqueo_ref: '1' }, { ...P0_VALS, extra: 1 }, { ...P0_VALS, name: 'otro' }, { ...P0_VALS, start_datetime: '2026-10-15 15:00:00' }]) {
    await assert.rejects(w.createExactlyOne(bad), (e) => ['P0_VALUES_MISMATCH', 'P0_FORBIDDEN_FIELD'].includes(e.code));
  }
  assert.equal(f.st.calls.filter((c) => /create/.test(c)).length, 0);
  await assert.rejects(w.unlinkOwn(5000), { code: 'P0_UNLINK_NOT_OWN_ID' });
  const id = await w.createExactlyOne({ ...P0_VALS });
  await assert.rejects(w.createExactlyOne({ ...P0_VALS }), { code: 'P0_ONLY_ONE_CREATE' });
  await assert.rejects(w.unlinkOwn(id + 1), { code: 'P0_UNLINK_NOT_OWN_ID' });
  await w.unlinkOwn(id);
  await assert.rejects(w.unlinkOwn(id), { code: 'P0_ONLY_ONE_UNLINK' });
  // el cliente de solo lectura sigue sin poder escribir
  const ro = new OdooJson2Client({ ...cfg, fetchImpl: f.fetchImpl });
  await assert.rejects(ro.call('planning.slot', 'create', {}), { code: 'ODOO_READ_ONLY_VIOLATION' });
  await assert.rejects(ro.call('planning.slot', 'unlink', {}), { code: 'ODOO_READ_ONLY_VIOLATION' });
});

test('el unico lugar con capacidad de escritura es odoo-json2-p0-client.mjs y el borrado exige el id propio', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../src/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const usesRequest = /\._request\(/.test(src);
    if (usesRequest) assert.ok(['odoo-json2-p0-client.mjs', 'odoo-json2-client.mjs'].includes(f), `${f} usa _request`);
    if (/['"](create|write|unlink)['"]/.test(src)) assert.ok(['odoo-json2-p0-client.mjs', 'odoo-json2-client.mjs', 'p0-run.mjs'].includes(f) || /READ_METHODS|rechaz|ODOO_READ_ONLY/.test(src) === false, `${f} nombra una mutacion`);
  }
  const run = readFileSync(new URL('../src/p0-run.mjs', import.meta.url), 'utf8');
  assert.ok(!/writer\.\w+\(/.test(run.replace(/writer\.(createExactlyOne|adoptCreatedId|unlinkOwn|createdIds)/g, '')), 'p0-run usa metodos del escritor no previstos');
  assert.equal(P0_MARKER_NAME.includes('161419736'), false);
});
