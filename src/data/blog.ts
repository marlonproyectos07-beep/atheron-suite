/* ============================================================
   MODELO DE DATOS DEL BLOG

   QUE ES ESTO Y QUE NO ES
   Es el contrato de que puede llevar un articulo: quien lo firma,
   cuando se publico, cuando se toco por ultima vez, de donde salen
   sus datos, que imagen lo encabeza, a que categoria pertenece, a
   donde enlaza dentro del sitio y con que llamada a la accion
   termina. Con eso, la ficha de datos estructurados y la fecha del
   sitemap salen solas y no hay que escribirlas dos veces.

   NO es una coleccion de contenido. Los dos articulos que existen
   hoy son paginas .astro escritas a mano, y convertirlas en
   markdown seria una migracion que nadie ha pedido en esta fase.
   Aqui viven sus metadatos, junto a los de cualquier articulo
   futuro, hasta que se decida esa migracion.

   AQUI NO SE INVENTA NINGUNA FECHA
   "publicado" es la fecha que el propio articulo ya declaraba, o la
   de su primer commit en el repositorio cuando no declaraba
   ninguna. "modificado" es la del ultimo commit que toco el
   archivo. Las dos son comprobables con git; ninguna es la fecha
   en que se construye el sitio, que cambiaria sola cada despliegue
   y le diria a Google que el articulo se reescribe cada semana.

   LOS CAMPOS VACIOS SE QUEDAN VACIOS
   Ninguno de los dos articulos tiene todavia imagen de portada ni
   fuentes citadas. Se quedan en null y ni la ficha de datos
   estructurados ni la pagina los inventan.
   ============================================================ */

export interface FuenteArticulo {
  /** Como se cita la fuente. */
  titulo: string;
  /** Direccion, si es publica y comprobable. */
  url?: string;
}

export interface EnlaceArticulo {
  texto: string;
  href: string;
}

export interface Articulo {
  /** Ruta dentro del sitio. Es la clave: no se repite. */
  ruta: string;
  titulo: string;
  descripcion: string;
  /** Quien firma. Hoy siempre la organizacion; el dia que firme una
      persona, aqui se pone su nombre. */
  autor: string;
  /** AAAA-MM-DD. */
  publicado: string;
  /** AAAA-MM-DD del ultimo cambio real del contenido. */
  modificado: string;
  /** Categoria que agrupa el articulo. */
  categoria: string;
  /** Imagen de portada. null = todavia no tiene, y no se inventa. */
  imagen: string | null;
  /** Que se ve en esa imagen. null mientras no haya imagen. */
  imagenAlt: string | null;
  /** De donde salen los datos del articulo. Vacio = no cita fuentes. */
  fuentes: FuenteArticulo[];
  /** Enlaces internos que el articulo ofrece. */
  enlacesInternos: EnlaceArticulo[];
  /** Llamada a la accion con la que cierra. null = no lleva. */
  cta: EnlaceArticulo | null;
  /** false = no se lista ni entra en el sitemap. */
  publicadoEnSitio: boolean;
}

export const CATEGORIA_ZIPAQUIRA = 'Zipaquirá';
export const CATEGORIA_ATHERON = 'Atheron Suite';

export const articulos: Articulo[] = [
  {
    ruta: '/blog/guia-de-zipaquira',
    titulo: 'Guía de Zipaquirá 2026: qué hacer, cómo llegar y dónde dormir',
    descripcion:
      'Guía practica de Zipaquirá, Cundinamarca: como llegar desde Bogotá, que visitar, cuantos días quedarse y donde alojarse cerca de la Catedral de Sal.',
    autor: 'Atheron Suite',
    /* El articulo no declaraba fecha propia: se toma la de su primer
       commit en el repositorio, que es cuando existio por primera vez. */
    publicado: '2026-08-20',
    modificado: '2026-09-10',
    categoria: CATEGORIA_ZIPAQUIRA,
    imagen: null,
    imagenAlt: null,
    fuentes: [],
    enlacesInternos: [
      { texto: 'Nuestros hospedajes', href: '/hospedajes' },
      { texto: 'Hospedaje en Zipaquirá', href: '/landing/hospedaje-en-zipaquira' },
    ],
    cta: { texto: 'Ver hospedajes en Zipaquirá', href: '/hospedajes' },
    publicadoEnSitio: true,
  },
  {
    ruta: '/blog/como-nacio-atheron-suite',
    titulo: 'Como nació Atheron Suite: de una oportunidad en Zipaquirá a un destino inteligente',
    descripcion:
      'La historia de Atheron Suite: como una necesidad de alojamiento en Zipaquirá dio origen a un proyecto de hospedaje para familias y grupos, y a una visión de destinos inteligentes en Cundinamarca.',
    autor: 'Atheron Suite',
    /* Esta fecha ya la declaraba el propio articulo en su ficha de
       datos estructurados. Se respeta la que estaba publicada. */
    publicado: '2026-08-18',
    modificado: '2026-08-20',
    categoria: CATEGORIA_ATHERON,
    imagen: null,
    imagenAlt: null,
    fuentes: [],
    enlacesInternos: [
      { texto: 'Nuestros hospedajes', href: '/hospedajes' },
    ],
    cta: { texto: 'Conocer los hospedajes', href: '/hospedajes' },
    publicadoEnSitio: true,
  },
];

/** El articulo de una ruta, o undefined si esa ruta no es un articulo. */
export const articuloDe = (ruta: string): Articulo | undefined =>
  articulos.find((a) => a.ruta === ruta);

/** Los que salen en el listado y en el sitemap, del mas nuevo al mas viejo. */
export const articulosPublicados = (): Articulo[] =>
  articulos
    .filter((a) => a.publicadoEnSitio)
    .sort((a, b) => b.publicado.localeCompare(a.publicado));
