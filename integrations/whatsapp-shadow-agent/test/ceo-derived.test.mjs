/**
 * Requisitos del CEO listados en el mensaje de continuacion de
 * GOAL-WHATSAPP-AGENT-001 (2026-10-03). OJO: NO son los "12 casos CEO
 * originales" (ese archivo no esta en el repo ni en la sesion); son un
 * caso ejecutable por cada requisito que el CEO enumero. Ids CEO-D01..D12.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSession, processMessage, processBurst } from '../src/agent.mjs';
import { guardPort, ShadowViolation, createGatewayShadowPort } from '../src/odoo-port.mjs';
import { makeFakeOdoo } from './fake-odoo.mjs';
import { depositFor, reconcileWithOdoo } from '../src/deposit.mjs';
import { evaluateGroup, GROUP_STATUS } from '../src/groups.mjs';
import { POLICY, PROPERTIES, VERIFIED_ODOO_CAPACITY } from '../src/policy.mjs';
import { norm } from '../src/nlu.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const mk = (odooCfg = {}, extra = {}) => {
  const fake = makeFakeOdoo(odooCfg);
  return { fake, deps: { odoo: guardPort(fake), humanAvailable: true, ...extra }, session: createSession({ id: 'ceo' }) };
};
const say = (ctx, text) => processMessage(ctx.session, { type: 'text', text }, ctx.deps);

test('CEO-D01 SHADOW: nunca hay outbound, nunca HOLD, y el codigo no contiene ningun camino de envio', async () => {
  const ctx = mk();
  for (const t of ['Hola, ¿hay habitaciones para mañana, somos 2?', 'Quiero reservar', '¿Me haces descuento?', 'Somos 150 personas']) {
    const d = await say(ctx, t);
    assert.equal(d.mode, 'SHADOW');
    assert.equal(d.outbound, null);
    assert.equal(d.hold, null);
  }
  for (const f of readdirSync(join(here, '..', 'src'))) {
    const src = readFileSync(join(here, '..', 'src', f), 'utf8');
    assert.ok(!/\bfetch\s*\(/.test(src) || f === 'odoo-port.mjs', `${f} usa fetch`);
    assert.ok(!/graph\.facebook|api\.whatsapp|twilio|sendMessage|messages\.send/i.test(src), `${f} referencia un canal de envio`);
  }
});

test('CEO-D02 anticipo oficial 50 %: se aplica sobre el total de Odoo y se avisa si Odoo aun exige 30 %', async () => {
  assert.equal(POLICY.deposit.percent, 50);
  assert.equal(depositFor(360000), 180000);
  assert.equal(depositFor(0), null);
  assert.equal(depositFor(null), null);
  assert.equal(reconcileWithOdoo({ total: 100000, deposit_required: 30000 }).mismatch, true);
  assert.equal(reconcileWithOdoo({ total: 100000, deposit_required: 50000 }).mismatch, false);

  const ctx = mk({ depositPercent: 30 }); // Odoo STAGING con configuracion anterior (30 %)
  const d1 = await say(ctx, 'Somos 2 para mañana, ¿hay algo?');
  assert.ok(d1.flags.some((f) => f.startsWith('ODOO_DEPOSIT_MISMATCH:odoo=30%')), 'debe marcar que Odoo exige 30 %');
  const d2 = await say(ctx, '¿Cuánto es el abono?');
  const total = ctx.session.lastQuote.total;
  assert.match(d2.reply, /50%/);
  assert.ok(d2.reply.includes(`$${(total / 2).toLocaleString('es-CO')}`), 'el valor es el 50 % del total de Odoo');
  assert.ok(!/30\s?%/.test(d2.reply), 'jamas dice 30 %');
  assert.equal(d2.escalate, false);
});

test('CEO-D03 horarios reales por propiedad; nunca 00:00; propiedad sin horario confirmado = DATA_GAP + humano', async () => {
  assert.equal(PROPERTIES.AS.checkin, '15:00');
  assert.equal(PROPERTIES.AS.checkout, '11:00');
  const ctx = mk();
  const asH = await say(ctx, '¿A qué hora es el check in y el check out del hotel atheron suite?');
  assert.match(asH.reply, /15:00/);
  assert.match(asH.reply, /11:00/);
  assert.ok(!/00:00/.test(asH.reply));
  for (const [text, key] of [['¿A qué hora es el check in en Casa Algarra?', 'CA'], ['¿A qué hora es el check in en La Margarita?', 'LM']]) {
    const c = mk();
    const d = await say(c, text);
    assert.equal(d.escalate, true, key);
    assert.ok(d.data_gaps.some((g) => g.includes(`horarios:${key}`)), key);
    assert.ok(!/\d{1,2}:\d{2}/.test(d.reply), `${key}: no inventa horario`);
  }
  const cc = await say(mk(), '¿A qué hora es el check in en Colonial Confort?');
  assert.match(cc.reply, /18:00/); // ficha web verificada
  assert.equal(cc.escalate, false);
  for (const p of Object.values(PROPERTIES)) for (const h of [p.checkin, p.checkout]) assert.ok(h === null || (h !== '00:00' && /^\d{2}:\d{2}$/.test(h)));
});

test('CEO-D04 memoria multi-turno: no repite preguntas, recalcula con el ultimo dato', async () => {
  const ctx = mk();
  const t1 = await say(ctx, 'Hola, ¿hay habitaciones para el 20 de octubre?');
  assert.match(norm(t1.reply), /cuantas personas/);
  assert.ok(!/fecha/.test(norm(t1.reply)), 'no vuelve a pedir la fecha');
  const t2 = await say(ctx, 'Somos 2');
  assert.equal(ctx.fake.calls.length, 1);
  assert.equal(ctx.fake.calls[0].req.checkIn, '2026-10-20');
  assert.equal(ctx.fake.calls[0].req.guests, 2);
  assert.ok(!/^¡?hola/i.test(t2.reply), 'saluda una sola vez');
  const t3 = await say(ctx, '¿Y parqueadero?');
  assert.match(t3.reply, /carro o moto/);
  assert.ok(!/fecha|personas/.test(norm(t3.reply)));
  const t4 = await say(ctx, 'Carro');
  assert.match(t4.reply, /15\.000/);
  const t5 = await say(ctx, 'Mejor 3 noches');
  const last = ctx.fake.calls.at(-1).req;
  assert.equal(last.checkIn, '2026-10-20');
  assert.equal(last.checkOut, '2026-10-23');
  assert.match(t5.reply, /3 noches/);
  const t6 = await say(ctx, 'Ya no somos 2, somos 3');
  assert.equal(ctx.fake.calls.at(-1).req.guests, 3);
  assert.equal(ctx.fake.calls.at(-1).req.checkOut, '2026-10-23', 'conserva las 3 noches');
  assert.match(t6.reply, /3 personas/);
});

test('CEO-D05 descuento -> humano, sin inventar ningun porcentaje ni valor', async () => {
  for (const text of ['¿Me haces descuento?', 'Hazme un mejor precio', 'Booking me lo ofrece más barato', '¿Hay descuento por varias noches?']) {
    const ctx = mk();
    const d = await say(ctx, text);
    assert.equal(d.escalate, true, text);
    assert.ok(!/\d/.test(d.reply), `${text}: sin cifras`);
    assert.ok(d.data_gaps.some((g) => g.includes('descuentos')));
  }
});

test('CEO-D06 cancelacion: politica oficial >=48 h explica; <48 h, no-show, OTA y sin datos verificables -> humano', async () => {
  assert.equal(POLICY.cancellation.cash_refund, false);
  assert.equal(POLICY.cancellation.credit_months, 6);
  assert.equal(POLICY.cancellation.notice_hours, 48);
  for (const text of ['Necesito cancelar mi reserva', 'No pude llegar', 'Quiero que me devuelvan mi plata']) {
    const ctx = mk();
    const d = await say(ctx, text);
    assert.equal(d.escalate, true, text);
    assert.ok(!/saldo a favor|6 meses/.test(d.reply ?? ''), `${text}: sin reserva verificable no se promete nada`);
  }
}); 

test('CEO-D07 clasificacion B2B (aliados): etiqueta, escala y NO responde como huesped', async () => {
  for (const text of ['Consulta de disponibilidad para un cliente', 'Cuadremos cuentas de septiembre', 'Tengo un cliente para el sábado', 'Liquidación de comisiones de octubre']) {
    const ctx = mk();
    const d = await say(ctx, text);
    assert.equal(d.line, 'ALLY_B2B', text);
    assert.ok(d.labels.includes('B2B_ALIADO'));
    assert.equal(d.reply, null);
    assert.equal(d.escalate, true);
    assert.equal(ctx.fake.calls.length, 0, 'no consulta Odoo para un aliado');
  }
});

test('CEO-D08 Atheron Security: se etiqueta, se deriva y no se cotiza', async () => {
  for (const text of ['Cotización de cámaras de seguridad', 'Necesito instalar una alarma', 'Precio de un DVR con 8 cámaras CCTV']) {
    const ctx = mk();
    const d = await say(ctx, text);
    assert.equal(d.line, 'ATHERON_SECURITY', text);
    assert.ok(d.labels.includes('ATHERON_SECURITY'));
    assert.ok(!/\$|\d{3,}/.test(d.reply));
    assert.match(d.reply, /Atheron Security/);
    assert.equal(d.escalate, true);
    assert.equal(ctx.fake.calls.length, 0);
  }
});

test('CEO-D09 grupos grandes: 11+ siempre humano; >22 PARTIAL_CAPACITY; jamas se promete cupo ni se crea HOLD', async () => {
  assert.equal(evaluateGroup(10).status, GROUP_STATUS.SMALL_GROUP);
  assert.equal(evaluateGroup(11).status, GROUP_STATUS.HUMAN_QUOTE);
  assert.equal(evaluateGroup(22).status, GROUP_STATUS.HUMAN_QUOTE);
  assert.equal(evaluateGroup(23).status, GROUP_STATUS.PARTIAL_CAPACITY);
  assert.equal(evaluateGroup(99).status, GROUP_STATUS.PARTIAL_CAPACITY);
  for (const n of [7, 11, 13, 22, 23, 40, 99, 150, 300]) {
    const g = evaluateGroup(n);
    assert.equal(g.can_promise_capacity, false, `n=${n}`);
    assert.equal(g.hold_allowed, false, `n=${n}`);
  }
  for (const n of [13, 25, 60]) {
    const ctx = mk();
    const d = await say(ctx, `Somos ${n} personas para el 24 de octubre`);
    assert.equal(d.escalate, true, `n=${n}`);
    assert.equal(d.hold, null);
    assert.ok(!/(si |sí )?caben|hay espacio para|queda confirmado|te los separo/i.test(d.reply), `n=${n}: ${d.reply}`);
  }
  // un intento de HOLD (masivo o no) lanza ShadowViolation
  const guarded = guardPort(makeFakeOdoo());
  assert.throws(() => guarded.hold({ quote_id: 1 }), ShadowViolation);
  assert.throws(() => guarded.createHold({}), ShadowViolation);
  assert.throws(() => guarded.cancel({}), ShadowViolation);
  assert.throws(() => guarded.registerPayment({}), ShadowViolation);
});

test('CEO-D10 STRATEGIC_GROUP_LEAD (>=100, p. ej. 150): etiqueta, urgencia alta y respuesta natural sin prometer capacidad', async () => {
  assert.equal(evaluateGroup(100).status, GROUP_STATUS.STRATEGIC_GROUP_LEAD);
  assert.equal(evaluateGroup(99).status, GROUP_STATUS.PARTIAL_CAPACITY);
  const ctx = mk();
  const d = await say(ctx, 'Hola, somos 150 personas para un evento en noviembre');
  assert.equal(d.group.status, 'STRATEGIC_GROUP_LEAD');
  assert.ok(d.labels.includes('STRATEGIC_GROUP_LEAD'));
  assert.equal(d.escalate, true);
  assert.equal(d.escalation.urgency, 'ALTA');
  assert.equal(d.reply, '¡Hola! Sí podemos revisar un grupo de ese tamaño. Déjame validar capacidad entre nuestras propiedades y te confirmo la distribución. ¿Para qué fechas sería?');
  assert.ok(!/caben|150 personas (si|sí)|confirmad/i.test(d.reply));
  assert.equal(d.hold, null);
  assert.equal(ctx.fake.calls.length, 0, 'ni consulta ni HOLD masivo');
});

test('CEO-D11 capacidades: solo Atheron Suite esta verificada en Odoo; el resto es referencia NO verificada (DATA_GAP/PARTIAL_CAPACITY)', async () => {
  assert.deepEqual(VERIFIED_ODOO_CAPACITY.properties, ['AS']);
  assert.deepEqual(Object.keys(VERIFIED_ODOO_CAPACITY.unit_ids_without_capacity), ['7', '8']); // Algarra y Neusa existen en Odoo sin capacidad
  const g = evaluateGroup(40);
  assert.equal(g.verified_capacity.single_property_max, 22);
  assert.ok(g.unverified_reference.length >= 4 && g.unverified_reference.every((u) => u.verified === false));
  assert.ok(g.data_gaps.includes('CAPACIDAD_OTRAS_PROPIEDADES_NO_VERIFICADA_EN_ODOO'));
  assert.ok(!PROPERTIES.AS.odoo_mapped === false);
  for (const k of ['CA', 'CN', 'AA', 'CC', 'LM']) assert.equal(PROPERTIES[k].odoo_mapped, false, k);
  // pedir precio/disponibilidad de una propiedad no mapeada NO consulta Odoo: DATA_GAP + humano
  for (const text of ['¿Hay disponibilidad en Casa Neusa para el 17 de octubre, somos 6?', 'Quiero reservar Casa Algarra el 24 de octubre, somos 10']) {
    const ctx = mk();
    const d = await say(ctx, text);
    assert.equal(ctx.fake.calls.length, 0, text);
    assert.equal(d.escalate, true, text);
    assert.ok(d.data_gaps.some((x) => /PARTIAL_CAPACITY|DATA_GAP|CAPACIDAD/.test(x)), text);
  }
});

test('CEO-D12 ningun outbound real, ningun cambio a WhatsApp/Odoo, ningun secreto en los entregables', async () => {
  // El puerto del Gateway real: quote desactivado en SHADOW (crearia una cotizacion en Odoo)
  const client = { availability: async () => ({ data: { opciones: [{ unit_id: 3, nombre: '203', estado: 'disponible', capacidad_comercial: 4 }] } }) };
  const port = createGatewayShadowPort({ client, propertyIds: { AS: 1 } });
  const res = await port.availability({ property: 'AS', checkIn: '2026-10-10', checkOut: '2026-10-11', guests: 2 });
  assert.equal(res.options[0].unit, '203');
  await assert.rejects(() => port.quote({ property: 'AS', checkIn: '2026-10-10', checkOut: '2026-10-11', guests: 2 }), ShadowViolation);
  // con quote desactivado el agente NO inventa precio: lo planea y lo declara
  const ctx = { deps: { odoo: guardPort(port) }, session: createSession() };
  const d = await processMessage(ctx.session, { type: 'text', text: 'Somos 2 para el 10 de octubre' }, ctx.deps);
  assert.ok(d.flags.includes('QUOTE_PLANNED_NOT_EXECUTED'));
  assert.equal(d.odoo.planned_only.length, 1);
  assert.ok(!/\$\s?\d/.test(d.reply), 'sin precio no hay cifra');

  // escaneo de secretos en lo que entrega este goal
  const files = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (n === 'node_modules') continue;
      statSync(p).isDirectory() ? walk(p) : files.push(p);
    }
  };
  walk(join(here, '..'));
  walk(join(root, 'AI', 'whatsapp'));
  const bad = [];
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    if (/(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|EAA[A-Za-z0-9]{40,}|-----BEGIN [A-Z ]*PRIVATE KEY|(?:token|secret|password|api[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}['"])/i.test(t)) bad.push(f);
    if (/\b(?:\+?57)?3\d{9}\b/.test(t)) bad.push(`${f} (telefono)`);
  }
  assert.deepEqual(bad, []);
});
