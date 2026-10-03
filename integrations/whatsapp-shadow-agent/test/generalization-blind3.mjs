/** Cuarta medida: 15 mensajes NUEVOS (B31-B45), escritos antes de ejecutarlos. */
export const BLIND = [
  { id: 'B31', text: 'Hola buenas, queria saber si tienen cupo para el 5 de diciembre, somos 3', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'B32', text: 'me gustaria cancelar la reserva que hice por booking', intent: 'CANCELACION', esc: true },
  { id: 'B33', text: 'cuanto es lo que debo transferir para apartar la habitacion', intent: 'ANTICIPO', esc: false },
  { id: 'B34', text: 'ayer nos fue muy bien en el partido', intent: 'INTENCION_NO_ENTENDIDA', esc: true, odoo: false },
  { id: 'B35', text: 'necesitamos 40 habitaciones para una convencion en marzo', intent: 'GRUPO', esc: true, odoo: false },
  { id: 'B36', text: 'a que hora es la salida el domingo', intent: 'CHECKOUT', esc: false, must: /11:00/ },
  { id: 'B37', text: 'les envie el pago por nequi, ya me confirman?', intent: 'ENVIO_COMPROBANTE', esc: true },
  { id: 'B38', text: 'Venden cámaras de vigilancia?', intent: 'FUERA_DE_ALCANCE', esc: true, line: 'ATHERON_SECURITY' },
  { id: 'B39', text: 'quiero que me atienda una persona, no un robot', intent: 'HABLAR_CON_HUMANO', esc: true },
  { id: 'B40', text: 'tienen algo mas barato que 100 mil por noche?', intent: 'PRESUPUESTO_LIMITADO', esc: false },
  { id: 'B41', text: 'buenas tardes', intent: 'SALUDO_SOLO', esc: false },
  { id: 'B42', text: 'estamos en la puerta y nadie abre', intent: 'LLEGADA_INMINENTE', esc: true },
  { id: 'B43', text: 'puedo cambiar la fecha de mi reserva directa sin perder lo que pague?', intent: 'CAMBIO_FECHAS', esc: true },
  { id: 'B44', text: 'el 15 de noviembre', intent: 'FECHA', esc: false, odoo: false },
  { id: 'B45', text: 'hola, podrian darme informacion de los hoteles', intent: 'INTENCION_NO_ENTENDIDA', esc: true, odoo: false },
];
