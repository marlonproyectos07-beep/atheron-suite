import fs from 'node:fs';

const paginaPath = 'src/pages/hospedajes/[slug].astro';
let pagina = fs.readFileSync(paginaPath, 'utf8');

if (!pagina.includes('hero--hotel-atheron')) {
  const apertura = '    <section class="hero hero--interior">\n      <div class="contenedor hero__contenido">';
  const hero = `    <section class:list={['hero', 'hero--interior', esHotelAtheron && 'hero--hotel-atheron']}>
      {esHotelAtheron && (
        <picture class="hero-hotel__fondo" aria-hidden="true">
          <source media="(max-width: 700px)" type="image/avif" srcset="/assets/img/hospedajes/la-magia-de-zipaquira-principal-700.avif" />
          <source media="(max-width: 700px)" type="image/webp" srcset="/assets/img/hospedajes/la-magia-de-zipaquira-principal-700.webp" />
          <source type="image/avif" srcset="/assets/img/hospedajes/la-magia-de-zipaquira-principal-900.avif" />
          <source type="image/webp" srcset="/assets/img/hospedajes/la-magia-de-zipaquira-principal-900.webp" />
          <img
            src="/assets/img/hospedajes/la-magia-de-zipaquira-principal.jpg"
            alt=""
            width="900"
            height="675"
            loading="eager"
            fetchpriority="high"
            decoding="async"
          />
        </picture>
      )}
      <div class="contenedor hero__contenido">`;
  if (!pagina.includes(apertura)) throw new Error('No se encontro apertura del hero');
  pagina = pagina.replace(apertura, hero);

  const casa = '                  <Foto src={d.fotoPrincipal} alt={d.fotoPrincipalAlt} />';
  const casaNueva = `                  <Foto
                    src={d.fotoPrincipal}
                    alt={d.fotoPrincipalAlt}
                    anchos={[400, 600, 700, 900]}
                    medidas="(min-width: 900px) 510px, calc(100vw - 3rem)"
                    ancho={900}
                    alto={675}
                  />`;
  if (!pagina.includes(casa)) throw new Error('No se encontro foto Casa completa');
  pagina = pagina.replace(casa, casaNueva);

  const mini = '                        <Foto src={h.foto} alt={h.fotoAlt} />';
  const miniNueva = `                        <Foto
                          src={h.foto}
                          alt={h.fotoAlt}
                          anchos={[240, 360, 480]}
                          medidas="(min-width: 900px) 220px, calc(100vw - 3rem)"
                          ancho={900}
                          alto={675}
                        />`;
  if (!pagina.includes(mini)) throw new Error('No se encontro foto mini habitacion');
  pagina = pagina.replace(mini, miniNueva);

  const casaMini = '                    <Foto src={h.foto} alt={h.fotoAlt} forma="cuadrado" />';
  const casaMiniNueva = `                    <Foto
                      src={h.foto}
                      alt={h.fotoAlt}
                      forma="cuadrado"
                      anchos={[240, 360, 480]}
                      medidas="(min-width: 900px) 190px, 42vw"
                      ancho={900}
                      alto={675}
                    />`;
  if (!pagina.includes(casaMini)) throw new Error('No se encontro mini Casa completa');
  pagina = pagina.replace(casaMini, casaMiniNueva);

  const detalle = '<Foto src={h.foto} alt={h.fotoAlt}>Foto pendiente</Foto>';
  const detalleNuevo = `<Foto
                        src={h.foto}
                        alt={h.fotoAlt}
                        anchos={[360, 480]}
                        medidas="(min-width: 800px) 320px, calc(100vw - 3rem)"
                        ancho={900}
                        alto={675}
                      >Foto pendiente</Foto>`;
  if (!pagina.includes(detalle)) throw new Error('No se encontro foto grande habitacion');
  pagina = pagina.replace(detalle, detalleNuevo);
  fs.writeFileSync(paginaPath, pagina);
}

const cssPath = 'public/assets/css/hotel-selector.css';
let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes('.hero-hotel__fondo')) {
  const inicio = css.indexOf('/* ------------------------------------------------------------\n   HERO FOTOGRAFICO');
  const fin = css.indexOf('/* La eleccion de Casa completa');
  if (inicio < 0 || fin < 0) throw new Error('No se encontro bloque hero CSS');
  const heroCss = `/* ------------------------------------------------------------
   HERO FOTOGRAFICO — imagen real en el HTML
   El diseño visual se conserva y el LCP se descubre inmediatamente.
   ------------------------------------------------------------ */
.hero--hotel-atheron {
  min-height: clamp(540px, 70vh, 720px);
  isolation: isolate;
  background: var(--color-noche);
}
.hero--hotel-atheron .hero-hotel__fondo {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: block;
}
.hero--hotel-atheron .hero-hotel__fondo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 53%;
}
.hero--hotel-atheron::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(90deg, rgba(8, 18, 34, .91) 0%, rgba(8, 18, 34, .76) 42%, rgba(8, 18, 34, .28) 72%, rgba(8, 18, 34, .15) 100%);
  pointer-events: none;
}
.hero--hotel-atheron .hero__contenido {
  position: relative;
  z-index: 2;
  max-width: 760px;
  padding-block: clamp(2.5rem, 6vw, 5rem);
}
.hero--hotel-atheron .hero__titulo { text-shadow: 0 2px 22px rgba(0, 0, 0, .28); }
.hero--hotel-atheron .hero__texto {
  max-width: 52ch;
  color: rgba(255,255,255,.94);
  text-shadow: 0 1px 10px rgba(0, 0, 0, .35);
}
.hero--hotel-atheron .hero__etiqueta {
  background: rgba(8,18,34,.36);
  backdrop-filter: blur(5px);
}
.hero--hotel-atheron .hero__datos {
  max-width: 670px;
  border-top-color: rgba(255,255,255,.34);
}
.hero--hotel-atheron + .seccion .bloque-doble__texto > .etiqueta { color: #856a10; }

`;
  css = css.slice(0, inicio) + heroCss + css.slice(fin);

  const movil = /  body:has\(\.hotel-selector-seccion\) \.hero--interior \{[\s\S]*?\n  \}\n  body:has\(\.hotel-selector-seccion\) \.hero--interior \.hero__contenido \{/;
  if (!movil.test(css)) throw new Error('No se encontro hero movil viejo');
  css = css.replace(movil, `  .hero--hotel-atheron { min-height: 560px; }
  .hero--hotel-atheron .hero-hotel__fondo img { object-position: 62% center; }
  .hero--hotel-atheron::after {
    background: linear-gradient(180deg, rgba(8,18,34,.74) 0%, rgba(8,18,34,.76) 58%, rgba(8,18,34,.90) 100%);
  }
  .hero--hotel-atheron .hero__contenido {`);

  const marcador = `/* En la vista de Casa completa se conserva UN CTA principal para la
   reserva del grupo. Las cinco miniaturas sirven para explorar cada
   habitacion y no compiten con cinco WhatsApps diferentes. */

`;
  if (!css.includes(marcador)) throw new Error('No se encontro marcador Casa completa');
  css = css.replace(marcador, marcador + `/* Posponer el layout de fichas fuera del primer viewport. */
.hotel-detalles .habitacion,
.hotel-casa-detalle {
  content-visibility: auto;
  contain-intrinsic-size: auto 900px;
}

`);
  fs.writeFileSync(cssPath, css);
}

console.log('Optimizacion Lighthouse aplicada o ya presente.');
