/**
 * Conjunto de GENERALIZACION: 30 mensajes parafraseados que NO estan en el
 * Playbook y con los que el agente NO se afino. Mide si el agente entiende
 * otras formas de decir lo mismo. Se reporta la tasa de la PRIMERA corrida
 * (antes de corregir nada) y la final.
 */
export const HELD_OUT = [
  { id: 'H01', text: 'Buenas noches, tienen cuartos libres para este viernes?', intent: 'CONSULTA_DISPONIBILIDAD', esc: false },
  { id: 'H02', text: 'cuanto vale una habitacion doble para el 14 de noviembre', intent: 'CONSULTA_PRECIO', esc: false },
  { id: 'H03', text: 'Hola! quisiera saber el precio por noche para 2 adultos el 1 de noviembre', intent: 'CONSULTA_PRECIO', esc: false, odoo: true },
  { id: 'H04', text: 'Hay parqueo?', intent: 'PARQUEADERO', esc: false },
  { id: 'H05', text: 'a que hora debo desocupar la habitacion?', intent: 'CHECKOUT', esc: false, must: /11:00/ },
  { id: 'H06', text: 'queda lejos de la catedral de sal?', intent: 'UBICACION', esc: false },
  { id: 'H07', text: 'Aceptan mascotas pequeñas?', intent: 'MASCOTA', esc: false },
  { id: 'H08', text: 'Somos un grupo de 12 amigos', intent: 'GRUPO', esc: true },
  { id: 'H09', text: 'Necesitamos alojamiento para 30 personas el 5 de diciembre', intent: 'GRUPO', esc: true, mustNot: /caben/ },
  { id: 'H10', text: 'Quisiera hablar con un asesor por favor', intent: 'HABLAR_CON_HUMANO', esc: true },
  { id: 'H11', text: 'me pueden rebajar un poco el precio?', intent: 'DESCUENTO', esc: true },
  { id: 'H12', text: 'ya hice la transferencia, aqui esta el soporte', intent: 'ENVIO_COMPROBANTE', esc: true },
  { id: 'H13', text: 'quiero cancelar mi reserva del sabado', intent: 'CANCELACION', esc: true },
  { id: 'H14', text: 'Estoy afuera del hotel y nadie contesta', intent: 'LLEGADA_INMINENTE', esc: true },
  { id: 'H15', text: 'necesito factura a nombre de mi empresa con NIT', intent: 'FACTURA', esc: true },
  { id: 'H16', text: 'Cual es el valor del anticipo?', intent: 'ANTICIPO', esc: false, must: /50%/ },
  { id: 'H17', text: 'Pueden guardarme las maletas despues del check out?', intent: 'EQUIPAJE', esc: false },
  { id: 'H18', text: 'cotizacion de un sistema de alarma para mi casa', intent: 'FUERA_DE_ALCANCE', esc: true, line: 'ATHERON_SECURITY' },
  { id: 'H19', text: 'Buenas, soy del hotel Sol, les mando un huesped para el 15', intent: 'ALIADO_CONSULTA', esc: true, line: 'ALLY_B2B' },
  { id: 'H20', text: 'Para 4 personas, dos noches desde el 8 de noviembre', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'H21', text: 'hay disponibilidad el fin de semana largo?', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: false },
  { id: 'H22', text: 'tienen cocina?', intent: 'PREGUNTA_PROPIEDAD', esc: false },
  { id: 'H23', text: 'aceptan tarjeta de credito?', intent: 'METODO_PAGO', esc: false, must: /5%/ },
  { id: 'H24', text: 'voy a llegar a las 10 de la noche', intent: 'LLEGADA_TARDE', esc: true },
  { id: 'H25', text: 'estamos 3 adultos y 1 niño de 5 años, el 20 de diciembre', intent: 'CONSULTA_DISPONIBILIDAD', esc: false },
  { id: 'H26', text: 'necesito la habitacion mas barata que tengan para mañana, una persona', intent: 'PRESUPUESTO_LIMITADO', esc: false, odoo: true },
  { id: 'H27', text: 'esto es inaceptable, el wifi no funciona y nadie responde', intent: 'RECLAMO', esc: true },
  { id: 'H28', text: 'puedo pagar el anticipo mañana?', intent: 'ANTICIPO_DIFERIDO', esc: false },
  { id: 'H29', text: 'buenos dias', intent: 'SALUDO_SOLO', esc: false },
  { id: 'H30', text: 'gracias, hasta luego', intent: 'CIERRE', esc: false },
];
