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
   anaden solos mas abajo. */
const paginasFijas: Entrada[] = [
  { ruta: '/', prioridad: '1.0' },
  { ruta: '/landing/hospedaje-en-zipaquira', prioridad: '0.9' },
  { ruta: '/landing/casas-para-grupos-en-zipaquira', prioridad: '0.9' },
  { ruta: '/hospedajes', prioridad: '0.8' },
  { ruta: '/blog', prioridad: '0.7' },
  { ruta: '/blog/guia-de-zipaquira', prioridad: '0.9' },
  { ruta: '/blog/como-nacio-atheron-suite', prioridad: '0.7' },
];

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

  const entradas = [...paginasFijas, ...fichas];

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

  Las fichas de hospedaje entran aqui solas cuando se marcan como
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
