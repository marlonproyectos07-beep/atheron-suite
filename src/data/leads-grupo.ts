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

   Vive en src/data/codigos-referido.ts, que es el mismo modulo que
   usa el piloto Atheron x La Triada. Aqui solo se reexporta lo que
   ya importaban otras partes del sitio.

   Desde el piloto, el quinto caracter es de control: detecta una
   letra mal copiada y el intercambio de dos contiguas. El formato no
   cambia. Lo que el codigo NO es -registro de comision, unicidad
   garantizada, prueba de convenio- esta explicado alli, y sigue
   siendo cierto.
   ============================================================ */

import { NUMERO } from './whatsapp';

export { CODIGOS_ORIGEN, CODIGO_POR_DEFECTO, generarCodigo } from './codigos-referido';

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
