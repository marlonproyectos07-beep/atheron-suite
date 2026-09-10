/* ============================================================
   SITEMAP — se genera solo

   Antes era un archivo XML que habia que editar a mano cada vez
   que se publicaba una ficha o un articulo. El pendiente 48 dice
   literalmente "anadir cada ficha al sitemap.xml", y era de los
   que se olvidan: quitas el noindex, publicas, y la direccion no
   llega nunca a Google porque nadie se acordo del sitemap.

   Ahora es la misma casilla: una ficha con publicado: true sale
   indexada Y entra aqui. No se pueden desincronizar.

   POR QUE NO USAMOS EL PLUGIN OFICIAL DE ASTRO:
   @astrojs/sitemap publica el archivo en /sitemap-index.xml. La
   direccion de hoy es /sitemap.xml, y es la que apunta robots.txt
   y la que enviaremos a Search Console. Cambiarla no aporta nada
   y rompe lo que ya existe. Este archivo la conserva exacta.
   ============================================================ */

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { articulosPublicados } from '../data/blog';

const DOMINIO = 'https://hotelesatheron.com';

/* Fecha de referencia para las paginas que no llevan la suya.
   Se actualiza a mano cuando se reescribe una pagina fija. */
const FECHA_BASE = '2026-08-18';

interface Entrada {
  ruta: string;
  prioridad: string;
  fecha?: string;
}

/* Las paginas fijas del sitio. Las fichas y los articulos se
   anaden solos mas abajo.

   NO ESTA AQUI, Y ES A PROPOSITO:
   /proyectos/casa-colonial-centro es un borrador privado. Sale con
   noindex y nofollow, sin enlace desde ninguna parte del sitio, y
   por eso tampoco entra en el sitemap: pedirle a Google que visite
   una pagina a la que le estamos diciendo que no la indexe es
   contradictorio. Se anadira cuando el proyecto se apruebe para
   publicacion, junto con el interruptor BORRADOR de
   src/data/casa-colonial-centro.ts. */
const paginasFijas: Entrada[] = [
  { ruta: '/', prioridad: '1.0' },
  { ruta: '/landing/hospedaje-en-zipaquira', prioridad: '0.9' },
  { ruta: '/landing/casas-para-grupos-en-zipaquira', prioridad: '0.9' },
  { ruta: '/hospedajes', prioridad: '0.8' },
  { ruta: '/grupos', prioridad: '0.8' },
  /* Guias del destino. Son contenido propio e indexable, con su
     propia fecha porque no se reescriben a la vez que el resto: la
     de la Catedral lleva datos que hay que revisar contra la fuente
     oficial, y su lastmod tiene que reflejar esa revision, no el
     ultimo despliegue del sitio.

     El hub va con prioridad 0.9, por encima de la guia suelta: es
     el nodo desde el que se reparte el destino entero. */
  { ruta: '/guia-zipaquira', prioridad: '0.9', fecha: '2026-09-10' },
  { ruta: '/zipaquira/catedral-de-sal', prioridad: '0.8', fecha: '2026-09-09' },
  { ruta: '/blog', prioridad: '0.7' },
];

/* Los articulos salen del modelo de datos del blog, con SU fecha de
   ultima modificacion real. Antes estaban en la lista de arriba y
   heredaban la fecha de referencia, la misma para todos: un sitemap
   que le dice a Google que siete paginas distintas se modificaron el
   mismo dia no le esta diciendo nada.

   Lo que NO se usa aqui, y es deliberado, es la fecha de hoy: un
   lastmod que se pone al dia solo con cada despliegue afirma que el
   contenido cambio cuando lo unico que cambio fue la publicacion. */
const articulosDelSitemap: Entrada[] = articulosPublicados().map((a) => ({
  ruta: a.ruta,
  prioridad: '0.9',
  fecha: a.modificado,
}));

const comoFecha = (f?: Date) =>
  f ? f.toISOString().slice(0, 10) : FECHA_BASE;

export const GET: APIRoute = async () => {
  /* Solo las fichas publicadas. Una ficha en obra lleva noindex,
     asi que incluirla aqui seria pedirle a Google que visite una
     pagina que le estamos pidiendo que no indexe. */
  const fichas = (await getCollection('hospedajes'))
    .filter((f) => f.data.publicado)
    .sort((a, b) => a.data.orden - b.data.orden)
    .map<Entrada>((f) => ({
      ruta: `/hospedajes/${f.id}`,
      prioridad: '0.9',
      fecha: comoFecha(f.data.actualizado),
    }));

  const entradas = [...paginasFijas, ...articulosDelSitemap, ...fichas];

  const cuerpo = entradas
    .map(({ ruta, prioridad, fecha }) => `  <url>
    <loc>${DOMINIO}${ruta}</loc>
    <lastmod>${fecha ?? FECHA_BASE}</lastmod>
    <priority>${prioridad}</priority>
  </url>`)
    .join('\n\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  SITEMAP generado automaticamente por src/pages/sitemap.xml.ts
  No editar a mano: los cambios se pierden en la siguiente publicacion.

  Las fichas de hospedaje entran aquí solas cuando se marcan como
  publicadas. Las paginas fijas estan listadas en ese mismo archivo.
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${cuerpo}

</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
