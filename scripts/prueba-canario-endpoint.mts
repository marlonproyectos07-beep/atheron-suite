/* ============================================================
   PRUEBAS DEL ENDPOINT src/pages/api/hotel/availability.ts
   (ATH-ODOO-HOTEL-008 — Fase 6, canario web -> Odoo staging)

     npm run prueba-canario

   Comprueban lo que de verdad importa de este puente:

   1. Validacion de input (rechaza unidad/fecha/huespedes invalidos).
   2. El navegador NUNCA llama a Odoo ni al gateway directamente: solo
      existe UN punto donde se llama fetch hacia HOTEL_GATEWAY_BASE_URL,
      y es dentro de este endpoint server-side (se verifica interceptando
      `fetch` global y confirmando que la clave configurada SOLO viaja
      ahi, nunca en la respuesta que recibe el navegador).
   3. Sin configuracion server-side, falla cerrado (503), nunca inventa
      disponibilidad.
   4. Metodo invalido (GET) rechazado.
   5. Content-Type invalido rechazado.
   6. Rate limit basico: pasado el limite, responde 429.
   7. Un error del gateway nunca expone su mensaje/stack real al
      navegador.

   POR QUE .mts: importa el endpoint, que es TypeScript. Node lo corre
   con --experimental-strip-types (ver package.json), igual que
   prueba-jornadas.mts. No hay compilador ni dependencias nuevas.
   ============================================================ */

import assert from 'node:assert/strict';

process.env.HOTEL_GATEWAY_BASE_URL = 'http://gateway.invalid';
process.env.HOTEL_WEB_AGENT_ID = 'web-hotel-007';
process.env.HOTEL_WEB_AGENT_KEY = 'clave-de-prueba-nunca-real';

const { POST, GET, validateAvailabilityInput } = await import('../src/pages/api/hotel/availability.ts');

let fallos = 0;
function verificar(nombre: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  OK  ${nombre}`))
    .catch((error) => {
      fallos += 1;
      console.error(`  FALLA  ${nombre}`);
      console.error(`         ${error.message}`);
    });
}

function req(body: unknown, { contentType = 'application/json' } = {}) {
  return new Request('http://localhost/api/hotel/availability', {
    method: 'POST',
    headers: contentType ? { 'content-type': contentType } : {},
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { unit: '201', checkIn: '2026-09-30', checkOut: '2026-10-01', guests: 2 };

console.log('1) validateAvailabilityInput');
await verificar('rechaza unidad desconocida', () => {
  const r = validateAvailabilityInput({ ...VALID_BODY, unit: 'PENTHOUSE' });
  assert.equal((r as any).error, 'INVALID_UNIT');
});
await verificar('rechaza checkIn con formato invalido', () => {
  const r = validateAvailabilityInput({ ...VALID_BODY, checkIn: '30-09-2026' });
  assert.equal((r as any).error, 'INVALID_CHECKIN');
});
await verificar('rechaza checkOut <= checkIn', () => {
  const r = validateAvailabilityInput({ ...VALID_BODY, checkOut: '2026-09-30' });
  assert.equal((r as any).error, 'INVALID_CHECKOUT');
});
await verificar('rechaza huespedes no enteros o <= 0', () => {
  assert.equal((validateAvailabilityInput({ ...VALID_BODY, guests: 0 }) as any).error, 'INVALID_GUESTS');
  assert.equal((validateAvailabilityInput({ ...VALID_BODY, guests: 2.5 }) as any).error, 'INVALID_GUESTS');
});
await verificar('acepta input valido', () => {
  const r = validateAvailabilityInput(VALID_BODY);
  assert.equal('error' in r, false);
});

console.log('\n2) metodo y content-type');
await verificar('GET responde 405 METHOD_NOT_ALLOWED', async () => {
  const res = await GET({} as any);
  assert.equal(res.status, 405);
  const body = await res.json();
  assert.equal(body.error, 'METHOD_NOT_ALLOWED');
});
await verificar('POST sin content-type json responde 400', async () => {
  const res = await POST({ request: req(VALID_BODY, { contentType: '' }), clientAddress: '127.0.0.1' } as any);
  assert.equal(res.status, 400);
});

console.log('\n3) falla cerrado sin configuracion server-side');
await verificar('sin HOTEL_WEB_AGENT_KEY -> 503 SERVICE_UNAVAILABLE, nunca inventa disponibilidad', async () => {
  const backup = process.env.HOTEL_WEB_AGENT_KEY;
  delete process.env.HOTEL_WEB_AGENT_KEY;
  try {
    const res = await POST({ request: req(VALID_BODY), clientAddress: '10.0.0.1' } as any);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, 'SERVICE_UNAVAILABLE');
  } finally {
    process.env.HOTEL_WEB_AGENT_KEY = backup;
  }
});

console.log('\n4) el navegador nunca llama a Odoo/gateway directamente: solo este endpoint lo hace');
await verificar('el POST llama fetch hacia HOTEL_GATEWAY_BASE_URL con la clave server-side, y la respuesta al navegador nunca la contiene', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  globalThis.fetch = (async (url: string, init: any) => {
    calls.push({ url: String(url), headers: init.headers });
    return new Response(JSON.stringify({ ok: true, available: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const res = await POST({ request: req(VALID_BODY), clientAddress: '10.0.0.2' } as any);
    const body = await res.json();
    const rawBodyText = JSON.stringify(body);

    assert.equal(calls.length >= 1, true, 'el endpoint deberia haber llamado al gateway');
    assert.ok(calls.every((c) => c.url.startsWith('http://gateway.invalid')), 'toda llamada va al gateway configurado, nunca a otro host');
    assert.ok(
      calls.every((c) => c.headers.authorization === 'Bearer clave-de-prueba-nunca-real'),
      'la clave SI viaja del servidor al gateway (es el lugar correcto)',
    );
    assert.equal(rawBodyText.includes('clave-de-prueba-nunca-real'), false, 'la clave NUNCA debe llegar en la respuesta que recibe el navegador');
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

console.log('\n5) error del gateway nunca expone su mensaje real');
await verificar('si el gateway responde error_code, el navegador solo ve AVAILABILITY_LOOKUP_FAILED (502), sin stack ni detalle interno', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error_code: 'INTERNAL_ERROR', internal_detail: 'stack trace secreto de Odoo' }), { status: 200 })) as typeof fetch;
  try {
    const res = await POST({ request: req(VALID_BODY), clientAddress: '10.0.0.3' } as any);
    const body = await res.json();
    assert.equal(res.status, 502);
    assert.equal(body.error, 'AVAILABILITY_LOOKUP_FAILED');
    assert.equal(JSON.stringify(body).includes('stack trace secreto'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

console.log('\n6) rate limit basico');
await verificar('pasado el limite de la ventana, responde 429 RATE_LIMITED', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, available: true }), { status: 200 })) as typeof fetch;
  try {
    let last;
    for (let i = 0; i < 35; i++) {
      last = await POST({ request: req(VALID_BODY), clientAddress: '10.0.0.4-rate-limit-test' } as any);
    }
    assert.equal(last!.status, 429);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} PRUEBA(S) FALLIDA(S)`}`);
process.exit(fallos ? 1 : 0);
