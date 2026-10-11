/* ============================================================
   MOTOR DE SOLICITUDES DE BEDS24 — un solo sitio donde vive el enlace

   La URL oficial de reserva de Hoteles Atheron lleva SIEMPRE &lang=es.
   Sin ese parametro el motor puede abrirse en otro idioma. No se
   construye por partes ni se copia a mano en las paginas: se importa
   de aqui.

   ALCANCE. propid=359051 es SOLO el Hotel Atheron Suite (201, 202,
   203, 301 y 302). Los demas hospedajes del portafolio y la Casa
   Completa NO pasan por este motor: siguen yendo a WhatsApp, con una
   persona. Por eso las paginas deciden con esHotelAtheronSuite().

   LA SOLICITUD NO ES UN PAGO. El texto que acompana a estos botones
   dice "solicitar" y "consultar", nunca "pagar", y aclara el anticipo.

   ANALITICA: no se instala nada. El boton sale del HTML con
   data-evento="booking_request_click"; main.js ya manda un evento a
   gtag SOLO si gtag existe. Sin gtag no ocurre nada.
   ============================================================ */

export const URL_SOLICITUD_BEDS24 = 'https://beds24.com/booking2.php?propid=359051&lang=es';

export const EVENTO_SOLICITUD = 'booking_request_click';

/** Nombre de la ficha del Hotel Atheron Suite (id de la coleccion y nombre). */
export const ID_HOTEL_ATHERON_SUITE = 'hotel-atheron-suite';
export const esHotelAtheronSuite = (id: string): boolean => id === ID_HOTEL_ATHERON_SUITE;

/** Mensaje comercial breve. Se muestra una vez por pagina, no en cada boton. */
export const MENSAJE_SOLICITUD =
  'Consulta disponibilidad en tiempo real y solicita tu reserva.';
export const AVISO_SOLICITUD =
  'La solicitud queda sujeta a confirmación por Hoteles Atheron. ' +
  'Para confirmar reservas directas se requiere un anticipo del 50%.';

interface OpcionesSolicitud {
  /** De donde sale el clic: "home_hero", "ficha_hero", "menu"... */
  origen: string;
  propiedad?: string;
}

/** Atributos de un enlace al motor de Beds24, listos para {...}. */
export function atributosBeds24(opciones: OpcionesSolicitud) {
  return {
    href: URL_SOLICITUD_BEDS24,
    'data-evento': EVENTO_SOLICITUD,
    'data-evento-origen': opciones.origen,
    'data-evento-propiedad': opciones.propiedad,
    target: '_blank',
    rel: 'noopener noreferrer',
  } as const;
}
