// @ts-check
import { defineConfig } from 'astro/config';

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
    // 'file' genera  /landing/hospedaje-en-zipaquira.html
    // 'directory' generaria  /landing/hospedaje-en-zipaquira/index.html
    // y eso publicaria la pagina CON barra final: direccion distinta
    // a la actual. Por eso va 'file'.
    format: 'file',
  },
});
