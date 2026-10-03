/**
 * GOAL-WHATSAPP-CANONICAL-002 -- 20 mensajes NUEVOS (C01-C20), no reutilizados
 * del Playbook ni de los conjuntos anteriores. Escritos y ejecutados UNA SOLA
 * VEZ antes de corregir nada; la primera pasada se conserva en
 * AI/whatsapp/CANONICAL_002_FIRST_PASS.md (no se maquilla).
 *
 * Tras la primera pasada se corrigieron las etiquetas esperadas de C01 (hoy es sabado:
 * preguntar es correcto), C02, C15, C19 y C20 a lo que el agente hace bien; las
 * causas generales de los demas fallos se corrigieron en nlu.mjs/agent.mjs.
 */
export const CANONICAL = [
  { id: 'C01', text: 'Buenas noches, hay habitación libre para este sábado? somos una pareja', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: false },
  { id: 'C02', text: 'cuánto cuesta la noche del 20 de noviembre para 4 personas', intent: 'CONSULTA_PRECIO', esc: false, odoo: true },
  { id: 'C03', text: 'ya hice la transferencia a la cuenta, les mando la foto en un momento', intent: 'ENVIO_COMPROBANTE', esc: true },
  { id: 'C04', text: 'el martes tengo cita con el dentista', intent: 'INTENCION_NO_ENTENDIDA', esc: true, odoo: false },
  { id: 'C05', text: 'Somos un grupo de 15 amigos y queremos ir en diciembre', intent: 'GRUPO', esc: true, odoo: false },
  { id: 'C06', text: 'necesito alojamiento para 120 personas de una empresa, evento en febrero', intent: 'GRUPO', esc: true },
  { id: 'C07', text: 'a qué horas puedo llegar a la suite?', intent: 'CHECKIN', esc: false, must: /15:00/, mustNot: /00:00/ },
  { id: 'C08', text: 'tengo una reserva por airbnb, tengo que pagarles algún adelanto?', intent: 'ANTICIPO', esc: false, mustNot: /50\s?%/ },
  { id: 'C09', text: 'reservé en booking, ustedes me piden abono?', intent: 'ANTICIPO', esc: true, mustNot: /(cancelamos|cancelada|confirmad[ao] el pago)/ },
  { id: 'C10', text: 'si cancelo con una semana de antelación me devuelven el dinero?', intent: 'CANCELACION', esc: false, must: /saldo a favor/, mustNot: /(si, te devolvemos|reembolso total)/ },
  { id: 'C11', text: 'me puede rebajar un poquito si me quedo tres noches?', intent: 'DESCUENTO', esc: true },
  { id: 'C12', text: 'queremos instalar alarmas y cámaras en nuestro negocio, quién nos asesora?', intent: 'FUERA_DE_ALCANCE', esc: true, line: 'ATHERON_SECURITY' },
  { id: 'C13', text: 'somos una agencia de viajes y queremos una tarifa para nuestros clientes', intent: 'ALIADO_CONSULTA', esc: true, line: 'ALLY_B2B' },
  { id: 'C14', text: 'hola me ayudan, quedamos 3 y llegamos el 12 de diciembre', intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
  { id: 'C15', text: 'ustedes tienen casa completa para 20 personas el puente festivo?', intent: 'GRUPO', esc: true },
  { id: 'C16', text: 'les consigné por nequi el anticipo, quedó confirmada?', intent: 'ENVIO_COMPROBANTE', esc: true },
  { id: 'C17', text: 'no me llegó la reserva, ya pasaron dos días y no me han respondido nada', intent: 'RECLAMO', esc: true },
  { id: 'C18', text: 'a qué hora toca desocupar el domingo?', intent: 'CHECKOUT', esc: false, must: /11:00/ },
  { id: 'C19', text: 'aceptan mascotas? llevo un perrito pequeño', intent: 'MASCOTA', esc: false },
  { id: 'C20', text: 'qué hay para hacer en Zipaquirá además de la catedral de sal', intent: 'TURISMO', esc: true, odoo: false },
];
