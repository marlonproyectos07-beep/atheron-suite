/* ============================================================
   MODELO DE DATOS DEL BLOG

   QUE ES ESTO Y QUE NO ES
   Es el contrato de que puede llevar un articulo: quien lo firma,
   cuando se publico, cuando se toco por ultima vez, de donde salen
   sus datos, que imagen lo encabeza, a que categoria pertenece, a
   donde enlaza dentro del sitio y con que llamada a la accion
   termina. Con eso, la ficha de datos estructurados, el listado de
   /blog y la fecha del sitemap salen solas y no hay que escribirlas
   dos veces.

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

   ============================================================
   QUE ES EL BLOG Y QUE NO ES (10 de septiembre de 2026)
   ============================================================

   Hay tres piezas que hablan de Zipaquira y cada una responde a una
   intencion distinta. Si dos responden a la misma, se quitan
   posiciones entre ellas:

     /guia-zipaquira            -> descubrir: que ver y que hacer.
     /zipaquira/catedral-de-sal -> la Catedral: horario y pasaportes.
     /blog/...                  -> resolver: como llegar, cuanto
                                   tiempo, donde dormir, y nuestra
                                   historia.

   Por eso el articulo que antes se titulaba "Guia de Zipaquira:
   que hacer, como llegar y donde dormir" se llama ahora "Guia
   practica". El "que hacer" es del hub; el articulo lo resume en dos
   parrafos y enlaza.
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
  /** Titular completo: el H1 del articulo y el headline de su ficha. */
  titulo: string;
  /** Version corta para tarjetas y migas de pan. */
  tituloCorto: string;
  /** Que clase de pieza es, dicho para el lector: "Guía práctica". */
  rotulo: string;
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
    titulo: 'Guía práctica de Zipaquirá: cómo llegar, cuántos días quedarse y dónde dormir',
    tituloCorto: 'Guía práctica: cómo llegar y cuántos días quedarse',
    rotulo: 'Guía práctica',
    descripcion:
      'Guía práctica para planear tu viaje a Zipaquirá desde Bogotá: opciones de transporte, cuántos días dedicarle, qué clima esperar y cómo elegir dónde dormir.',
    autor: 'Atheron Suite',
    /* El articulo no declaraba fecha propia: se toma la de su primer
       commit en el repositorio, que es cuando existio por primera vez.
       Corregido el 10 de septiembre de 2026: aqui ponia 2026-08-20,
       que es la migracion a Astro; el articulo existe desde c25e5ba,
       del 2026-08-18, como blog/guia-de-zipaquira.html. */
    publicado: '2026-08-18',
    modificado: '2026-09-10',
    categoria: CATEGORIA_ZIPAQUIRA,
    imagen: null,
    imagenAlt: null,
    /* Registrada por orden de direccion el 10 de septiembre de 2026.
       Sostiene la altitud (2.650 m). Ver el encabezado del articulo
       sobre lo que esa pagina NO dice. */
    fuentes: [
      {
        titulo: 'Alcaldía de Zipaquirá, «Nuestro municipio»',
        url: 'https://www.zipaquira-cundinamarca.gov.co/municipio/nuestro-municipio',
      },
    ],
    enlacesInternos: [
      { texto: 'Guía Atheron de Zipaquirá', href: '/guia-zipaquira' },
      { texto: 'Catedral de Sal', href: '/zipaquira/catedral-de-sal' },
      { texto: 'Nuestros hospedajes', href: '/hospedajes' },
    ],
    cta: { texto: 'Ver hospedajes en Zipaquirá', href: '/hospedajes' },
    publicadoEnSitio: true,
  },
  {
    ruta: '/blog/como-nacio-atheron-suite',
    titulo: 'Cómo nació Atheron Suite: de una oportunidad en Zipaquirá a la construcción de un destino inteligente',
    tituloCorto: 'Cómo nació Atheron Suite',
    rotulo: 'Nuestra historia',
    descripcion:
      'La historia de Atheron Suite: cómo una necesidad de alojamiento en Zipaquirá dio origen a un proyecto de hospedaje para familias y grupos.',
    autor: 'Atheron Suite',
    /* Esta fecha ya la declaraba el propio articulo en su ficha de
       datos estructurados. Se respeta la que estaba publicada. */
    publicado: '2026-08-18',
    /* 10 de septiembre: correccion ortografica del texto y del
       titular. El contenido no cambio. */
    modificado: '2026-09-10',
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

/* ------------------------------------------------------------
   PROXIMOS ARTICULOS

   Se enseñan como "en preparación" y SIN enlace: no existen, y un
   enlace a una ruta que no existe es una promesa rota. Cuando uno se
   escriba, se da de alta arriba en "articulos" y se quita de aqui.

   Lo que NO esta en esta lista, y es a proposito:
     - "Catedral de Sal: horarios y precios". Esa intencion ya la
       responde /zipaquira/catedral-de-sal, y no publicamos precios.
     - "Zipaquira en un fin de semana". Es el itinerario del hub.
     - "Donde dormir cerca de la Catedral". Es /hospedajes.
   ------------------------------------------------------------ */
export interface ArticuloProximo {
  titulo: string;
  tema: string;
}

export const proximosArticulos: ArticuloProximo[] = [
  { titulo: 'Cómo llegar a Zipaquirá desde Bogotá, paso a paso', tema: 'Transporte' },
  { titulo: 'Restaurantes y cafés en Zipaquirá', tema: 'Gastronomía' },
  { titulo: 'Qué hacer en Zipaquirá de noche', tema: 'Planes' },
  { titulo: 'Zipaquirá con niños', tema: 'Familia' },
];

/** El articulo de una ruta, o undefined si esa ruta no es un articulo. */
export const articuloDe = (ruta: string): Articulo | undefined =>
  articulos.find((a) => a.ruta === ruta);

/** Los que salen en el listado y en el sitemap, del mas nuevo al mas viejo. */
export const articulosPublicados = (): Articulo[] =>
  articulos
    .filter((a) => a.publicadoEnSitio)
    .sort((a, b) => b.publicado.localeCompare(a.publicado));

/** "2026-09-10" -> "10 de septiembre de 2026". En UTC para que la
    zona horaria de la maquina que construye no mueva el dia. */
export const fechaLarga = (iso: string): string =>
  new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
