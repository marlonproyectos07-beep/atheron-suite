/* ============================================================
   EXPERIENCIAS LOCALES — restaurantes, cafes y sitios de la ciudad

   QUE ES ESTO

   Es el modelo de un lugar de la ciudad que NO es nuestro: un
   restaurante, un cafe, un museo, un mirador. La guia de Zipaquira
   va a llenarse de ellos, y hay interes comercial en convertir a
   algunos en aliados.

   La lista estuvo VACIA a proposito hasta el 19 de septiembre de
   2026, y el criterio no ha cambiado: un lugar entra solo con lo que
   se puede sostener. No hay direccion, ni horario, ni fotografia con
   procedencia, ni permiso que se publique sin comprobar. Un horario
   inventado es un cliente que llega y se encuentra cerrado.

   Es el mismo criterio que ya se aplico a los testimonios de grupos
   en src/data/grupos.ts: la estructura se deja hecha, y el dia que
   llegue el dato real es rellenar un campo. Ni la maqueta ni el CSS
   cambian.

   ============================================================
   LOS TRES ESTADOS, Y POR QUE NO SE PUEDEN CONFUNDIR
   ============================================================

   INFORMATIVO
     El lugar existe y sus datos estan verificados. Nada mas. Es el
     unico estado que puede tener un sitio con el que no hemos
     hablado nunca.

   RECOMENDADO
     Ademas, Atheron lo recomienda. Es una decision EDITORIAL: la
     toma alguien que ha estado y responde por ella. NO se compra,
     no la da una comision y no la da que el sitio nos caiga bien.

   ALIADO
     Ademas, existe un convenio FIRMADO. Solo entonces pueden
     aparecer el distintivo de aliado y el beneficio.

   LA REGLA QUE SOSTIENE TODO ESTO:
   una comision no compra una mejor posicion editorial. Si algun dia
   hay contenido patrocinado, se identifica como tal. El dia que un
   lector descubra que "recomendado" significaba "nos paga", la guia
   entera deja de valer, y con ella la razon por la que alguien
   confiaria en nuestras recomendaciones de hospedaje.

   ============================================================
   DIVULGAR EL VINCULO NO ES PUBLICAR EL ACUERDO
   ============================================================

   Hay un hueco entre los tres estados: un lugar con el que EXISTE
   una relacion comercial pero cuyo convenio todavia no se puede
   declarar como firmado sigue apareciendo como INFORMATIVO, es decir,
   como si no hubiera ningun interes detras. Eso es lo que las guias
   de divulgacion de vinculos comerciales consideran enganoso, y es
   un riesgo real de reputacion.

   El campo divulgacionComercial cierra ese hueco. Dice que la
   relacion existe y que no condiciona lo que se publica. NO dice
   -y no puede decir nunca- porcentajes, comisiones, cupos, plazos
   ni ninguna otra condicion privada: eso no aparece en el sitio ni
   en este repositorio. Ver docs/red-atheron-zipaquira.md.

   ============================================================
   BAGATELA E INDULTO — NO ESTAN AQUI, Y ES DELIBERADO
   ============================================================

   Direccion conoce al propietario de Bagatela y hay interes en
   conversar con Indulto. Conversar no es un acuerdo. Hasta que
   exista un convenio firmado NO pueden aparecer como aliados, ni
   con beneficio, ni con porcentaje, ni con Atheron Pass. Y hasta
   que tengamos sus datos verificados y su permiso, tampoco pueden
   aparecer como fichas informativas.

   Cuando llegue el momento: se anade el objeto, con estado
   INFORMATIVO primero. El resto viene despues, y cada escalon
   necesita algo real detras.
   ============================================================ */

/** Que relacion tiene Atheron con este lugar. Ver arriba. */
export type EstadoComercial = 'INFORMATIVO' | 'RECOMENDADO' | 'ALIADO';

/** Si la ficha se pinta o no. Un borrador nunca sale. */
export type EstadoPublicacion = 'BORRADOR' | 'PUBLICADO';

export interface ExperienciaLocal {
  /* --- Identidad --- */
  slug: string;
  nombre: string;
  /** "Café", "Restaurante", "Museo", "Mirador"... */
  categoria: string;
  /* La ciudad va en la ficha, no se deduce de la carpeta: el dia que
     exista la guia de otra ciudad, el mismo componente sirve. Y evita
     el error de Casa Neusa, que esta en Cogua y no en Zipaquira. */
  ciudad: string;

  /* --- Lo que se cuenta --- */
  /** Dos o tres lineas. Escritas por nosotros, no copiadas del sitio. */
  descripcion: string;
  /** "Café · desayuno · pausa por el centro". Ayuda a decidir rapido. */
  idealPara?: string;
  /** Lo concreto que el visitante va a encontrar. */
  queEncontraras?: string[];

  /* --- Como llegar y cuando --- */
  direccion?: string;
  /** Solo si se ha comprobado. Un horario viejo es peor que ninguno. */
  horarios?: { dia: string; horas: string }[];
  coordenadas?: { lat: number; lon: number };
  mapa?: string;

  /* --- Contacto propio del lugar, no el nuestro --- */
  sitioOficial?: string;
  telefono?: string;
  whatsapp?: string;
  /** Solo la cuenta oficial, y solo si se ha verificado que lo es. */
  redSocial?: string;

  /* --- Imagen --- */
  /* Sin fotografia legitima, se queda sin foto y la tarjeta funciona
     igual. NUNCA se rellena con una imagen de banco, ni con una
     generada, ni con la foto de otro sitio. */
  foto?: string;
  fotoAlt?: string;

  /* --- Relacion comercial --- */
  estadoComercial: EstadoComercial;
  /* Por que lo recomendamos. Obligatorio si el estado es RECOMENDADO:
     una recomendacion sin motivo no es una recomendacion, es un
     anuncio. */
  motivoRecomendacion?: string;
  /* Solo con convenio firmado. Los tres van juntos: sin descripcion
     no hay beneficio que mostrar. */
  beneficio?: {
    titulo: string;
    descripcion: string;
    /** true = hara falta el Atheron Pass, que TODAVIA NO EXISTE. */
    requiereAtheronPass: boolean;
    /** Identificador del aliado para la futura atribucion. */
    codigoPartner?: string;
    /** Desde cuando y hasta cuando. Sin vigencia no se publica. */
    vigencia?: { desde: string; hasta?: string };
  };

  /* Vinculo comercial declarado, SIN condiciones. Una frase corta,
     visible en la tarjeta y en la ficha. Se pone en cuanto existe
     cualquier interes economico, aunque el estado siga siendo
     INFORMATIVO. Nunca lleva cifras ni terminos del acuerdo. */
  divulgacionComercial?: string;

  /* --- Trazabilidad --- */
  /** AAAA-MM-DD. Cuando se comprobo por ultima vez lo de arriba. */
  fechaUltimaVerificacion?: string;
  /** De donde salio cada dato que puede cambiar. */
  fuentes?: string[];
  estadoPublicacion: EstadoPublicacion;

  /* --- Ficha propia --- */
  /* Ruta de la ficha completa dentro de la guia. Solo si existe la
     pagina: la tarjeta pinta "Ver ficha" unicamente cuando esto esta
     puesto, asi que no puede enlazar a un 404. Las fichas se generan
     solas desde esta lista: src/pages/guia-zipaquira/restaurantes-y-cafes/[slug].astro */
  rutaFicha?: string;
}

/* ------------------------------------------------------------
   LA LISTA

   Estuvo vacia hasta el 19 de septiembre de 2026, y sigue el mismo
   criterio: un lugar entra solo con lo que se puede sostener.

   LA TRIADA — INFORMATIVO, Y SOLO CON TRES DATOS
   Nombre, categoria y ciudad. Aparece como "Restaurante La Triada" en
   el listado de turismo del Gobierno de Cundinamarca (Detour). Ni la
   direccion, ni los horarios, ni la carta, ni los precios, ni la
   capacidad, ni los servicios para familias o grupos estan
   confirmados POR EL LOCAL: cuando los confirme, se anaden aqui y
   la ficha los pinta sola. Ver docs/red-atheron-zipaquira.md.

   Estado INFORMATIVO y no RECOMENDADO: recomendar es una decision
   editorial de quien ha estado y responde por ella, y hoy no la
   hay. Tampoco ALIADO: la insignia de aliado afirma "convenio
   firmado, que se declara", y lo que hay confirmado por direccion es
   que existe una relacion comercial, no un convenio publicable.

   PERO LA RELACION SE DECLARA. Direccion confirmo que existe. Dejar
   la ficha como simple INFORMATIVO seria presentarla como si no
   hubiera ningun interes detras, y eso es lo que hace enganosa una
   guia. Por eso lleva divulgacionComercial: se dice que la relacion
   existe, no se dice ni una sola condicion. Ninguna comision, ningun
   porcentaje y ningun termino del acuerdo aparece en el sitio ni en
   este repositorio.
   ------------------------------------------------------------ */
export const experienciasLocales: ExperienciaLocal[] = [
  {
    slug: 'la-triada',
    nombre: 'La Triada',
    categoria: 'Restaurante',
    ciudad: 'Zipaquirá',
    descripcion:
      'Restaurante en Zipaquirá. Esta ficha está en construcción: publicaremos la carta, ' +
      'los horarios y los servicios para familias y grupos cuando el local los confirme.',
    estadoComercial: 'INFORMATIVO',
    divulgacionComercial:
      'Atheron mantiene una relación comercial con este establecimiento. ' +
      'No condiciona lo que publicamos: los datos se comprueban igual y una ' +
      'comisión no compra posición editorial.',
    fechaUltimaVerificacion: '2026-09-19',
    fuentes: ['Listado «Restaurante La Triada» en Detour Cundinamarca (Gobierno de Cundinamarca)'],
    estadoPublicacion: 'PUBLICADO',
    rutaFicha: '/guia-zipaquira/restaurantes-y-cafes/la-triada',
  },
];

/* ------------------------------------------------------------
   CONSULTAS

   La maqueta nunca filtra por su cuenta: si tuviera que acordarse
   de excluir los borradores, algun dia se le olvidaria en una
   pagina y publicaria un sitio a medias.
   ------------------------------------------------------------ */

/** Las publicables de una ciudad. Es lo unico que puede pintarse. */
export const experienciasDe = (ciudad: string): ExperienciaLocal[] =>
  experienciasLocales.filter(
    (e) => e.estadoPublicacion === 'PUBLICADO' && e.ciudad === ciudad,
  );

/** De una categoria concreta, dentro de una ciudad. */
export const experienciasPorCategoria = (
  ciudad: string,
  categoria: string,
): ExperienciaLocal[] =>
  experienciasDe(ciudad).filter((e) => e.categoria === categoria);

/* ------------------------------------------------------------
   PUERTA A LA ATRIBUCION QUE VENDRA

   El dia que existan el Atheron Pass, el portal de aliados y la
   conciliacion en Odoo, el camino es:

     ciudad -> aliado -> sede -> visitante -> referido
            -> Atheron Pass -> redencion -> venta atribuida
            -> comision -> liquidacion -> Odoo

   Este archivo cubre los tres primeros escalones -ciudad, aliado y
   sus datos- y deja el gancho de "codigoPartner" para el cuarto. Lo
   demas es backend y NO existe todavia.

   Por eso aqui no hay ni un boton, ni un endpoint, ni un QR: un
   boton que promete un beneficio que nadie puede canjear es peor
   que no tener el boton.
   ------------------------------------------------------------ */
