/* ============================================================
   FICHAS DE LUGARES — LO QUE UNA FICHA PUEDE LLEVAR ADEMAS

   ExperienciaLocal (src/data/experiencias-locales.ts) cubre lo basico
   de un lugar: nombre, direccion, horario, foto. Una FICHA PROPIA
   (/guia-zipaquira/restaurantes-y-cafes/<slug>) admite mas, y eso vive
   aqui para no engordar el modelo que ya usa el hub.

   LA REGLA, IGUAL QUE EN TODA LA GUIA

   Cada campo de abajo es opcional y CADA BLOQUE SE PINTA SOLO SI TIENE
   DATO. Sin dato, no existe en el DOM: ni vacio, ni "proximamente".
   Rellenar un objeto basta para encender su bloque; ni la maqueta ni
   el CSS cambian.

   QUE SE PUEDE INCORPORAR CUANDO LLEGUE

     intro             parrafos propios, escritos por nosotros
     platosDestacados  lo que el local confirma como plato insignia
     menu              enlace a la carta y/o platos con precio. Los
                       precios SOLO salen con fechaPrecios: un precio
                       sin fecha es el que se queda viejo sin avisar
     familias          informacion para familias, tal como la confirma
                       el local
     grupos            capacidad y condiciones para grupos, tal como
                       las confirma el local. No confundir con lo que
                       ofrece Atheron, que es la cotizacion
     rutaCatedral      cercania/ruta a la Catedral de Sal, MEDIDA: sin
                       cifra medida no se escribe ninguna
     galeria           fotografias reales, con procedencia. Nunca de
                       banco ni generadas
     video             un video real del local
     opinionesAtheron  solo visitas reales de Atheron, con fecha. No
                       son reseñas de terceros ni una valoracion
                       agregada: NO existe rating en este sitio

   INDEXACION

   Una ficha con casi nada dentro es contenido delgado, y Google lo
   castiga a nivel de todo el dominio (ver Base.astro). Por eso cada
   ficha nace con indexable: false: sale con noindex,follow y no entra
   en el sitemap. Cuando tenga contenido de verdad, se pone true y las
   dos cosas cambian a la vez: no se pueden desincronizar.
   ============================================================ */

export interface FichaExtra {
  /** false = noindex,follow y fuera del sitemap. */
  indexable: boolean;
  intro?: string[];
  platosDestacados?: string[];
  menu?: {
    enlace?: string;
    /** AAAA-MM-DD. Obligatoria para mostrar precios. */
    fechaPrecios?: string;
    platos?: { plato: string; precio: string }[];
  };
  familias?: string;
  grupos?: string;
  rutaCatedral?: string;
  galeria?: { src: string; alt: string }[];
  video?: { titulo: string; enlace: string };
  opinionesAtheron?: { texto: string; fecha: string }[];
  /** AAAA-MM-DD del ultimo cambio real de la ficha. Alimenta el sitemap. */
  modificado?: string;
}

export const fichasExtra: Record<string, FichaExtra> = {
  'la-triada': {
    indexable: false,
    modificado: '2026-09-19',
  },
};

export const extraDe = (slug: string): FichaExtra =>
  fichasExtra[slug] ?? { indexable: false };

/* ------------------------------------------------------------
   EL HUB /guia-zipaquira/restaurantes-y-cafes

   Misma regla que las fichas, y por el mismo motivo: con UN lugar
   publicado y una carta sin confirmar es un indice delgado. Nace
   noindex,follow y fuera del sitemap. Se pone true cuando haya
   varios lugares verificados con contenido propio; pagina y
   sitemap leen esta misma constante.
   ------------------------------------------------------------ */
export const HUB_RESTAURANTES = {
  ruta: '/guia-zipaquira/restaurantes-y-cafes',
  indexable: false,
  modificado: '2026-09-19',
} as const;
