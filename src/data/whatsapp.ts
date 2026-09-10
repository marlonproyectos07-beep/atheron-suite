/* ============================================================
   WHATSAPP — un solo sitio donde se construye el enlace

   POR QUE EXISTE ESTE ARCHIVO

   El recorrido de cliente que hizo direccion el 9 de septiembre de
   2026 encontro el problema mas caro del sitio: pulsar "Ver
   disponibilidad" NO abria WhatsApp. Llevaba a una landing, y desde
   la landing habia que buscar otro boton. Dos o tres clics para
   empezar una conversacion que el visitante ya habia decidido tener.

   Cada clic intermedio pierde gente. El boton que dice "ver
   disponibilidad" tiene que abrir el canal donde se responde, en un
   clic, con el mensaje ya escrito.

   QUE HACE ESTE ARCHIVO

   Construye la direccion completa de wa.me con el texto codificado.
   El enlace queda escrito EN EL HTML al construir el sitio, no lo
   pone JavaScript. Eso importa: hasta hoy el destino real lo escribia
   main.js al cargar, y un visitante que pulsara antes de que el guion
   montara -o con el guion bloqueado- se iba a "#contacto" o a la
   landing. Ahora el href correcto ya esta ahi desde el primer byte y
   el guion solo le anade el codigo promocional si lo hay.

   EL NUMERO SE ESCRIBE UNA VEZ

   Estaba repetido en tres sitios: main.js, src/data/ajustes.ts y a
   mano en algunas maquetas. Tres copias de un telefono son tres
   oportunidades de que una se quede vieja. Esta es la copia buena;
   ajustes.ts la reexporta para no romper lo que ya la importaba.
   ============================================================ */

/** Numero oficial de Atheron Suite, en formato internacional sin signos. */
export const NUMERO = '573188983167';

/** El mismo numero, escrito para leerlo. */
export const NUMERO_VISIBLE = '+57 318 898 3167';

/* ------------------------------------------------------------
   MENSAJE GLOBAL DE DISPONIBILIDAD

   Los tres campos van en lineas separadas y VACIOS a proposito.
   WhatsApp respeta el salto de linea, asi que al cliente le llega
   una plantilla que solo tiene que rellenar. Preguntarselo en prosa
   -"cuentanos fechas y personas"- obliga a redactar, y redactar es
   justo la friccion que estamos quitando.
   ------------------------------------------------------------ */
export const MENSAJE_DISPONIBILIDAD =
  'Hola, quiero consultar disponibilidad en Atheron Suite.\n\n' +
  'Fecha de llegada:\n' +
  'Fecha de salida:\n' +
  'Número de huéspedes:';

/** El mismo mensaje, pero nombrando la propiedad que el visitante mira. */
export const mensajeDisponibilidadDe = (propiedad: string): string =>
  `Hola, quiero consultar disponibilidad de ${propiedad}.\n\n` +
  'Fecha de llegada:\n' +
  'Fecha de salida:\n' +
  'Número de huéspedes:';

/* ------------------------------------------------------------
   MENSAJE DE GRUPOS

   Un grupo no pregunta lo mismo que una pareja: el numero de
   personas y el tipo de evento cambian por completo la respuesta,
   asi que se piden desde el primer mensaje.
   ------------------------------------------------------------ */
export const MENSAJE_GRUPO =
  'Hola, quiero cotizar alojamiento para un grupo en Zipaquirá.\n\n' +
  'Número de personas:\n' +
  'Fecha de llegada:\n' +
  'Fecha de salida:\n' +
  'Tipo de grupo/evento:';

/** Igual, con la cifra ya puesta cuando el visitante la elige en el planificador. */
export const mensajeGrupoDe = (personas: string): string =>
  `Hola, necesito alojamiento para aproximadamente ${personas} personas en Zipaquirá.\n\n` +
  'Fecha de llegada:\n' +
  'Fecha de salida:\n' +
  'Tipo de grupo/evento:';

/* ------------------------------------------------------------
   CONSTRUCTOR DEL ENLACE

   encodeURIComponent y no encodeURI: el segundo deja pasar "#",
   "&" y "+" sin codificar, y cualquiera de los tres corta el texto
   a mitad de mensaje. Con "#" ya paso en otro sitio del proyecto.
   ------------------------------------------------------------ */
export const enlaceWhatsApp = (mensaje: string): string =>
  `https://wa.me/${NUMERO}?text=${encodeURIComponent(mensaje)}`;

/** Enlace de disponibilidad general. El que usa el boton del menu. */
export const ENLACE_DISPONIBILIDAD = enlaceWhatsApp(MENSAJE_DISPONIBILIDAD);

/** Enlace de cotizacion de grupo. */
export const ENLACE_GRUPO = enlaceWhatsApp(MENSAJE_GRUPO);

/* ------------------------------------------------------------
   ATRIBUTOS COMUNES DE UN ENLACE A WHATSAPP

   target="_blank" para no sacar al visitante de la pagina que
   estaba viendo, y rel="noopener noreferrer" porque una pestana
   abierta asi puede manipular la que la abrio si no se le corta el
   acceso. Se escriben aqui una vez y se reparten con {...}.
   ------------------------------------------------------------ */
export const ATRIBUTOS_WHATSAPP = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;

/* ------------------------------------------------------------
   NOMBRES DE EVENTO PARA LA ANALITICA QUE TODAVIA NO EXISTE

   HOY NO HAY GA4 NI NINGUNA OTRA MEDICION INSTALADA. No se anade
   una: instalar analitica es una decision con implicaciones de
   privacidad y de rendimiento que no le corresponde a este sprint.

   Lo que si se deja hecho es la semantica. Cada boton de WhatsApp
   sale del HTML diciendo QUE es y DE DONDE viene:

     data-evento="whatsapp_availability"
     data-evento-origen="home_hero"
     data-evento-propiedad="Hotel Atheron Suite"

   El dia que se instale la medicion, es un solo oyente sobre
   [data-evento] y todos los botones del sitio quedan medidos sin
   tocar ni una maqueta. Sin esto habria que volver a recorrer las
   nueve paginas para etiquetarlas una por una.
   ------------------------------------------------------------ */
export const EVENTO_DISPONIBILIDAD = 'whatsapp_availability';
export const EVENTO_GRUPO = 'whatsapp_group_quote';

interface OpcionesEnlace {
  /** De donde sale el clic: "home_hero", "ficha_pie", "menu_movil"... */
  origen: string;
  /** Nombre de la propiedad, cuando el boton pertenece a una. */
  propiedad?: string;
  /** Nombre del evento. Por defecto, consulta de disponibilidad. */
  evento?: string;
}

/** Todos los atributos de un enlace a WhatsApp, listos para {...}. */
export function atributosWhatsApp(mensaje: string, opciones: OpcionesEnlace) {
  return {
    href: enlaceWhatsApp(mensaje),
    'data-whatsapp': mensaje,
    'data-evento': opciones.evento ?? EVENTO_DISPONIBILIDAD,
    'data-evento-origen': opciones.origen,
    'data-evento-propiedad': opciones.propiedad,
    ...ATRIBUTOS_WHATSAPP,
  };
}
