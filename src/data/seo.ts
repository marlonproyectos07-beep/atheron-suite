/* ============================================================
   PIEZAS DE DATOS ESTRUCTURADOS QUE SE REPITEN

   La miga de pan y la ficha de la organizacion son identicas en
   todas las paginas que las llevan. Escritas a mano en cada archivo
   se descoordinan: basta con que una use "hotelesatheron.com" y
   otra "www.hotelesatheron.com" para que Google las lea como dos
   organizaciones distintas.

   EL DOMINIO SE ESCRIBE UNA VEZ
   Es el canonico aprobado, sin "www" y con https. La etiqueta
   canonical y og:url los construye Base.astro a partir de
   astro.config.mjs; aqui se usa el mismo valor para que no puedan
   contradecirse.
   ============================================================ */

export const DOMINIO = 'https://hotelesatheron.com';

/** Direccion absoluta de una ruta del sitio. */
export const url = (ruta: string): string =>
  ruta === '/' ? `${DOMINIO}/` : `${DOMINIO}${ruta}`;

/** La organizacion que publica. Un solo identificador para todo el sitio. */
export const ORGANIZACION = {
  '@type': 'Organization',
  '@id': `${DOMINIO}/#organizacion`,
  name: 'Atheron Suite',
  url: `${DOMINIO}/`,
} as const;

export interface Escalon {
  nombre: string;
  /** Ruta del sitio. Se omite en el ultimo escalon: es la pagina actual. */
  ruta?: string;
}

/* La miga de pan que se declara para el buscador.

   Un escalon SIN ruta sale sin "item", que es como schema.org
   representa "aqui estas". Inventarle una direccion a un escalon
   que no tiene pagina -por ejemplo "Proyectos", que no existe- es
   declararle a Google una URL que devuelve 404. */
export function migaDePan(escalones: Escalon[], anclaId: string) {
  return {
    '@type': 'BreadcrumbList',
    '@id': anclaId,
    itemListElement: escalones.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: e.nombre,
      ...(e.ruta ? { item: url(e.ruta) } : {}),
    })),
  };
}
