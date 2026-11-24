/* ------------------------------------------------------------
   RESERVA DE ALTURA PARA EL TITULO DEL HERO (movil)

   Problema medido el 24/11/2026 (ORDENES ATH-WEB-SEO-122 y 123):
   Fraunces es mas ancha que la letra de respaldo, asi que un titulo
   como "Hotel Colonial Confort" ocupa UNA linea hasta que llega la
   fuente y DOS despues. Todo lo que hay debajo (.hero__datos) baja
   40 px de golpe: CLS de 0,06 a 0,11 en PageSpeed movil.

   Esta funcion calcula, al compilar, cuantas lineas ocupara el titulo
   YA con Fraunces y devuelve el CSS que las reserva desde el primer
   pintado. No depende de ninguna fuente instalada en el aparato, no
   precarga nada y no cambia lo que se ve cuando Fraunces ya esta.

   Como se calcula:
   - fraunces-avances.json trae el ancho de cada letra de Fraunces con
     peso 600 y tamano optico 35,2 px (los del h1 en movil), sacado del
     propio archivo public/assets/fuentes/fraunces-latin-var.woff2.
     Sumarlos sin kerning da un ancho igual o apenas MAYOR que el real
     (el kerning solo lo achica): se reserva de mas, nunca de menos.
   - En pantallas menores de 640 px el h1 mide 2,2 rem (35,2 px) y el
     contenedor es el ancho de la pantalla menos 48 px.
   - Se parte el texto por palabras, como hace el navegador, para cada
     ancho de pantalla entre 320 y 639 px.
   Si el texto lleva una letra que la tabla no conoce, se usa 0,6 em,
   que tambien sobra.
   ------------------------------------------------------------ */
import avances from './fraunces-avances.json';

const TAMANO_PX = 35.2;
const ESPACIADO_EM = -0.01; // letter-spacing de h1
const RELLENO_PX = 48; // padding horizontal del contenedor, dos lados
const INTERLINEADO = 1.15;
const PANTALLA_MAX = 639; // desde 640 px el h1 crece con vw y deja de ser fijo
const ANCHO_DESCONOCIDO_EM = 0.6;

const tabla = avances as Record<string, number>;

/** Ancho del texto en px, con Fraunces 600 a 35,2 px y el espaciado del h1. */
export function anchoTituloPx(texto: string): number {
  let em = 0;
  for (const letra of texto) em += (tabla[letra] ?? ANCHO_DESCONOCIDO_EM) + ESPACIADO_EM;
  return em * TAMANO_PX;
}

/** Lineas que ocupa el texto en un contenedor de ese ancho, partiendo por palabras como el navegador. */
export function lineasTitulo(texto: string, contenedorPx: number): number {
  const espacio = anchoTituloPx(' ');
  const palabras = texto.split(/\s+/).filter(Boolean);
  let lineas = 1;
  let usado = 0;
  for (const palabra of palabras) {
    const w = anchoTituloPx(palabra);
    if (usado === 0) usado = w;
    else if (usado + espacio + w <= contenedorPx) usado += espacio + w;
    else { lineas++; usado = w; }
  }
  return lineas;
}

/**
 * CSS que reserva las lineas del titulo en movil (320 a 639 px). Recorre
 * cada ancho de pantalla, agrupa los tramos con el mismo numero de lineas
 * y solo emite regla para los de dos lineas o mas. Vacio si siempre cabe en una.
 */
export function reservaTitulo(texto: string): string {
  const reglas: string[] = [];
  let desde = 320;
  let lineasTramo = lineasTitulo(texto, desde - RELLENO_PX);
  for (let v = 321; v <= PANTALLA_MAX + 1; v++) {
    const l = v <= PANTALLA_MAX ? lineasTitulo(texto, v - RELLENO_PX) : -1;
    if (l !== lineasTramo) {
      if (lineasTramo >= 2) {
        reglas.push(
          `@media (min-width:${desde}px) and (max-width:${v - 1}px){.hero__titulo{min-height:${(lineasTramo * INTERLINEADO).toFixed(2)}em}}`,
        );
      }
      desde = v;
      lineasTramo = l;
    }
  }
  return reglas.join('');
}
