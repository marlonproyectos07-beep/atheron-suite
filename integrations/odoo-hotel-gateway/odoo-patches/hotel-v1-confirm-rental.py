# Replacement code for ir.actions.server 1899 on Odoo STAGING only.
# Requires a fresh read/backup of the live action before installation.
# Odoo safe_eval supplies env, records, UserError, datetime and timezone.
LABEL = {'draft': 'CONSULTA', 'opcion': 'OPCION', 'hold': 'HOLD'}
PS = env['planning.slot'].sudo()
for order in records:
    unit = order.x_hotel_unit_id
    if not unit:
        raise UserError('HOTEL: defina la unidad antes de confirmar.')
    cur = order.x_reservation_status or 'draft'
    if cur not in ('draft', 'opcion', 'hold'):
        raise UserError('HOTEL: transicion no permitida %s -> CONFIRMADA en %s.' % (LABEL.get(cur, cur), order.name))
    if not order.x_checkin or not order.x_checkout or order.x_checkout <= order.x_checkin:
        raise UserError('HOTEL: check-in y check-out validos son obligatorios.')
    if not unit.x_resource_id or not unit.x_role_id or not unit.x_product_tmpl_id:
        raise UserError('HOTEL: unidad sin recurso, rol o producto de alquiler; no se confirma sin inventario.')
    if not unit.x_product_tmpl_id.rent_ok:
        raise UserError('HOTEL: el producto de la unidad no esta habilitado para alquiler.')
    product = unit.x_product_tmpl_id.product_variant_id
    room_lines = [line for line in order.order_line if line.product_id.id == product.id]
    if len(room_lines) != 1:
        raise UserError('HOTEL: se requiere exactamente una linea del producto de la unidad.')
    line = room_lines[0]

    prop = unit.x_property_id
    tz = timezone(prop.x_tz or 'America/Bogota')
    utc = timezone('UTC')
    cin = prop.x_checkin_time or 15.0
    cout = prop.x_checkout_time or 11.0
    ci = order.x_checkin
    co = order.x_checkout
    start = tz.localize(datetime.datetime(ci.year, ci.month, ci.day, int(cin), int(round((cin % 1) * 60)))).astimezone(utc).replace(tzinfo=None)
    end = tz.localize(datetime.datetime(co.year, co.month, co.day, int(cout), int(round((cout % 1) * 60)))).astimezone(utc).replace(tzinfo=None)
    if end <= start:
        raise UserError('HOTEL: periodo de alquiler invalido.')

    # Preserve commercial data; Rental may recompute prices during confirmation.
    agreed = [(item, item.product_uom_qty, item.price_unit, item.discount) for item in order.order_line]
    total = order.amount_total
    order.write({'is_rental_order': True, 'rental_start_date': start, 'rental_return_date': end})
    if not line.is_rental:
        line.write({'is_rental': True})
    if not order.is_rental_order or not line.is_rental:
        raise UserError('HOTEL: Odoo no acepto la configuracion de alquiler.')

    # Existing HOTEL v1 inventory automation checks CASA <-> rooms on this transition.
    order.write({'x_reservation_status': 'confirmed'})
    if order.state in ('draft', 'sent'):
        order.action_confirm()
    for item, qty, price, discount in agreed:
        if item.exists() and (item.product_uom_qty != qty or item.price_unit != price or item.discount != discount):
            item.write({'product_uom_qty': qty, 'price_unit': price, 'discount': discount})
    if abs(order.amount_total - total) > 0.01:
        raise UserError('HOTEL: confirmar altero el precio acordado; se revierte la operacion.')
    if order.state not in ('sale', 'done') or not order.is_rental_order or order.rental_status != 'pickup':
        raise UserError('HOTEL: la orden no quedo Reservada en Alquileres; se revierte la operacion.')

    # Only one already-created Planning slot is acceptable. Never use Pickup/Collection
    # to create the initial reservation or create a second slot as a workaround.
    slots = PS.search([('sale_line_id', '=', line.id), ('state', '=', 'published'),
                       ('resource_id', '=', unit.x_resource_id.id)])
    if len(slots) != 1:
        raise UserError('HOTEL: Alquileres no creo exactamente un bloque Planning para la unidad y periodo; se revierte la operacion.')
    slot = slots[0]
    if slot.start_datetime != start or slot.end_datetime != end:
        slot.write({'start_datetime': start, 'end_datetime': end})
    if slot.start_datetime != start or slot.end_datetime != end:
        raise UserError('HOTEL: el bloque Planning no conserva el periodo de alquiler; se revierte la operacion.')
