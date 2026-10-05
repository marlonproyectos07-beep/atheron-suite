# ATHERON iCal — REFRESH SOLO 202 (rol 19). Escribe SOLO el adjunto 26984. SUMMARY neutro.
ROLE_ID = 19
ATTACH_ID = 26984
OTA_CH = ('booking', 'airbnb', 'expedia')
SUMMARY_PUBLIC = 'ODOO - Not available'

role = env['planning.role'].sudo().browse(ROLE_ID)
if not role.exists() or not role.x_is_a_room_offer:
    raise UserError('Rol 19 invalido')
attach = env['ir.attachment'].sudo().browse(ATTACH_ID)
if (not attach.exists() or attach.name != 'ical_atheron_role_19.ics'
        or attach.res_model != 'planning.role' or attach.res_id != ROLE_ID):
    raise UserError('Adjunto 26984 no coincide con el rol 19')

roles = env['planning.role'].sudo().search([('x_is_a_room_offer', '=', True), ('x_casa', '=', role.x_casa)])
completa = roles.filtered(lambda r: 'completa' in (r.name or '').lower())
linked_ids = [r.id for r in completa if r.id != ROLE_ID]

cand = env['planning.slot'].sudo().search([
    ('state', '=', 'published'),
    ('role_id', 'in', [ROLE_ID] + linked_ids),
    ('x_bloqueo_ref', 'in', [False, '']),
])
slots = cand.filtered(lambda s: s.start_datetime and s.end_datetime
                      and s.x_hotel_block_kind not in ('external', 'derived')
                      and not s.x_nobeds_id
                      and s.x_channel not in OTA_CH)
if slots.filtered(lambda s: s.x_hotel_block_kind in ('external', 'derived') or s.x_nobeds_id or s.x_bloqueo_ref or s.x_channel in OTA_CH):
    raise UserError('Abortado: el filtro dejo pasar eventos OTA/derivados')

now_str = datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Atheron Suite//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
for slot in slots:
    uid = 'slot-' + str(slot.id) + '-r' + str(ROLE_ID) + '@atheron1.odoo.com'
    dtstart = slot.start_datetime.strftime('%Y%m%dT%H%M%SZ')
    dtend = slot.end_datetime.strftime('%Y%m%dT%H%M%SZ')
    lines += ['BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + now_str, 'DTSTART:' + dtstart,
              'DTEND:' + dtend, 'SUMMARY:' + SUMMARY_PUBLIC, 'STATUS:CONFIRMED', 'END:VEVENT']
lines.append('END:VCALENDAR')
ical_content = '\r\n'.join(lines) + '\r\n'
ical_b64 = b64encode(ical_content.encode('utf-8')).decode('utf-8')

attach.write({'datas': ical_b64})
log('iCal 202: ' + str(len(slots)) + ' eventos -> adjunto 26984 (SUMMARY neutro)')
