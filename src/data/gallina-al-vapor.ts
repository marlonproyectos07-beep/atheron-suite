/* ============================================================
   GALLINA AL VAPOR — EXPERIENCIA GASTRONOMICA PERMANENTE

   QUE ES Y QUE NO ES

   Es una jornada gastronomica especial, que se repite cuando se
   anuncia. NO es un restaurante con horario diario, y ninguna pagina
   puede presentarla asi.

   LA URL ES PERMANENTE, LA JORNADA NO

   /guia-zipaquira/gallina-al-vapor no cambia nunca. Lo que cambia es
   el CALENDARIO de mas abajo. Para anunciar la proxima jornada se
   anade un objeto a JORNADAS y se vuelve a construir. Nada mas: ni la
   pagina, ni el sitemap, ni los enlaces internos necesitan tocarse, y
   el SEO acumulado de la direccion no se pierde nunca.

   ============================================================
   POR QUE ES UN CALENDARIO Y NO UNA SOLA JORNADA
   ============================================================

   La version anterior tenia una unica JORNADA y decidia AL CONSTRUIR
   si se anunciaba. Eso deja dos agujeros reales:

     1. Si pasa la fecha y nadie despliega, la pagina sigue anunciando
        una jornada vencida, con su precio y su dia, indefinidamente.
        El error no se ve: la pagina esta "bien", solo esta caducada.
     2. Para anunciar la siguiente hay que estar disponible ese dia.

   Ahora hay tres defensas, y ninguna depende de que alguien se
   acuerde:

     A. CALENDARIO. Se pueden dejar cargadas varias fechas por
        adelantado. Al terminar una, la pagina pasa sola a la
        siguiente sin desplegar nada.
     B. RELOJ DEL VISITANTE. La pagina se construye con el estado
        correcto en el momento del build Y ademas lleva el calendario
        dentro. El navegador vuelve a elegir el bloque con la hora
        del visitante (src/components/SelectorJornada.astro). Una
        construccion vieja deja de poder mostrar una fecha vencida.
     C. METADATOS SIN FECHA. El <title>, la meta descripcion y el
        Open Graph son permanentes y no llevan fecha ni precio: aunque
        Google guarde en cache una version antigua, el resultado de
        busqueda nunca anuncia una jornada que ya paso. La fecha vive
        en el cuerpo de la pagina, que es donde puede caducar sin
        enganar a nadie.

   Queda un caso que el codigo no puede resolver solo: que se agote el
   calendario. Cuando eso pasa la pagina dice "fecha por anunciar" y
   ofrece el WhatsApp, que es la verdad. scripts/comprueba-jornadas.mjs
   avisa al construir cuando quedan pocas jornadas por delante, o
   ninguna.

   ============================================================
   DATOS CONFIRMADOS (direccion, 19 de septiembre de 2026)
   ============================================================

   Jornada del domingo 20 de septiembre de 2026:
   - gallina completa: $60.000 COP
   - media gallina:    $32.000 COP
   - incluye gallina, papa, yuca, platano y aji tradicional
   - preparacion aproximada de 5 a 6 horas
   - WhatsApp 312 400 4887
   - el domicilio se consulta por WhatsApp

   LO QUE NO SE AFIRMA, porque nadie lo ha confirmado:
   cuantas personas alimenta cada porcion, hasta que hora se reciben
   pedidos, a que zonas se entrega, direccion del punto de venta,
   metodos de pago, cupos.

   EL WHATSAPP DE GALLINA ES OTRO NUMERO

   No es el de Atheron. Por eso el boton NO usa data-whatsapp (main.js
   lo redirigiria al numero de Atheron). Ver src/data/eventos-red.ts.
   ============================================================ */

/** Numero de Gallina al Vapor, formato internacional sin signos. */
export const NUMERO_GALLINA = '573124004887';
export const NUMERO_GALLINA_VISIBLE = '312 400 4887';

export const RUTA_GALLINA = '/guia-zipaquira/gallina-al-vapor';

/** Identificador del bloque que se pinta cuando no queda ninguna jornada. */
export const SIN_JORNADA = 'por-anunciar';

/** AAAA-MM-DD del ultimo cambio real de esta pagina. Alimenta el sitemap. */
export const MODIFICADO = '2026-09-19';

export interface Jornada {
  /** AAAA-MM-DD. Es tambien el identificador del bloque en la pagina. */
  fechaMaquina: string;
  /** Como se lee en pantalla. */
  fechaTexto: string;
  /** Con dia de la semana, para los titulos del cuerpo de la pagina. */
  fechaLarga: string;
  precios: { producto: string; valor: string }[];
  incluye: string[];
  preparacion: string;
  /* Titulo del bloque familiar. Es dato y no texto de la maqueta porque
     depende del dia: "este domingo" solo es cierto si la jornada es
     un domingo. Se cambia junto con la fecha. */
  tituloFamiliar: string;
  /** Ultima vez que se comprobaron estos datos con direccion. AAAA-MM-DD. */
  verificadoEl: string;
  /* Landing propia de ESA jornada, si la hay. Va dentro de la jornada y
     no suelta en el modulo porque una landing de septiembre no puede
     seguir enlazada cuando la jornada vigente es la de octubre. */
  landing?: string;
}

/* ------------------------------------------------------------
   EL CALENDARIO

   En orden, la mas proxima primero. Se pueden dejar varias cargadas:
   la pagina pasa sola de una a otra. Una jornada que ya paso se puede
   borrar de aqui, pero no hace falta: el codigo la ignora.
   ------------------------------------------------------------ */
export const JORNADAS: Jornada[] = [
  {
    fechaMaquina: '2026-09-20',
    fechaTexto: '20 de septiembre de 2026',
    fechaLarga: 'domingo 20 de septiembre de 2026',
    tituloFamiliar: '¿Plan familiar este domingo?',
    precios: [
      { producto: 'Gallina completa', valor: '$60.000 COP' },
      { producto: 'Media gallina', valor: '$32.000 COP' },
    ],
    incluye: ['Gallina', 'Papa', 'Yuca', 'Plátano', 'Ají tradicional'],
    preparacion: 'Aproximadamente de 5 a 6 horas',
    verificadoEl: '2026-09-19',
    landing:
      'https://gallina-al-vapor-20-septiembre.marlon-proyectos07.chatgpt.site',
  },
];

/* ------------------------------------------------------------
   CONSULTAS

   Colombia no tiene horario de verano, asi que -05:00 es constante y
   se puede escribir fijo sin arrastrar una libreria de zonas.
   ------------------------------------------------------------ */

/** Instante en que la jornada deja de anunciarse, hora de Colombia. */
export const finDeJornada = (j: Jornada): string =>
  `${j.fechaMaquina}T23:59:59-05:00`;

const porFecha = (a: Jornada, b: Jornada) =>
  a.fechaMaquina < b.fechaMaquina ? -1 : a.fechaMaquina > b.fechaMaquina ? 1 : 0;

/** Las que todavia no han terminado, de la mas proxima a la mas lejana. */
export const jornadasPendientes = (hoy: Date = new Date()): Jornada[] =>
  [...JORNADAS]
    .sort(porFecha)
    .filter((j) => new Date(finDeJornada(j)).getTime() >= hoy.getTime());

/** La que se anuncia ahora mismo, o null si no queda ninguna. */
export const jornadaVigente = (hoy: Date = new Date()): Jornada | null =>
  jornadasPendientes(hoy)[0] ?? null;

/* Lo que viaja al navegador para que vuelva a elegir con SU reloj.
   Solo fechas: ni precios ni textos, que ya estan en el HTML. */
export const calendarioCliente = (
  hoy: Date = new Date(),
): { id: string; hasta: string }[] =>
  jornadasPendientes(hoy).map((j) => ({
    id: j.fechaMaquina,
    hasta: finDeJornada(j),
  }));

/* ------------------------------------------------------------
   MENSAJES DE WHATSAPP

   El de pedido lleva la fecha de SU jornada: quien atiende sabe de
   cual se le habla, y de que la persona viene de la guia.
   ------------------------------------------------------------ */
export const mensajePedido = (j: Jornada): string =>
  `Hola, vengo de la Guía Atheron y quiero información sobre la gallina al vapor ` +
  `del ${j.fechaLarga}.`;

export const MENSAJE_PROXIMA =
  'Hola, vengo de la Guía Atheron y quiero saber cuándo es la próxima jornada de gallina al vapor.';

export const enlaceGallina = (mensaje: string): string =>
  `https://wa.me/${NUMERO_GALLINA}?text=${encodeURIComponent(mensaje)}`;
