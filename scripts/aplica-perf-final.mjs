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
}

if (!css.includes('ICONO WHATSAPP SIN JS')) {
  css += `\n/* ICONO WHATSAPP SIN JS: evita insertar SVG en cada boton al cargar. */
.boton--whatsapp::before {
  content: "";
  width: 1.15em;
  height: 1.15em;
  flex: 0 0 1.15em;
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M20.5 3.4A11.8 11.8 0 0 0 12.05 0C5.5 0 .15 5.35.15 11.9c0 2.1.55 4.15 1.6 5.95L0 24l6.3-1.65a11.9 11.9 0 0 0 5.7 1.45c6.55 0 11.9-5.35 11.9-11.9 0-3.2-1.25-6.2-3.4-8.5m-8.45 18.3c-1.75 0-3.5-.5-5-1.4l-.35-.2-3.75 1 1-3.65-.25-.4a9.85 9.85 0 0 1-1.5-5.25c0-5.45 4.45-9.9 9.9-9.9 2.65 0 5.15 1.05 7 2.9a9.83 9.83 0 0 1 2.9 7c0 5.45-4.45 9.9-9.95 9.9m5.45-7.42c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.67-.51h-.58c-.2 0-.53.07-.8.38-.28.3-1.05 1.02-1.05 2.5s1.07 2.9 1.22 3.1c.15.2 2.11 3.22 5.11 4.52.71.3 1.27.49 1.71.63.72.23 1.37.2 1.89.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35'/%3E%3C/svg%3E") center/contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M20.5 3.4A11.8 11.8 0 0 0 12.05 0C5.5 0 .15 5.35.15 11.9c0 2.1.55 4.15 1.6 5.95L0 24l6.3-1.65a11.9 11.9 0 0 0 5.7 1.45c6.55 0 11.9-5.35 11.9-11.9 0-3.2-1.25-6.2-3.4-8.5m-8.45 18.3c-1.75 0-3.5-.5-5-1.4l-.35-.2-3.75 1 1-3.65-.25-.4a9.85 9.85 0 0 1-1.5-5.25c0-5.45 4.45-9.9 9.9-9.9 2.65 0 5.15 1.05 7 2.9a9.83 9.83 0 0 1 2.9 7c0 5.45-4.45 9.9-9.95 9.9m5.45-7.42c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.67-.51h-.58c-.2 0-.53.07-.8.38-.28.3-1.05 1.02-1.05 2.5s1.07 2.9 1.22 3.1c.15.2 2.11 3.22 5.11 4.52.71.3 1.27.49 1.71.63.72.23 1.37.2 1.89.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35'/%3E%3C/svg%3E") center/contain no-repeat;
}\n`;
}

fs.writeFileSync(cssPath, css);
console.log('Optimizacion Lighthouse aplicada o ya presente.');
