/** Tercera medida: 15 mensajes NUEVOS (B16-B30), escritos antes de ejecutarlos. */
export const BLIND = [
  { id: 'B16', text: 'Hola, necesito una habitación para el puente festivo de noviembre, somos 2', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: false },
  { id: 'B17', text: 'cual es el precio de la suite 301 para 6 personas', intent: 'CONSULTA_PRECIO', esc: false, odoo: false },
  { id: 'B18', text: 'Mi esposa está embarazada, ¿hay habitación en primer piso?', intent: 'PREGUNTA_PROPIEDAD', esc: true },
  { id: 'B19', text: 'buenas, ¿tienen disponibilidad para el sábado 21 de noviembre? somos 3', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'B20', text: 'no me ha llegado la confirmación de mi reserva', intent: 'RECLAMO', esc: true },
  { id: 'B21', text: 'disculpe, ¿puedo llevar a mi gato?', intent: 'MASCOTA', esc: false },
  { id: 'B22', text: 'queremos reservar para 4 adultos 3 noches empezando el 2 de diciembre', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'B23', text: 'A qué hora puedo hacer el ingreso?', intent: 'CHECKIN', esc: false, must: /15:00/ },
  { id: 'B24', text: 'necesito que me envíen la factura de mi estadía', intent: 'FACTURA', esc: true },
  { id: 'B25', text: 'hola, ¿está disponible el hotel para año nuevo?', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: false },
  { id: 'B26', text: 'Me cobraron de más en mi reserva', intent: 'RECLAMO', esc: true },
  { id: 'B27', text: 'una pregunta, ¿el hotel queda en el centro?', intent: 'UBICACION', esc: false },
  { id: 'B28', text: 'somos 5 personas y queremos 2 habitaciones el 28 de noviembre', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'B29', text: 'mil gracias por todo, excelente atención', intent: 'CIERRE', esc: false },
  { id: 'B30', text: '¿tienen algún plan para parejas?', intent: 'PAREJA', esc: false },
];
