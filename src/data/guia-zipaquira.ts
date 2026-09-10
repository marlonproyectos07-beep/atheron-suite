/* ============================================================
   GUIA ATHERON — ZIPAQUIRA

   QUE ES ESTE ARCHIVO
   Todo el contenido de /guia-zipaquira. La maqueta decide como se
   ve; que se dice se decide aqui.

   QUE NO ES ESTA GUIA
   No es un blog, ni un "top 10", ni un directorio, ni TripAdvisor
   copiado. Es lo que le contariamos a un huesped que nos pregunta
   "¿y que mas hago aqui?".

   EL OBJETIVO EDITORIAL, DICHO SIN ADORNOS
   Mucha gente viene a la Catedral de Sal y se vuelve a Bogota el
   mismo dia. La guia existe para enseñar que hay razones para
   quedarse. Si lo consigue, el hospedaje se vende solo.

   Lo que NO se hace para conseguirlo: afirmar como dato que "el 90 %
   de los visitantes se va el mismo dia". No tenemos ese estudio. Se
   cuenta lo que hay que ver, y que cada uno saque la cuenta.

   ============================================================
   POR QUE ESTA CIUDAD ESTA EN UN OBJETO
   ============================================================

   Zipaquira es el piloto. Detras vendran otras ciudades, y la
   arquitectura tiene que permitirlo sin rehacer la pagina. Pero
   tampoco se monta un CMS para una sola ciudad: los datos van
   separados de la maqueta y ya esta. Cuando exista la segunda
   ciudad se vera que sobra de verdad, no antes.

   ============================================================
   REGLA DE DATOS
   ============================================================

   Todo lo que puede cambiar -horarios, tarifas, servicios, accesos-
   lleva fuente y fecha, o no se publica. Y no se copian textos de
   terceros: se parafrasea.
   ============================================================ */

import { ENLACE_DISPONIBILIDAD } from './whatsapp';

/** Identidad de la ciudad. El dia que haya otra, se clona esto. */
export const CIUDAD = {
  slug: 'zipaquira',
  nombre: 'Zipaquirá',
  departamento: 'Cundinamarca',
  ruta: '/guia-zipaquira',
} as const;

/* ------------------------------------------------------------
   HERO
   ------------------------------------------------------------ */
export const hero = {
  ceja: 'Guía Atheron · Zipaquirá',
  titulo: 'Descubre Zipaquirá',
  texto:
    'Catedral de Sal, gastronomía, historia, naturaleza y experiencias locales. ' +
    'Organiza tu visita y descubre todo lo que puedes vivir en Zipaquirá y sus alrededores.',
  /* El segundo boton lleva a hospedajes y no a WhatsApp: quien acaba
     de llegar a una guia todavia esta decidiendo si viene, no
     cuantas noches. El canal directo aparece mas abajo, donde la
     intencion ya es otra. */
  ctaPrimario: { texto: 'Explorar la guía', href: '#descubrir' },
  ctaSecundario: { texto: 'Dónde hospedarse', href: '/hospedajes' },
};

/* ------------------------------------------------------------
   ¿QUE QUIERES DESCUBRIR?

   El indice visual de la guia. Y el sitio donde es mas facil
   mentir: basta con poner nueve tarjetas bonitas y que seis no
   lleven a ninguna parte.

   Regla: una categoria SOLO es enlazable si su destino existe y
   tiene contenido de verdad. Las demas salen visibles pero
   apagadas, diciendo que estan en preparacion. Preferimos que se
   vea que la guia esta creciendo a fingir que ya esta terminada:
   una tarjeta que no responde es una promesa rota, y son las que el
   visitante recuerda.
   ------------------------------------------------------------ */
export interface Categoria {
  id: string;
  titulo: string;
  /** Una linea. Que va a encontrar si entra. */
  texto: string;
  /** Sin destino, la tarjeta no es enlazable. */
  href?: string;
  /** true = el destino sale del sitio hacia otra pagina nuestra. */
  externa?: boolean;
}

export const categorias: Categoria[] = [
  {
    id: 'catedral',
    titulo: 'Catedral de Sal',
    texto: 'Horario, los tres pasaportes y cómo organizar la visita.',
    href: '/zipaquira/catedral-de-sal',
    externa: true,
  },
  {
    id: 'centro-historico',
    titulo: 'Centro histórico',
    texto: 'La plaza, la catedral diocesana y las calles que se recorren a pie.',
    href: '#centro-historico',
  },
  {
    id: 'alrededores',
    titulo: 'Alrededores',
    texto: 'Neusa y Nemocón, a un rato en carro del centro.',
    href: '#alrededores',
  },
  {
    id: 'itinerario',
    titulo: 'Qué hacer en dos días',
    texto: 'Una forma de repartir la visita sin correr.',
    href: '#itinerario',
  },
  {
    id: 'grupos',
    titulo: 'Viajes en grupo',
    texto: 'Cómo organizamos el alojamiento de un grupo que viene a Zipaquirá.',
    href: '/grupos',
    externa: true,
  },
  {
    id: 'hospedaje',
    titulo: 'Dónde hospedarse',
    texto: 'Nuestros hospedajes en el municipio y en los alrededores.',
    href: '/hospedajes',
    externa: true,
  },
  /* Las dos de abajo NO llevan href. Cuando existan lugares
     verificados en src/data/experiencias-locales.ts, se les pone el
     destino y se encienden solas. */
  {
    id: 'donde-comer',
    titulo: 'Dónde comer',
    texto: 'Estamos verificando sitio por sitio antes de recomendar ninguno.',
  },
  {
    id: 'cafes',
    titulo: 'Cafés y experiencias',
    texto: 'En preparación, con el mismo criterio: solo lo que hemos comprobado.',
  },
];

/* ------------------------------------------------------------
   MAS ALLA DE LA CATEDRAL

   La seccion que justifica la guia entera. Nada de aqui es un dato
   que se pueda quedar viejo: son descripciones del lugar, no
   horarios ni precios.
   ------------------------------------------------------------ */
export const centroHistorico = {
  id: 'centro-historico',
  ceja: 'Más allá de la Catedral',
  titulo: 'El centro histórico se recorre a pie',
  parrafos: [
    'La plaza principal y la catedral diocesana concentran la parte colonial del ' +
      'municipio. Alrededor hay cafés, restaurantes y calles que se caminan sin prisa: ' +
      'es una escala amable, de las que se recorren en una tarde.',
    'Es también la diferencia entre venir a Zipaquirá y venir solo a la Catedral. ' +
      'La visita subterránea ocupa media jornada; lo que se hace con la otra media ' +
      'es lo que decide si el viaje merecía quedarse a dormir.',
  ],
  /* Sin horarios ni tarifas de atracciones del centro: no estan
     verificados. Cuando se comprueben, entran aqui con su fecha. */
};

/* ------------------------------------------------------------
   ALREDEDORES

   Los dos primeros descubrimientos fuera del casco urbano. Cada uno
   con su municipio REAL: es el error mas facil y mas caro de esta
   guia, porque manda a alguien a un sitio equivocado.
   ------------------------------------------------------------ */
export interface Descubrimiento {
  id: string;
  nombre: string;
  /** El municipio de verdad. Nunca "Zipaquirá" por defecto. */
  municipio: string;
  parrafos: string[];
  /** Datos cortos y verificados. Nada estimado. */
  datos?: string[];
  /** A donde lleva, si tenemos algo nuestro que ofrecer ahi. */
  enlace?: { texto: string; href: string; nota?: string };
  fechaUltimaVerificacion: string;
  fuentes: { nombre: string; url: string }[];
}

export const alrededores: Descubrimiento[] = [
  {
    id: 'neusa',
    nombre: 'Embalse del Neusa',
    municipio: 'Cogua y Tausa',
    parrafos: [
      'Un embalse rodeado de bosque de pinos y eucaliptos, a más de 3.000 metros ' +
        'de altura, dentro de un parque forestal que administra la Corporación ' +
        'Autónoma Regional de Cundinamarca. Es el contrapeso natural de un viaje ' +
        'que, si no, se queda todo bajo tierra y entre calles.',
      'El parque tiene zonas de camping, senderos, áreas de picnic con asadores y ' +
        'restaurantes. Se va en carro, y es un plan de día completo más que una ' +
        'parada rápida.',
    ],
    datos: ['Parque forestal administrado por la CAR', 'A unos 3.100 m de altitud'],
    /* Casa Neusa esta en Cogua, no en Zipaquira. La nota lo dice en
       vez de dejarlo implicito: un grupo que reserve creyendo que
       duerme en Zipaquira lo descubre al repartir habitaciones. */
    enlace: {
      texto: 'Ver Casa Neusa',
      href: '/hospedajes/casa-neusa',
      nota: 'Casa Neusa está en Cogua, no en Zipaquirá. El embalse queda a unos 20 minutos en carro desde la casa.',
    },
    fechaUltimaVerificacion: '2026-09-10',
    fuentes: [
      { nombre: 'CAR Cundinamarca', url: 'https://www.car.gov.co/' },
      {
        nombre: 'Cundinamarca DeTour',
        url: 'https://detour.cundinamarca.gov.co/geomarker/parque-embalse-del-neusa-en-cogua-y-tausa',
      },
    ],
  },
  {
    id: 'nemocon',
    nombre: 'Mina de Sal de Nemocón',
    municipio: 'Nemocón',
    parrafos: [
      'La otra mina de sal de la sabana, y la que casi nadie tiene en el plan. ' +
        'Un recorrido subterráneo a unos 80 metros de profundidad por una ' +
        'explotación con más de cinco siglos de historia, con cámaras de espejos ' +
        'de salmuera que devuelven el reflejo del techo sobre el agua.',
      'Está en el municipio de Nemocón, no en Zipaquirá: es una salida aparte, ' +
        'no una parada dentro de la visita a la Catedral de Sal.',
    ],
    /* NI HORARIO NI TARIFA. La investigacion previa encontro cifras
       que no coinciden entre fuentes, y el sitio del operador no se
       pudo leer. Publicar una tarifa que no cuadre en taquilla es
       una queja garantizada. Se enlaza y punto. */
    fechaUltimaVerificacion: '2026-09-10',
    fuentes: [
      {
        nombre: 'Alcaldía de Nemocón',
        url: 'https://www.nemocon-cundinamarca.gov.co/directorio-institucional/mina-de-sal-de-nemocon',
      },
      {
        nombre: 'Cundinamarca DeTour',
        url: 'https://detour.cundinamarca.gov.co/geomarker/mina-de-sal-de-nemocon',
      },
    ],
  },
];

/* ------------------------------------------------------------
   ITINERARIO DE DOS DIAS

   UNA forma de repartir la visita, no LA forma. Sin horas exactas y
   sin nombrar ningun establecimiento: no tenemos tiempos de
   trayecto medidos ni sitios verificados, y un itinerario con horas
   inventadas se nota en la primera hora del primer dia.
   ------------------------------------------------------------ */
export const itinerario = {
  id: 'itinerario',
  ceja: '¿Y si te quedas un poco más?',
  titulo: 'Zipaquirá en dos días',
  entrada:
    'La Catedral de Sal se ve en media jornada. Con una noche de por medio, el ' +
    'viaje cambia de forma: da tiempo a ver el centro sin reloj, cenar con calma ' +
    'y salir temprano hacia los alrededores.',
  dias: [
    {
      rotulo: 'Día 1',
      titulo: 'La ciudad',
      pasos: [
        'Catedral de Sal por la mañana, que es cuando está más tranquila.',
        'Comida y paseo por el centro histórico.',
        'Tarde sin plan fijo: la plaza, los cafés, las calles coloniales.',
      ],
    },
    {
      rotulo: 'Día 2',
      titulo: 'Los alrededores',
      pasos: [
        'Salida temprano hacia el Embalse del Neusa o la Mina de Sal de Nemocón.',
        'Día completo fuera del casco urbano.',
        'Regreso, o segunda noche si el plan se alarga.',
      ],
    },
  ],
  /* Se dice que es una propuesta. No es una coletilla legal: es que
     de verdad no es la unica manera de hacerlo. */
  aviso:
    'Es una propuesta, no la única ruta posible. Los tiempos dependen de cómo ' +
    'viajes y de dónde te alojes.',
};

/* ------------------------------------------------------------
   MENSAJES DE WHATSAPP DE LA GUIA

   Salen del modulo central (src/data/whatsapp.ts). Aqui solo se
   escribe el texto, que lleva el contexto de que la persona viene
   de la guia: quien atiende sabe por donde entro y de que hablar.
   ------------------------------------------------------------ */
export const WA_GUIA =
  'Hola, estoy organizando una visita a Zipaquirá y encontré la Guía Atheron. ' +
  'Quiero consultar hospedaje.\n\n' +
  'Fecha de llegada:\n' +
  'Fecha de salida:\n' +
  'Número de huéspedes:';

export const WA_GUIA_GRUPO =
  'Hola, encontré la Guía Atheron de Zipaquirá. Somos un grupo de ___ personas y ' +
  'queremos organizar nuestra visita y hospedaje.\n\n' +
  'Fecha de llegada:\n' +
  'Fecha de salida:\n' +
  'Tipo de grupo:';

/* Enlace de respaldo, por si alguna maqueta necesita el generico. */
export const ENLACE_GENERICO = ENLACE_DISPONIBILIDAD;

/* ------------------------------------------------------------
   INDEPENDENCIA EDITORIAL

   Se publica en la pagina, no solo aqui. Mientras no haya convenios
   con nadie, decirlo en voz alta es lo que hace creible el dia que
   si los haya y se declaren.
   ------------------------------------------------------------ */
export const INDEPENDENCIA =
  'Esta guía es independiente. Atheron no vende entradas de la Catedral de Sal ' +
  'ni de la Mina de Sal de Nemocón, no es operador autorizado de ninguna de las ' +
  'dos y no tiene convenio con los sitios que menciona. Lo que recomendamos, lo ' +
  'recomendamos porque lo hemos comprobado.';
