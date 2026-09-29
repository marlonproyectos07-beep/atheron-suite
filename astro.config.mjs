// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

/* ============================================================
   CONFIGURACION DE ASTRO — Atheron Suite

   Las dos opciones de abajo NO son decorativas: son las que
   garantizan que las direcciones del sitio no cambien ni una
   letra al migrar. Si se tocan, se rompe el SEO.
   ============================================================ */

export default defineConfig({
  // Direccion oficial del sitio. De aqui salen las canonicas
  // y el sitemap, asi no se escribe el dominio a mano nunca mas.
  site: 'https://hotelesatheron.com',

  // Sin barra final. Es como esta publicado hoy el sitio
  // (vercel.json ya trae "trailingSlash": false).
  trailingSlash: 'never',

  build: {
    // 'preserve' genera los archivos EXACTAMENTE con la misma forma que
    // tienen hoy en el repositorio:
    //
    //   src/pages/index.astro                     -> /index.html
    //   src/pages/blog/index.astro                -> /blog/index.html
    //   src/pages/blog/guia-de-zipaquira.astro    -> /blog/guia-de-zipaquira.html
    //
    // Es la opcion que garantiza que ninguna direccion cambie.
    //
    // Las otras dos NO sirven aqui:
    //   'directory' pondria cada pagina en su propia carpeta y la
    //               publicaria CON barra final: direccion distinta.
    //   'file'      convertiria /blog/index.astro en /blog.html, que
    //               funciona pero deja de coincidir con lo que hay
    //               publicado hoy. Preferimos no depender de eso.
    format: 'preserve',
  },

  /* ATH-ODOO-HOTEL-008 (canario web -> Odoo staging): agrega el
     adaptador de Vercel SOLO para poder tener una o dos rutas
     server-side (src/pages/api/hotel/*), sin convertir el sitio a SSR.
     Con `output` sin declarar, Astro sigue en modo estatico por
     defecto: todas las paginas existentes se siguen generando
     exactamente igual, y solo las rutas que declaren
     `export const prerender = false` se sirven como funcion
     serverless. Ninguna URL ni el formato de build cambia. */
  adapter: vercel(),
});
