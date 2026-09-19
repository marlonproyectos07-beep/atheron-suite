/* ============================================================
   GALLINA AL VAPOR — EXPERIENCIA GASTRONOMICA PERMANENTE

   QUE ES Y QUE NO ES

   Es una jornada gastronomica especial, que se repite cuando se
   anuncia. NO es un restaurante con horario diario, y ninguna pagina
   puede presentarla asi.

   LA URL ES PERMANENTE, LA JORNADA NO

   /guia-zipaquira/gallina-al-vapor no cambia nunca. Lo que cambia es
   el objeto JORNADA de mas abajo. Para anunciar la proxima:

     1. Editar JORNADA: fecha, precios, lo que incluye.
     2. Volver a construir el sitio.

   Nada mas: ni la pagina, ni el sitemap, ni los enlaces internos
   necesitan tocarse.

   CUANDO LA FECHA PASA
   jornadaVigente() decide, AL CONSTRUIR, si la jornada se anuncia o
   no. Pasada la fecha, la pagina deja de mostrar precios y fecha y
   pasa a "proxima fecha por anunciar", con el WhatsApp para
   preguntar. Igual que la agenda del hub: la comprobacion es al
   construir, asi que si despues de la fecha no hay ningun despliegue,
   el anuncio sigue visible hasta el siguiente. Por eso, el lunes 21 de
   septiembre hay que desplegar o actualizar JORNADA.

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

/** La landing oficial de la jornada. La guia enlaza; no la reemplaza. */
export const LANDING_OFICIAL =
  'https://gallina-al-vapor-20-septiembre.marlon-proyectos07.chatgpt.site';

export const RUTA_GALLINA = '/guia-zipaquira/gallina-al-vapor';

/** Ultima vez que se comprobaron los datos de JORNADA con direccion. */
export const VERIFICADO_EL = '2026-09-19';

export interface Jornada {
  /** AAAA-MM-DD. */
  fechaMaquina: string;
  /** Como se lee en pantalla. */
  fechaTexto: string;
  /** Con dia de la semana, para el titulo y la descripcion. */
  fechaLarga: string;
  precios: { producto: string; valor: string }[];
  incluye: string[];
  preparacion: string;
  /* Titulo del bloque familiar. Es dato y no texto de la maqueta porque
     depende del dia: "este domingo" solo es cierto si la jornada es
     un domingo. Se cambia junto con la fecha. */
  tituloFamiliar: string;
}

export const JORNADA: Jornada = {
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
};

/** true hasta el final del dia de la jornada, hora de Colombia. */
export const jornadaVigente = (hoy: Date = new Date()): boolean =>
  hoy <= new Date(`${JORNADA.fechaMaquina}T23:59:59-05:00`);

/* Mensajes. El primero lleva el contexto de que la persona viene de la
   guia: quien atiende sabe por donde entro. */
export const MENSAJE_PEDIDO =
  `Hola, vengo de la Guía Atheron y quiero información sobre la gallina al vapor ` +
  `del ${JORNADA.fechaLarga}.`;

export const MENSAJE_PROXIMA =
  'Hola, vengo de la Guía Atheron y quiero saber cuándo es la próxima jornada de gallina al vapor.';

export const enlaceGallina = (mensaje: string): string =>
  `https://wa.me/${NUMERO_GALLINA}?text=${encodeURIComponent(mensaje)}`;
