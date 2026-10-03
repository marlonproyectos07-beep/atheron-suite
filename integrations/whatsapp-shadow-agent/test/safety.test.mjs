import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStagingDatabase, resolveConfig, ConfigError, MODES } from '../src/config.mjs';
import { ShadowAgent } from '../src/agent.mjs';
import { assertGatewayPort } from '../src/gateway-port.mjs';
import { makeAgent, fixtureCatalog, fakeGateway } from './support.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === 'node_modules' ? [] : walk(p)) : [p]; });

test('kill switch: por defecto WHATSAPP_AUTOMATION_ENABLED=false y modo shadow', () => {
  const c = resolveConfig({});
  assert.deepEqual({ ...c }, { mode: 'shadow', enabled: false });
  assert.equal(resolveConfig({ WHATSAPP_AUTOMATION_ENABLED: 'true' }).enabled, true);
  assert.equal(resolveConfig({ WHATSAPP_AUTOMATION_ENABLED: 'TRUE ' }).enabled, true);
  assert.equal(resolveConfig({ WHATSAPP_AUTOMATION_ENABLED: 'yes' }).enabled, false);
});

test('los 4 modos existen pero solo shadow esta habilitado', () => {
  assert.deepEqual([...MODES], ['shadow', 'supervised', 'auto_offhours', 'auto']);
  for (const m of ['supervised', 'auto_offhours', 'auto']) {
    assert.throws(() => resolveConfig({ WHATSAPP_AUTOMATION_MODE: m }), (e) => e instanceof ConfigError && e.code === 'MODE_NOT_ENABLED');
    assert.throws(() => new ShadowAgent({ config: { mode: m, enabled: true }, gateway: fakeGateway(fixtureCatalog()) }), /SHADOW_ONLY/);
  }
  assert.throws(() => resolveConfig({ WHATSAPP_AUTOMATION_MODE: 'turbo' }), (e) => e.code === 'UNKNOWN_MODE');
});

test('kill switch apagado: no analiza, no consulta Odoo, no responde', async () => {
  const { agent, gateway } = makeAgent({ enabled: false });
  const r = await agent.handle('k1', ['Hola, somos dos para mañana']);
  assert.equal(r.status, 'DISABLED_KILL_SWITCH');
  assert.equal(r.text, null);
  assert.equal(r.escalation, null);
  assert.equal(gateway.calls.length, 0);
});

test('ninguna respuesta puede enviarse: send:false y sin metodo de envio', async () => {
  const { agent } = makeAgent();
  for (const m of ['Hola', 'Somos dos para mañana', '¿Me haces descuento?', 'Quiero cancelar, llego mañana', 'se activó la alarma']) {
    const r = await agent.handle(`s-${m}`, [m]);
    assert.equal(r.send, false);
    assert.equal(r.outbound, 'BLOCKED_SHADOW');
    assert.ok(Object.isFrozen(r));
  }
  for (const k of ['send', 'sendMessage', 'sendImage', 'sendVideo', 'markRead', 'reply']) assert.equal(typeof agent[k], 'undefined', `el agente no debe exponer ${k}`);
});

test('el codigo de src no tiene ruta de red ni de proceso', () => {
  const banned = /(from\s+['"](?:node:)?(?:https?|net|tls|dgram|dns|child_process|worker_threads|http2)['"]|\bfetch\s*\(|XMLHttpRequest|WebSocket|require\()/;
  for (const f of walk(join(root, 'src'))) assert.doesNotMatch(readFileSync(f, 'utf8'), banned, f);
});

test('el puerto del Gateway rechaza metodos de escritura (HOLD/cancel/confirm)', () => {
  const g = fakeGateway(fixtureCatalog());
  assert.equal(assertGatewayPort(g), true);
  for (const m of ['createHold', 'hold', 'cancel', 'confirm', 'createBooking']) assert.throws(() => assertGatewayPort({ ...g, [m]: () => {} }), /FORBIDDEN/);
  assert.throws(() => assertGatewayPort({ searchOptions() {} }), /MISSING/);
});

test('el agente solo llama a searchOptions y quote en el Gateway', async () => {
  const { agent, gateway } = makeAgent();
  await agent.handle('g1', ['Somos dos para mañana']);
  await agent.handle('g1', ['¿Cuánto debo abonar?']);
  assert.ok(gateway.calls.length >= 2);
  assert.deepEqual([...new Set(gateway.calls.map((c) => c.op))].sort(), ['quote', 'searchOptions']);
});

test('Production bloqueado: solo la base staging pasa el guard', () => {
  assert.equal(assertStagingDatabase('atheron1-hotel-staging-20260923'), true);
  for (const db of ['atheron1-hotel', 'atheron1-hotel-prod', '', undefined, ' atheron1-hotel-staging-20260923']) assert.throws(() => assertStagingDatabase(db), /DATABASE_NOT_ALLOWED|no es la base/);
});

test('sin secretos en el modulo ni en la evidencia', () => {
  const pats = [/EAA[A-Za-z0-9]{20,}/, /sk-[A-Za-z0-9]{20,}/, /Bearer\s+[A-Za-z0-9._-]{20,}/, /(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  const longDigits = /\b\d{10,}\b/; // telefonos/cuentas: ni en codigo ni en evidencia (los tests usan numeros falsos a proposito)
  for (const f of walk(root)) {
    if (f.endsWith('.test.mjs') && f.includes('safety')) continue;
    const text = readFileSync(f, 'utf8');
    for (const p of pats) assert.doesNotMatch(text, p, `${f} ${p}`);
    if (!f.includes('/test/')) assert.doesNotMatch(text, longDigits, f);
  }
});

test('no hay variables de entorno con credenciales leidas por el modulo', () => {
  for (const f of walk(join(root, 'src'))) {
    const refs = [...readFileSync(f, 'utf8').matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]);
    for (const r of refs) assert.ok(['WHATSAPP_AUTOMATION_ENABLED', 'WHATSAPP_AUTOMATION_MODE', 'ODOO_DATABASE'].includes(r), `${f} lee ${r}`);
  }
});
