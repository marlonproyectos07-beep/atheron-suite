/* ============================================================
   PRUEBA DE ANALITICA CON CONSENTIMIENTO — ATH-WEB-META-025

     npm run prueba   (se ejecuta despues de las pruebas del minimo publicable)

   Comprueba, sobre el codigo fuente (no necesita construir), que:
   - ninguna plantilla ni pagina declara la libreria de Google Analytics;
   - main.js solo la carga dentro de activarAnalitica(), y esa funcion
     solo se llama tras una decision "si" del visitante;
   - sin decision, la unica accion es mostrar el aviso;
   - el aviso nace oculto y ofrece Aceptar y Rechazar;
   - con PUBLICAR_PRIVACIDAD = false la analitica y el aviso siguen apagados;
   - el correo de privacidad esta en la politica.

   Sin dependencias: node y ya.
   ============================================================ */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let hechas = 0;
const fallos = [];
const prueba = (nombre, ok) => { hechas++; if (!ok) fallos.push(nombre); console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${nombre}`); };
const leer = (r) => readFileSync(r, 'utf8');

function archivos(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) archivos(r, acc); else acc.push(r);
  }
  return acc;
}

console.log('\nAnalitica con consentimiento\n');

const fuentes = archivos('src').filter((f) => /\.(astro|ts|mjs)$/.test(f));
const conGoogle = fuentes.filter((f) => leer(f).includes('googletagmanager.com'));
prueba('ninguna plantilla ni pagina de src/ declara gtag.js', conGoogle.length === 0);

const main = leer('public/assets/js/main.js');
prueba('main.js menciona la libreria de Google una sola vez', (main.match(/googletagmanager\.com/g) || []).length === 1);

const lineaActivar = main.split('\n').find((l) => l.startsWith('function activarAnalitica()')) || '';
prueba('esa unica mencion esta dentro de activarAnalitica()', lineaActivar.includes('googletagmanager.com'));
prueba('activarAnalitica() solo actua en hotelesatheron.com', /hotelesatheron\\\.com/.test(lineaActivar));

const llamadas = [...main.matchAll(/(?<!des)activarAnalitica\(\)/g)].length;
prueba('activarAnalitica() se invoca solo desde iniciarAnalitica (decision si previa o clic en Aceptar)', llamadas === 3); // definicion + 2 usos
const ini = main.split('\n').find((l) => l.startsWith('function iniciarAnalitica()')) || '';
prueba('sin decision solo se muestra el aviso (no se activa)', /else mostrarAvisoAnalitica\(true\)/.test(ini));
prueba('iniciarAnalitica() sale si el modo no es "consentimiento"', /if\(!analiticaConConsentimiento\(\)\)return/.test(ini));
prueba('rechazar desactiva y borra cookies de analitica', /desactivarAnalitica\(\)/.test(ini) && /_ga\|_gid\|_gat/.test(main));
prueba('la decision caduca a los 12 meses', /365\*24\*60\*60\*1e3/.test(main));
prueba('los eventos de GA siguen protegidos con typeof gtag === "function"',
  (main.match(/typeof window\.gtag/g) || []).length >= 2);

const base = leer('src/layouts/Base.astro');
prueba('Base.astro solo pinta el aviso si la analitica es con consentimiento', /analiticaConConsentimiento && <AvisoAnalitica/.test(base));
prueba('Base.astro protege la analitica con PUBLICAR_PRIVACIDAD',
  /const analiticaConConsentimiento = PUBLICAR_PRIVACIDAD;/.test(base));
prueba('Base.astro no habilita GA4 al desactivar BORRADOR_LEGAL',
  !/const analiticaConConsentimiento = !BORRADOR_LEGAL/.test(base));
prueba('main.js recibe data-analitica desde Base.astro', /data-analitica=\{analiticaConConsentimiento/.test(base));

const aviso = leer('src/components/AvisoAnalitica.astro');
prueba('el aviso nace oculto', /data-aviso-analitica hidden/.test(aviso));
prueba('el aviso ofrece Aceptar y Rechazar con el mismo estilo',
  /data-analitica-decision="si"/.test(aviso) && /data-analitica-decision="no"/.test(aviso)
  && (aviso.match(/class="aviso-analitica__boton"/g) || []).length === 2);

const legal = leer('src/data/legal.ts');
prueba('BORRADOR_LEGAL sigue en true', /export const BORRADOR_LEGAL = true;/.test(legal));
prueba('PUBLICAR_PRIVACIDAD sigue apagado', /export const PUBLICAR_PRIVACIDAD = false;/.test(legal));
prueba('PUBLICAR_ELIMINACION sigue apagado', /export const PUBLICAR_ELIMINACION = false;/.test(legal));
prueba('el correo de privacidad esta en legal.ts', legal.includes("'comercialgsc001@gmail.com'"));

const priv = leer('src/pages/politica-de-privacidad.astro');
prueba('la politica usa el correo de privacidad', priv.includes('CORREO_CONTACTO'));
prueba('la politica dice que la analitica esta desactivada por defecto', priv.includes('desactivada por defecto'));
prueba('la politica nombra Smoobu y Odoo', priv.includes('Smoobu') && priv.includes('Odoo'));
prueba('la politica no afirma que el sitio no guarda datos en general', !/no guardamos ning/i.test(priv));

const pie = leer('src/components/PieLegal.astro');
prueba('el pie legal ofrece "Preferencias de analitica"', pie.includes('data-analitica-preferencias'));

const info = leer('src/pages/informacion-legal.astro');
prueba('el RNT sigue atribuido a una persona natural, no a la sociedad', /no es de la sociedad/.test(info) && /RNT\.titular/.test(info));

console.log(`\n${hechas} pruebas, ${fallos.length ? fallos.length + ' con fallos' : 'todas correctas'}.\n`);
if (fallos.length) process.exit(1);
