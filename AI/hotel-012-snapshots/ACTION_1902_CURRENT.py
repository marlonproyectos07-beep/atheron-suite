# ATH-ODOO-HOTEL-012 — Snapshot ACTUAL de la accion 1902 (posterior a la modificacion)
# ir.actions.server id 1902 | nombre: "HOTEL v1 — CHECKOUT" | modelo: sale.order | tipo: codigo
# write_date ACTUAL: 2026-10-01 05:20:38 | Base: STAGING
# Fuente: handoff de Marlon (copia textual). Todo lo que sigue a esta cabecera es el campo `code` tal cual.
# ---------------------------------------------------------------------------------------------
LABEL = {'draft': 'CONSULTA', 'opcion': 'OPCION', 'hold': 'HOLD', 'confirmed': 'CONFIRMADA', 'pre_checkin': 'PRE_CHECKIN', 'checked_in': 'CHECKIN', 'checked_out': 'CHECKOUT', 'closed': 'CERRADA', 'cancelled': 'CANCELADA', 'no_show': 'NO_SHOW'}
now = datetime.datetime.now()
for order in records:
    cur = order.x_reservation_status or 'draft'
    if cur not in ('checked_in',):
        raise UserError('HOTEL: transición no permitida %s → CHECKOUT en %s.' % (LABEL.get(cur), order.name))
    order.write({'x_reservation_status': 'checked_out', 'x_checkout_actual': now, 'x_checkout_done': True})
    prop = order.x_hotel_unit_id.x_property_id
    leaves = order.x_hotel_unit_id
    while leaves.filtered(lambda u: u.x_child_ids):
        leaves = leaves.filtered(lambda u: not u.x_child_ids) | leaves.mapped('x_child_ids')
    leaves.mapped('x_resource_id').sudo().write({'x_occupancy': 'vacant'})
    leaves.mapped('x_role_id').sudo().write({'x_estado_limpieza': 'sucia'})
    if not (prop.x_hk_project_id and prop.x_hk_stage_todo_id):
        raise UserError('HOTEL: configure proyecto/etapas de housekeeping en la propiedad %s.' % prop.x_name)
    Task = env['project.task'].sudo()
    for leaf in leaves:
        res = leaf.x_resource_id
        task = Task.search([('project_id', '=', prop.x_hk_project_id.id), ('x_resource_id', '=', res.id), ('stage_id', 'not in', (prop.x_hk_stage_ready_id | prop.x_hk_stage_issue_id).ids), ('state', 'not in', ['1_done', '1_canceled'])], limit=1) if res else Task
        if task:
            task.write({'stage_id': prop.x_hk_stage_todo_id.id, 'x_cleaning': 'checkout', 'name': 'Limpieza %s — %s' % (leaf.x_name, order.name), 'description': 'Reserva %s - Unidad %s' % (order.name, leaf.x_name)})
            task.message_post(body='Movida a POR LIMPIAR por CHECKOUT de %s.' % order.name, subtype_xmlid='mail.mt_note')
        else:
            Task.create({'name': 'Limpieza %s — %s' % (leaf.x_name, order.name), 'project_id': prop.x_hk_project_id.id, 'stage_id': prop.x_hk_stage_todo_id.id, 'x_resource_id': res.id or False, 'x_cleaning': 'checkout', 'partner_id': order.partner_id.id})
