/* ============================================================
   DATOS LEGALES DEL SITIO — ATH-WEB-META-019

   Una sola fuente para la identificacion de la empresa y para los
   textos legales. El pie, la pagina de informacion legal, la
   politica de privacidad y los terminos leen de aqui, de modo que no
   puedan contradecirse.

   INTERRUPTOR DE PUBLICACION
   BORRADOR_LEGAL = true  (estado actual)
     - Las tres paginas existen pero salen con noindex, nofollow y una
       banda de "borrador".
     - NO se enlazan desde el pie ni desde ningun menu.
     - NO entran en el sitemap.
     Es decir: fusionar esta rama por descuido no cambia lo que ve el
     visitante, y nada de esto llega a buscadores.

   BORRADOR_LEGAL = false (solo con aprobacion de direccion y revision
   juridica, ver docs/ATH-WEB-META-019-legal.md)
     - Las paginas pasan a indexables, entran al sitemap y el pie
       muestra la identificacion y los enlaces legales.

   QUE ES CONFIRMADO Y DE DONDE SALE
   Razon social, NIT, direccion y telefono: RUT y Certificado de
   Existencia y Representacion Legal de la Camara de Comercio de
   Bogota (expedido el 10 de octubre de 2026), cotejados el 3 de
   noviembre de 2026 (ATH-META-WA-015). El numero de WhatsApp sale de
   src/data/whatsapp.ts, la unica copia.

   LO QUE NO ESTA AQUI, A PROPOSITO (regla 4 del proyecto: no inventar)
   Correo de contacto, politicas de anticipo, cancelacion, horarios de
   entrada y salida, plazos de conservacion y cualquier otra condicion
   comercial. Quedan en null: el bloque que dependa de ellos NO se
   muestra hasta que direccion los entregue.
   ============================================================ */

import { NUMERO, NUMERO_VISIBLE } from './whatsapp';

export const BORRADOR_LEGAL = true;

/* ---- La sociedad que opera el sitio ---- */
export const EMPRESA = {
  razonSocial: 'ATHERON S.A.S.',
  nit: '901.881.946-1',
  direccion: 'Carrera 9 N.º 10-32',
  ciudad: 'Zipaquirá',
  departamento: 'Cundinamarca',
  pais: 'Colombia',
  nombreComercial: 'Atheron Suite',
  whatsapp: NUMERO_VISIBLE,
  whatsappTel: `+${NUMERO}`,
} as const;

/* ---- Registro Nacional de Turismo ----
   El RNT 235267 esta a nombre de una PERSONA NATURAL, no de la
   sociedad, y su categoria es Casa Turistica. Por eso se presenta
   siempre separado de ATHERON S.A.S. y nunca como "registro de la
   empresa". Vence el 31 de marzo de 2027 y hay que renovarlo cada
   ano: la fecha se muestra para que no quede publicado un numero
   vencido, y se debe revisar antes de cada 31 de marzo.

   El numero se publica SOLO en las paginas legales, no en una ficha
   de hospedaje concreta: el certificado no nombra un establecimiento,
   asi que no se sabe a cual de los hospedajes del sitio corresponde. */
export const RNT = {
  numero: '235267',
  titular: 'persona natural',
  categoria: 'Casa Turística',
  vigenteHasta: '31 de marzo de 2027',
  /* Mostrar el nombre del titular en la pagina publica es una decision
     de direccion (es un dato personal de una persona natural, aunque el
     RNT oficial es consultable). Por defecto NO se muestra. */
  mostrarNombreTitular: false,
  nombreTitular: 'Marlon Mauricio Parra Villarreal',
} as const;

/* ---- Datos que direccion todavia no ha entregado ---- */
export const CORREO_CONTACTO: string | null = null;

/** Condiciones comerciales de la reserva. Todas null hasta que
    direccion las defina; cada bloque solo se pinta si tiene valor. */
export const CONDICIONES_RESERVA = {
  anticipo: null as string | null,
  medioDePago: null as string | null,
  cancelacion: null as string | null,
  cambiosDeFecha: null as string | null,
  entradaYSalida: null as string | null,
  menoresYMascotas: null as string | null,
  normasDeConvivencia: null as string | null,
};

export const VERSION_LEGAL = '1.0 (borrador)';
/* Fecha de entrada en vigencia: se completa al aprobar. null = no se muestra. */
export const VIGENCIA_LEGAL: string | null = null;

export const RUTAS_LEGALES = {
  informacion: '/informacion-legal',
  privacidad: '/politica-de-privacidad',
  terminos: '/terminos-y-condiciones',
} as const;

export const AVISO_BORRADOR_LEGAL =
  'BORRADOR — texto pendiente de aprobación de dirección y revisión jurídica. No es el texto definitivo.';

export const direccionCompleta = `${EMPRESA.direccion}, ${EMPRESA.ciudad}, ${EMPRESA.departamento}, ${EMPRESA.pais}`;
