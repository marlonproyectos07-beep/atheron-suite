import test from 'node:test';
import assert from 'node:assert/strict';
import { createAtheronMcpService } from '../src/mcp-server.mjs';

const TOKEN = 'm'.repeat(48);
const SUMMARY = {
  fuente: 'conciliacion-smoobu-odoo',
  consultaUTC: '2026-11-12T18:00:00.000Z',
  estado: 'OK',
  ventana: { desde: '2026-11-11', hasta: '2026-11-12' },
  totales: { MATCH: 5, MATCH_DRAFT: 1, MISSING_IN_ODOO: 0, CONFLICT: 0, CANCELLED: 0, AMBIGUOUS: 0 },
  alertas: { sinPedido: 0, conflictos: 0, ambiguos: 0, sobreventas: 0 },
  alcance: 'SOLO_LECTURA_SIN_SALDOS_BANCARIOS_NI_DISPONIBILIDAD_CERTIFICADA',
};
const OCCUPANCY = {
  fecha: '2026-11-12',
  horaConsultaUTC: '2026-11-12T18:00:00.000Z',
  origen: 'SMOOBU_ODOO_API_LECTURA',
  modo: 'SOLO_LECTURA',
  escrituras: 0,
  disponibilidadCertificada: false,
  unidades: [
    { habitacion: '201', estado: 'RESERVA_ACTIVA', revisarOdoo: false },
    { habitacion: '202', estado: 'SIN_RESERVA_ACTIVA_EN_LISTADO', revisarOdoo: false },
    { habitacion: '203', estado: 'SIN_RESERVA_ACTIVA_EN_LISTADO', revisarOdoo: false },
    { habitacion: '301', estado: 'RESERVA_ACTIVA', revisarOdoo: false },
    { habitacion: '302', estado: 'SIN_RESERVA_ACTIVA_EN_LISTADO', revisarOdoo: false },
  ],
  bloqueosActivosEnVentana: 2,
  conflictosOdooEnVentana: 0,
  overbookingDetectado: false,
};

function makeService(overrides = {}) {
  return createAtheronMcpService({
    env: { VERCEL_AUTOMATION_BYPASS_SECRET: TOKEN, VERCEL_ENV: 'preview' },
    getSummary: async () => SUMMARY,
    getOccupancy: async () => OCCUPANCY,
    ...overrides,
  });
}

function request(body, token = TOKEN) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (token !== null) headers['x-vercel-protection-bypass'] = token;
  return new Request('https://example.vercel.app/api/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function rpc(service, body, token = TOKEN) {
  return service.fetch(request(body, token));
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'atheron-mobile-test', version: '1.0.0' },
  },
};

test('MCP exige clave antes de procesar cualquier llamada', async () => {
  let calls = 0;
  const service = makeService({ getSummary: async () => { calls += 1; return SUMMARY; } });
  const missing = await rpc(service, initialize, null);
  assert.equal(missing.status, 401);
  const invalid = await rpc(service, initialize, 'wrong-token-value-which-is-long-enough');
  assert.equal(invalid.status, 401);
  assert.equal(calls, 0);
});

test('MCP falla cerrado si no existe una clave de servicio', async () => {
  const service = makeService({ env: { VERCEL_ENV: 'preview' } });
  const response = await rpc(service, initialize);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'MCP_NO_CONFIGURADO' });
});

test('Inicialización y listado anuncian exclusivamente herramientas de solo lectura', async () => {
  const service = makeService();
  const init = await rpc(service, initialize);
  assert.equal(init.status, 200);

  const list = await rpc(service, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.equal(list.status, 200);
  const payload = await list.json();
  const tools = payload.result?.tools ?? payload.tools;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['get_atheron_status', 'get_room_occupancy']);
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
  }
  assert.equal(JSON.stringify(tools).toLowerCase().includes('create_reservation'), false);
  assert.equal(JSON.stringify(tools).toLowerCase().includes('post_payment'), false);
});

test('Consulta de estado devuelve solo el resumen anonimizado', async () => {
  const service = makeService();
  const response = await rpc(service, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'get_atheron_status', arguments: {} },
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  const text = payload.result?.content?.[0]?.text ?? payload.content?.[0]?.text;
  assert.equal(JSON.parse(text).fuente, 'conciliacion-smoobu-odoo');
  assert.equal(text.includes('Huesped'), false);
  assert.equal(text.includes('Nequi'), false);
});

test('Consulta por fecha valida y conserva la advertencia de no disponibilidad certificada', async () => {
  const service = makeService();
  const response = await rpc(service, {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'get_room_occupancy', arguments: { date: '2026-11-12' } },
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  const text = payload.result?.content?.[0]?.text ?? payload.content?.[0]?.text;
  const result = JSON.parse(text);
  assert.equal(result.escrituras, 0);
  assert.equal(result.disponibilidadCertificada, false);
  assert.equal(result.unidades.length, 5);
});

test('Fecha inválida no consulta fuentes y devuelve error seguro', async () => {
  let calls = 0;
  const service = makeService({ getOccupancy: async () => { calls += 1; return OCCUPANCY; } });
  const response = await rpc(service, {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'get_room_occupancy', arguments: { date: '12/11/2026' } },
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result?.isError, true);
  assert.equal(calls, 0);
});

test('Métodos HTTP distintos de POST se rechazan', async () => {
  const service = makeService();
  const response = await service.fetch(new Request('https://example.vercel.app/api/mcp', { method: 'GET' }));
  assert.equal(response.status, 405);
});
