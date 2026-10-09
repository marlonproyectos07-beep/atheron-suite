/* ============================================================
   PRUEBA DE HUMO DEL PILOTO — NAVEGADOR REAL, PANTALLA DE MOVIL

     npm install --no-save playwright jsqr pngjs
     npm run prueba-humo-piloto

   Las otras pruebas comprueban la logica. Esta comprueba el
   RECORRIDO: activar en un iPhone, leer el QR con un lector de
   verdad, rechazar un codigo mal copiado, registrar el consumo y
   ver el movimiento en el registro. Es lo unico que demuestra que
   el piloto funciona de punta a punta.

   POR QUE EL QR SE DECODIFICA Y NO SE MIRA

   Un QR mal generado se dibuja igual de bonito. Aqui se fotografia
   el que pinta la pagina y se pasa por jsQR -un lector ajeno-, y se
   comprueba que lo que sale es exactamente la direccion de
   validacion con el codigo dentro. Si no escanea, esta prueba falla.

   LAS DEPENDENCIAS NO ESTAN EN EL REPOSITORIO

   playwright, jsqr y pngjs solo hacen falta para esto. Si no estan,
   la prueba lo dice y termina sin fallar: no se puede exigir una
   dependencia que no esta declarada. Se instalan con --no-save.

   Necesita dist/ construido (npm run build).
   ============================================================ */
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const RAIZ = 'dist';
if (!existsSync(join(RAIZ, 'piloto/la-triada/index.html'))) {
  console.error('\n  No hay dist/ construido. Ejecuta antes: npm run build\n');
  process.exit(1);
}

let chromium, devices, jsQR, PNG;
try {
  ({ chromium, devices } = await import('playwright'));
  jsQR = (await import('jsqr')).default;
  ({ PNG } = await import('pngjs'));
} catch {
  console.log('\n  (omitida: faltan dependencias de navegador)');
  console.log('   npm install --no-save playwright jsqr pngjs && npm run prueba-humo-piloto\n');
  process.exit(0);
}

/* Playwright encuentra su Chromium solo salvo cuando el entorno lo
   tiene aparte (PLAYWRIGHT_BROWSERS_PATH). Se busca ahi antes de
   rendirse, y si no aparece se deja decidir a Playwright. */
function chromiumDelEntorno() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return undefined;
  for (const nombre of readdirSync(base).filter((n) => n.startsWith('chromium-'))) {
    const ruta = join(base, nombre, 'chrome-linux', 'chrome');
    if (existsSync(ruta)) return ruta;
  }
  return undefined;
}

const SALIDA = process.env.SALIDA_HUMO ?? 'dist/.humo-piloto';
mkdirSync(SALIDA, { recursive: true });

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain' };

const servidor = http.createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const intento of [join(RAIZ, ruta), join(RAIZ, ruta + '.html'), join(RAIZ, ruta, 'index.html')]) {
    if (existsSync(intento) && !intento.endsWith('/')) {
      try {
        const cuerpo = readFileSync(intento);
        res.writeHead(200, { 'content-type': TIPOS[extname(intento)] ?? 'application/octet-stream' });
        return res.end(cuerpo);
      } catch { /* era un directorio */ }
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('404');
});

await new Promise((r) => servidor.listen(4399, r));
const BASE = 'http://localhost:4399';

console.log('\n Recorrido completo en un iPhone 13');

let fallos = 0;
const ok = (nombre, cond, detalle = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}${cond || !detalle ? '' : `\n        ${detalle}`}`);
  if (!cond) fallos++;
};

const navegador = await chromium.launch({ executablePath: chromiumDelEntorno() });
const contexto = await navegador.newContext({ ...devices['iPhone 13'] });
const pagina = await contexto.newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
/* Los recursos externos (GA4) no salen de este sandbox: eso no es un
   fallo de la pagina. */
pagina.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL_CONNECTION_FAILED')) errores.push(m.text()); });

/* ---------- 1. Activar ---------- */
await pagina.goto(`${BASE}/piloto/la-triada`, { waitUntil: 'networkidle' });
ok('el aviso de condicion sin verificar esta visible', await pagina.locator('.piloto__condicion').isVisible());
ok('no aparece ningun porcentaje en la pantalla', !/\d+\s*%/.test(await pagina.locator('main').innerText()), await pagina.locator('main').innerText());

await pagina.getByRole('button', { name: 'Activar mi beneficio' }).click();
await pagina.waitForSelector('[data-paso="codigo"]:not([hidden])');
const codigo = (await pagina.locator('[data-codigo]').innerText()).trim();
ok('se genero un codigo con la forma ATH-TRI-XXXXX', /^ATH-TRI-[A-Z0-9]{5}$/.test(codigo), codigo);
ok('se dice hasta cuando vale', /Válido hasta las \d{2}:\d{2}/.test(await pagina.locator('[data-caducidad]').innerText()));
ok('la insignia dice Activado', /ACTIVADO/i.test(await pagina.locator('[data-insignia]').innerText()), await pagina.locator('[data-insignia]').innerText());
await pagina.screenshot({ path: join(SALIDA, '1-activado.png'), fullPage: true });

/* ---------- 2. El QR se puede leer de verdad ---------- */
const qr = pagina.locator('svg.piloto__qr');
ok('hay un QR dibujado', await qr.isVisible());
const png = PNG.sync.read(await qr.screenshot({ path: join(SALIDA, '2-qr.png'), scale: 'css' }));
const leido = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
ok('el QR se decodifica', Boolean(leido), 'jsQR no encontro nada');
if (leido) {
  ok('y lleva la validacion con el codigo dentro', leido.data === `${BASE}/piloto/la-triada/validar?c=${codigo}`, leido.data);
}

/* ---------- 3. Un codigo mal copiado se rechaza ---------- */
await pagina.goto(`${BASE}/piloto/la-triada/validar`, { waitUntil: 'networkidle' });
const letra = codigo[8] === 'K' ? 'M' : 'K';
const roto = codigo.slice(0, 8) + letra + codigo.slice(9);
await pagina.locator('input[name="codigo"]').fill(roto);
await pagina.getByRole('button', { name: 'Comprobar' }).click();
await pagina.waitForSelector('.piloto__resultado--no');
ok('un codigo con una letra cambiada se rechaza', await pagina.locator('.piloto__resultado--no').isVisible());
ok('y se explica sin culpar a quien teclea', (await pagina.locator('[data-resultado]').innerText()).includes('vuelve a leerlo'));
ok('el paso 2 sigue oculto', await pagina.locator('[data-form-cuenta]').isHidden());

/* ---------- 4. El bueno, por la via del QR ---------- */
await pagina.goto(`${BASE}/piloto/la-triada/validar?c=${codigo}`, { waitUntil: 'networkidle' });
await pagina.waitForSelector('.piloto__resultado--si');
ok('entrando por el QR, el codigo se acepta solo', await pagina.locator('[data-form-cuenta]').isVisible());
ok('dice que se activo en este mismo dispositivo', (await pagina.locator('[data-resultado]').innerText()).includes('este mismo dispositivo'));

await pagina.locator('input[name="consumo"]').fill('120000');
await pagina.locator('input[name="porcentaje"]').fill('10');
await pagina.locator('textarea[name="nota"]').fill('Mesa 4, prueba de humo');
await pagina.waitForSelector('[data-cuenta]:not([hidden])');
ok('el total se calcula al teclear', (await pagina.locator('[data-total]').innerText()).includes('108.000'), await pagina.locator('[data-cuenta]').innerText());
await pagina.screenshot({ path: join(SALIDA, '3-cuenta.png'), fullPage: true });

await pagina.getByRole('button', { name: 'Registrar redención' }).click();
await pagina.waitForSelector('[data-cierre]:not([hidden])');
const linea = await pagina.locator('[data-linea]').innerText();
ok('la linea del registro sale completa', linea.includes(`|${codigo}|`) && linea.includes('|REDIMIDO|120000|10|12000|108000|'), linea);
ok('la insignia dice Redimido', /^REDIMIDO$/i.test((await pagina.locator('[data-insignia]').innerText()).trim()), await pagina.locator('[data-insignia]').innerText());
ok('se avisa de que aun no esta registrado en Atheron', (await pagina.locator('[data-cierre]').innerText()).includes('todavía no está registrado'));
const wa = await pagina.locator('[data-whatsapp-piloto]').getAttribute('href');
ok('el boton de WhatsApp lleva el mensaje', wa.startsWith('https://wa.me/573188983167?text=') && decodeURIComponent(wa).includes(codigo), wa?.slice(0, 80));
await pagina.screenshot({ path: join(SALIDA, '4-redimido.png'), fullPage: true });

/* ---------- 5. El registro ---------- */
await pagina.goto(`${BASE}/piloto/la-triada/registro`, { waitUntil: 'networkidle' });
ok('el movimiento aparece en el registro', (await pagina.locator('[data-lista]').innerText()).includes(codigo));
ok('el volcado trae cabecera y fila', (await pagina.locator('[data-volcado]').innerText()).split('\n').length === 2);
const qrPapel = PNG.sync.read(await pagina.locator('svg.piloto__qr').screenshot({ path: join(SALIDA, '5-qr-papel.png') }));
const leidoPapel = jsQR(new Uint8ClampedArray(qrPapel.data), qrPapel.width, qrPapel.height);
ok('el QR de papel apunta al dominio oficial', leidoPapel?.data === 'https://hotelesatheron.com/piloto/la-triada', leidoPapel?.data);
await pagina.screenshot({ path: join(SALIDA, '6-registro.png'), fullPage: true });

/* ---------- 6. Vuelta al movil del huesped ---------- */
await pagina.goto(`${BASE}/piloto/la-triada`, { waitUntil: 'networkidle' });
ok('el huesped ve que su codigo ya esta cerrado', (await pagina.locator('[data-paso="cerrado"]').innerText()).includes('redimido'));

/* ---------- 7. Sin JavaScript ---------- */
const sinJs = await navegador.newContext({ ...devices['iPhone 13'], javaScriptEnabled: false });
const pag2 = await sinJs.newPage();
await pag2.goto(`${BASE}/piloto/la-triada`);
ok('sin JavaScript se dice que hace falta', (await pag2.locator('noscript').innerHTML()).includes('Hace falta JavaScript'));

ok('no hubo errores de consola', errores.length === 0, errores.join(' | '));

await navegador.close();
servidor.close();
console.log(fallos ? `\nFALLOS: ${fallos}\n` : '\nTodo correcto.\n');
process.exit(fallos ? 1 : 0);
