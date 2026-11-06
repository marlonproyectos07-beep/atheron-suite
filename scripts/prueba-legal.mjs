/* ============================================================
   PRUEBA DE PAGINAS LEGALES — ATH-WEB-META-039

     npm run prueba   (se ejecuta junto con las demas)

   Comprueba sobre el codigo fuente (sin construir):
   - existen las cuatro paginas legales y estan enlazadas entre si;
   - la ruta de eliminacion esta en legal.ts, el sitemap y el pie;
   - los tres controles siguen apagados y no hay fecha de vigencia inventada;
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
prueba('PUBLICAR_PRIVACIDAD apagado', /export const PUBLICAR_PRIVACIDAD = false;/.test(legal));
prueba('PUBLICAR_ELIMINACION apagado', /export const PUBLICAR_ELIMINACION = false;/.test(legal));
prueba('VIGENCIA_LEGAL sigue en null (sin fecha ficticia)', /export const VIGENCIA_LEGAL: string \| null = null;/.test(legal));
prueba("ruta de eliminacion = '/eliminacion-de-datos'", /eliminacion: '\/eliminacion-de-datos'/.test(legal));

const priv = leer(paginas.privacidad);
const estiloLegal = leer('public/assets/css/legal.css');
prueba('correo de privacidad tiene salto de línea seguro a 320px',
  estiloLegal.includes('.legal a[href^="mailto:"] { overflow-wrap: anywhere; }'));
prueba('aviso no junta el punto con Política de privacidad',
  leer('src/components/AvisoAnalitica.astro').includes("página.{' '}"));
prueba('párrafo de recepción tiene espacio antes de ATHERON',
  priv.includes("),{' '}"));

const elim = leer(paginas.eliminacion);
const term = leer(paginas.terminos);
const info = leer(paginas.informacion);
const pie = leer('src/components/PieLegal.astro');
const sitemap = leer('src/pages/sitemap.xml.ts');

prueba('la politica enlaza a eliminacion', priv.includes('RUTAS_LEGALES.eliminacion'));
prueba('los terminos enlazan a eliminacion', term.includes('RUTAS_LEGALES.eliminacion'));
prueba('informacion legal enlaza a eliminacion', info.includes('RUTAS_LEGALES.eliminacion'));
prueba('el pie legal enlaza a eliminacion', pie.includes('RUTAS_LEGALES.eliminacion'));
prueba('sitemap enlaza privacidad solo con PUBLICAR_PRIVACIDAD',
  sitemap.includes('PUBLICAR_PRIVACIDAD ?') && sitemap.includes('RUTAS_LEGALES.privacidad'));
prueba('sitemap enlaza eliminacion solo con PUBLICAR_ELIMINACION',
  sitemap.includes('PUBLICAR_ELIMINACION ?') && sitemap.includes('RUTAS_LEGALES.eliminacion'));
prueba('sitemap deja terminos e informacion bajo BORRADOR_LEGAL',
  sitemap.includes('!BORRADOR_LEGAL ?') && sitemap.includes('RUTAS_LEGALES.terminos') && sitemap.includes('RUTAS_LEGALES.informacion'));
prueba('eliminacion enlaza solo a politica, no a informacion en borrador',
  elim.includes('RUTAS_LEGALES.privacidad') && !elim.includes('RUTAS_LEGALES.informacion'));
prueba('eliminacion usa el correo de legal.ts', elim.includes('CORREO_CONTACTO'));
prueba('eliminacion usa PaginaLegal (hereda noindex en borrador)', elim.includes('<PaginaLegal'));

for (const [k, t] of Object.entries({ privacidad: priv, eliminacion: elim, terminos: term, informacion: info })) {
  prueba(`${k}: no repite el NIT escrito a mano`, !/901\.?881\.?946/.test(t));
}

prueba('la politica nombra WhatsApp Cloud API, Odoo y Smoobu',
  /Cloud API/.test(priv) && /Odoo/.test(priv) && /Smoobu/.test(priv));
prueba('la politica no afirma automatizacion activa',
  /No hay respuestas automáticas/.test(priv) && /recepción de mensajes de esta línea aún no ha sido validada/.test(priv));
prueba('la politica no afirma copia automatica Smoobu-Odoo activa', /no se hace de forma automática/.test(priv));
prueba('privacidad no publica un RNT sin relacion documentada', !priv.includes('RNT.numero') && !priv.includes('RUTAS_LEGALES.informacion'));
prueba('privacidad presenta Cloud API como integracion en preparacion', priv.includes('La integración está en preparación') && priv.includes('cuando entre en operación'));
prueba('privacidad no promete BAJA sin operacion comprobada', !priv.includes('«BAJA»'));
prueba('eliminacion usa solo recepcion verificada, no la linea nueva', !elim.includes('LINEA_CLOUD_API') && elim.includes('EMPRESA.whatsapp'));
prueba('PaginaLegal controla cada pagina individualmente',
  ['PUBLICAR_PRIVACIDAD', 'PUBLICAR_ELIMINACION', 'BORRADOR_LEGAL'].every(k => leer('src/components/PaginaLegal.astro').includes(k)));
prueba('footer oculta terminos y RNT si BORRADOR_LEGAL=true',
  pie.includes('!BORRADOR_LEGAL && <a href={RUTAS_LEGALES.terminos}>') && pie.includes('{!BORRADOR_LEGAL && ('));
prueba('footer solo ofrece preferencias GA4 cuando publica privacidad',
  pie.includes('PUBLICAR_PRIVACIDAD && <button'));
prueba('GA4 requiere PUBLICAR_PRIVACIDAD', leer('src/layouts/Base.astro').includes('const analiticaConConsentimiento = PUBLICAR_PRIVACIDAD;'));
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

// ATH-PMS-WA-048B: responsabilidades sobre alojamientos de terceros
prueba('privacidad no afirma acuerdos con titulares ni atribuye sus obligaciones', /no describe ni modifica los acuerdos/.test(priv) && /no responde por tratamientos/.test(priv));
prueba('privacidad no publica porcentajes, contratos ni numero RNT', !/\d+\s?%|contrato de administraci|235267|70\/30/i.test(priv + elim));
prueba('eliminacion mantiene verificacion de identidad y conservacion legal', /no podamos verificar razonablemente/.test(elim) && /obligaciones legales/.test(elim));
prueba('eliminacion traslada solicitudes a titulares sin prometer su eliminacion', /no controlamos directamente su eliminaci/.test(elim));
const textos = [priv, elim, term, info].join('\n');
prueba('sin marcadores provisionales (lorem, TODO, XXX)', !/lorem ipsum|TODO|XXX/i.test(textos));

console.log(`\n${hechas} pruebas, ${fallos.length ? fallos.length + ' con fallos' : 'todas correctas'}.\n`);
if (fallos.length) process.exit(1);
