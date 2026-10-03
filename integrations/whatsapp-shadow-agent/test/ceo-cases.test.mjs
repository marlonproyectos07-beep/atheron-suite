/**
 * Ejecuta los 12 casos CANONICOS de AI/whatsapp/CEO_CASES_V1.md (CEO-01..CEO-12).
 * El test primero comprueba que el archivo tiene EXACTAMENTE esos 12 IDs y la
 * politica oficial verbatim; luego ejecuta cada caso contra el agente SHADOW.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSession, processMessage, processBurst } from '../src/agent.mjs';
import { guardPort } from '../src/odoo-port.mjs';
import { makeFakeOdoo } from './fake-odoo.mjs';
import { POLICY } from '../src/policy.mjs';
import { norm } from '../src/nlu.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const md = readFileSync(join(root, 'AI', 'whatsapp', 'CEO_CASES_V1.md'), 'utf8');
const mk = (cfg = {}) => {
  const fake = makeFakeOdoo(cfg);
  return { fake, deps: { odoo: guardPort(fake), humanAvailable: true }, session: createSession({ id: 'ceo-canon' }) };
};
const say = (c, text) => processMessage(c.session, { type: 'text', text }, c.deps);
const quote = { property: 'AS', checkIn: '2026-10-10', checkOut: '2026-10-13', nights: 3, guests: 2, unit: '302', total: 360000 };
const direct = (checkIn, extra = {}) => ({ property: 'AS', source: 'DIRECT', has_payment: true, checkIn, checkOut: `${checkIn.slice(0, 8)}${String(Number(checkIn.slice(8)) + 1).padStart(2, '0')}`, nights: 1, guests: 2, ...extra });

test('CEO_CASES_V1.md: exactamente CEO-01..CEO-12 y la politica oficial verbatim', () => {
  const ids = [...md.matchAll(/^### (CEO-\d{2})$/gm)].map((m) => m[1]);
  assert.deepEqual(ids, Array.from({ length: 12 }, (_, i) => `CEO-${String(i + 1).padStart(2, '0')}`));
  assert.ok(md.includes('Cancelación o cambio hasta 48 horas antes del check-in: no hay devolución en efectivo. El valor pagado queda como saldo a favor durante 6 meses para una nueva reserva en Hoteles Atheron, sujeto a disponibilidad y a la tarifa vigente de las nuevas fechas. Si la nueva tarifa es superior, el huésped paga la diferencia. Solicitudes con menos de 48 horas, no-show o casos excepcionales pasan a revisión humana. Las reservas realizadas mediante Booking, Airbnb u otra OTA se rigen primero por las condiciones de la plataforma.'));
  assert.match(md, /50 % del total vigente/);
});

test('modo: WHATSAPP_AUTOMATION_MODE=shadow, sin outbound; Odoo live = PENDING_EXTERNAL_AUTHENTICATED_TEST', async () => {
  assert.equal(POLICY.automation_mode, 'shadow');
  assert.equal(POLICY.odoo_staging_live_validation, 'PENDING_EXTERNAL_AUTHENTICATED_TEST');
  const c = mk();
  const d = await say(c, 'Hola');
  assert.equal(d.mode, 'SHADOW');
  assert.equal(d.outbound, null);
});

test('CEO-01 descuento/rebaja/mejor precio -> ESCALATE_HUMAN, nunca modifica el precio', async () => {
  for (const t of ['¿Me haces un descuento?', 'Hazme una rebaja', 'Necesito un mejor precio']) {
    const c = mk();
    c.session.lastQuote = { ...quote };
    const d = await say(c, t);
    assert.equal(d.escalate, true, t);
    assert.ok(!/\d/.test(d.reply), `${t}: ${d.reply}`);
    assert.equal(c.session.lastQuote.total, 360000, 'el precio no cambia');
    assert.equal(c.fake.calls.length, 0);
  }
});

test('CEO-02 abono tras cotizacion valida = 50 % del total vigente', async () => {
  const c = mk();
  c.session.lastQuote = { ...quote };
  const d = await say(c, '¿Cuánto debo abonar?');
  assert.match(d.reply, /50%/);
  assert.match(d.reply, /\$180\.000/);
  assert.match(d.reply, /\$360\.000/);
  assert.equal(d.escalate, false);
  assert.equal(d.deposit.percent, 50);
});

test('CEO-03 reserva directa, cancelar/cambiar con >= 48 h: explica la politica completa', async () => {
  for (const t of ['Quiero cancelar mi reserva', 'Necesito cambiar mi reserva de fecha']) {
    const c = mk();
    c.session.reservation = direct('2026-10-10');
    const d = await say(c, t);
    const r = norm(d.reply);
    assert.equal(d.escalate, false, t);
    assert.match(r, /no hay devolucion en efectivo/);
    assert.match(r, /saldo a favor 6 meses/);
    assert.match(r, /sujeto a disponibilidad/);
    assert.match(r, /tarifa vigente de las nuevas fechas/);
    assert.match(r, /si es superior, pagas la diferencia/);
    assert.ok(d.flags.some((f) => f.startsWith('CANCELACION_DECISION:POLICY')));
  }
  // limite exacto: 48 h justas todavia es politica ("hasta 48 horas")
  const c = mk();
  c.session.reservation = direct('2026-10-05');
  assert.equal((await say(c, 'Quiero cancelar')).escalate, false);
});

test('CEO-04 reserva directa, < 48 h: ESCALATE_HUMAN, sin decidir devolucion ni penalidad', async () => {
  for (const checkIn of ['2026-10-04', '2026-10-03']) {
    const c = mk();
    c.session.reservation = direct(checkIn);
    const d = await say(c, 'Necesito cancelar mi reserva');
    assert.equal(d.escalate, true, checkIn);
    assert.ok(!/saldo a favor|6 meses|devolucion en efectivo|penalidad de|te devolvemos/.test(norm(d.reply)), d.reply);
    assert.ok(d.flags.some((f) => f.startsWith('CANCELACION_DECISION:HUMAN:MENOS_DE_48H')));
  }
  // no-show y reserva OTA tambien van a humano (la OTA se rige primero por su plataforma)
  const ns = mk();
  ns.session.reservation = direct('2026-10-10');
  assert.equal((await say(ns, 'No llegué, fue un no show')).escalate, true);
  const ota = mk();
  ota.session.reservation = direct('2026-10-20', { source: 'BOOKING' });
  const d = await say(ota, 'Quiero cancelar mi reserva');
  assert.equal(d.escalate, true);
  assert.match(norm(d.reply), /plataforma/);
});

test('CEO-05 "Booking me sale mas barato": no discute, no iguala, ESCALATE_HUMAN', async () => {
  const c = mk();
  const d = await say(c, 'Booking me sale más barato');
  assert.equal(d.escalate, true);
  assert.ok(!/\d|igualamos|igualar|te lo dejo|no es cierto/i.test(d.reply), d.reply);
  assert.equal(c.fake.calls.length, 0);
});

test('CEO-06 "Somos cuatro para manana": conserva pax=4 y fecha=manana, no re-pregunta, consulta disponibilidad', async () => {
  const c = mk();
  const d = await say(c, 'Somos cuatro para mañana');
  assert.equal(d.memory.guests, 4);
  assert.equal(d.memory.checkIn, '2026-10-04');
  assert.ok(!/cuantas personas|para que fecha/.test(norm(d.reply)));
  assert.equal(c.fake.calls.length, 1);
  assert.equal(c.fake.calls[0].req.guests, 4);
  assert.equal(c.fake.calls[0].req.checkIn, '2026-10-04');
});

test('CEO-07 mensajes fragmentados: agrupa, una sola respuesta, no re-pregunta pax/fecha', async () => {
  const c = mk();
  const d = await processBurst(c.session, ['Hola', 'somos dos', 'para mañana'].map((text) => ({ type: 'text', text })), c.deps);
  assert.ok(d.flags.includes('RAFAGA_AGRUPADA:3'));
  assert.equal(c.session.history.filter((h) => h.role === 'agent_proposal').length, 1, 'una sola respuesta');
  assert.equal(d.memory.guests, 2);
  assert.equal(d.memory.checkIn, '2026-10-04');
  assert.ok(!/cuantas personas|para que fecha/.test(norm(d.reply)));
  assert.equal(c.fake.calls.length, 1);
});

test('CEO-08 "Ya no somos dos, somos tres": actualiza, reconsulta y NO conserva la cotizacion anterior como valida', async () => {
  const c = mk();
  await say(c, 'Somos 2 para mañana');
  const before = c.session.lastQuote;
  assert.equal(before.guests, 2);
  const d = await say(c, 'Ya no somos dos, somos tres');
  assert.equal(d.memory.guests, 3);
  assert.ok(d.flags.includes('COTIZACION_ANTERIOR_INVALIDADA'));
  assert.equal(c.fake.calls.length, 2, 'reconsulto Odoo');
  assert.equal(c.fake.calls[1].req.guests, 3);
  assert.equal(c.session.lastQuote.guests, 3, 'la cotizacion vigente es la nueva');
  assert.notEqual(c.session.lastQuote, before);
});

test('CEO-09 aliado/hotel B2B: ALLY_B2B, no responde como huesped, ESCALATE_HUMAN', async () => {
  for (const t of ['Soy del hotel Sol, les mando un huésped para el 15', 'Cuadremos cuentas de septiembre', 'Consulta de disponibilidad para un cliente']) {
    const c = mk();
    const d = await say(c, t);
    assert.equal(d.line, 'ALLY_B2B', t);
    assert.ok(d.labels.includes('ALLY_B2B'));
    assert.equal(d.reply, null);
    assert.equal(d.escalate, true);
    assert.equal(c.fake.calls.length, 0);
  }
});

test('CEO-10 camaras/alarmas/seguridad electronica: ATHERON_SECURITY, fuera del flujo hotelero, deriva', async () => {
  for (const t of ['Quiero cotizar cámaras de seguridad', 'Necesito una alarma para mi local', 'Instalación de seguridad electrónica']) {
    const c = mk();
    const d = await say(c, t);
    assert.equal(d.line, 'ATHERON_SECURITY', t);
    assert.ok(d.labels.includes('ATHERON_SECURITY'));
    assert.equal(d.escalate, true);
    assert.equal(c.fake.calls.length, 0);
    assert.ok(!/\$|\d{3}/.test(d.reply));
  }
});

test('CEO-11 150 personas: STRATEGIC_GROUP_LEAD, pide solo lo que falta, capacidad verificada, sin prometer ni descuento, aprobacion de precio de grupo', async () => {
  const c = mk();
  const d = await say(c, 'Necesito alojamiento para 150 personas');
  assert.equal(d.group.status, 'STRATEGIC_GROUP_LEAD');
  assert.ok(d.labels.includes('STRATEGIC_GROUP_LEAD'));
  assert.ok(d.flags.includes('GROUP_PRICING_APPROVAL'));
  assert.equal(d.escalate, true);
  assert.equal(d.group.verified_capacity.single_property_max, 22);
  assert.deepEqual(d.group.verified_capacity.properties, ['AS']);
  assert.match(d.reply, /¿Para qué fechas sería\?/); // unico dato que falta
  assert.ok(!/caben|confirmad|descuento|%/i.test(d.reply));
  assert.equal(d.hold, null);
  // con fechas: se consulta SOLO la capacidad verificada (Atheron Suite) como insumo para el humano
  const c2 = mk();
  const d2 = await say(c2, 'Necesito alojamiento para 150 personas el 14 de noviembre');
  assert.equal(c2.fake.calls.length, 1);
  assert.equal(c2.fake.calls[0].req.guests, 22);
  assert.ok(d2.flags.includes('CAPACIDAD_VERIFICADA_CONSULTADA_SOLO_ATHERON_SUITE'));
  assert.ok(!/caben|150 personas (si|sí)|descuento/i.test(d2.reply));
});

test('CEO-12 comprobante o "ya pague": no confirma, PAYMENT_VALIDATION_REQUIRED, ESCALATE_HUMAN', async () => {
  const c1 = mk();
  const d1 = await say(c1, 'Ya pagué');
  const c2 = mk();
  const d2 = await processMessage(c2.session, { type: 'image', caption: 'comprobante' }, c2.deps);
  for (const d of [d1, d2]) {
    assert.equal(d.escalate, true);
    assert.ok(d.flags.includes('PAYMENT_VALIDATION_REQUIRED'));
    assert.ok(!/confirmad|reserva (queda|está) (lista|confirmada)/i.test(d.reply), d.reply);
    assert.match(d.reply, /valido con el equipo/);
  }
});

test('SAFETY intencion desconocida o confianza insuficiente -> ESCALATE_HUMAN; nunca se asume disponibilidad', async () => {
  for (const t of ['asdf qwerty', 'jajaja', 'el jueves nos vemos en la plaza', '👍', 'quiero saber lo de lo otro']) {
    const c = mk();
    const d = await say(c, t);
    assert.equal(d.escalate, true, t);
    assert.equal(c.fake.calls.length, 0, `${t}: no consulta Odoo`);
    assert.ok(!/tengo|disponib|hab\.|cupo/i.test(d.reply), `${t}: ${d.reply}`);
    assert.equal(d.hold, null);
  }
  // audio de baja confianza (inaudible o transcripcion < 0.6)
  for (const m of [{ type: 'audio', transcript: null, confidence: 0.1 }, { type: 'audio', transcript: 'quiero una habitación mañana', confidence: 0.4 }]) {
    const c = mk();
    const d = await processMessage(c.session, m, c.deps);
    assert.equal(d.escalate, true);
    assert.equal(c.fake.calls.length, 0);
  }
});
