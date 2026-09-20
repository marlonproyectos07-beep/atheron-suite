/* ============================================================
   EVENTOS DE LA RED GASTRONOMICA Y DE GRUPOS

   QUE HAY YA MEDIDO

   GA4 esta instalado (G-KXXM0LJKK9, ver Base.astro y main.js) y solo
   envia datos desde hotelesatheron.com: los previews de Vercel no lo
   contaminan. Todo boton de WhatsApp con data-whatsapp ya emite
   "whatsapp_click" con su origen. Eso NO se toca.

   QUE AÑADE ESTE ARCHIVO

   Los eventos que no son WhatsApp de Atheron:

     triada_click            clic hacia la ficha de La Triada
     lugar_click             clic hacia la ficha de cualquier otro lugar
     gallina_click           clic hacia la pagina de Gallina al Vapor
     gallina_whatsapp_click  clic al WhatsApp PROPIO de Gallina
     hospedaje_click         clic hacia hospedajes desde estas paginas
     group_lead_submit       solicitud de grupo enviada (formulario)

   POR QUE "data-red-evento" Y NO "data-evento"

   "data-evento" ya lo usan la cabecera y la ficha de Casa Colonial, y
   un oyente nuevo sobre ese atributo empezaria a emitir eventos
   distintos a los de hoy sobre botones que ya estan medidos. El
   atributo propio deja lo existente exactamente como esta.

   POR QUE EL WHATSAPP DE GALLINA NO LLEVA data-whatsapp

   main.js reescribe el href de todo [data-whatsapp] hacia el numero de
   Atheron. Gallina tiene su propio numero, y si el boton llevara ese
   atributo el clic abriria el WhatsApp equivocado. Ver
   src/data/gallina-al-vapor.ts.

   PRIVACIDAD

   Ningun evento lleva nombre, telefono ni texto libre del visitante.
   Google Analytics prohibe enviar datos personales, y ademas no hace
   falta para medir: basta el origen, el codigo de referencia y el
   tamano aproximado del grupo.
   ============================================================ */

export const EVENTO_TRIADA = 'triada_click';
export const EVENTO_LUGAR = 'lugar_click';
export const EVENTO_GALLINA = 'gallina_click';
export const EVENTO_GALLINA_WHATSAPP = 'gallina_whatsapp_click';
export const EVENTO_HOSPEDAJE = 'hospedaje_click';
export const EVENTO_SOLICITUD_GRUPO = 'group_lead_submit';

/** El evento de "clic hacia una ficha" segun el lugar. */
export const eventoDeLugar = (slug: string): string =>
  slug === 'la-triada' ? EVENTO_TRIADA : EVENTO_LUGAR;

/** Atributos de un enlace medido. Se reparten con {...atributosRed(...)}. */
export function atributosRed(evento: string, origen: string, destino?: string) {
  return {
    'data-red-evento': evento,
    'data-evento-origen': origen,
    'data-evento-destino': destino,
  };
}
