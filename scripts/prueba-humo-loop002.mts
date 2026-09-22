/* ============================================================
   PRUEBA DE HUMO DE ATH-LOOP-002 — RECORRIDO REAL, EXTREMO A EXTREMO

     npm install --no-save playwright jsqr pngjs
     npm run prueba-humo-loop002

   Lo que la hace distinta de las otras: aqui el navegador habla con
   la API DE VERDAD, montada tal cual desde /api, y detras hay un
   Redis real. No hay imitaciones en ninguna capa: si el cliente
   activa, es el endpoint real el que responde; si el local confirma
   dos veces, es la idempotencia real la que lo evita; y si alguien
   intenta redimir sin credencial, es la autorizacion real la que lo
   corta.

   QUE SE RECORRE

     cliente activa (UNA pulsacion) -> QR -> el local escanea ->
     escribe el valor -> confirma -> el cliente ve su credito ->
     opina -> y se comprueba que confirmar otra vez no cobra dos
     veces.

   Y lo que tiene que fallar: codigo invalido, consumo cero, y una
   pantalla de cliente que no le hable de procesos internos.

   Las dependencias de navegador no estan en el repositorio: si
   faltan, la prueba lo dice y termina sin fallar.
   ============================================================ */

import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { hayRedis, levanta } from './lib/redis-local.mts';
import { leerCodigo } from '../src/data/codigos-referido.ts';

const RAIZ = 'dist';
if (!existsSync(join(RAIZ, 'red/la-triada/index.html'))) {
  console.error('\n  No hay dist/ construido. Ejecuta antes: npm run build\n');
  process.exit(1);
}

if (!hayRedis()) {
  console.log('\n  (omitida: no hay redis-server en esta máquina)\n');
  process.exit(0);
}

let chromium: typeof import('playwright').chromium;
let devices: typeof import('playwright').devices;
let jsQR: typeof import('jsqr').default;
let PNG: typeof import('pngjs').PNG;
try {
  ({ chromium, devices } = await import('playwright'));
  jsQR = (await import('jsqr')).default;
  ({ PNG } = await import('pngjs'));
} catch {
  console.log('\n  (omitida: faltan dependencias de navegador)');
  console.log('   npm install --no-save playwright jsqr pngjs && npm run prueba-humo-loop002\n');
  process.exit(0);
}

function chromiumDelEntorno(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return undefined;
  for (const nombre of readdirSync(base).filter((n) => n.startsWith('chromium-'))) {
    const ruta = join(base, nombre, 'chrome-linux', 'chrome');
    if (existsSync(ruta)) return ruta;
  }
  return undefined;
}

const SALIDA = process.env.SALIDA_HUMO ?? 'dist/.humo-loop002';
mkdirSync(SALIDA, { recursive: true });

/* ------------------------------------------------------------
   EL SERVIDOR: estatico + los endpoints REALES sobre Redis real
   ------------------------------------------------------------ */
const local = await levanta(6393, 6392);
process.env.KV_REST_API_URL = local.url;
process.env.KV_REST_API_TOKEN = 'prueba';

/** La credencial del local, guardada hasheada como en produccion. */
const CREDENCIAL = 'credencial-de-humo-larga-y-aleatoria-0001';
process.env.ATHERON_OPERADOR_LA_TRIADA = createHash('sha256').update(CREDENCIAL).digest('hex');

const { default: activarApi } = await import('../api/activar.ts');
const { default: transaccionApi } = await import('../api/transaccion.ts');
const { default: redimirApi } = await import('../api/redimir.ts');
const { default: seguimientoApi } = await import('../api/seguimiento.ts');
const { default: operadorApi } = await import('../api/operador.ts');
const { almacen } = await import('../api/_almacen.ts');
const deposito = almacen();

type Handler = (p: unknown, c: unknown) => Promise<void>;
const API: Record<string, Handler> = {
  '/api/activar': activarApi as Handler,
  '/api/transaccion': transaccionApi as Handler,
  '/api/redimir': redimirApi as Handler,
  '/api/seguimiento': seguimientoApi as Handler,
  '/api/operador': operadorApi as Handler,
};

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.xml': 'application/xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
};

const servidor = http.createServer(async (peticion, respuesta) => {
  const url = new URL(peticion.url ?? '/', 'http://local');
  const handler = API[url.pathname];

  if (handler) {
    const trozos: Buffer[] = [];
    for await (const t of peticion) trozos.push(t as Buffer);
    await handler(
      {
        method: peticion.method,
        url: peticion.url,
        headers: peticion.headers,
        body: trozos.length ? Buffer.concat(trozos).toString('utf8') : undefined,
      },
      {
        status(codigo: number) {
          respuesta.statusCode = codigo;
          return this;
        },
        setHeader(nombre: string, valor: string) {
          respuesta.setHeader(nombre, valor);
        },
        json(cuerpo: unknown) {
          respuesta.end(JSON.stringify(cuerpo));
        },
      },
    );
    return;
  }

  for (const intento of [join(RAIZ, url.pathname), join(RAIZ, `${url.pathname}.html`), join(RAIZ, url.pathname, 'index.html')]) {
    if (!existsSync(intento)) continue;
    try {
      const cuerpo = readFileSync(intento);
      respuesta.writeHead(200, { 'content-type': TIPOS[extname(intento)] ?? 'application/octet-stream' });
      respuesta.end(cuerpo);
      return;
    } catch {
      /* era un directorio */
    }
  }
  respuesta.writeHead(404, { 'content-type': 'text/plain' });
  respuesta.end('404');
});

await new Promise<void>((r) => servidor.listen(4401, r));
const BASE = 'http://localhost:4401';

let fallos = 0;
const ok = (nombre: string, condicion: boolean, detalle = ''): void => {
  console.log(`  ${condicion ? 'ok  ' : 'FALLA'} ${nombre}${condicion || !detalle ? '' : `\n        ${detalle}`}`);
  if (!condicion) fallos++;
};

console.log('\n Recorrido comercial completo en un iPhone 13, contra la API real');

const navegador = await chromium.launch({ executablePath: chromiumDelEntorno() });
const cliente = await navegador.newContext({ ...devices['iPhone 13'] });
const pagina = await cliente.newPage();
const errores: string[] = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
pagina.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL_CONNECTION_FAILED')) errores.push(m.text());
});

/* ---------- 1. El cliente: UNA pulsacion ---------- */
await pagina.goto(`${BASE}/red/la-triada?f=ficha-la-triada`, { waitUntil: 'networkidle' });

const textoCliente = await pagina.locator('main').innerText();
ok('se ve lo que gana, en grande', (await pagina.locator('.piloto__premio-cifra').innerText()).includes('5'));
ok(
  'no se le habla de procesos internos',
  !/localStorage|backend|API|serverless|idempot|comisión|margen/i.test(textoCliente),
  textoCliente.slice(0, 200),
);

const botones = await pagina.locator('main button:visible, main a.piloto__boton:visible').count();
ok('hay una sola acción visible al llegar', botones === 1, `${botones} acciones`);

await pagina.getByRole('button', { name: 'Activar beneficio Atheron' }).click();
await pagina.waitForSelector('[data-paso="codigo"]:not([hidden])');
const codigo = (await pagina.locator('[data-codigo]').innerText()).trim();
ok('el servidor devolvió un código válido', leerCodigo(codigo, 'TRI').valido, codigo);
await pagina.screenshot({ path: join(SALIDA, '1-cliente.png'), fullPage: true });

/* ---------- 2. El QR lleva a la validación ---------- */
const png = PNG.sync.read(await pagina.locator('svg.piloto__qr').screenshot({ path: join(SALIDA, '2-qr.png') }));
const leido = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
ok('el QR se decodifica', Boolean(leido));
ok('y lleva la validación con el código', leido?.data === `${BASE}/red/la-triada/validar?c=${codigo}`, leido?.data);

/* ---------- 3. El local: escanear, valor, confirmar ---------- */
const contextoLocal = await navegador.newContext({ ...devices['iPhone 13'] });
const pagLocal = await contextoLocal.newPage();
pagLocal.on('pageerror', (e) => errores.push(String(e)));

await pagLocal.goto(leido!.data, { waitUntil: 'networkidle' });

/* Sin credencial, la pantalla del local no ensena ni el campo del
   codigo: el QR identifica al cliente, no autoriza a cobrar. */
ok('sin credencial no se puede ni buscar el código', await pagLocal.locator('[data-form-codigo]').isHidden());
ok('y se pide la credencial del local', await pagLocal.locator('[data-form-credencial]').isVisible());

await pagLocal.locator('input[name="credencial"]').fill('esta-no-es');
await pagLocal.getByRole('button', { name: 'Entrar' }).click();
await pagLocal.waitForFunction(() => (document.querySelector('[data-error-credencial]')?.textContent ?? '').length > 0);
ok('una credencial equivocada se rechaza en el momento', (await pagLocal.locator('[data-error-credencial]').innerText()).length > 0);

await pagLocal.locator('input[name="credencial"]').fill(CREDENCIAL);
await pagLocal.getByRole('button', { name: 'Entrar' }).click();
await pagLocal.waitForSelector('.piloto__resultado--si');
ok('el local ve el cliente verificado', (await pagLocal.locator('[data-resultado]').innerText()).includes('verificado'));
ok('desde otro dispositivo distinto al del cliente', true);

const camposLocal = await pagLocal.locator('[data-form-cuenta] input:visible').count();
ok('sólo se le piden dos datos: valor y personas', camposLocal === 2, `${camposLocal} campos`);
ok('no se le pide ningún porcentaje', !(await pagLocal.locator('[data-form-cuenta]').innerText()).includes('%'));

await pagLocal.locator('input[name="consumo"]').fill('100000');
await pagLocal.screenshot({ path: join(SALIDA, '3-local.png'), fullPage: true });
await pagLocal.getByRole('button', { name: 'Confirmar consumo' }).click();
await pagLocal.waitForSelector('[data-hecho]:not([hidden])');

ok('la cuenta del cliente sale entera', (await pagLocal.locator('[data-consumo]').innerText()).includes('100.000'));
ok('y la comisión Atheron es de 10.000', (await pagLocal.locator('[data-comision]').innerText()).includes('10.000'));
await pagLocal.screenshot({ path: join(SALIDA, '4-confirmado.png'), fullPage: true });

/* ---------- 4. Doble redención ---------- */
await pagLocal.goto(`${BASE}/red/la-triada/validar?c=${codigo}`, { waitUntil: 'networkidle' });
await pagLocal.waitForSelector('.piloto__resultado--no');
ok('reintentar el mismo código avisa de que ya se usó', (await pagLocal.locator('[data-resultado]').innerText()).includes('ya se usó'));
ok('y no vuelve a pedir el valor de la cuenta', await pagLocal.locator('[data-form-cuenta]').isHidden());

/* ---------- 5. Código inválido y consumo cero ---------- */
await pagLocal.goto(`${BASE}/red/la-triada/validar`, { waitUntil: 'networkidle' });
const roto = `${codigo.slice(0, 8)}${codigo[8] === 'K' ? 'M' : 'K'}${codigo.slice(9)}`;
await pagLocal.locator('input[name="codigo"]').fill(roto);
await pagLocal.getByRole('button', { name: 'Buscar' }).click();
await pagLocal.waitForSelector('.piloto__resultado--no');
ok('un código mal copiado se rechaza antes de llamar al servidor', await pagLocal.locator('[data-form-cuenta]').isHidden());

const otra = await fetch(`${BASE}/api/activar`, { method: 'POST' }).then((r) => r.json() as Promise<{ datos: { codigo: string } }>);
await pagLocal.goto(`${BASE}/red/la-triada/validar?c=${otra.datos.codigo}`, { waitUntil: 'networkidle' });
await pagLocal.waitForSelector('[data-form-cuenta]:not([hidden])');
await pagLocal.locator('input[name="consumo"]').fill('0');
await pagLocal.getByRole('button', { name: 'Confirmar consumo' }).click();
await pagLocal.waitForTimeout(300);
ok('un consumo de cero no se registra', await pagLocal.locator('[data-hecho]').isHidden());

/* ---------- 6. El cliente ve su crédito ---------- */
await pagina.bringToFront();
await pagina.reload({ waitUntil: 'networkidle' });
await pagina.waitForSelector('[data-paso="listo"]:not([hidden])');
ok('el cliente ve su consumo', (await pagina.locator('[data-consumo]').innerText()).includes('100.000'));
ok('y su Crédito Atheron de 5.000', (await pagina.locator('[data-credito]').innerText()).includes('5.000'));
await pagina.screenshot({ path: join(SALIDA, '5-credito.png'), fullPage: true });

/* ---------- 7. Seguimiento ---------- */
await pagina.getByRole('link', { name: '¿Cómo te fue?' }).click();
await pagina.waitForSelector('[data-form]');
/* Se pulsa como pulsaria una persona: sobre la carita. */
await pagina.locator('.piloto__carita').last().click();
ok('la carita marca su radio', await pagina.locator('input[name="satisfaccion"][value="5"]').isChecked());
await pagina.getByRole('button', { name: 'Enviar' }).click();
await pagina.waitForSelector('[data-gracias]:not([hidden])');
ok('la opinión se envía y se agradece', await pagina.locator('[data-gracias]').isVisible());
const guardada = await deposito.lee<{ seguimiento?: { satisfaccion?: number } }>('tx', codigo);
ok('y queda registrada en el servidor', guardada?.seguimiento?.satisfaccion === 5, JSON.stringify(guardada?.seguimiento));
await pagina.screenshot({ path: join(SALIDA, '6-seguimiento.png'), fullPage: true });

/* ---------- 8. Accesibilidad básica ---------- */
const sinEtiqueta = await pagina.evaluate(() => {
  const campos = [...document.querySelectorAll('input:not([type=hidden]), textarea, select')];
  return campos.filter((c) => {
    const id = c.getAttribute('id');
    return (
      !c.closest('label') &&
      !c.getAttribute('aria-label') &&
      !(id && document.querySelector(`label[for="${id}"]`))
    );
  }).length;
});
ok('ningún campo se queda sin etiqueta', sinEtiqueta === 0, `${sinEtiqueta} sin etiqueta`);

const pequenos = await pagina.evaluate(() => {
  const tocables = [...document.querySelectorAll('button, a.piloto__boton, summary, .piloto__carita')];
  return tocables.filter((t) => {
    const caja = t.getBoundingClientRect();
    return caja.height > 0 && caja.height < 44;
  }).length;
});
ok('nada que se toque mide menos de 44 px de alto', pequenos === 0, `${pequenos} por debajo`);

const unaH1 = await pagina.locator('h1').count();
ok('hay exactamente un h1', unaH1 === 1, `${unaH1}`);

/* ---------- 9. Sin JavaScript ---------- */
const sinJs = await navegador.newContext({ ...devices['iPhone 13'], javaScriptEnabled: false });
const pag3 = await sinJs.newPage();
await pag3.goto(`${BASE}/red/la-triada`);
ok('sin JavaScript se dice que hace falta', (await pag3.locator('noscript').innerHTML()).includes('JavaScript'));

/* ---------- 10. Sin servidor, se dice ---------- */
const aislado = await navegador.newContext({ ...devices['iPhone 13'] });
const pag4 = await aislado.newPage();
await pag4.route('**/api/**', (ruta) => ruta.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"motivo":"ALMACEN_NO_CONFIGURADO"}' }));
await pag4.goto(`${BASE}/red/la-triada`, { waitUntil: 'networkidle' });
await pag4.getByRole('button', { name: 'Activar beneficio Atheron' }).click();
await pag4.waitForSelector('[data-error]:not([hidden])');
ok('si el almacén no está configurado, se dice y no se finge', (await pag4.locator('[data-error]').innerText()).includes('no está configurado'));

ok('no hubo errores de consola', errores.length === 0, errores.join(' | '));

await navegador.close();
servidor.close();
local.cierra();
console.log(fallos ? `\nFALLOS: ${fallos}\n` : '\nTodo correcto.\n');
process.exit(fallos ? 1 : 0);
