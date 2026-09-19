/* ============================================================
   CAPTACION DE GRUPOS — MVP SIN SERVIDOR

   QUE ES

   Lo minimo que funciona de verdad: un formulario que reune los datos
   de un grupo y abre WhatsApp con la solicitud ya escrita, hacia el
   numero oficial de Atheron. Eso es todo.

   POR QUE NO HAY ENDPOINT NI BASE DE DATOS

   El formulario de contacto del sitio esta apagado precisamente porque
   respondia "recibimos tu mensaje" sin enviar nada
   (src/data/ajustes.ts). Repetir ese error aqui seria peor. El canal
   que si responde es WhatsApp, asi que la solicitud viaja por ahi y
   solo cuenta como recibida cuando la persona pulsa enviar. La
   pagina lo dice tal cual.

   Consecuencia honesta: no queda ningun registro en el sitio. Cuando
   exista backend (fase 2, ver docs/red-atheron-zipaquira.md), este
   modulo es el unico sitio que cambia: construirMensaje() sigue
   sirviendo y se anade el envio.

   ============================================================
   EL CODIGO DE REFERENCIA — ATH-TRI-xxxxx
   ============================================================

   Cada solicitud lleva una referencia con esta forma:

     ATH-<ALIADO>-<5 caracteres>     ATH-TRI-K7M2Q

   El aliado dice DE DONDE vino el grupo (TRI = La Triada, GUI = la
   guia sin comercio concreto). Los cinco caracteres se generan en el
   navegador: identifican la solicitud dentro de la conversacion de
   WhatsApp, que es donde luego se cruza a mano.

   LO QUE ESTE CODIGO NO ES, Y NO DEBE LEERSE COMO

   - No es un registro de comision. Ninguna condicion comercial con
     ningun comercio se publica ni se calcula aqui.
   - No es unico garantizado: sin servidor no hay quien lo compruebe.
   - No es un descuento ni una prueba de que existe un convenio.

   Es solo la semilla de la atribucion futura: cuando haya backend,
   el mismo formato pasa a ser un identificador real sin cambiar lo
   que ya circula en los mensajes.
   ============================================================ */

import { NUMERO } from './whatsapp';

/** Aliados con codigo propio. El resto usa GUI. */
export const CODIGOS_ORIGEN: Record<string, string> = {
  'la-triada': 'TRI',
};
export const CODIGO_POR_DEFECTO = 'GUI';

/* Sin 0/O ni 1/I/L: se leen por telefono y se copian a mano. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generarCodigo(origen: string): string {
  const aliado = CODIGOS_ORIGEN[origen] ?? CODIGO_POR_DEFECTO;
  const aleatorio = new Uint32Array(5);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(aleatorio);
  } else {
    for (let i = 0; i < 5; i++) aleatorio[i] = Math.floor(Math.random() * 4294967296);
  }
  const cola = Array.from(aleatorio, (n) => ALFABETO[n % ALFABETO.length]).join('');
  return `ATH-${aliado}-${cola}`;
}

export interface SolicitudGrupo {
  codigo: string;
  origen: string;
  nombre: string;
  whatsapp: string;
  fecha: string;
  personas: string;
  ciudad: string;
  servicios: string[];
  observaciones: string;
}

/** Etiquetas de los servicios de interes. La clave es el value del checkbox. */
export const SERVICIOS: Record<string, string> = {
  almuerzo: 'Almuerzo',
  catedral: 'Catedral de Sal',
  hospedaje: 'Hospedaje',
};

/** "2026-09-20" -> "20/09/2026". Sin pasar por Date: evita el salto de zona horaria. */
const fechaLegible = (iso: string): string => {
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

export function construirMensaje(s: SolicitudGrupo): string {
  const servicios = s.servicios.map((k) => SERVICIOS[k] ?? k).join(', ');
  return (
    'Hola, vengo de la Guía Atheron y quiero cotizar la visita de un grupo a Zipaquirá.\n\n' +
    `Referencia: ${s.codigo}\n` +
    `Nombre: ${s.nombre}\n` +
    `WhatsApp: ${s.whatsapp}\n` +
    `Fecha aproximada: ${s.fecha ? fechaLegible(s.fecha) : 'por definir'}\n` +
    `Número aproximado de personas: ${s.personas}\n` +
    `Ciudad de origen: ${s.ciudad}\n` +
    `Me interesa: ${servicios || 'por definir'}\n` +
    `Observaciones: ${s.observaciones || 'ninguna'}`
  );
}

export const enlaceSolicitud = (s: SolicitudGrupo): string =>
  `https://wa.me/${NUMERO}?text=${encodeURIComponent(construirMensaje(s))}`;

/** Rangos para medir sin enviar la cifra exacta ni nada personal. */
export function rangoPersonas(personas: number): string {
  if (personas < 10) return '2-9';
  if (personas < 25) return '10-24';
  if (personas < 50) return '25-49';
  return '50+';
}

/* Copy fijo. Vive aqui para que ninguna pagina lo reescriba distinto:
   no se promete disponibilidad ni tarifa en ningun sitio. */
export const COPY_GRUPO = {
  titulo: '¿Vienes con un grupo a Zipaquirá?',
  entrada:
    'Cuéntanos fecha, número de personas y qué quieres incluir. Te respondemos por WhatsApp.',
  tarifas: 'Tarifas especiales para grupos sujetas a cotización.',
  aviso:
    'Enviar la solicitud no confirma disponibilidad ni tarifa: se confirman al cotizar.',
  privacidad:
    'No guardamos estos datos en el sitio. Se envían por WhatsApp cuando tú pulsas enviar.',
} as const;
