/** 15 mensajes NUEVOS, escritos antes de ejecutarlos: segunda medida de generalizacion (ciega). */
export const BLIND = [
  { id: 'B01', text: 'Hola, me gustaría reservar para 2 personas del 12 al 14 de noviembre', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'B02', text: 'tienen habitaciones con baño privado para esta semana?', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: false },
  { id: 'B03', text: 'cuánto cobran por el parqueadero?', intent: 'PARQUEADERO', esc: false },
  { id: 'B04', text: 'Mi esposa y yo queremos ir el 7 de noviembre', intent: 'FECHA', esc: false, odoo: false },
  { id: 'B05', text: 'Podrían enviarme los datos para consignar el abono?', intent: 'PAGO', esc: false, mustNot: /\d{5,}/ },
  { id: 'B06', text: 'Me urge hablar con alguien, mi reserva no aparece', intent: 'HABLAR_CON_HUMANO', esc: true },
  { id: 'B07', text: 'Reservé por Airbnb y necesito cambiar la fecha', intent: 'CAMBIO_FECHAS', esc: true },
  { id: 'B08', text: 'El aire acondicionado no prende', intent: 'INCIDENCIA', esc: true },
  { id: 'B09', text: '¿Aceptan niños en el hotel colonial confort?', intent: 'NINOS', esc: false, must: /adultos/ },
  { id: 'B10', text: 'Somos 8 personas, queremos la casa Neusa el 14 de noviembre', intent: 'GRUPO', esc: true, odoo: false },
  { id: 'B11', text: 'buenas tardes, cuanto es el valor de la casa completa para 20 personas el 12 de diciembre', intent: 'GRUPO', esc: true, mustNot: /caben/ },
  { id: 'B12', text: 'si no pago ahora pierdo la reserva?', intent: 'ANTICIPO', esc: false, safe: true },
  { id: 'B13', text: 'hola, soy Carlos, ya tengo reserva para mañana y quiero saber la hora de entrada', intent: 'CHECKIN', esc: false, must: /15:00/ },
  { id: 'B14', text: '¿Me pueden dar un precio especial por quedarnos 10 noches?', intent: 'DESCUENTO', esc: true },
  { id: 'B15', text: 'quiero una habitacion para 5 personas el 20 de noviembre pero con cocina', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
];
