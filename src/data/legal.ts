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
   Plazos de conservacion, medios de pago, condiciones concretas de
   cancelacion y otras condiciones no aprobadas permanecen pendientes.
   Los datos comerciales autorizados en ATH-WEB-META-022 se mantienen
   como borrador hasta la revision juridica y la orden de publicacion.
   ============================================================ */

import { NUMERO, NUMERO_VISIBLE } from './whatsapp';

export const BORRADOR_LEGAL = true;

/* ATH-PMS-WA-042: preparacion para publicación independiente.
   Ambos permanecen APAGADOS hasta nueva autorización de gerencia.
   BORRADOR_LEGAL sigue protegiendo terminos e informacion legal. */
export const PUBLICAR_PRIVACIDAD = false;
export const PUBLICAR_ELIMINACION = false;

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
  /* Direccion autorizo mostrar el nombre del titular en la pagina legal
     (ATH-WEB-META-022); sigue en borrador hasta revision juridica. */
  mostrarNombreTitular: true,
  nombreTitular: 'Marlon Mauricio Parra Villarreal',
} as const;

/* ---- Contacto autorizado por gerencia en ATH-WEB-META-022 ---- */
export const CORREO_CONTACTO: string | null = 'comercialgsc001@gmail.com';

/** Condiciones aprobadas en ATH-WEB-META-022. Los campos restantes
    siguen pendientes; cada bloque se muestra solamente si tiene valor. */
export const CONDICIONES_RESERVA = {
  anticipo: 'Para reservas directas, el anticipo solicitado será entre el 30 % y el 50 % del valor de la reserva, según las condiciones informadas en la cotización o confirmación correspondiente.' as string | null,
  medioDePago: null as string | null,
  cancelacion: 'Las cancelaciones y eventuales devoluciones se rigen por las condiciones específicas comunicadas y aceptadas al confirmar cada reserva.' as string | null,
  cambiosDeFecha: null as string | null,
  entradaYSalida: 'Horario habitual de entrada (check-in): 3:00 p. m. Horario habitual de salida (check-out): 11:00 a. m. Cualquier excepción debe confirmarse previamente.' as string | null,
  menoresYMascotas: null as string | null,
  normasDeConvivencia: null as string | null,
};

export const VERSION_LEGAL = '1.2 (borrador)';
/* ---- Línea WhatsApp Cloud API (ATH-WEB-META-039/042) ----
   Línea registrada en Meta, con webhook configurado, pero aún SIN
   prueba real de recepción en Odoo. No afirmar que ya funciona.
   No hay automatización de respuestas ni reservas por ese canal.
   Antes de activarla, revisar y actualizar la política de privacidad.
   El canal de recepción actual sigue siendo EMPRESA.whatsapp. */
export const LINEA_CLOUD_API = {
  numero: '+57 301 803 5593',
  numeroTel: '+573018035593',
} as const;

/* Fecha de entrada en vigencia: se completa al aprobar. null = no se muestra. */
export const VIGENCIA_LEGAL: string | null = null;

export const RUTAS_LEGALES = {
  informacion: '/informacion-legal',
  privacidad: '/politica-de-privacidad',
  terminos: '/terminos-y-condiciones',
  eliminacion: '/eliminacion-de-datos',
} as const;

export const AVISO_BORRADOR_LEGAL =
  'BORRADOR — texto pendiente de aprobación de dirección y revisión jurídica. No es el texto definitivo.';

export const direccionCompleta = `${EMPRESA.direccion}, ${EMPRESA.ciudad}, ${EMPRESA.departamento}, ${EMPRESA.pais}`;
