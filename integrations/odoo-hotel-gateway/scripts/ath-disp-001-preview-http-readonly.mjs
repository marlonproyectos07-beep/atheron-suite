// ATH-DISP-001 — VERIFICACIÓN DE LA PANTALLA POR HTTP (sin navegador). Solo lectura.
// Llama a las mismas rutas que usa la pantalla: /api/interno/login y /api/interno/disponibilidad.
// Los PIN se calculan en memoria con la convención acordada; no se imprimen.
const BASE = process.env.PREVIEW_BASE ?? 'http://localhost:4322';

async function post(path, body, cookie) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}

// Login correcto (marlon, PIN de la convención) y dos incorrectos
const ok = await post('/api/interno/login', { operator: 'marlon', pin: '1'.repeat(6) });
console.log('LOGIN_VALID: ' + (ok.status === 200 && ok.json.ok === true ? 'YES' : 'NO') + ' status=' + ok.status);
const cookie = ok.setCookie ? ok.setCookie.split(';')[0] : null;
console.log('COOKIE_HTTPONLY_SECURE_SAMESTRICT: ' + (ok.setCookie && /HttpOnly/.test(ok.setCookie) && /Secure/.test(ok.setCookie) && /SameSite=Strict/.test(ok.setCookie) ? 'YES' : 'NO'));
const bad = await post('/api/interno/login', { operator: 'marlon', pin: '9'.repeat(6) });
console.log('LOGIN_WRONG_PIN_REJECTED: ' + (bad.status === 401 ? 'YES' : 'NO') + ' status=' + bad.status);
const noSession = await post('/api/interno/disponibilidad', { checkin: '2026-11-05', checkout: '2026-11-06', guests: 2 });
console.log('AVAILABILITY_WITHOUT_SESSION_REJECTED: ' + (noSession.status === 401 ? 'YES' : 'NO') + ' status=' + noSession.status);

// Fechas pedidas por el CEO
const DATES = [
  ['2026-11-05', '2026-11-06'],
  ['2026-11-20', '2026-11-21'],
  ['2026-12-05', '2026-12-06'],
  ['2026-12-20', '2026-12-21'],
  ['2026-12-21', '2026-12-22'],
];
const ORDER = ['201', '202', '203', '301', '302', 'CASA_COMPLETA'];
for (const [checkin, checkout] of DATES) {
  const r = await post('/api/interno/disponibilidad', { checkin, checkout, guests: 2 }, cookie);
  if (r.status !== 200) { console.log(`${checkin}->${checkout}: HTTP ${r.status} ${r.json.error ?? ''}`); continue; }
  const map = Object.fromEntries(r.json.units.map((u) => [u.key, u.status]));
  console.log(`${checkin}->${checkout}: ` + ORDER.map((k) => `${k}=${map[k]}`).join(' | '));
}

// Fail-closed: fechas inválidas (salida antes de entrada) no devuelven nada libre
const inv = await post('/api/interno/disponibilidad', { checkin: '2026-11-06', checkout: '2026-11-05', guests: 2 }, cookie);
console.log('INVALID_RANGE_HTTP: ' + inv.status + ' ' + (inv.json.error ?? ''));
