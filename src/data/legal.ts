/* ============================================================
   DATOS LEGALES DEL SITIO — ATH-WEB-META-019

   Una sola fuente para la identificacion de la empresa y para los
   textos legales. El pie, la pagina de informacion legal, la
   politica de privacidad y los terminos leen de aqui, de modo que no
   puedan contradecirse.

   INTERRUPTORES DE PUBLICACION (ATH-PMS-WA-051)
   BORRADOR_LEGAL = true mantiene Terminos e Informacion Legal como
   borradores no indexables, sin enlaces de pie ni entradas en sitemap.
   PUBLICAR_PRIVACIDAD y PUBLICAR_ELIMINACION controlan las otras
   dos paginas independientemente. Se habilitan AQUI solo en la rama
   Draft para preparar y probar la publicacion, sin merge ni despliegue.
   IMPORTANTE: un merge podria publicar estas dos paginas. Antes del
   merge se requiere revision juridica y autorizacion expresa.
   Ver docs/ATH-PMS-WA-051-preparacion-publicacion.md.

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

/* ATH-PMS-WA-051: habilitadas SOLO en PR Draft, con autorizacion
   para preparar. No fusionar ni desplegar sin aprobacion separada.
   BORRADOR_LEGAL protege terminos, informacion legal y RNT. */
export const PUBLICAR_PRIVACIDAD = true;
export const PUBLICAR_ELIMINACION = true;

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

export const VERSION_LEGAL = '1.2';
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

/* FECHA PROVISIONAL (ATH-PMS-WA-051): solo para validar el PR Draft.
   Confirmar o actualizar a la fecha REAL de publicacion en produccion
   ANTES de autorizar el merge. No afirmar vigencia antes de desplegar. */
export const VIGENCIA_LEGAL: string | null = '6 de noviembre de 2026';

export const RUTAS_LEGALES = {
  informacion: '/informacion-legal',
  privacidad: '/politica-de-privacidad',
  terminos: '/terminos-y-condiciones',
  eliminacion: '/eliminacion-de-datos',
} as const;

export const AVISO_BORRADOR_LEGAL =
  'BORRADOR — texto pendiente de aprobación de dirección y revisión jurídica. No es el texto definitivo.';

export const direccionCompleta = `${EMPRESA.direccion}, ${EMPRESA.ciudad}, ${EMPRESA.departamento}, ${EMPRESA.pais}`;
