/**
 * ATH-HOTELS-SIRE-TRA-001 · Manifiesto declarativo de lo que se crea en Odoo (y NADA mas).
 * Reutiliza sale.order, resource.resource, survey y x_guests_line; crea solo x_establishment, x_report_attempt y x_tra_amount.
 * Todo registro lleva xmlid en el modulo NS (inventario, repeticion y reversion).
 * Sin valores por defecto de negocio: códigos SIRE, catalogos TRA y costo quedan vacios hasta verificarse.
 */
export const NS = '__ath_sire_tra__';

const sel = (...pairs) => pairs.map(([value, name], i) => ({ value, name, sequence: i + 1 }));
const STATES = sel(['no_aplica', 'No aplica'], ['pendiente', 'Pendiente'], ['en_envio', 'En envío'], ['enviado', 'Enviado'], ['aceptado', 'Aceptado'], ['rechazado', 'Rechazado'], ['incierto', 'Incierto']);

export const MODELS = [
  { model: 'x_establishment', name: 'Establecimiento SIRE/TRA' },
  { model: 'x_report_attempt', name: 'Intento de reporte SIRE/TRA' },
  { model: 'x_tra_amount', name: 'Importe pagado confirmado (TRA)' },
];

/** [modelo, campo, tipo, etiqueta, extra] */
export const FIELDS = [
  // --- x_establishment: PROPERTY_ID independiente del PMS; titular RNT, operador y reportante SIRE separados ---
  ['x_establishment', 'x_name', 'char', 'Nombre', { required: true }],
  ['x_establishment', 'x_code', 'char', 'Código de propiedad (PROPERTY_ID)', { required: true }],
  ['x_establishment', 'x_active', 'boolean', 'Activo', {}],
  ['x_establishment', 'x_address_partner_id', 'many2one', 'Dirección (contacto)', { relation: 'res.partner' }],
  ['x_establishment', 'x_rnt_number', 'char', 'Número RNT', {}],
  ['x_establishment', 'x_rnt_holder_id', 'many2one', 'Titular del RNT', { relation: 'res.partner' }],
  ['x_establishment', 'x_rnt_expiry', 'date', 'Vencimiento RNT', {}],
  ['x_establishment', 'x_operator_company_id', 'many2one', 'Operador (compañía)', { relation: 'res.company' }],
  ['x_establishment', 'x_sire_reporter_id', 'many2one', 'Quien reporta a SIRE', { relation: 'res.partner' }],
  ['x_establishment', 'x_sire_company_code', 'char', 'SIRE: código del hotel', {}],
  ['x_establishment', 'x_sire_city_code', 'char', 'SIRE: código de ciudad', {}],
  ['x_establishment', 'x_sire_move_in_code', 'char', 'SIRE: código movimiento entrada', {}],
  ['x_establishment', 'x_sire_move_out_code', 'char', 'SIRE: código movimiento salida', {}],
  ['x_establishment', 'x_sire_date_format', 'char', 'SIRE: formato de fecha (strftime)', {}],
  ['x_establishment', 'x_sire_encoding', 'selection', 'SIRE: codificación', { selection: sel(['utf-8', 'UTF-8'], ['latin-1', 'Latin-1']) }],
  ['x_establishment', 'x_sire_codes_verified', 'boolean', 'SIRE: códigos verificados con el paquete de guía', {}],
  ['x_establishment', 'x_sire_export_enabled', 'boolean', 'SIRE: exportador habilitado', {}],
  ['x_establishment', 'x_tra_mode', 'selection', 'TRA: modo', { selection: sel(['manual', 'Manual (portal)'], ['api', 'API PMS'], ['no_aplica', 'No aplica']) }],
  ['x_establishment', 'x_tra_accommodation_type', 'char', 'TRA: tipo de acomodación (valor oficial)', {}],
  ['x_establishment', 'x_tra_cost_basis', 'selection', 'TRA: base del costo', { selection: sel(['total_estancia', 'Total de la estancia'], ['por_noche', 'Por noche']) }],
  ['x_establishment', 'x_tra_config_verified', 'boolean', 'TRA: configuración verificada con MinCIT', {}],
  // Nombre que se envia a TRA segun el registro oficial (RNT), separado del nombre interno x_name, que no se envia.
  ['x_establishment', 'x_tra_establishment_name', 'char', 'TRA: nombre del establecimiento (registro oficial RNT)', {}],
  ['x_establishment', 'x_tra_establishment_name_source', 'char', 'TRA: fuente del nombre (documento y fecha)', {}],
  ['x_establishment', 'x_analytic_account_id', 'many2one', 'Cuenta analitica', { relation: 'account.analytic.account' }],
  // --- unidades: Casa Completa es derivada, nunca sexta habitación ---
  ['resource.resource', 'x_establishment_id', 'many2one', 'Establecimiento', { relation: 'x_establishment' }],
  ['resource.resource', 'x_unit_kind', 'selection', 'Tipo de unidad', { selection: sel(['fisica', 'Física'], ['derivada', 'Derivada']) }],
  ['resource.resource', 'x_component_ids', 'many2many', 'Unidades que la componen', { relation: 'resource.resource', relation_table: 'x_ath_resource_component_rel', column1: 'x_parent_id', column2: 'x_component_id' }],
  // --- catalogos oficiales: vacios hasta tener el paquete de guía SIRE ---
  ['l10n_latam.identification.type', 'x_sire_code', 'char', 'Código SIRE', {}],
  ['res.country', 'x_sire_code', 'char', 'Código SIRE', {}],
  // --- invitacion por reserva (reutiliza survey.user_input) ---
  ['survey.user_input', 'x_sale_order_id', 'many2one', 'Reserva', { relation: 'sale.order' }],
  ['survey.user_input', 'x_ath_state', 'selection', 'Estado del registro', { selection: sel(['invitado', 'Invitado'], ['procesado', 'Procesado'], ['error', 'Error'], ['revocado', 'Revocado']) }],
  ['survey.user_input', 'x_ath_error', 'char', 'Error de procesamiento', {}],
  ['survey.user_input', 'x_ath_processed_at', 'datetime', 'Procesado el', {}],
  ['survey.user_input', 'x_ath_url', 'char', 'Enlace para el huésped', {}],
  ['survey.user_input', 'x_ath_contact_gap', 'char', 'Datos de contacto faltantes', {}],
  ['survey.user_input', 'x_ath_message', 'text', 'Mensaje preparado para el huésped (no enviado)', {}],
  ['survey.user_input', 'x_ath_lock', 'integer', 'Bloqueo (técnico)', {}],
  // evidencia: version del formulario/aviso, fecha y respuestas tal como llegaron (solo administradores)
  ['survey.user_input', 'x_ath_form_version', 'char', 'Versión del formulario y aviso', {}],
  ['survey.user_input', 'x_ath_submitted_at', 'datetime', 'Recibido el', {}],
  ['survey.user_input', 'x_ath_snapshot', 'text', 'Respuestas recibidas (evidencia)', { groups: ['base.group_system'] }],
  // --- x_guests_line (existente, de booking_engine): participacion de cada huésped ---
  ['x_guests_line', 'x_doc_type_id', 'many2one', 'Tipo de documento', { relation: 'l10n_latam.identification.type' }],
  ['x_guests_line', 'x_given_names', 'char', 'Nombres', {}],
  ['x_guests_line', 'x_surname_1', 'char', 'Primer apellido', {}],
  ['x_guests_line', 'x_surname_2', 'char', 'Segundo apellido', {}],
  ['x_guests_line', 'x_residence_city_id', 'many2one', 'Ciudad de residencia', { relation: 'res.city' }],
  ['x_guests_line', 'x_residence_text', 'char', 'Residencia (texto)', {}],
  ['x_guests_line', 'x_residence_country_id', 'many2one', 'País de residencia', { relation: 'res.country' }],
  ['x_guests_line', 'x_origin_city_id', 'many2one', 'Ciudad de procedencia', { relation: 'res.city' }],
  ['x_guests_line', 'x_origin_text', 'char', 'Procedencia (texto)', {}],
  ['x_guests_line', 'x_origin_country_id', 'many2one', 'País de procedencia', { relation: 'res.country' }],
  ['x_guests_line', 'x_destination_text', 'char', 'Próximo destino (texto)', {}],
  ['x_guests_line', 'x_destination_country_id', 'many2one', 'País proximo destino', { relation: 'res.country' }],
  ['x_guests_line', 'x_travel_reason', 'char', 'Motivo de viaje (declarado)', {}],
  ['x_guests_line', 'x_is_main', 'boolean', 'Huésped principal', {}],
  ['x_guests_line', 'x_consent', 'boolean', 'Consentimiento de datos', {}],
  ['x_guests_line', 'x_consent_at', 'datetime', 'Consentimiento el', {}],
  ['x_guests_line', 'x_data_state', 'selection', 'Estado de los datos', { selection: sel(['borrador', 'Borrador'], ['recibido', 'Recibido'], ['validado', 'Validado'], ['rechazado', 'Rechazado']) }],
  ['x_guests_line', 'x_data_source', 'selection', 'Origen de los datos', { selection: sel(['formulario', 'Formulario'], ['recepcion', 'Recepción'], ['contingencia_smoobu', 'Contingencia Smoobu']) }],
  ['x_guests_line', 'x_validated_at', 'datetime', 'Validado el', {}],
  ['x_guests_line', 'x_user_input_id', 'many2one', 'Formulario de origen', { relation: 'survey.user_input' }],
  ['x_guests_line', 'x_establishment_id', 'many2one', 'Establecimiento', { relation: 'x_establishment' }],
  ['x_guests_line', 'x_arrived_at', 'datetime', 'Llegada real', {}],
  ['x_guests_line', 'x_departed_at', 'datetime', 'Salida real', {}],
  // Registro tardio: la hora REAL del movimiento la escribe Recepcion; la hora y el usuario de CAPTURA los pone Odoo.
  ['x_guests_line', 'x_arrival_input', 'datetime', 'Hora real de llegada (a registrar)', {}],
  ['x_guests_line', 'x_departure_input', 'datetime', 'Hora real de salida (a registrar)', {}],
  ['x_guests_line', 'x_movement_reason', 'char', 'Motivo (registro tardío o corrección)', {}],
  ['x_guests_line', 'x_arrival_captured_at', 'datetime', 'Llegada capturada el', { readonly: true }],
  ['x_guests_line', 'x_arrival_captured_by', 'many2one', 'Llegada capturada por', { relation: 'res.users', readonly: true }],
  ['x_guests_line', 'x_departure_captured_at', 'datetime', 'Salida capturada el', { readonly: true }],
  ['x_guests_line', 'x_departure_captured_by', 'many2one', 'Salida capturada por', { relation: 'res.users', readonly: true }],
  ['x_guests_line', 'x_movement_log', 'text', 'Bitácora de llegada y salida', { readonly: true }],
  ['x_guests_line', 'x_is_foreign', 'boolean', 'Extranjero', { store: true, readonly: true, depends: 'x_nationality', compute: "for r in self:\n    r['x_is_foreign'] = bool(r.x_nationality) and r.x_nationality.code != 'CO'" }],
  ['x_guests_line', 'x_sire_in_state', 'selection', 'SIRE entrada', { selection: STATES }],
  ['x_guests_line', 'x_sire_out_state', 'selection', 'SIRE salida', { selection: STATES }],
  ['x_guests_line', 'x_tra_state', 'selection', 'TRA', { selection: STATES }],
  ['x_guests_line', 'x_tra_external_id', 'char', 'TRA: identificador devuelto', {}],
  ['x_guests_line', 'x_claim_ref', 'char', 'Reclamo (técnico)', {}],
  ['x_guests_line', 'x_lock_rev', 'integer', 'Bloqueo (técnico)', {}],
  ['x_guests_line', 'x_last_error', 'char', 'Último error u observación', {}],
  ['x_guests_line', 'x_tra_room', 'char', 'TRA: habitación', { store: false, readonly: true, depends: 'x_room_resource_id', compute: "for r in self:\n    n = (r.x_room_resource_id.name or '').split(' ')[0]\n    r['x_tra_room'] = n if n.isdigit() else ''" }],
  // fechas que TRA acepto (copia al momento de la aceptacion; solo lectura) y discrepancia con la estancia posterior
  ['x_guests_line', 'x_tra_rep_checkin', 'date', 'TRA: check-in aceptado', { readonly: true }],
  ['x_guests_line', 'x_tra_rep_checkout', 'date', 'TRA: check-out aceptado', { readonly: true }],
  ['x_guests_line', 'x_date_gap', 'selection', 'Discrepancia de fechas', { selection: sel(['prorroga', 'Prórroga'], ['anticipada', 'Salida anticipada']), store: true, readonly: true, depends: 'x_tra_state,x_tra_rep_checkout,x_departed_at,x_sale_order_id.x_checkout', compute: "for r in self:\n    gap = False\n    rep = r.x_tra_rep_checkout\n    if r.x_tra_state == 'aceptado' and rep:\n        d = r.x_departed_at\n        if d:\n            day = d.date()\n            cur = day if d.hour >= 5 else day.fromordinal(day.toordinal() - 1)\n        else:\n            cur = r.x_sale_order_id.x_checkout\n        if cur and cur > rep:\n            gap = 'prorroga'\n        elif cur and cur < rep:\n            gap = 'anticipada'\n    r['x_date_gap'] = gap" }],
  ['x_guests_line', 'x_order_checkin', 'date', 'Check-in previsto', { related: 'x_sale_order_id.x_checkin', readonly: true }],
  ['x_guests_line', 'x_order_checkout', 'date', 'Check-out previsto', { related: 'x_sale_order_id.x_checkout', readonly: true }],
  // --- intentos: solo crear y leer (ACL); la evidencia se adjunta al crear ---
  ['x_report_attempt', 'x_name', 'char', 'Descripción', {}],
  ['x_report_attempt', 'x_guest_line_id', 'many2one', 'Huésped', { relation: 'x_guests_line', required: true, on_delete: 'restrict' }],
  ['x_report_attempt', 'x_sale_order_id', 'many2one', 'Reserva', { relation: 'sale.order', related: 'x_guest_line_id.x_sale_order_id', store: true, readonly: true }],
  ['x_report_attempt', 'x_system', 'selection', 'Sistema', { required: true, selection: sel(['sire_entrada', 'SIRE entrada'], ['sire_salida', 'SIRE salida'], ['tra', 'TRA']) }],
  ['x_report_attempt', 'x_channel', 'selection', 'Canal', { required: true, selection: sel(['portal_manual', 'Portal (manual)'], ['archivo_sire', 'Archivo SIRE'], ['api_tra', 'API TRA'], ['simulador', 'Simulador (pruebas)']) }],
  ['x_report_attempt', 'x_result', 'selection', 'Resultado', { required: true, selection: sel(['enviado', 'Enviado'], ['aceptado', 'Aceptado'], ['rechazado', 'Rechazado'], ['incierto', 'Incierto'], ['error_previo', 'Error antes de enviar'], ['no_recibido', 'Comprobado: no recibido']) }],
  ['x_report_attempt', 'x_external_id', 'char', 'Identificador oficial', {}],
  ['x_report_attempt', 'x_http_status', 'integer', 'Estado HTTP', {}],
  ['x_report_attempt', 'x_error_code', 'char', 'Código de error', {}],
  ['x_report_attempt', 'x_reported_checkin', 'date', 'Check-in reportado', {}],
  ['x_report_attempt', 'x_reported_checkout', 'date', 'Check-out reportado', {}],
  ['x_report_attempt', 'x_run_ref', 'char', 'Ejecución', {}],
  ['x_report_attempt', 'x_actor', 'char', 'Actor declarado (no autenticado)', {}],
  ['x_report_attempt', 'x_evidence', 'binary', 'Evidencia', {}],
  ['x_report_attempt', 'x_evidence_name', 'char', 'Nombre de la evidencia', {}],
  ['x_report_attempt', 'x_note', 'text', 'Nota', {}],
  ['x_guests_line', 'x_attempt_ids', 'one2many', 'Intentos', { relation: 'x_report_attempt', relation_field: 'x_guest_line_id', readonly: true }],
  // --- importe pagado confirmado (campo "costo" de TRA). NO es un pago contable ni lo crea: registra lo efectivamente
  // pagado con su evidencia, moneda y fecha de corte. Sin estado confirmado (accion sa_amount_confirm) el emisor bloquea.
  ['x_tra_amount', 'x_name', 'char', 'Descripción', {}],
  ['x_tra_amount', 'x_sale_order_id', 'many2one', 'Reserva', { relation: 'sale.order', required: true, on_delete: 'restrict' }],
  ['x_tra_amount', 'x_amount', 'float', 'Importe pagado confirmado', {}],
  ['x_tra_amount', 'x_currency_id', 'many2one', 'Moneda', { relation: 'res.currency' }],
  ['x_tra_amount', 'x_cutoff_date', 'date', 'Fecha de corte (pagos recibidos hasta)', {}],
  ['x_tra_amount', 'x_evidence_kind', 'selection', 'Tipo de evidencia', { selection: sel(['comprobante_pago', 'Comprobante de pago (transferencia, datáfono, recibo de caja)'], ['liquidacion_canal', 'Liquidación o extracto del canal de venta'], ['factura_pagada', 'Factura con pago registrado'], ['extracto_bancario', 'Extracto bancario']) }],
  ['x_tra_amount', 'x_evidence_ref', 'char', 'Referencia de la evidencia', {}],
  ['x_tra_amount', 'x_evidence', 'binary', 'Evidencia (archivo)', {}],
  ['x_tra_amount', 'x_evidence_name', 'char', 'Nombre del archivo de evidencia', {}],
  // MinCIT, respuesta oficial 2-2026-039958, punto 7: costo total de alojamiento del principal y sus acompanantes, sin
  // impuestos. Constancias expresas de quien registra; sin ellas no se confirma ni se envia.
  ['x_tra_amount', 'x_excludes_taxes', 'boolean', 'El importe no incluye impuestos', {}],
  ['x_tra_amount', 'x_covers_all_guests', 'boolean', 'Cubre el alojamiento del principal y de todos sus acompañantes', {}],
  ['x_tra_amount', 'x_state', 'selection', 'Estado', { selection: sel(['borrador', 'Reportado, sin confirmar'], ['confirmado', 'Confirmado con evidencia'], ['anulado', 'Anulado']) }],
  ['x_tra_amount', 'x_confirmed_by', 'many2one', 'Confirmado por', { relation: 'res.users', readonly: true }],
  ['x_tra_amount', 'x_confirmed_at', 'datetime', 'Confirmado el', { readonly: true }],
  ['x_tra_amount', 'x_note', 'text', 'Nota', {}],
];

export const ACLS = [
  { xmlid: 'acl_establishment_user', model: 'x_establishment', group: 'base.group_user', perms: [1, 0, 0, 0] },
  { xmlid: 'acl_establishment_admin', model: 'x_establishment', group: 'base.group_system', perms: [1, 1, 1, 0] },
  // solo leer y crear: el historial no se edita ni se borra desde la interfaz (el administrador puede cambiar esta regla)
  { xmlid: 'acl_attempt_user', model: 'x_report_attempt', group: 'base.group_user', perms: [1, 0, 1, 0] },
  // importes: leer y crear; confirmar o anular solo por sus acciones (dejan quien y cuando). Nadie edita ni borra,
  // tampoco el administrador (defecto D2 demostrado en la copia el 18/11/2026: el admin podia cambiar un confirmado).
  { xmlid: 'acl_amount_user', model: 'x_tra_amount', group: 'base.group_user', perms: [1, 0, 1, 0] },
  { xmlid: 'acl_amount_admin', model: 'x_tra_amount', group: 'base.group_system', perms: [1, 0, 1, 0] },
];

// ---------------------------------------------------------------- acciones de servidor (Python, safe_eval)
const PY_INVITE = String.raw`if not records:
    raise UserError('Seleccione al menos un registro.')
survey = env.ref('__ath_sire_tra__.survey_registro')
base = env['ir.config_parameter'].sudo().get_param('web.base.url')
ids = []
for order in records:
    if order.state == 'cancel' or order.x_reservation_status in ('cancelled', 'no_show'):
        raise UserError('Reserva %s cancelada o no-show: no se genera enlace.' % order.name)
    old = env['survey.user_input'].search([('x_sale_order_id', '=', order.id), ('x_ath_state', '=', 'invitado')])
    for o in old:
        o.write({'access_token': env['survey.user_input'].default_get(['access_token'])['access_token'], 'deadline': datetime.datetime.now(), 'x_ath_state': 'revocado', 'x_ath_url': False})
    end = order.x_checkout or (order.rental_return_date and order.rental_return_date.date())
    deadline = datetime.datetime.combine(end + datetime.timedelta(days=1), datetime.time(4, 59)) if end else datetime.datetime.now() + datetime.timedelta(days=3)
    ui = env['survey.user_input'].create({'survey_id': survey.id, 'x_sale_order_id': order.id, 'deadline': deadline, 'x_ath_state': 'invitado'})
    ui.write({'x_ath_url': '%s/survey/%s/%s' % (base, survey.access_token, ui.access_token)})
    ids.append(ui.id)
action = {'type': 'ir.actions.act_window', 'name': 'Enlace de registro', 'res_model': 'survey.user_input', 'domain': [('id', 'in', ids)], 'views': [[env.ref('__ath_sire_tra__.view_invite_list').id, 'list'], [env.ref('__ath_sire_tra__.view_invite_form').id, 'form']]}`;

// Puente Smoobu -> Odoo -> enlace de registro. Lo dispara la automatizacion au_invite (reserva Smoobu confirmada, o cancelada
// despues de haber tenido enlace). Es UNA sola regla sobre reservas; solo escribe en los registros de enlace, nunca en la reserva.
// Reglas: NUNCA confirma, escribe ni cancela el pedido; NUNCA envia el enlace; NUNCA deja escapar un error (SAVEPOINT de PostgreSQL + try/except por
// reserva: un fallo de Python o de base de datos se deshace solo en esa reserva y no bloquea la confirmacion ni la cancelacion del pedido); idempotente.
// Confirmada: si la reserva ya tiene enlace (vigente, usado o retirado) no hace nada, asi que una prorroga NO mueve el vencimiento
// original. Si faltan datos deja UN registro "error" con la causa y una nota interna; al completarse pasa a enlace vigente.
// Cancelada (state cancel, o estado de reserva cancelled / no_show): revoca los enlaces vigentes rotando su token (la URL anterior
// y cualquier formulario ya abierto dejan de aceptar datos). No toca el vencimiento, los formularios recibidos ni el historial.
// 2026-11-18: se prepara al INGRESAR la reserva de Smoobu (borrador, cotizacion enviada o confirmada), sin esperar la
// confirmacion manual; nunca confirma ni cobra. Si faltan nombre, telefono o correo del huesped deja la excepcion visible
// (x_ath_contact_gap) y sigue. El mensaje para el huesped queda redactado (x_ath_message) para que Recepcion lo envie por
// el canal de la reserva; Odoo no lo envia.
const PY_INVITE_AUTO = String.raw`def contact_gap(order):
    p = order.partner_id
    miss = []
    name = ' '.join(('%s' % (p.name or '')).split())
    if len(name.split()) < 2:
        miss.append('nombre completo')
    if not (p.phone or ''):
        miss.append('teléfono')
    if not (p.email or ''):
        miss.append('correo')
    return ('Falta: %s' % ', '.join(miss)) if miss else False

def message_for(order, url):
    name = ' '.join(('%s' % (order.partner_id.name or '')).split()) or 'huésped'
    return ('Hola %s. Para su estadía en Atheron Suite (Zipaquirá) del %s al %s necesitamos el registro obligatorio de huéspedes '
            '(Migración Colombia y Tarjeta de Registro de Alojamiento del MinCIT). Por favor diligéncielo antes de llegar, '
            'para usted y sus acompañantes: %s . Gracias.') % (name, order.x_checkin or '-', order.x_checkout or '-', url)

def refresh(order, s):
    gap = contact_gap(order)
    msg = message_for(order, s.x_ath_url) if s.x_ath_url else False
    vals = {}
    if (s.x_ath_contact_gap or False) != gap:
        vals['x_ath_contact_gap'] = gap
    if (s.x_ath_message or False) != msg:
        vals['x_ath_message'] = msg
    if vals:
        s.write(vals)

def prepare(order, survey, UI, base, today):
    slots = UI.search([('x_sale_order_id', '=', order.id)])
    done = False
    pending = None
    for s in slots:
        if s.x_ath_state == 'invitado':
            refresh(order, s)
        if s.x_ath_state in ('invitado', 'procesado', 'revocado'):
            done = True
        elif s.x_ath_state == 'error' and not pending:
            pending = s
    if done:
        return
    end = order.x_checkout or (order.rental_return_date and order.rental_return_date.date())
    cause = False
    if not order.x_checkin and not end:
        cause = 'Faltan las fechas de entrada y salida de la reserva. Complételas en la reserva y el enlace se preparará solo.'
    elif not order.x_checkin:
        cause = 'Falta la fecha de entrada de la reserva. Complétela en la reserva y el enlace se preparará solo.'
    elif not end:
        cause = 'Falta la fecha de salida de la reserva. Complétela en la reserva y el enlace se preparará solo.'
    elif end < today:
        cause = 'La estancia ya terminó (salida %s): no se preparó enlace. Si hace falta, use «Generar enlace de registro».' % end
    if cause:
        if pending and pending.x_ath_error == cause:
            return
        if pending:
            pending.write({'x_ath_error': cause})
        else:
            UI.create({'survey_id': survey.id, 'x_sale_order_id': order.id, 'deadline': datetime.datetime.now(), 'x_ath_state': 'error', 'x_ath_error': cause})
        order.message_post(body='Registro SIRE/TRA: no se preparó el enlace de registro. %s' % cause, message_type='comment', subtype_xmlid='mail.mt_note')
        return
    deadline = datetime.datetime.combine(end + datetime.timedelta(days=1), datetime.time(4, 59))
    token = UI.default_get(['access_token'])['access_token']
    if pending:
        ui = pending
        ui.write({'access_token': token, 'deadline': deadline, 'x_ath_state': 'invitado', 'x_ath_error': False})
    else:
        ui = UI.create({'survey_id': survey.id, 'x_sale_order_id': order.id, 'deadline': deadline, 'x_ath_state': 'invitado'})
    url = '%s/survey/%s/%s' % (base, survey.access_token, ui.access_token)
    gap = contact_gap(order)
    ui.write({'x_ath_url': url, 'x_ath_contact_gap': gap, 'x_ath_message': message_for(order, url)})
    order.message_post(body='Registro SIRE/TRA: enlace de registro y mensaje preparados (no enviados). Están en Registro SIRE/TRA > Enlaces de registro; envíelos al huésped principal por el canal de la reserva.%s' % ((' Excepción: %s.' % gap) if gap else ''), message_type='comment', subtype_xmlid='mail.mt_note')

def revoke(order, UI):
    n = 0
    for s in UI.search([('x_sale_order_id', '=', order.id), ('x_ath_state', '=', 'invitado')]):
        if s.state == 'done':
            continue
        s.write({'access_token': UI.default_get(['access_token'])['access_token'], 'x_ath_state': 'revocado', 'x_ath_url': False, 'x_ath_message': False})
        n += 1
    if n:
        order.message_post(body='Registro SIRE/TRA: la reserva se canceló; el enlace de registro quedó revocado (la URL anterior ya no recibe datos). Los formularios ya recibidos se conservan.', message_type='comment', subtype_xmlid='mail.mt_note')

def process(order, survey, UI, base, today):
    if 'SMOOBU-' not in (order.x_pms_reference or ''):
        return
    if order.state == 'cancel' or order.x_reservation_status in ('cancelled', 'no_show'):
        revoke(order, UI)
    elif order.state in ('draft', 'sent', 'sale'):
        prepare(order, survey, UI, base, today)

survey = env.ref('__ath_sire_tra__.survey_registro', raise_if_not_found=False)
if survey:
    UI = env['survey.user_input']
    base = env['ir.config_parameter'].sudo().get_param('web.base.url')
    today = (datetime.datetime.now() - datetime.timedelta(hours=5)).date()
    for order in records:
        env.flush_all()
        env.cr.execute('SAVEPOINT ath_invite_sp')
        try:
            process(order, survey, UI, base, today)
            env.cr.execute('RELEASE SAVEPOINT ath_invite_sp')
        except Exception as e:
            env.cr.execute('ROLLBACK TO SAVEPOINT ath_invite_sp')
            env.invalidate_all(flush=False)
            log('SIRE/TRA puente: reserva %s sin procesar: %s' % (order.id, e), level='warning')`;

const PY_REVOKE = String.raw`if not records:
    raise UserError('Seleccione al menos un registro.')
for ui in records:
    if ui.x_ath_state != 'invitado':
        raise UserError('Solo se revocan enlaces vigentes.')
    ui.write({'access_token': env['survey.user_input'].default_get(['access_token'])['access_token'], 'deadline': datetime.datetime.now(), 'x_ath_state': 'revocado', 'x_ath_url': False})`;

const PY_MAP = String.raw`DOC = {'Cédula de ciudadanía (Colombia)': 'national_citizen_id', 'Tarjeta de identidad (Colombia)': 'id_card', 'Registro civil (Colombia)': 'civil_registration', 'Cédula de extranjería (Colombia)': 'foreign_resident_card', 'Pasaporte': 'passport', 'PEP': 'PEP', 'PPT': 'PPT'}
now = datetime.datetime.now()
FORM_VERSION = 'registro-huespedes v2 (2026-11-08) / aviso de tratamiento de datos v1'

def clean(v):
    return ' '.join(('%s' % (v or '')).replace('\t', ' ').split()).strip()

def norm(text):
    t = clean(text).lower()
    for a, b in (('á', 'a'), ('é', 'e'), ('í', 'i'), ('ó', 'o'), ('ú', 'u'), ('ü', 'u'), ('ñ', 'n'), ('.', ''), (',', ' ')):
        t = t.replace(a, b)
    return ' '.join(t.split())

# Catalogo res.country (ISO): nombre en espanol o ingles, o codigo ISO de 2 letras. Alias explicitos y documentados.
# Nombres que corresponden a mas de un pais: nunca se infieren (Recepcion elige con el huesped).
AMBIGUOUS = {'congo', 'guinea', 'corea', 'korea', 'sudan', 'samoa', 'islas virgenes', 'virgin islands', 'macedonia'}
ALIAS = {'eeuu': 'US', 'ee uu': 'US', 'usa': 'US', 'estados unidos de america': 'US', 'united states of america': 'US', 'reino unido': 'GB', 'uk': 'GB'}
INDEX = {}
for lang in ('es_419', 'en_US'):
    for c in env['res.country'].with_context(lang=lang).search([]):
        for k in (norm(c.name), (c.code or '').lower()):
            if k:
                INDEX.setdefault(k, set()).add(c.id)

def country(text):
    k = norm(text)
    if not k:
        return False
    if k in AMBIGUOUS:
        return False
    if k in ALIAS:
        return env['res.country'].search([('code', '=', ALIAS[k])], limit=1).id or False
    found = INDEX.get(k) or set()
    return list(found)[0] if len(found) == 1 else False

def city(name):
    name = clean(name)
    if not name:
        return False
    return env['res.city'].search([('name', '=ilike', name)], limit=1).id or False

def gtype(b):
    if not b:
        return 'adult'
    age = (now.date() - b).days / 365.25
    return 'infant' if age < 2 else ('child' if age < 12 else 'adult')

def parse(ui):
    keys = dict((d.res_id, d.name[2:]) for d in env['ir.model.data'].sudo().search([('module', '=', '__ath_sire_tra__'), ('model', '=', 'survey.question'), ('name', '=like', 'q_%')]))
    v = {}
    for l in ui.user_input_line_ids:
        k = keys.get(l.question_id.id)
        if not k or l.skipped:
            continue
        if l.answer_type == 'suggestion':
            v[k] = l.suggested_answer_id.value
        elif l.answer_type == 'date':
            v[k] = l.value_date
        else:
            v[k] = clean(l.value_char_box)
    n = int(v.get('p_companions') or 0)
    consent = v.get('p_consent') == 'Sí, autorizo'
    common = {'x_residence_city_id': city(v.get('p_res_city')), 'x_residence_text': v.get('p_res_city') or False, 'x_residence_country_id': country(v.get('p_res_country')), 'x_origin_city_id': city(v.get('p_origin_city')), 'x_origin_text': v.get('p_origin_city') or False, 'x_origin_country_id': country(v.get('p_origin_country')), 'x_destination_text': v.get('p_dest') or False, 'x_destination_country_id': country(v.get('p_dest_country')), 'x_travel_reason': v.get('p_reason') or False, 'x_consent': consent, 'x_consent_at': now if consent else False, 'x_data_state': 'recibido', 'x_data_source': 'formulario', 'x_user_input_id': ui.id}
    out = []
    for i in range(0, n + 1):
        p = 'p_' if i == 0 else 'c%s_' % i
        code = DOC.get(v.get(p + 'doc_type') or '', '-')
        dt = env['l10n_latam.identification.type'].search([('l10n_co_document_code', '=', code)], limit=1)
        num = clean(v.get(p + 'doc_num')).upper()
        vals = dict(common)
        vals.update({'x_is_main': i == 0, 'x_doc_type_id': dt.id or False, 'x_identity_number': num or False, 'x_given_names': v.get(p + 'given') or False, 'x_surname_1': v.get(p + 'surname1') or False, 'x_surname_2': v.get(p + 'surname2') or False, 'x_nationality': country(v.get(p + 'nationality')), 'x_birth_date': v.get(p + 'birth') or False, 'x_guest_type': gtype(v.get(p + 'birth'))})
        vals['x_name'] = clean('%s %s %s' % (vals['x_given_names'] or '', vals['x_surname_1'] or '', vals['x_surname_2'] or ''))
        notes = []
        for key, field, label in ((p + 'nationality', 'x_nationality', 'nacionalidad'), ('p_res_country', 'x_residence_country_id', 'país de residencia'), ('p_origin_country', 'x_origin_country_id', 'país de procedencia'), ('p_dest_country', 'x_destination_country_id', 'país de destino')):
            if v.get(key) and not vals[field]:
                notes.append('no se reconoció %s (%s)' % (label, clean(v.get(key))[:40]))
        vals['x_last_error'] = ('Revisar: ' + '; '.join(notes)) if notes else False
        out.append(vals)
    return out, v

def apply(ui, guests, answers):
    order = ui.x_sale_order_id
    siblings = env['survey.user_input'].search([('x_sale_order_id', '=', order.id)])
    siblings.write({'x_ath_lock': (ui.x_ath_lock or 0) + 1})
    for vals in guests:
        same = None
        for r in order.x_guest_line_ids:
            if r.x_doc_type_id.id == vals['x_doc_type_id'] and (r.x_identity_number or '').upper() == (vals['x_identity_number'] or ''):
                same = r
                break
        if same and (same.x_data_state == 'validado' or same.x_arrived_at):
            same.write({'x_last_error': 'Formulario repetido: no se reemplazaron datos ya validados'})
        elif same:
            same.write(vals)
        else:
            vals['x_sale_order_id'] = order.id
            env['x_guests_line'].create(vals)
    lines = []
    for k in sorted(answers):
        lines.append('%s=%s' % (k, answers[k]))
    snapshot = '\n'.join(lines)
    ui.write({'x_ath_snapshot': snapshot, 'x_ath_form_version': FORM_VERSION, 'x_ath_submitted_at': now})
    ui.user_input_line_ids.unlink()
    ui.write({'x_ath_state': 'procesado', 'x_ath_processed_at': now, 'x_ath_error': False})

for ui in records:
    if ui.x_ath_state != 'invitado' or not ui.x_sale_order_id:
        continue
    try:
        guests, answers = parse(ui)
    except Exception:
        ui.write({'x_ath_state': 'error', 'x_ath_error': 'No se pudo interpretar el formulario; respuestas conservadas para revision manual'})
        guests = None
    if guests is not None:
        apply(ui, guests, answers)`;

const PY_VALIDATE = String.raw`if not records:
    raise UserError('Seleccione al menos un registro.')
DIGITS = ('national_citizen_id', 'id_card', 'civil_registration', 'foreign_resident_card')
COLOMBIAN = ('national_citizen_id', 'id_card', 'civil_registration')
now = datetime.datetime.now()
errors = []
for r in records:
    o = r.x_sale_order_id
    miss = []
    if r.x_data_state not in ('recibido', 'rechazado', 'borrador') and r.x_data_state:
        miss.append('estado %s' % r.x_data_state)
    for f, lbl in (('x_doc_type_id', 'tipo de documento'), ('x_identity_number', 'número'), ('x_given_names', 'nombres'), ('x_surname_1', 'primer apellido'), ('x_nationality', 'nacionalidad'), ('x_birth_date', 'fecha de nacimiento'), ('x_room_resource_id', 'habitación')):
        if not r[f]:
            miss.append(lbl)
    code = r.x_doc_type_id.l10n_co_document_code
    num = r.x_identity_number or ''
    if code in DIGITS and num and not num.isdigit():
        miss.append('número solo con dígitos')
    if num and not num.replace('-', '').isalnum():
        miss.append('número con caracteres no válidos')
    if r.x_birth_date and r.x_birth_date > now.date():
        miss.append('fecha de nacimiento futura')
    if r.x_is_foreign and code in COLOMBIAN:
        miss.append('extranjero con documento colombiano')
    room = r.x_room_resource_id
    if room and room.x_unit_kind != 'fisica':
        miss.append('asignar habitación fisica (Casa Completa es derivada)')
    if room and not room.x_establishment_id:
        miss.append('habitación sin establecimiento')
    if not o.x_guest_line_ids.filtered(lambda x: x.x_is_main):
        miss.append('la reserva no tiene huésped principal')
    if len(o.x_guest_line_ids.filtered(lambda x: x.x_is_main)) > 1:
        miss.append('más de un huésped principal')
    if o.x_guest_line_ids.filtered(lambda x: x.id != r.id and x.x_doc_type_id == r.x_doc_type_id and (x.x_identity_number or '').upper() == num.upper()):
        miss.append('documento repetido en la reserva')
    if not r.x_consent:
        miss.append('sin consentimiento')
    if miss:
        errors.append('%s (linea %s): %s' % (o.name or '-', r.id, ', '.join(miss)))
if errors:
    raise UserError('No se validó ningún huésped.\n' + '\n'.join(errors))
for r in records:
    r.write({'x_data_state': 'validado', 'x_validated_at': now, 'x_last_error': False, 'x_establishment_id': r.x_room_resource_id.x_establishment_id.id})`;

const PY_REJECT = String.raw`if not records:
    raise UserError('Seleccione al menos un registro.')
for r in records:
    if r.x_arrived_at:
        raise UserError('No se puede invalidar: la llegada ya fue registrada (linea %s).' % r.id)
records.write({'x_data_state': 'rechazado'})`;

// Llegada y salida reales: la hora REAL la escribe Recepcion (x_arrival_input / x_departure_input); Odoo nunca usa la hora
// actual por defecto. Hora y usuario de CAPTURA quedan aparte; si la captura es mas de 1 h posterior exige motivo. Cada
// movimiento queda en la bitacora de la linea y en una nota interna de la reserva. Lo ya registrado no se cambia aqui:
// para eso esta "Corregir hora" (con motivo, valor anterior y bloqueo si ya se reporto).
const PY_MOVE_LIB = String.raw`now = datetime.datetime.now()
LATE = datetime.timedelta(hours=1)
SLACK = datetime.timedelta(minutes=5)

def bog(dt):
    return (dt - datetime.timedelta(hours=5)).strftime('%Y-%m-%d %H:%M') if dt else '-'

def reason_of(r):
    return ' '.join(('%s' % (r.x_movement_reason or '')).split())

def log_line(r, text):
    entry = '%s | %s | %s' % (bog(now), env.user.name, text)
    return ((r.x_movement_log + '\n') if r.x_movement_log else '') + entry

def note(r, text):
    r.x_sale_order_id.message_post(body='Registro SIRE/TRA (linea %s): %s' % (r.id, text), message_type='comment', subtype_xmlid='mail.mt_note')
`;

const PY_ARRIVE = PY_MOVE_LIB + String.raw`if not records:
    raise UserError('Seleccione al menos un registro.')
errors = []
for r in records:
    o = r.x_sale_order_id
    when = r.x_arrival_input
    if r.x_data_state != 'validado':
        errors.append('linea %s: datos no validados' % r.id)
    elif r.x_arrived_at:
        errors.append('linea %s: llegada ya registrada (para cambiarla use «Corregir hora de llegada/salida»)' % r.id)
    elif o.state != 'sale' or o.x_reservation_status in ('cancelled', 'no_show'):
        errors.append('linea %s: reserva no confirmada, cancelada o no-show' % r.id)
    elif not when:
        errors.append('linea %s: escriba la hora REAL de llegada (campo «Hora real de llegada»); no se usa la hora actual por defecto' % r.id)
    elif when > now + SLACK:
        errors.append('linea %s: la hora real de llegada (%s) es futura' % (r.id, bog(when)))
    elif not (o.x_checkin and o.x_checkout and o.x_checkin - datetime.timedelta(days=1) <= (when - datetime.timedelta(hours=5)).date() <= o.x_checkout):
        errors.append('linea %s: la llegada real (%s) está fuera de las fechas de la reserva %s' % (r.id, bog(when), o.name))
    elif now - when > LATE and not reason_of(r):
        errors.append('linea %s: registro tardío (llegada %s, captura %s): escriba el motivo' % (r.id, bog(when), bog(now)))
if errors:
    raise UserError('No se registró ninguna llegada.\n' + '\n'.join(errors))
for r in records:
    when = r.x_arrival_input
    late = now - when > LATE
    text = 'llegada real %s (hora Bogotá), capturada %s por %s%s' % (bog(when), bog(now), env.user.name, (' - registro tardío: %s' % reason_of(r)) if late else '')
    tra = 'pendiente' if r.x_establishment_id.x_tra_mode in ('manual', 'api') else 'no_aplica'
    r.write({'x_arrived_at': when, 'x_arrival_captured_at': now, 'x_arrival_captured_by': env.user.id, 'x_arrival_input': False, 'x_movement_reason': False, 'x_movement_log': log_line(r, text), 'x_sire_in_state': 'pendiente' if r.x_is_foreign else 'no_aplica', 'x_sire_out_state': 'no_aplica', 'x_tra_state': tra})
    note(r, text)`;

const PY_DEPART = PY_MOVE_LIB + String.raw`if not records:
    raise UserError('Seleccione al menos un registro.')
errors = []
for r in records:
    when = r.x_departure_input
    if not r.x_arrived_at or r.x_departed_at:
        errors.append('linea %s: sin llegada o ya con salida' % r.id)
    elif not when:
        errors.append('linea %s: escriba la hora REAL de salida (campo «Hora real de salida»); no se usa la hora actual por defecto' % r.id)
    elif when > now + SLACK:
        errors.append('linea %s: la hora real de salida (%s) es futura' % (r.id, bog(when)))
    elif when < r.x_arrived_at:
        errors.append('linea %s: la salida (%s) es anterior a la llegada (%s)' % (r.id, bog(when), bog(r.x_arrived_at)))
    elif now - when > LATE and not reason_of(r):
        errors.append('linea %s: registro tardío (salida %s, captura %s): escriba el motivo' % (r.id, bog(when), bog(now)))
if errors:
    raise UserError('Salida no registrada.\n' + '\n'.join(errors))
for r in records:
    when = r.x_departure_input
    late = now - when > LATE
    text = 'salida real %s (hora Bogotá), capturada %s por %s%s' % (bog(when), bog(now), env.user.name, (' - registro tardío: %s' % reason_of(r)) if late else '')
    r.write({'x_departed_at': when, 'x_departure_captured_at': now, 'x_departure_captured_by': env.user.id, 'x_departure_input': False, 'x_movement_reason': False, 'x_movement_log': log_line(r, text), 'x_sire_out_state': 'pendiente' if r.x_is_foreign else 'no_aplica'})
    note(r, text)`;

// Correccion explicita de una hora ya registrada: motivo obligatorio, valor anterior en bitacora y nota; nunca toca estados
// de reporte; se niega si ese movimiento ya esta en envio, enviado o aceptado (se corrige en el portal, segun gerencia).
const PY_FIX_MOVE = PY_MOVE_LIB + String.raw`if not records:
    raise UserError('Seleccione al menos un registro.')
SENT = ('en_envio', 'enviado', 'aceptado', 'incierto')
errors = []
plan = []
for r in records:
    a, d = r.x_arrival_input, r.x_departure_input
    if not a and not d:
        errors.append('linea %s: escriba la hora corregida en «Hora real de llegada» o «Hora real de salida»' % r.id)
        continue
    if not reason_of(r):
        errors.append('linea %s: escriba el motivo de la corrección' % r.id)
        continue
    if a:
        if not r.x_arrived_at:
            errors.append('linea %s: no hay llegada que corregir (use «Registrar llegada real»)' % r.id)
        elif r.x_tra_state in SENT or r.x_sire_in_state in SENT:
            errors.append('linea %s: la llegada ya está en reporte (TRA %s / SIRE %s): no se corrige aquí' % (r.id, r.x_tra_state, r.x_sire_in_state))
        elif a > now + SLACK or (r.x_departed_at and a > r.x_departed_at):
            errors.append('linea %s: hora de llegada corregida no válida (%s)' % (r.id, bog(a)))
    if d:
        if not r.x_departed_at:
            errors.append('linea %s: no hay salida que corregir (use «Registrar salida real»)' % r.id)
        elif r.x_sire_out_state in SENT:
            errors.append('linea %s: la salida ya está en reporte SIRE (%s): no se corrige aquí' % (r.id, r.x_sire_out_state))
        elif d > now + SLACK or d < (a or r.x_arrived_at):
            errors.append('linea %s: hora de salida corregida no válida (%s)' % (r.id, bog(d)))
if errors:
    raise UserError('No se corrigió ninguna hora.\n' + '\n'.join(errors))
for r in records:
    a, d = r.x_arrival_input, r.x_departure_input
    vals = {'x_arrival_input': False, 'x_departure_input': False, 'x_movement_reason': False}
    parts = []
    if a:
        parts.append('llegada %s -> %s' % (bog(r.x_arrived_at), bog(a)))
        vals['x_arrived_at'] = a
    if d:
        parts.append('salida %s -> %s' % (bog(r.x_departed_at), bog(d)))
        vals['x_departed_at'] = d
    text = 'CORRECCIÓN %s por %s - motivo: %s' % ('; '.join(parts), env.user.name, reason_of(r))
    vals['x_movement_log'] = log_line(r, text)
    r.write(vals)
    note(r, text)`;

const PY_CLAIM = String.raw`F = {'sire_entrada': 'x_sire_in_state', 'sire_salida': 'x_sire_out_state', 'tra': 'x_tra_state'}
system = env.context.get('ath_system')
ref = env.context.get('ath_run_ref') or ''
if system not in F or not ref:
    raise UserError('Parametros de reclamo inválidos')
f = F[system]
claimed = []
for r in records:
    r.write({'x_lock_rev': (r.x_lock_rev or 0) + 1})
    ok = r[f] == 'pendiente' and bool(r.x_arrived_at)
    if ok and system == 'tra' and not r.x_is_main:
        main = r.x_sale_order_id.x_guest_line_ids.filtered(lambda x: x.x_is_main)
        ok = bool(main) and main[0].x_tra_state == 'aceptado' and bool(main[0].x_tra_external_id)
    if ok:
        r.write({f: 'en_envio', 'x_claim_ref': ref})
        claimed.append(r.id)
action = {'claimed': claimed}`;

const PY_APPLY_ATTEMPT = String.raw`F = {'sire_entrada': 'x_sire_in_state', 'sire_salida': 'x_sire_out_state', 'tra': 'x_tra_state'}
ALLOWED = {'enviado': ('pendiente', 'en_envio'), 'aceptado': ('en_envio', 'enviado', 'incierto'), 'rechazado': ('en_envio', 'enviado', 'incierto'), 'incierto': ('en_envio', 'enviado'), 'error_previo': ('en_envio',), 'no_recibido': ('incierto', 'rechazado')}
TARGET = {'enviado': 'enviado', 'aceptado': 'aceptado', 'rechazado': 'rechazado', 'incierto': 'incierto', 'error_previo': 'pendiente', 'no_recibido': 'pendiente'}
for a in records:
    line = a.x_guest_line_id
    f = F[a.x_system]
    cur = line[f]
    if cur not in ALLOWED[a.x_result]:
        raise UserError('Transición no permitida (%s): %s -> %s' % (a.x_system, cur, a.x_result))
    if a.x_result == 'aceptado' and a.x_channel in ('portal_manual', 'archivo_sire') and not a.x_evidence:
        raise UserError('Para marcar aceptado adjunte la evidencia de la consulta oficial.')
    if a.x_system == 'tra' and a.x_result == 'aceptado' and line.x_is_main and not a.x_external_id and a.x_channel in ('api_tra', 'simulador'):
        raise UserError('Falta el identificador devuelto por TRA para el huésped principal.')
    if a.x_system == 'tra' and a.x_result == 'aceptado' and not (a.x_reported_checkin and a.x_reported_checkout):
        raise UserError('Falta registrar las fechas de check-in y check-out reportadas a TRA.')
    vals = {f: TARGET[a.x_result], 'x_last_error': a.x_error_code or False}
    if a.x_system == 'tra' and a.x_result == 'aceptado':
        vals['x_tra_rep_checkin'] = a.x_reported_checkin
        vals['x_tra_rep_checkout'] = a.x_reported_checkout
    if a.x_system == 'tra' and a.x_external_id and line.x_is_main:
        vals['x_tra_external_id'] = a.x_external_id
    line.write(vals)`;

const PY_SIRE_EXPORT = String.raw`lines = records
if not lines:
    raise UserError('Seleccione huéspedes.')
est = lines.mapped('x_establishment_id')
if len(est) != 1:
    raise UserError('Seleccione huéspedes de un solo establecimiento.')
if not (est.x_sire_export_enabled and est.x_sire_codes_verified):
    raise UserError('Exportador SIRE deshabilitado: faltan los códigos oficiales del paquete de guía del portal SIRE. Use la Hoja guíada SIRE.')
fmt = est.x_sire_date_format
if not (fmt and est.x_sire_company_code and est.x_sire_city_code and est.x_sire_move_in_code and est.x_sire_move_out_code):
    raise UserError('Faltan en el establecimiento: código de hotel, código de ciudad, códigos de movimiento o formato de fecha.')
tz = timezone('America/Bogota')

def local(dt):
    return timezone('UTC').localize(dt).astimezone(tz)

def clean(v):
    return ' '.join(('%s' % (v or '')).replace('\t', ' ').split()).strip()

rows, errs, claim = [], [], {}
for r in lines:
    if not r.x_is_foreign:
        errs.append('linea %s: no es extranjero' % r.id)
        continue
    if r.x_sire_in_state == 'pendiente':
        mov, when, f = est.x_sire_move_in_code, r.x_arrived_at, 'x_sire_in_state'
    elif r.x_sire_out_state == 'pendiente':
        mov, when, f = est.x_sire_move_out_code, r.x_departed_at, 'x_sire_out_state'
    else:
        errs.append('linea %s: sin movimiento SIRE pendiente' % r.id)
        continue
    cols = [est.x_sire_company_code, est.x_sire_city_code, r.x_doc_type_id.x_sire_code, r.x_identity_number, r.x_nationality.x_sire_code, r.x_surname_1, r.x_surname_2 or '', r.x_given_names, mov, when and local(when).strftime(fmt), r.x_origin_country_id.x_sire_code, r.x_destination_country_id.x_sire_code, r.x_birth_date and r.x_birth_date.strftime(fmt)]
    missing = [str(i + 1) for i in (0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12) if not cols[i]]
    if missing:
        errs.append('linea %s: faltan columnas %s' % (r.id, ','.join(missing)))
        continue
    rows.append('\t'.join(clean(c) for c in cols))
    claim[r.id] = f
if errs:
    raise UserError('Archivo no generado.\n' + '\n'.join(errs))
for r in lines:
    r.write({'x_lock_rev': (r.x_lock_rev or 0) + 1})
    if r[claim[r.id]] != 'pendiente':
        raise UserError('Otro proceso tomó la linea %s; vuelva a intentarlo.' % r.id)
    r.write({claim[r.id]: 'en_envio', 'x_claim_ref': 'archivo-sire'})
data = ('\r\n'.join(rows) + '\r\n').encode(est.x_sire_encoding or 'utf-8', 'replace')
att = env['ir.attachment'].create({'name': 'SIRE_%s_%s.txt' % (est.x_code, datetime.datetime.now().strftime('%Y%m%d_%H%M%S')), 'datas': b64encode(data), 'res_model': 'x_establishment', 'res_id': est.id, 'mimetype': 'text/plain'})
action = {'type': 'ir.actions.act_url', 'url': '/web/content/%s?download=true' % att.id, 'target': 'self'}`;

const PY_SIRE_MARK = String.raw`if not records:
    raise UserError('Seleccione al menos un registro.')
n = 0
for r in records:
    for system, f in (('sire_entrada', 'x_sire_in_state'), ('sire_salida', 'x_sire_out_state')):
        if r[f] in ('pendiente', 'en_envio'):
            env['x_report_attempt'].create({'x_name': 'Carga en portal SIRE', 'x_guest_line_id': r.id, 'x_system': system, 'x_channel': 'archivo_sire' if r[f] == 'en_envio' else 'portal_manual', 'x_result': 'enviado', 'x_actor': 'Recepción (usuario compartido)'})
            n += 1
            break
if not n:
    raise UserError('Ningún huésped de la seleccion tiene SIRE pendiente.')`;

const PY_AMOUNT_CONFIRM = String.raw`if not records:
    raise UserError('Seleccione un importe.')
if len(records) != 1:
    raise UserError('Confirme un importe a la vez.')
r = records
today = (datetime.datetime.utcnow() - datetime.timedelta(hours=5)).date()
# salida de la estancia en Bogota (UTC-5): la mas tardia; el costo es definitivo solo despues del check-out
stay_lines = env['x_guests_line'].sudo().search([('x_sale_order_id', '=', r.x_sale_order_id.id)])
not_departed = False
last_departure = False
for gl in stay_lines:
    if not gl.x_departed_at:
        not_departed = True
    else:
        dd = (gl.x_departed_at - datetime.timedelta(hours=5)).date()
        if not last_departure or dd > last_departure:
            last_departure = dd
err = False
if r.x_state == 'confirmado':
    err = 'ya está confirmado'
elif r.x_state == 'anulado':
    err = 'está anulado; registre uno nuevo'
elif not r.x_amount or r.x_amount <= 0:
    err = 'falta el importe efectivamente pagado'
elif not r.x_currency_id:
    err = 'falta la moneda'
elif r.x_currency_id.name != 'COP':
    err = 'TRA exige el valor en pesos colombianos (COP)'
elif not r.x_cutoff_date:
    err = 'falta la fecha de corte'
elif r.x_cutoff_date > today:
    err = 'la fecha de corte no puede ser futura'
elif not r.x_evidence_kind or not (r.x_evidence_ref or '').strip() or not r.x_evidence or not (r.x_evidence_name or '').strip():
    err = 'falta la evidencia: tipo, referencia y archivo'
elif not r.x_excludes_taxes:
    err = 'falta la constancia de que el importe no incluye impuestos (MinCIT, 2-2026-039958)'
elif not r.x_covers_all_guests:
    err = 'falta la constancia de que cubre el alojamiento del principal y de todos sus acompañantes'
elif not stay_lines or not_departed:
    err = 'la estancia no tiene registrada la salida real de todos los huéspedes; el costo se confirma después del check-out'
elif r.x_cutoff_date < last_departure:
    err = 'la fecha de corte es anterior a la salida real de la estancia'
elif env['x_tra_amount'].search_count([('x_sale_order_id', '=', r.x_sale_order_id.id), ('x_state', '=', 'confirmado'), ('id', '!=', r.id)]):
    err = 'la reserva ya tiene un importe confirmado; anúlelo antes'
if err:
    raise UserError('No se confirmó el importe: %s.' % err)
r.sudo().write({'x_state': 'confirmado', 'x_confirmed_by': env.user.id, 'x_confirmed_at': datetime.datetime.now()})`;

const PY_AMOUNT_VOID = String.raw`if not records:
    raise UserError('Seleccione un importe.')
if len(records) != 1:
    raise UserError('Anule un importe a la vez.')
r = records
if r.x_state == 'anulado':
    raise UserError('El importe ya está anulado.')
note = ((r.x_note or '') + '\nAnulado por %s el %s (UTC)' % (env.user.name, datetime.datetime.now().strftime('%Y-%m-%d %H:%M'))).strip()
r.sudo().write({'x_state': 'anulado', 'x_note': note})`;

// Defecto D1 (demostrado en la copia el 18/11/2026): por el ORM se podia CREAR un importe ya confirmado, sin evidencia y con
// confirmador falso. Esta accion, disparada al crear (au_amount_guard), rechaza cualquier estado o confirmacion de origen.
const PY_AMOUNT_GUARD = String.raw`raise UserError('Los importes se registran sin estado ni confirmación. Solo la acción "Confirmar con evidencia" confirma y deja quién y cuándo.')`;

export const SERVER_ACTIONS = [
  { xmlid: 'sa_invite', name: '[SIRE/TRA] Generar enlace de registro', model: 'sale.order', bind: true, code: PY_INVITE },
  { xmlid: 'sa_invite_auto', name: '[SIRE/TRA] Preparar enlace de registro (automático)', model: 'sale.order', code: PY_INVITE_AUTO },
  { xmlid: 'sa_revoke', name: '[SIRE/TRA] Revocar enlace', model: 'survey.user_input', bind: true, code: PY_REVOKE },
  { xmlid: 'sa_map', name: '[SIRE/TRA] Procesar formulario recibido', model: 'survey.user_input', code: PY_MAP },
  { xmlid: 'sa_validate', name: '[SIRE/TRA] Validar datos', model: 'x_guests_line', bind: true, code: PY_VALIDATE },
  { xmlid: 'sa_reject', name: '[SIRE/TRA] Marcar datos no válidos', model: 'x_guests_line', bind: true, code: PY_REJECT },
  { xmlid: 'sa_arrive', name: '[SIRE/TRA] Registrar llegada real', model: 'x_guests_line', bind: true, code: PY_ARRIVE },
  { xmlid: 'sa_depart', name: '[SIRE/TRA] Registrar salida real', model: 'x_guests_line', bind: true, code: PY_DEPART },
  { xmlid: 'sa_fix_move', name: '[SIRE/TRA] Corregir hora de llegada/salida', model: 'x_guests_line', bind: true, code: PY_FIX_MOVE },
  { xmlid: 'sa_claim', name: '[SIRE/TRA] Reclamar obligación (emisor)', model: 'x_guests_line', code: PY_CLAIM },
  { xmlid: 'sa_apply_attempt', name: '[SIRE/TRA] Aplicar intento', model: 'x_report_attempt', code: PY_APPLY_ATTEMPT },
  { xmlid: 'sa_sire_export', name: '[SIRE/TRA] Generar archivo SIRE', model: 'x_guests_line', bind: true, code: PY_SIRE_EXPORT },
  { xmlid: 'sa_sire_mark', name: '[SIRE/TRA] Marcar cargado en portal SIRE', model: 'x_guests_line', bind: true, code: PY_SIRE_MARK },
  // groups: sin grupo, Odoo exige permiso de escritura sobre el modelo para ejecutar la accion, y nadie lo tiene
  // (defecto D3 demostrado en la copia: el usuario no podia confirmar ni anular). Con grupo, la escritura va por sudo.
  { xmlid: 'sa_amount_confirm', name: '[SIRE/TRA] Confirmar importe pagado (con evidencia)', model: 'x_tra_amount', bind: true, groups: ['base.group_user'], code: PY_AMOUNT_CONFIRM },
  { xmlid: 'sa_amount_void', name: '[SIRE/TRA] Anular importe', model: 'x_tra_amount', bind: true, groups: ['base.group_user'], code: PY_AMOUNT_VOID },
  { xmlid: 'sa_amount_guard', name: '[SIRE/TRA] Rechazar importe creado con estado o confirmación', model: 'x_tra_amount', groups: ['base.group_user'], code: PY_AMOUNT_GUARD },
];

export const AUTOMATIONS = [
  { xmlid: 'au_map', name: '[SIRE/TRA] Formulario terminado', model: 'survey.user_input', trigger: 'on_create_or_write', triggerFields: ['state'], domain: "[('state', '=', 'done'), ('x_sale_order_id', '!=', False), ('x_ath_state', '=', 'invitado')]", action: 'sa_map' },
  // Reserva confirmada (state = sale) que viene de Smoobu. Dispara al confirmarse o al completar fechas; un borrador no la activa.
  { xmlid: 'au_invite', name: '[SIRE/TRA] Preparar enlace al ingresar la reserva Smoobu y revocarlo al cancelar', model: 'sale.order', trigger: 'on_create_or_write', triggerFields: ['state', 'x_reservation_status', 'x_checkin', 'x_checkout', 'partner_id'], domain: "['&', ('x_pms_reference', 'ilike', 'SMOOBU-'), '|', ('state', 'in', ['draft', 'sent', 'sale', 'cancel']), ('x_reservation_status', 'in', ['cancelled', 'no_show'])]", action: 'sa_invite_auto' },
  { xmlid: 'au_attempt', name: '[SIRE/TRA] Aplicar intento registrado', model: 'x_report_attempt', trigger: 'on_create', triggerFields: [], domain: '', action: 'sa_apply_attempt' },
  { xmlid: 'au_amount_guard', name: '[SIRE/TRA] Importe: rechazar estado o confirmación al crear', model: 'x_tra_amount', trigger: 'on_create', triggerFields: [], domain: "['|', '|', ('x_state', '!=', False), ('x_confirmed_by', '!=', False), ('x_confirmed_at', '!=', False)]", action: 'sa_amount_guard' },
];

// ---------------------------------------------------------------- encuesta (captura unica, por invitacion)
export const MAX_COMPANIONS = 21; // grupo de hasta 22 personas
const DOC_CHOICES = ['Cédula de ciudadanía (Colombia)', 'Tarjeta de identidad (Colombia)', 'Registro civil (Colombia)', 'Cédula de extranjería (Colombia)', 'Pasaporte', 'PEP', 'PPT'];
// Lista de captura. 'Trabajo' (26/11/2026) es el valor del ejemplo oficial del manual Grupo 1 y se envia tal cual; las
// demas opciones no tienen equivalencia respaldada (tra-catalog.json). 'Negocios o motivos profesionales' NO se asigna a
// 'Trabajo': en estadistica de turismo (RIET 2008) designa viajes por negocios o actividad profesional y excluye el empleo
// en una entidad del lugar visitado; el MinCIT no publica que significa 'Trabajo'. Sin opcion por defecto.
// Las opciones existentes conservan id, texto y orden relativo; 'Trabajo' se inserta antes de 'Otro'.
export const REASONS = Object.freeze(['Vacaciones, recreación u ocio', 'Visita a familiares o amigos', 'Negocios o motivos profesionales', 'Salud', 'Educación', 'Religión', 'Trabajo', 'Otro']);

function guestQuestions(prefix, label, trigger) {
  const t = trigger ? { triggerKey: 'p_companions', triggerMin: trigger } : {};
  return [
    { key: `${prefix}doc_type`, title: `${label}: tipo de documento`, type: 'simple_choice', mandatory: true, answers: DOC_CHOICES, ...t },
    { key: `${prefix}doc_num`, title: `${label}: número de documento (sin puntos ni espacios)`, type: 'char_box', mandatory: true, ...t },
    { key: `${prefix}given`, title: `${label}: nombres`, type: 'char_box', mandatory: true, ...t },
    { key: `${prefix}surname1`, title: `${label}: primer apellido`, type: 'char_box', mandatory: true, ...t },
    { key: `${prefix}surname2`, title: `${label}: segundo apellido (si tiene)`, type: 'char_box', mandatory: false, ...t },
    { key: `${prefix}nationality`, title: `${label}: país de nacionalidad (ej.: Colombia, España, Estados Unidos o su código: CO, ES, US)`, type: 'char_box', mandatory: true, ...t },
    { key: `${prefix}birth`, title: `${label}: fecha de nacimiento`, type: 'date', mandatory: true, ...t },
  ];
}

export function surveyQuestions() {
  const q = [{ key: 'pg_main', title: 'Huésped principal', page: true }];
  q.push(...guestQuestions('p_', 'Huésped principal'));
  q.push(
    { key: 'p_res_city', title: 'Ciudad de residencia', type: 'char_box', mandatory: true },
    { key: 'p_res_country', title: 'País de residencia (nombre o código: CO, US...)', type: 'char_box', mandatory: true },
    { key: 'p_origin_city', title: 'Ciudad de procedencia (última ciudad antes de llegar)', type: 'char_box', mandatory: true },
    { key: 'p_origin_country', title: 'País de procedencia', type: 'char_box', mandatory: true },
    { key: 'p_dest', title: 'Próximo destino (ciudad)', type: 'char_box', mandatory: false },
    { key: 'p_dest_country', title: 'País del proximo destino', type: 'char_box', mandatory: true },
    { key: 'p_reason', title: 'Motivo principal del viaje', type: 'simple_choice', mandatory: true, answers: REASONS },
    { key: 'p_companions', title: 'Número de acompañantes', type: 'simple_choice', mandatory: true, answers: Array.from({ length: MAX_COMPANIONS + 1 }, (_, i) => String(i)) },
    { key: 'p_consent', title: 'Autorizo el tratamiento de mis datos y los de mis acompañantes para el registro obligatorio de huéspedes (Migración Colombia y Tarjeta de Registro de Alojamiento del MinCIT).', type: 'simple_choice', mandatory: true, answers: ['Sí, autorizo'] },
  );
  for (let k = 1; k <= MAX_COMPANIONS; k += 1) {
    q.push({ key: `pg_c${k}`, title: `Acompañante ${k}`, page: true });
    q.push(...guestQuestions(`c${k}_`, `Acompañante ${k}`, k));
  }
  return q;
}

export const SURVEY = {
  xmlid: 'survey_registro',
  vals: {
    title: 'Registro de huéspedes - Atheron',
    access_mode: 'token',
    questions_layout: 'page_per_section',
    questions_selection: 'all',
    users_login_required: false,
    is_attempts_limited: true,
    attempts_limit: 1,
    certification: false,
    scoring_type: 'no_scoring',
    description: '<p>Registro obligatorio de huéspedes. El huésped principal registra sus datos y los de sus acompañantes. Los datos se usan solo para los reportes legales (Migración Colombia para extranjeros y Tarjeta de Registro de Alojamiento del MinCIT).</p>',
    description_done: '<p>Gracias. Recepción revisará los datos a su llegada.</p>',
  },
};

// ---------------------------------------------------------------- vistas, acciones y menus
const R = (x) => `{{ref:${x}}}`;
const LOCKED = "readonly=\"x_data_state == 'validado'\"";

export const VIEWS = [
  { xmlid: 'view_guest_form', name: 'ath.sire.tra.guest.form', model: 'x_guests_line', type: 'form', priority: 90, arch: `<form string="Huésped SIRE/TRA">
<header>
<button name="${R('sa_validate')}" type="action" string="Validar datos" class="btn-primary" invisible="x_data_state not in ('recibido', 'rechazado', 'borrador', False)"/>
<button name="${R('sa_reject')}" type="action" string="Marcar no valido" invisible="x_data_state != 'recibido'"/>
<button name="${R('sa_arrive')}" type="action" string="Registrar llegada real" class="btn-primary" invisible="x_data_state != 'validado' or x_arrived_at"/>
<button name="${R('sa_depart')}" type="action" string="Registrar salida real" invisible="not x_arrived_at or x_departed_at"/>
<button name="${R('sa_fix_move')}" type="action" string="Corregir hora de llegada/salida" invisible="not x_arrived_at"/>
<button name="${R('act_attempt_new')}" type="action" string="Registrar resultado de reporte" context="{'default_x_guest_line_id': id}" invisible="not x_arrived_at"/>
<field name="x_data_state" widget="statusbar" statusbar_visible="recibido,validado"/>
</header>
<sheet>
<div class="alert alert-warning" role="alert" invisible="not x_date_gap"><strong>Discrepancia de fechas.</strong> Las fechas que TRA aceptó (entrada <field name="x_tra_rep_checkin" readonly="1" nolabel="1" class="oe_inline"/>, salida <field name="x_tra_rep_checkout" readonly="1" nolabel="1" class="oe_inline"/>) ya no coinciden con la estancia. La aceptación y su comprobante se conservan sin cambios y no se reenvía nada. El procedimiento lo define gerencia.</div>
<group>
<group string="Identificación">
<field name="x_sale_order_id" readonly="1"/>
<field name="x_is_main" ${LOCKED}/>
<field name="x_doc_type_id" options="{'no_create': True}" ${LOCKED}/>
<field name="x_identity_number" ${LOCKED}/>
<field name="x_given_names" ${LOCKED}/>
<field name="x_surname_1" ${LOCKED}/>
<field name="x_surname_2" ${LOCKED}/>
<field name="x_nationality" options="{'no_create': True}" ${LOCKED}/>
<field name="x_birth_date" ${LOCKED}/>
<field name="x_is_foreign"/>
</group>
<group string="Viaje y habitación">
<field name="x_room_resource_id" options="{'no_create': True}" ${LOCKED}/>
<field name="x_establishment_id" readonly="1"/>
<field name="x_residence_city_id" options="{'no_create': True}"/>
<field name="x_residence_text"/>
<field name="x_residence_country_id" options="{'no_create': True}"/>
<field name="x_origin_city_id" options="{'no_create': True}"/>
<field name="x_origin_text"/>
<field name="x_origin_country_id" options="{'no_create': True}"/>
<field name="x_destination_text"/>
<field name="x_destination_country_id" options="{'no_create': True}"/>
<field name="x_travel_reason"/>
<field name="x_consent" readonly="1"/>
<field name="x_consent_at" readonly="1"/>
</group>
<group string="Estancia real">
<field name="x_arrival_input" invisible="x_data_state != 'validado'" help="Fecha y hora en que el huésped llegó de verdad. Se escribe antes de pulsar «Registrar llegada real» (o para corregirla)."/>
<field name="x_departure_input" invisible="not x_arrived_at" help="Fecha y hora en que el huésped salió de verdad. Se escribe antes de pulsar «Registrar salida real» (o para corregirla)."/>
<field name="x_movement_reason" invisible="x_data_state != 'validado'" help="Obligatorio si se registra más de 1 hora después del movimiento, y en toda corrección."/>
<field name="x_arrived_at" readonly="1"/>
<field name="x_arrival_captured_at" readonly="1" invisible="not x_arrived_at"/>
<field name="x_arrival_captured_by" readonly="1" invisible="not x_arrived_at"/>
<field name="x_departed_at" readonly="1"/>
<field name="x_departure_captured_at" readonly="1" invisible="not x_departed_at"/>
<field name="x_departure_captured_by" readonly="1" invisible="not x_departed_at"/>
<field name="x_movement_log" readonly="1" invisible="not x_movement_log"/>
</group>
<group string="Reportes">
<field name="x_sire_in_state" readonly="1"/>
<field name="x_sire_out_state" readonly="1"/>
<field name="x_tra_state" readonly="1"/>
<field name="x_tra_external_id" readonly="1"/>
<field name="x_tra_rep_checkin" readonly="1"/>
<field name="x_tra_rep_checkout" readonly="1"/>
<field name="x_order_checkout" readonly="1"/>
<field name="x_date_gap" readonly="1"/>
<field name="x_last_error" readonly="1"/>
</group>
</group>
<field name="x_attempt_ids" readonly="1"><list><field name="create_date"/><field name="x_system"/><field name="x_channel"/><field name="x_result"/><field name="x_external_id"/><field name="x_error_code"/><field name="x_evidence_name"/></list></field>
</sheet>
</form>` },
  { xmlid: 'view_guest_list', name: 'ath.sire.tra.guest.list', model: 'x_guests_line', type: 'list', priority: 90, arch: `<list string="Huéspedes SIRE/TRA" create="0" decoration-danger="x_tra_state in ('incierto', 'rechazado') or x_sire_in_state in ('incierto', 'rechazado') or x_sire_out_state in ('incierto', 'rechazado')" decoration-warning="x_date_gap != False" decoration-muted="x_data_state == 'rechazado'">
<field name="x_sale_order_id"/><field name="x_is_main"/><field name="x_given_names"/><field name="x_surname_1"/><field name="x_doc_type_id"/><field name="x_identity_number"/><field name="x_nationality"/><field name="x_room_resource_id"/><field name="x_data_state"/><field name="x_arrived_at"/><field name="x_departed_at"/><field name="x_sire_in_state"/><field name="x_sire_out_state"/><field name="x_tra_state"/><field name="x_date_gap"/><field name="x_last_error" optional="hide"/>
</list>` },
  { xmlid: 'view_guest_search', name: 'ath.sire.tra.guest.search', model: 'x_guests_line', type: 'search', priority: 90, arch: `<search>
<field name="x_sale_order_id"/><field name="x_identity_number"/><field name="x_surname_1"/>
<filter name="f_recibidos" string="Por validar" domain="[('x_data_state', '=', 'recibido')]"/>
<filter name="f_validados" string="Validados sin llegada" domain="[('x_data_state', '=', 'validado'), ('x_arrived_at', '=', False)]"/>
<filter name="f_alojados" string="Alojados" domain="[('x_arrived_at', '!=', False), ('x_departed_at', '=', False)]"/>
<separator/>
<filter name="f_sire_in" string="SIRE entrada por reportar" domain="[('x_sire_in_state', 'in', ('pendiente', 'en_envio', 'enviado'))]"/>
<filter name="f_sire_out" string="SIRE salida por reportar" domain="[('x_sire_out_state', 'in', ('pendiente', 'en_envio', 'enviado'))]"/>
<filter name="f_tra" string="TRA por reportar" domain="[('x_tra_state', 'in', ('pendiente', 'en_envio', 'enviado'))]"/>
<filter name="f_date_gap" string="Discrepancia de fechas" domain="[('x_date_gap', '!=', False)]"/>
<filter name="f_alerta" string="Incierto o rechazado" domain="['|', '|', ('x_sire_in_state', 'in', ('incierto', 'rechazado')), ('x_sire_out_state', 'in', ('incierto', 'rechazado')), ('x_tra_state', 'in', ('incierto', 'rechazado'))]"/>
<group><filter name="g_order" string="Reserva" context="{'group_by': 'x_sale_order_id'}"/></group>
</search>` },
  { xmlid: 'view_sire_sheet', name: 'ath.sire.tra.sire.sheet', model: 'x_guests_line', type: 'list', priority: 91, arch: `<list string="Hoja guíada SIRE (orden del formulario del portal)" create="0">
<field name="x_sire_in_state" string="Entrada"/><field name="x_arrived_at" string="Fecha entrada"/><field name="x_sire_out_state" string="Salida"/><field name="x_departed_at" string="Fecha salida"/>
<field name="x_doc_type_id"/><field name="x_identity_number"/><field name="x_birth_date"/><field name="x_surname_1"/><field name="x_surname_2"/><field name="x_given_names"/><field name="x_nationality"/><field name="x_origin_country_id" string="País de procedencia"/><field name="x_destination_country_id" string="País proximo destino"/>
</list>` },
  { xmlid: 'view_tra_sheet', name: 'ath.sire.tra.tra.sheet', model: 'x_guests_line', type: 'list', priority: 92, arch: `<list string="Hoja guíada TRA" create="0">
<field name="x_sale_order_id"/><field name="x_is_main"/><field name="x_doc_type_id"/><field name="x_identity_number"/><field name="x_given_names"/><field name="x_surname_1"/><field name="x_surname_2"/><field name="x_residence_city_id"/><field name="x_residence_text"/><field name="x_origin_city_id"/><field name="x_origin_text"/><field name="x_tra_room"/><field name="x_travel_reason"/><field name="x_order_checkin"/><field name="x_order_checkout"/><field name="x_tra_state"/><field name="x_tra_external_id"/>
</list>` },
  { xmlid: 'view_attempt_form', name: 'ath.sire.tra.attempt.form', model: 'x_report_attempt', type: 'form', priority: 90, arch: `<form string="Resultado de reporte" edit="0">
<sheet><group>
<field name="x_guest_line_id" options="{'no_create': True, 'no_open': True}"/>
<field name="x_system"/><field name="x_channel"/><field name="x_result"/>
<field name="x_external_id"/><field name="x_error_code"/>
<field name="x_reported_checkin"/><field name="x_reported_checkout"/>
<field name="x_evidence" filename="x_evidence_name"/><field name="x_evidence_name" invisible="1"/>
<field name="x_actor" placeholder="Quien registra (declarado)"/><field name="x_note"/>
<field name="x_sale_order_id" readonly="1"/><field name="x_http_status" readonly="1"/><field name="x_run_ref" readonly="1"/>
</group></sheet>
</form>` },
  { xmlid: 'view_attempt_list', name: 'ath.sire.tra.attempt.list', model: 'x_report_attempt', type: 'list', priority: 90, arch: `<list string="Intentos y evidencia" create="0"><field name="create_date"/><field name="x_sale_order_id"/><field name="x_guest_line_id"/><field name="x_system"/><field name="x_channel"/><field name="x_result"/><field name="x_external_id"/><field name="x_http_status"/><field name="x_error_code"/><field name="x_reported_checkin" optional="show"/><field name="x_reported_checkout" optional="show"/><field name="x_run_ref"/><field name="x_actor"/><field name="x_evidence_name"/></list>` },
  { xmlid: 'view_est_form', name: 'ath.sire.tra.establishment.form', model: 'x_establishment', type: 'form', priority: 90, arch: `<form string="Establecimiento">
<sheet><group>
<group string="Identificación"><field name="x_name"/><field name="x_code"/><field name="x_active"/><field name="x_address_partner_id"/><field name="x_analytic_account_id"/></group>
<group string="RNT y operador"><field name="x_rnt_number"/><field name="x_rnt_holder_id"/><field name="x_rnt_expiry"/><field name="x_operator_company_id"/></group>
<group string="SIRE"><field name="x_sire_reporter_id"/><field name="x_sire_company_code"/><field name="x_sire_city_code"/><field name="x_sire_move_in_code"/><field name="x_sire_move_out_code"/><field name="x_sire_date_format"/><field name="x_sire_encoding"/><field name="x_sire_codes_verified"/><field name="x_sire_export_enabled"/></group>
<group string="TRA"><field name="x_tra_mode"/><field name="x_tra_establishment_name"/><field name="x_tra_establishment_name_source"/><field name="x_tra_accommodation_type"/><field name="x_tra_cost_basis"/><field name="x_tra_config_verified"/></group>
</group></sheet>
</form>` },
  { xmlid: 'view_amount_form', name: 'ath.sire.tra.amount.form', model: 'x_tra_amount', type: 'form', priority: 90, arch: `<form string="Importe pagado (TRA)">
<header><button name="${R('sa_amount_confirm')}" type="action" string="Confirmar con evidencia" class="btn-primary" invisible="x_state in ('confirmado', 'anulado')"/><button name="${R('sa_amount_void')}" type="action" string="Anular" invisible="x_state == 'anulado'"/><field name="x_state" widget="statusbar" readonly="1"/></header>
<sheet>
<div class="alert alert-info" role="status">Costo total del alojamiento del huésped principal y de todos sus acompañantes, sin impuestos (MinCIT, respuesta 2-2026-039958). Regla interna: se confirma después de registrar la salida real, con fecha de corte igual o posterior a esa salida; una tarifa o un anticipo no son el importe definitivo.</div>
<group>
<group string="Importe"><field name="x_sale_order_id" options="{'no_create': True}"/><field name="x_amount"/><field name="x_currency_id" options="{'no_create': True}"/><field name="x_cutoff_date"/><field name="x_excludes_taxes"/><field name="x_covers_all_guests"/></group>
<group string="Evidencia"><field name="x_evidence_kind"/><field name="x_evidence_ref"/><field name="x_evidence" filename="x_evidence_name"/><field name="x_evidence_name" invisible="1"/></group>
<group string="Confirmación"><field name="x_confirmed_by" readonly="1"/><field name="x_confirmed_at" readonly="1"/><field name="x_name"/><field name="x_note"/></group>
</group></sheet>
</form>` },
  { xmlid: 'view_amount_list', name: 'ath.sire.tra.amount.list', model: 'x_tra_amount', type: 'list', priority: 90, arch: '<list string="Importes pagados (TRA)"><field name="x_sale_order_id"/><field name="x_amount"/><field name="x_currency_id"/><field name="x_cutoff_date"/><field name="x_excludes_taxes" optional="show"/><field name="x_covers_all_guests" optional="show"/><field name="x_evidence_kind"/><field name="x_evidence_ref"/><field name="x_state"/><field name="x_confirmed_by"/><field name="x_confirmed_at"/></list>' },
  { xmlid: 'view_est_list', name: 'ath.sire.tra.establishment.list', model: 'x_establishment', type: 'list', priority: 90, arch: '<list><field name="x_code"/><field name="x_name"/><field name="x_rnt_number"/><field name="x_tra_mode"/><field name="x_sire_export_enabled"/><field name="x_active"/></list>' },
  { xmlid: 'view_invite_list', name: 'ath.sire.tra.invite.list', model: 'survey.user_input', type: 'list', priority: 90, arch: '<list string="Enlaces de registro" create="0"><field name="create_date"/><field name="x_sale_order_id"/><field name="x_ath_state"/><field name="deadline"/><field name="x_ath_url" widget="CopyClipboardChar"/><field name="x_ath_contact_gap" optional="show" decoration-warning="x_ath_contact_gap"/><field name="x_ath_message" widget="CopyClipboardText" optional="hide"/><field name="x_ath_error" optional="show"/></list>' },
  { xmlid: 'view_invite_form', name: 'ath.sire.tra.invite.form', model: 'survey.user_input', type: 'form', priority: 90, arch: `<form string="Enlace de registro" create="0" edit="0">
<header><button name="${R('sa_revoke')}" type="action" string="Revocar enlace" invisible="x_ath_state != 'invitado'"/></header>
<sheet><group><field name="x_sale_order_id"/><field name="x_ath_state"/><field name="deadline"/><field name="x_ath_url" widget="CopyClipboardChar"/><field name="x_ath_contact_gap" invisible="not x_ath_contact_gap"/><field name="x_ath_message" widget="CopyClipboardText" invisible="not x_ath_message"/><field name="x_ath_processed_at"/><field name="x_ath_error"/><field name="x_ath_form_version"/><field name="x_ath_submitted_at"/><field name="x_ath_snapshot" groups="base.group_system"/></group></sheet>
</form>` },
];

const W = (model, name, views, extra = {}) => ({ model, name, views, ...extra });
export const WINDOW_ACTIONS = [
  { xmlid: 'act_guests', ...W('x_guests_line', 'Huéspedes', ['view_guest_list', 'view_guest_form'], { search: 'view_guest_search', domain: "[('x_data_state', '!=', False)]" }) },
  { xmlid: 'act_sire_sheet', ...W('x_guests_line', 'Hoja guíada SIRE', ['view_sire_sheet', 'view_guest_form'], { search: 'view_guest_search', domain: "[('x_is_foreign', '=', True), '|', ('x_sire_in_state', 'in', ('pendiente', 'en_envio', 'enviado', 'incierto')), ('x_sire_out_state', 'in', ('pendiente', 'en_envio', 'enviado', 'incierto'))]" }) },
  { xmlid: 'act_tra_sheet', ...W('x_guests_line', 'Hoja guíada TRA', ['view_tra_sheet', 'view_guest_form'], { search: 'view_guest_search', domain: "[('x_tra_state', 'in', ('pendiente', 'en_envio', 'enviado', 'incierto', 'rechazado'))]" }) },
  { xmlid: 'act_date_gap', ...W('x_guests_line', 'Discrepancia de fechas', ['view_guest_list', 'view_guest_form'], { search: 'view_guest_search', domain: "[('x_date_gap', '!=', False)]" }) },
  { xmlid: 'act_attempts', ...W('x_report_attempt', 'Intentos y evidencia', ['view_attempt_list', 'view_attempt_form']) },
  { xmlid: 'act_attempt_new', ...W('x_report_attempt', 'Registrar resultado de reporte', ['view_attempt_form'], { target: 'new', view_mode: 'form' }) },
  { xmlid: 'act_invites', ...W('survey.user_input', 'Enlaces de registro', ['view_invite_list', 'view_invite_form'], { domain: "[('x_sale_order_id', '!=', False)]" }) },
  { xmlid: 'act_establishments', ...W('x_establishment', 'Establecimientos', ['view_est_list', 'view_est_form']) },
  { xmlid: 'act_amounts', ...W('x_tra_amount', 'Importes pagados (TRA)', ['view_amount_list', 'view_amount_form']) },
  { xmlid: 'act_orders', ...W('sale.order', 'Reservas', [], { domain: "[('is_rental_order', '=', True)]" }) },
];

export const MENUS = [
  { xmlid: 'menu_root', name: 'Registro SIRE/TRA', sequence: 95 },
  { xmlid: 'menu_orders', name: 'Reservas', parent: 'menu_root', action: 'act_orders', sequence: 1 },
  { xmlid: 'menu_invites', name: 'Enlaces de registro', parent: 'menu_root', action: 'act_invites', sequence: 2 },
  { xmlid: 'menu_guests', name: 'Huéspedes', parent: 'menu_root', action: 'act_guests', sequence: 3 },
  { xmlid: 'menu_sire', name: 'Hoja guíada SIRE', parent: 'menu_root', action: 'act_sire_sheet', sequence: 4 },
  { xmlid: 'menu_tra', name: 'Hoja guíada TRA', parent: 'menu_root', action: 'act_tra_sheet', sequence: 5 },
  { xmlid: 'menu_date_gap', name: 'Discrepancia de fechas', parent: 'menu_root', action: 'act_date_gap', sequence: 6 },
  { xmlid: 'menu_attempts', name: 'Intentos y evidencia', parent: 'menu_root', action: 'act_attempts', sequence: 7 },
  { xmlid: 'menu_est', name: 'Establecimientos', parent: 'menu_root', action: 'act_establishments', sequence: 8 },
  { xmlid: 'menu_amounts', name: 'Importes pagados (TRA)', parent: 'menu_root', action: 'act_amounts', sequence: 9 },
];

/** Modelos técnicos que el aplicador puede tocar. Nada de datos de negocio. */
export const WRITABLE_MODELS = Object.freeze(['ir.model', 'ir.model.fields', 'ir.model.access', 'ir.model.data', 'ir.actions.server', 'base.automation', 'ir.ui.view', 'ir.actions.act_window', 'ir.actions.act_window.view', 'ir.ui.menu', 'survey.survey', 'survey.question']);
/** Modelos existentes de los que depende (deben existir antes). */
export const REQUIRED_MODELS = Object.freeze(['sale.order', 'resource.resource', 'x_guests_line', 'survey.survey', 'survey.question', 'survey.user_input', 'l10n_latam.identification.type', 'res.country', 'res.city', 'res.partner', 'res.company', 'account.analytic.account', 'ir.attachment', 'res.currency', 'res.users']);
