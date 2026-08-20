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
});
