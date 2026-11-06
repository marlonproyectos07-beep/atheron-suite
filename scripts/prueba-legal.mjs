/* ============================================================
   PRUEBA DE PAGINAS LEGALES — ATH-WEB-META-039

     npm run prueba   (se ejecuta junto con las demas)

   Comprueba sobre el codigo fuente (sin construir):
   - existen las cuatro paginas legales y estan enlazadas entre si;
   - la ruta de eliminacion esta en legal.ts, el sitemap y el pie;
   - BORRADOR_LEGAL sigue en true y no hay fecha de vigencia inventada;
   - los datos legales vienen de legal.ts (sin NIT duplicado en paginas);
   - el RNT no se atribuye a la sociedad;
   - no se afirman automatizaciones que no existen;
   - los datos comerciales pendientes siguen en null (no inventados).
   ============================================================ */
import { readFileSync, existsSync } from 'node:fs';

let hechas = 0;
const fallos = [];
const prueba = (n, ok) => { hechas++; if (!ok) fallos.push(n); console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${n}`); };
const leer = (r) => readFileSync(r, 'utf8');

console.log('\nPaginas legales\n');
const paginas = {
  informacion: 'src/pages/informacion-legal.astro',
  privacidad: 'src/pages/politica-de-privacidad.astro',
  terminos: 'src/pages/terminos-y-condiciones.astro',
  eliminacion: 'src/pages/eliminacion-de-datos.astro',
};
for (const [k, f] of Object.entries(paginas)) prueba(`existe la pagina ${k}`, existsSync(f));

const legal = leer('src/data/legal.ts');
prueba('BORRADOR_LEGAL sigue en true', /export const BORRADOR_LEGAL = true;/.test(legal));
prueba('VIGENCIA_LEGAL sigue en null (sin fecha ficticia)', /export const VIGENCIA_LEGAL: string \| null = null;/.test(legal));
prueba("ruta de eliminacion = '/eliminacion-de-datos'", /eliminacion: '\/eliminacion-de-datos'/.test(legal));

const priv = leer(paginas.privacidad);
const elim = leer(paginas.eliminacion);
const term = leer(paginas.terminos);
const info = leer(paginas.informacion);
const pie = leer('src/components/PieLegal.astro');
const sitemap = leer('src/pages/sitemap.xml.ts');

prueba('la politica enlaza a eliminacion', priv.includes('RUTAS_LEGALES.eliminacion'));
prueba('los terminos enlazan a eliminacion', term.includes('RUTAS_LEGALES.eliminacion'));
prueba('informacion legal enlaza a eliminacion', info.includes('RUTAS_LEGALES.eliminacion'));
prueba('el pie legal enlaza a eliminacion', pie.includes('RUTAS_LEGALES.eliminacion'));
prueba('el sitemap incluye eliminacion solo con BORRADOR_LEGAL = false',
  /BORRADOR_LEGAL\s*\?\s*\[\]/.test(sitemap) && sitemap.includes('RUTAS_LEGALES.eliminacion'));
prueba('eliminacion enlaza a politica e informacion legal',
  elim.includes('RUTAS_LEGALES.privacidad') && elim.includes('RUTAS_LEGALES.informacion'));
prueba('eliminacion usa el correo de legal.ts', elim.includes('CORREO_CONTACTO'));
prueba('eliminacion usa PaginaLegal (hereda noindex en borrador)', elim.includes('<PaginaLegal'));

for (const [k, t] of Object.entries({ privacidad: priv, eliminacion: elim, terminos: term, informacion: info })) {
  prueba(`${k}: no repite el NIT escrito a mano`, !/901\.?881\.?946/.test(t));
}

prueba('la politica nombra WhatsApp Cloud API, Odoo y Smoobu',
  /Cloud API/.test(priv) && /Odoo/.test(priv) && /Smoobu/.test(priv));
prueba('la politica dice que hoy no hay automatizaciones activas',
  /No hay respuestas automáticas/.test(priv) && /atención por esa línea es <strong>humana/.test(priv));
prueba('la politica no afirma copia automatica Smoobu-Odoo activa', /no se hace de forma automática/.test(priv));
prueba('la politica separa el RNT de la sociedad', /no atribuye ese registro/.test(priv));
prueba('la politica no fija plazos de conservacion inventados', !/\b\d+\s+(años|anos|meses)\b/i.test(priv + elim));
prueba('la politica no afirma recoger documentos ni datos de menores', !/menores/i.test(priv.split('---')[2] || '') && !/pasaporte|c[eé]dula/i.test(priv.split('---')[2] || ''));
prueba('eliminacion no promete borrar datos de terceros', /No controlamos directamente/.test(elim));
prueba('eliminacion no pide copia de documentos por regla general', /no le pediremos copia de documentos/.test(elim));
prueba('informacion legal: RNT de persona natural, no de la sociedad', /no es de la sociedad/.test(info));

prueba('medios de pago siguen sin definir (null)', /medioDePago: null/.test(legal));
prueba('cambios de fecha siguen sin definir (null)', /cambiosDeFecha: null/.test(legal));
prueba('menores y mascotas siguen sin definir (null)', /menoresYMascotas: null/.test(legal));
prueba('normas de convivencia siguen sin definir (null)', /normasDeConvivencia: null/.test(legal));
prueba('anticipo 30-50 % conservado', /entre el 30 % y el 50 %/.test(legal));
prueba('check-in 3:00 p. m. y check-out 11:00 a. m. conservados', /3:00 p\. m\./.test(legal) && /11:00 a\. m\./.test(legal));

const textos = [priv, elim, term, info].join('\n');
prueba('sin marcadores provisionales (lorem, TODO, XXX)', !/lorem ipsum|TODO|XXX/i.test(textos));

console.log(`\n${hechas} pruebas, ${fallos.length ? fallos.length + ' con fallos' : 'todas correctas'}.\n`);
if (fallos.length) process.exit(1);
