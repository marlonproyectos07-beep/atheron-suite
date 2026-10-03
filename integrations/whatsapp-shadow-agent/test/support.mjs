/**
 * Arnes de pruebas: Gateway FALSO (cumple el puerto, registra llamadas, usa
 * precios arbitrarios no redondos para demostrar que el agente NO inventa:
 * cualquier total que aparezca viene del Gateway) + inventario FIXTURE.
 * Los inventarios son sinteticos y NO describen la realidad de los hoteles.
 */
import { ShadowAgent } from '../src/agent.mjs';
import { MemoryEvidenceSink } from '../src/evidence.mjs';
import { addDays, diffDays } from '../src/nlu.mjs';

export const NOW = new Date('2026-10-03T10:00:00-05:00'); // sabado

const mk = (pid, pname, aliases, labels, cap, rate) => ({ id: pid, name: pname, aliases, units: labels.map((l, i) => ({ unit_id: pid * 1000 + i, unit_label: l, capacity: Array.isArray(cap) ? cap[i] : cap, composite: false, rate })) });
const range = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

export function fixtureCatalog(size = 'small') {
  const big = size === 'big';
  return {
    properties: [
      mk(1, 'Hotel Atheron Suite', ['atheron'], big ? range(22, 'H') : range(5, 'H'), big ? 1 : [2, 4, 4, 4, 4], 187_250),
      mk(2, 'Casa Algarra', ['algarra'], range(big ? 12 : 6, 'A'), 4, 143_900),
      mk(3, 'Casa Neusa', ['neusa'], range(big ? 10 : 5, 'N'), 4, 131_400),
      mk(4, 'Colonial Confort', ['colonial'], range(big ? 16 : 8, 'C'), 3, 119_700),
      mk(5, 'La Margarita', ['margarita'], range(big ? 12 : 6, 'M'), 4, 156_300),
    ],
  };
}
// Atheron "big" = 22 unidades de capacidad 1 -> 22 personas; el resto escala. Total big = 22+48+40+48+48 = 206.

export function fakeGateway(catalog, { fail = false, manual = false, unavailable = () => false, noPrice = false } = {}) {
  const calls = [];
  const byId = new Map(catalog.properties.flatMap((p) => p.units.map((u) => [u.unit_id, { ...u, property_id: p.id, property_name: p.name }])));
  return {
    calls,
    async searchOptions({ checkIn, checkOut, guests }) {
      calls.push({ op: 'searchOptions', checkIn, checkOut, guests });
      if (fail) return { ok: false, error_code: 'GATEWAY_AVAILABILITY_ERROR:TIMEOUT', options: [] };
      const nights = Math.max(1, diffDays(checkIn, checkOut));
      return {
        ok: true,
        options: [...byId.values()].filter((u) => !unavailable(u, checkIn)).map((u) => ({
          property_id: u.property_id, property_name: u.property_name, unit_id: u.unit_id, unit_label: u.unit_label,
          capacity: u.capacity, available: true, base_total: noPrice ? null : u.rate * nights,
        })),
      };
    },
    async quote({ checkIn, checkOut, guests, unit_ids }) {
      calls.push({ op: 'quote', checkIn, checkOut, guests, unit_ids });
      if (fail) return { ok: false, error_code: 'GATEWAY_QUOTE_ERROR:TIMEOUT' };
      const nights = Math.max(1, diffDays(checkIn, checkOut));
      const total = unit_ids.reduce((s, id) => s + byId.get(id).rate * nights, 0);
      return { ok: true, total: noPrice ? null : total, quote_id: 'Q-FIXTURE', requires_manual_confirmation: manual };
    },
  };
}

export function makeAgent({ size = 'small', enabled = true, gatewayOpts = {}, contacts = {}, debounceMs = 4000, now = NOW } = {}) {
  const catalog = fixtureCatalog(size);
  const gateway = fakeGateway(catalog, gatewayOpts);
  const evidence = new MemoryEvidenceSink();
  const agent = new ShadowAgent({ config: { mode: 'shadow', enabled }, gateway, catalog, evidence, contacts, debounceMs, clock: () => now });
  return { agent, gateway, evidence, catalog };
}

const asRe = (x) => (x instanceof RegExp ? x : new RegExp(String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

/** Evalua `expect` contra una respuesta; devuelve lista de fallos (vacia = PASS). */
export function check(res, expect = {}, ctxBefore = {}) {
  const fails = [];
  const f = (m) => fails.push(m);
  if (res == null) { f('sin respuesta'); return fails; }
  if (res.send !== false) f('send != false');
  if ('classification' in expect && res.classification !== expect.classification) f(`classification ${res.classification} != ${expect.classification}`);
  for (const i of expect.intents_include ?? []) if (!res.intents.includes(i)) f(`falta intent ${i} (hay ${res.intents})`);
  if ('escalation' in expect) {
    if (expect.escalation === null) { if (res.escalation) f(`no debia escalar y escalo: ${res.escalation.reason}`); }
    else if (res.escalation?.reason !== expect.escalation) f(`escalation ${res.escalation?.reason} != ${expect.escalation}`);
  }
  for (const a of expect.actions_include ?? []) if (!res.escalation?.actions?.includes(a)) f(`falta accion ${a}`);
  if (expect.text_null && res.text !== null) f(`text debia ser null: ${res.text}`);
  for (const r of expect.text_includes ?? []) if (!asRe(r).test(res.text ?? '')) f(`text no incluye ${r}`);
  for (const r of expect.text_excludes ?? []) if (asRe(r).test(res.text ?? '')) f(`text incluye prohibido ${r}`);
  if ('odoo_called' in expect && res.odoo.called !== expect.odoo_called) f(`odoo_called ${res.odoo.called} != ${expect.odoo_called}`);
  for (const [k, v] of Object.entries(expect.context ?? {})) if (JSON.stringify(res.context[k]) !== JSON.stringify(v)) f(`context.${k} ${JSON.stringify(res.context[k])} != ${JSON.stringify(v)}`);
  for (const [k, v] of Object.entries(expect.context_before ?? {})) if (JSON.stringify(ctxBefore[k]) !== JSON.stringify(v)) f(`context_before.${k} ${JSON.stringify(ctxBefore[k])} != ${JSON.stringify(v)}`);
  if (expect.custom) { try { expect.custom(res); } catch (e) { f(`custom: ${e.message}`); } }
  return fails;
}

/** Ejecuta un caso declarativo. Devuelve {id, pass, fails[]}. */
export async function runCase(c) {
  const env = makeAgent({ size: c.inventory ?? 'small', ...(c.agent ?? {}) });
  const convo = `case-${c.id}`;
  if (c.contacts) env.agent.contacts[convo] = c.contacts;
  const fails = [];
  let t = 0;
  for (const [i, turn] of c.turns.entries()) {
    const before = structuredClone(env.agent.getContext(convo));
    let res;
    if (turn.fragments) {
      const base = NOW.getTime() + t;
      for (const [j, text] of turn.fragments.entries()) {
        const ts = base + j * 1500;
        env.agent.ingest(convo, { id: `m${i}-${j}`, text, ts });
        if (env.agent.dueConversations(ts + 500).includes(convo)) fails.push(`turn ${i}: respondio antes de esperar fragmentos`);
      }
      const last = base + (turn.fragments.length - 1) * 1500;
      if (!env.agent.dueConversations(last + env.agent.debounceMs).includes(convo)) fails.push(`turn ${i}: no vencio la espera`);
      res = await env.agent.flush(convo, { testId: c.id });
      if ((await env.agent.flush(convo)) !== null) fails.push(`turn ${i}: segunda respuesta para el mismo turno`);
    } else {
      res = await env.agent.handle(convo, Array.isArray(turn.say) ? turn.say : [turn.say], { testId: c.id });
    }
    t += 60_000;
    for (const m of check(res, turn.expect, before)) fails.push(`turn ${i}: ${m}`);
  }
  return { id: c.id, title: c.title, pass: fails.length === 0, fails, odoo_calls: env.gateway.calls.length, records: env.evidence.records };
}
