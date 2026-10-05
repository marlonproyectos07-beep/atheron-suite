# HOTEL v1 — API GATEWAY (Sofía) — ATH-ODOO-HOTEL-006
# Única puerta para el usuario técnico API. Operaciones: availability | quote | hold | status.
# context: op, payload (dict con parámetros del cliente). Todo lo demás del contexto se ignora.
now = datetime.datetime.now()
ctx = env.context
ROOT = env.ref('base.user_root')
API = env['res.groups'].sudo().search([('name', '=', 'Hotel v1 / API Sofía')], limit=1)
is_api = env.user in API.sudo().user_ids
channel = 'sofia' if is_api else 'staff_gateway'
op = str(ctx.get('op') or '')
pl = ctx.get('payload') or {}
ALLOWED = {'availability': ['fecha_entrada', 'fecha_salida', 'personas', 'property_id'],
           'quote': ['fecha_entrada', 'fecha_salida', 'personas', 'property_id', 'client_ref'],
           'hold': ['quote_id', 'unit_id', 'client_ref', 'client_name', 'client_phone'],
           'status': ['quote_id', 'hold_id', 'client_ref'],
           'ota_blocks_list': ['property_id'],
           'ota_block_apply': ['source', 'canonical_unit_id', 'odoo_unit_id', 'external_uid', 'check_in', 'check_out', 'property_id'],
           'ota_block_release': ['property_id'],
           'ota_snapshot_list': ['source', 'canonical_unit_id', 'property_id'],
           'ota_snapshot_put': ['entry', 'property_id']}
COMMON = ['idempotency_key', 'correlation_id']
FORBIDDEN = ['approved', 'approve', 'price', 'precio', 'precio_total', 'price_unit', 'discount', 'descuento', 'tax', 'taxes', 'tax_ids', 'impuesto', 'confirmed', 'confirm',
             'extra_approved', 'x_hotel_extra_approved', 'inventory_override', 'override', 'allow_preview', 'include_validated', 'qa_fixtures', 'mode', 'hold_origin',
             'partner_id', 'pricelist_id', 'x_reservation_status', 'state', 'channel', 'source_channel', 'user_id', 'sudo']
LOG = env['x_hotel_api_log'].sudo()
corr = str(pl.get('correlation_id') or '')[:64]
ikey = str(pl.get('idempotency_key') or '')[:128]
safe_req = dict([(k, pl.get(k)) for k in pl if k not in ('client_name', 'client_phone')])
if pl.get('client_phone'):
    safe_req['client_phone'] = '***' + str(pl.get('client_phone'))[-3:]
res = {'ok': False, 'op': op, 'correlation_id': corr, 'idempotency_key': ikey or None, 'idempotent_replay': False, 'error_code': None, 'message': '', 'data': None}
logv = {'x_name': '%s %s' % (op, corr or now), 'x_user_id': env.uid, 'x_ts': now, 'x_operation': op, 'x_correlation_id': corr, 'x_idempotency_key': ikey, 'x_source_channel': channel,
        'x_client_ref': str(pl.get('client_ref') or '')[:64], 'x_request': json.dumps(safe_req, ensure_ascii=False, default=str)[:4000]}
def fail(code, msg):
    res['error_code'] = code
    res['message'] = msg
    return res
err = None
if op not in ALLOWED:
    err = fail('UNKNOWN_OP', 'Operación no permitida')
if not err:
    bad = [k for k in pl if k in FORBIDDEN]
    if bad:
        err = fail('FORBIDDEN_PARAM', 'Parámetros prohibidos: %s' % ', '.join(sorted(bad)))
if not err:
    unk = [k for k in pl if k not in ALLOWED[op] + COMMON]
    if unk:
        err = fail('UNKNOWN_PARAM', 'Parámetros no reconocidos: %s' % ', '.join(sorted(unk)))
if not err:
    rl = env['ir.config_parameter'].sudo().get_param('hotel_v1.api_rate_limit_per_min')
    if rl and is_api:
        n = LOG.search_count([('x_user_id', '=', env.uid), ('x_ts', '>=', now - datetime.timedelta(minutes=1))])
        if n >= int(rl):
            err = fail('RATE_LIMITED', 'Límite de solicitudes por minuto alcanzado')
if not err and op == 'hold' and not ikey:
    err = fail('IDEMPOTENCY_KEY_REQUIRED', 'hold requiere idempotency_key')
if not err and op in ('ota_block_apply', 'ota_block_release') and not ikey:
    err = fail('IDEMPOTENCY_KEY_REQUIRED', '%s requiere idempotency_key' % op)
if not err and op == 'ota_block_apply':
    required = ('source', 'canonical_unit_id', 'odoo_unit_id', 'external_uid', 'check_in', 'check_out')
    missing = [k for k in required if not str(pl.get(k) or '').strip()]
    if missing:
        err = fail('INVALID_PARAM', 'Faltan parámetros OTA: %s' % ', '.join(missing))
if not err and op == 'ota_snapshot_list':
    if not str(pl.get('source') or '').strip() or not str(pl.get('canonical_unit_id') or '').strip():
        err = fail('INVALID_PARAM', 'snapshot/list requiere source y canonical_unit_id')
if not err and op == 'ota_snapshot_put':
    entry = pl.get('entry')
    if not isinstance(entry, dict):
        err = fail('INVALID_PARAM', 'snapshot/put requiere entry objeto')
    else:
        ikey = str(entry.get('idempotency_key') or '')[:128]
        logv['x_idempotency_key'] = ikey
        required = ('source', 'canonical_unit_id', 'external_uid', 'check_in', 'check_out', 'state')
        missing = [k for k in required if not str(entry.get(k) or '').strip()]
        if missing:
            err = fail('INVALID_PARAM', 'snapshot/put entry incompleta: %s' % ', '.join(missing))
        elif not ikey:
            err = fail('IDEMPOTENCY_KEY_REQUIRED', 'snapshot/put requiere entry.idempotency_key')
if not err and ikey and op in ('quote', 'hold'):
    lock = env['x_hotel_api_lock'].sudo().search([('x_user_id', '=', env.uid)], limit=1)
    if not lock:
        lock = env['x_hotel_api_lock'].sudo().create({'x_name': 'lock %s' % env.uid, 'x_user_id': env.uid})
    lock.write({'x_touch': now})
    prev = LOG.search([('x_user_id', '=', env.uid), ('x_operation', '=', op), ('x_idempotency_key', '=', ikey), ('x_result', '=', 'ok')], order='id asc', limit=1)
    if prev:
        if prev.x_request != logv['x_request'] and json.loads(prev.x_request or '{}').get('client_ref') != pl.get('client_ref'):
            err = fail('IDEMPOTENCY_KEY_REUSED', 'idempotency_key ya usada con otra solicitud')
        else:
            res.update(json.loads(prev.x_response or '{}'))
            res['idempotent_replay'] = True
            res['correlation_id'] = corr
            logv.update({'x_result': 'replay', 'x_response': json.dumps(res, ensure_ascii=False, default=str)[:20000], 'x_quote_id': prev.x_quote_id.id, 'x_order_id': prev.x_order_id.id, 'x_query_id': prev.x_query_id, 'x_unit_id': prev.x_unit_id.id, 'x_property_id': prev.x_property_id.id})
            LOG.create(logv)
            action = {'type': 'ir.actions.client', 'tag': 'display_notification', 'params': {'title': 'HOTEL API', 'message': op, 'result': res}}
            err = 'REPLAYED'
if not err and ikey and op in ('ota_block_apply', 'ota_block_release'):
    prev = LOG.search([('x_user_id', '=', env.uid), ('x_operation', '=', op), ('x_idempotency_key', '=', ikey), ('x_result', '=', 'ok')], order='id asc', limit=1)
    if prev:
        if prev.x_request != logv['x_request']:
            err = fail('IDEMPOTENCY_KEY_REUSED', 'idempotency_key ya usada con otra solicitud')
        else:
            res.update(json.loads(prev.x_response or '{}'))
            res['idempotent_replay'] = True
            res['correlation_id'] = corr
            logv.update({'x_result': 'replay', 'x_response': json.dumps(res, ensure_ascii=False, default=str)[:20000], 'x_unit_id': prev.x_unit_id.id, 'x_property_id': prev.x_property_id.id})
            err = 'REPLAYED'
if err == 'REPLAYED':
    pass
elif not err:
    def pdate(s):
        return datetime.datetime.strptime(str(s), '%Y-%m-%d').date()
    if op in ('availability', 'quote'):
        fe = pl.get('fecha_entrada'); fs = pl.get('fecha_salida')
        personas = str(pl.get('personas') or '')
        def vdate(s):
            s = str(s or '')
            return len(s) == 10 and s[4] == '-' and s[7] == '-' and s[:4].isdigit() and s[5:7].isdigit() and s[8:].isdigit() and 1 <= int(s[5:7]) <= 12 and 1 <= int(s[8:]) <= 28 + (3 if int(s[5:7]) != 2 else 0)
        ok_ = vdate(fe) and vdate(fs) and personas.isdigit()
        if ok_:
            d1 = pdate(fe); d2 = pdate(fs)
            personas = int(personas)
            if d2 <= d1 or personas < 1 or personas > 60 or d1 < now.date() or (d2 - d1).days > 60:
                ok_ = False
        pid = int(pl.get('property_id') or 0)
        if not ok_:
            err = fail('INVALID_PARAM', 'Fechas o personas inválidas')
        elif op == 'availability':
            av = env['ir.actions.server'].with_user(ROOT).browse(1914).with_context(fe=fe, fs=fs, personas=personas, property_id=pid or False, active_model='x_hotel_property').run()['params']['result']
            res['ok'] = True
            res['data'] = {'inventory_checked_at': av['inventory_checked_at'], 'fecha_entrada': fe, 'fecha_salida': fs, 'personas': personas,
                           'opciones': [{'property_id': o['property_id'], 'property_name': o['property_name'], 'unit_id': o['unit_id'], 'nombre': o['nombre'], 'estado': o['estado'],
                                         'capacidad_comercial': o['capacidad_comercial'], 'requires_manual_confirmation': o['requires_manual_confirmation']} for o in av['opciones']]}
        else:
            q = env['ir.actions.server'].with_user(ROOT).browse(1922).with_context(fe=fe, fs=fs, personas=personas, property_id=pid or False, channel=channel, active_model='x_hotel_property').run()['params']['result']
            qrec = env['x_hotel_quote'].sudo().browse(q['quote_id'])
            qrec.write({'x_api_user_id': env.uid, 'x_api_client_ref': str(pl.get('client_ref') or '')[:64], 'x_channel': channel})
            for o in q['opciones']:
                o.pop('motivos_inventario', None)
            res['ok'] = True
            res['data'] = q
            logv.update({'x_quote_id': qrec.id, 'x_query_id': q['query_id'], 'x_property_id': pid or False})
    elif op == 'hold':
        Q = env['x_hotel_quote'].sudo().browse(int(pl.get('quote_id') or 0)).exists()
        cref = str(pl.get('client_ref') or '')
        if not Q or Q.x_api_user_id.id != env.uid or (Q.x_api_client_ref or '') != cref:
            err = fail('NOT_FOUND', 'Cotización no encontrada para este cliente')
        elif Q.x_expires_at and Q.x_expires_at < now:
            err = fail('QUOTE_EXPIRED', 'La cotización venció; solicite una nueva')
        else:
            data = json.loads(Q.x_payload or '{}')
            uid_ = int(pl.get('unit_id') or 0)
            opt = [o for o in data.get('opciones', []) if o.get('unit_id') == uid_]
            if not opt:
                err = fail('NOT_FOUND', 'La unidad no está en la cotización')
            elif opt[0].get('pricing_status') != 'quoted' or opt[0].get('approval_level') != 'approved':
                err = fail('NOT_QUOTED', 'Sin precio aprobado (%s): requiere cotización/gestión humana' % opt[0].get('pricing_status'))
            elif opt[0].get('requires_manual_confirmation'):
                err = fail('REQUIRES_HUMAN_APPROVAL', 'Requiere aprobación humana de capacidad extraordinaria: escalar')
            else:
                av = env['ir.actions.server'].with_user(ROOT).browse(1914).with_context(fe=data['fecha_entrada'], fs=data['fecha_salida'], personas=data['personas'], property_id=opt[0]['property_id'], active_model='x_hotel_property').run()['params']['result']
                now_opt = [o for o in av['opciones'] if o['unit_id'] == uid_]
                if not now_opt or now_opt[0]['estado'] != 'disponible':
                    err = fail('UNAVAILABLE', 'La unidad ya no está disponible')
                else:
                    P = env['res.partner'].sudo()
                    pref = 'SOFIA:%s' % cref
                    partner = P.search([('ref', '=', pref)], limit=1)
                    if not partner:
                        partner = P.create({'name': str(pl.get('client_name') or ('Cliente WhatsApp %s' % cref))[:120], 'phone': str(pl.get('client_phone') or '')[:32] or False, 'ref': pref, 'comment': 'Creado por API Sofía (HOTEL-006). Datos a verificar por personal.'})
                    r = env['ir.actions.server'].with_user(ROOT).browse(1935).with_context(quote_id=Q.id, unit_id=uid_, partner_id=partner.id, mode='hold', hold_origin='sofia', active_model='x_hotel_quote').run()['params']['result']
                    so = env['sale.order'].sudo().browse(r['sale_order_id'])
                    so.write({'x_api_user_id': env.uid, 'x_api_client_ref': cref})
                    res['ok'] = True
                    res['data'] = {'hold_id': so.id, 'hold_ref': so.name, 'status': so.x_reservation_status, 'hold_expires_utc': str(so.x_hold_expires or ''), 'hold_duration_status': 'PENDIENTE_APROBACION_CEO',
                                   'quote_id': Q.id, 'query_id': Q.x_name, 'unit_id': uid_, 'precio_total': so.x_frozen_price_total, 'currency': so.x_frozen_currency, 'rate_rule_id': so.x_frozen_rate_rule,
                                   'rate_rule_version': so.x_frozen_rate_version, 'tax_status': so.x_frozen_tax_status}
                    logv.update({'x_quote_id': Q.id, 'x_query_id': Q.x_name, 'x_order_id': so.id, 'x_unit_id': uid_, 'x_property_id': opt[0]['property_id']})
    elif op == 'status':
        cref = str(pl.get('client_ref') or '')
        if pl.get('hold_id'):
            so = env['sale.order'].sudo().browse(int(pl.get('hold_id') or 0)).exists()
            if not so or so.x_api_user_id.id != env.uid or (so.x_api_client_ref or '') != cref:
                err = fail('NOT_FOUND', 'HOLD no encontrado para este cliente')
            else:
                st = so.x_reservation_status
                active = st == 'hold' and so.x_hold_expires and so.x_hold_expires > now
                shown = 'hold_active' if active else ('hold_expired' if (st == 'hold' or so.x_hold_expired) and st not in ('confirmed', 'cancelled') else st)
                res['ok'] = True
                res['data'] = {'hold_id': so.id, 'hold_ref': so.name, 'status': shown, 'hold_expires_utc': str(so.x_hold_expires or ''), 'precio_total': so.x_frozen_price_total, 'currency': so.x_frozen_currency}
                logv.update({'x_order_id': so.id, 'x_unit_id': so.x_hotel_unit_id.id, 'x_quote_id': so.x_hotel_quote_id.id})
        else:
            Q = env['x_hotel_quote'].sudo().browse(int(pl.get('quote_id') or 0)).exists()
            if not Q or Q.x_api_user_id.id != env.uid or (Q.x_api_client_ref or '') != cref:
                err = fail('NOT_FOUND', 'Cotización no encontrada para este cliente')
            else:
                d = json.loads(Q.x_payload or '{}')
                for o in d.get('opciones', []):
                    o.pop('motivos_inventario', None)
                res['ok'] = True
                res['data'] = d
                logv.update({'x_quote_id': Q.id, 'x_query_id': Q.x_name})
    elif op == 'ota_blocks_list':
        UNIT = env['x_hotel_unit'].sudo(); PS = env['planning.slot'].sudo()
        CANON = {'201': 'AHS-201', '202': 'AHS-202', '203': 'AHS-203', '301': 'AHS-301', '302': 'AHS-302'}
        rows = []
        for unit in UNIT.search([('x_active', '=', True)]):
            if not unit.x_resource_id:
                continue
            cname = 'AHS-CASA' if 'casa' in (unit.x_name or '').lower() else CANON.get(str(unit.x_name or ''))
            if not cname:
                continue
            slots = PS.search([('resource_id', '=', unit.x_resource_id.id), ('state', '=', 'published')])
            for slot in slots:
                if slot.x_checkin_state == 'cancelled' or slot.x_hotel_block_kind == 'derived':
                    continue
                if slot.x_hotel_block_kind not in ('external', 'manual', 'reservation', 'hold'):
                    continue
                slot_key = ''
                for audit_row in LOG.search([('x_operation', '=', 'ota_block_apply'), ('x_unit_id', '=', unit.id), ('x_result', '=', 'ok')], order='id desc'):
                    try:
                        saved = json.loads(audit_row.x_response or '{}')
                        if int((saved.get('data') or {}).get('slot_id') or 0) == slot.id:
                            slot_key = audit_row.x_idempotency_key
                            break
                    except Exception:
                        continue
                rows.append({'slot_id': slot.id, 'canonical_unit_id': cname, 'check_in': str(slot.start_datetime)[:10], 'check_out': str(slot.end_datetime)[:10], 'status': 'blocked', 'source': slot.x_channel or 'odoo', 'idempotency_key': slot_key})
        res['ok'] = True
        res['data'] = {'blocks': rows}
    elif op == 'ota_block_apply':
        UNIT = env['x_hotel_unit'].sudo(); PS = env['planning.slot'].sudo()
        source = str(pl.get('source') or '').strip().lower()
        canonical = str(pl.get('canonical_unit_id') or '').strip()
        external_uid = str(pl.get('external_uid') or '').strip()
        try:
            odoo_unit_id = int(pl.get('odoo_unit_id') or 0)
        except Exception:
            odoo_unit_id = 0
        check_in = str(pl.get('check_in') or '')
        check_out = str(pl.get('check_out') or '')
        valid_sources = ('booking', 'airbnb')
        valid_units = ('AHS-201', 'AHS-202', 'AHS-203', 'AHS-301', 'AHS-302', 'AHS-CASA')
        unit = UNIT.browse(odoo_unit_id).exists()
        expected_name = 'CASA COMPLETA' if canonical == 'AHS-CASA' else canonical.replace('AHS-', '')
        if source not in valid_sources or canonical not in valid_units or not unit or str(unit.x_name or '').strip().upper() != expected_name.upper():
            err = fail('MAPPING_REQUIRED', 'mapping OTA/STAGING inválido o no verificable')
        elif not (len(check_in) == 10 and len(check_out) == 10 and check_out > check_in):
            err = fail('INVALID_PARAM', 'ventana OTA inválida')
        elif not unit.x_resource_id or not unit.x_role_id:
            err = fail('MAPPING_REQUIRED', 'la unidad no tiene recurso/rol planning verificable')
        else:
            st = datetime.datetime.strptime(check_in + ' 20:00:00', '%Y-%m-%d %H:%M:%S')
            en = datetime.datetime.strptime(check_out + ' 16:00:00', '%Y-%m-%d %H:%M:%S')
            leaves = UNIT.browse(); frontier = unit
            while frontier:
                nochild = frontier.filtered(lambda u: not u.x_child_ids)
                leaves |= nochild
                frontier = (frontier - nochild).mapped('x_child_ids') - leaves
            conflict_units = leaves; frontier = leaves
            while frontier:
                nxt = frontier.mapped('x_parent_ids') - conflict_units
                conflict_units |= nxt
                frontier = nxt
            conflict_units |= unit
            conflict_resources = conflict_units.mapped('x_resource_id')
            conflict_slots = PS.search([('resource_id', 'in', conflict_resources.ids), ('start_datetime', '<', en), ('end_datetime', '>', st), ('state', '=', 'published')])
            conflict_slots = conflict_slots.filtered(lambda s: s.x_checkin_state != 'cancelled' and s.x_hotel_block_kind != 'derived' and not (s.x_hotel_order_id and s.x_hotel_order_id.x_reservation_status == 'cancelled'))
            if conflict_slots:
                err = fail('CONFLICT', 'ya existe un bloqueo/ocupación en la unidad o CASA relacionada')
            else:
                role = unit.x_role_id
                casa_value = role.x_casa
                casa_role = env['planning.role'].sudo().search([('x_casa', '=', casa_value), ('x_is_a_room_offer', '=', True), ('name', 'ilike', 'completa')], limit=1)
                if not casa_role:
                    err = fail('MAPPING_REQUIRED', 'no se pudo resolver el rol CASA COMPLETA')
                else:
                    prior = [{'slot_id': s.id, 'resource_id': s.resource_id.id, 'start': str(s.start_datetime), 'end': str(s.end_datetime)} for s in conflict_slots if s.x_hotel_block_kind != 'derived']
                    snapshot_entry = {'idempotency_key': ikey, 'source': source, 'external_uid': external_uid, 'canonical_unit_id': canonical, 'odoo_unit_id': unit.id, 'check_in': check_in, 'check_out': check_out, 'state': 'PRE_APPLY', 'previous_slots': prior, 'first_seen_at': str(now), 'last_seen_at': str(now), 'missing_count': 0, 'correlation_id': corr}
                    snap_log = LOG.create({'x_name': 'ota_snapshot_put %s' % ikey, 'x_user_id': env.uid, 'x_ts': now, 'x_operation': 'ota_snapshot_put', 'x_correlation_id': corr, 'x_idempotency_key': ikey, 'x_source_channel': source, 'x_unit_id': unit.id, 'x_request': json.dumps(snapshot_entry, ensure_ascii=False, default=str)[:4000], 'x_response': json.dumps({'ok': True, 'data': snapshot_entry}, ensure_ascii=False, default=str)[:20000], 'x_result': 'ok'})
                    slot = PS.create({'role_id': role.id, 'resource_id': unit.x_resource_id.id, 'start_datetime': st, 'end_datetime': en, 'state': 'published', 'x_channel': source, 'x_hotel_block_kind': 'external', 'x_checkin_state': 'pending', 'name': '[HOTEL-017 %s %s]' % (source, ikey)})
                    derived = PS.search([('x_bloqueo_src_id', '=', slot.id)])
                    if not derived:
                        derived = PS.create({'role_id': casa_role.id, 'resource_id': casa_role.resource_ids[:1].id, 'start_datetime': st, 'end_datetime': en, 'state': 'published', 'x_bloqueo_ref': str(slot.id), 'x_bloqueo_src_id': slot.id, 'x_hotel_block_kind': 'derived'})
                    snapshot_entry.update({'state': 'ACTIVE', 'slot_id': slot.id, 'derived_slot_ids': derived.ids})
                    snap_log.write({'x_response': json.dumps({'ok': True, 'data': snapshot_entry}, ensure_ascii=False, default=str)[:20000]})
                    res['ok'] = True
                    res['data'] = {'slot_id': slot.id, 'derived_slot_ids': derived.ids, 'replay': False, 'snapshot_id': snap_log.id}
                    logv.update({'x_unit_id': unit.id})
    elif op == 'ota_block_release':
        UNIT = env['x_hotel_unit'].sudo(); PS = env['planning.slot'].sudo()
        prev = LOG.search([('x_operation', '=', 'ota_block_apply'), ('x_idempotency_key', '=', ikey), ('x_result', '=', 'ok')], order='id asc', limit=1)
        if not prev:
            err = fail('NOT_FOUND', 'bloqueo OTA no encontrado para release')
        else:
            try:
                saved = json.loads(prev.x_response or '{}')
                slot_id = int((saved.get('data') or {}).get('slot_id') or 0)
            except Exception:
                slot_id = 0
            slot = PS.browse(slot_id).exists()
            if not slot or slot.x_hotel_block_kind != 'external':
                err = fail('AMBIGUOUS_STATE', 'el bloqueo OTA no existe o ya no es externo')
            else:
                derived = PS.search([('x_bloqueo_src_id', '=', slot.id)])
                derived_ids = derived.ids
                if derived:
                    derived.unlink()
                slot.unlink()
                snap = LOG.search([('x_operation', '=', 'ota_snapshot_put'), ('x_idempotency_key', '=', ikey), ('x_result', '=', 'ok')], order='id desc', limit=1)
                if snap:
                    try:
                        sentry = json.loads(snap.x_request or '{}')
                        sentry.update({'state': 'RELEASED', 'released_at': str(now), 'released_slot_id': slot_id})
                        snap.write({'x_result': 'snapshot_released', 'x_request': json.dumps(sentry, ensure_ascii=False, default=str)[:4000], 'x_response': json.dumps({'ok': True, 'data': sentry}, ensure_ascii=False, default=str)[:20000]})
                    except Exception:
                        err = fail('SNAPSHOT_ERROR', 'snapshot durable ilegible; release detenido')
                if not err:
                    res['ok'] = True
                    res['data'] = {'released': True, 'slot_id': slot_id, 'derived_slot_ids': derived_ids}
                    logv.update({'x_unit_id': prev.x_unit_id.id})
    elif op == 'ota_snapshot_list':
        source = str(pl.get('source') or '').strip().lower()
        canonical = str(pl.get('canonical_unit_id') or '').strip()
        latest = {}
        for snap in LOG.search([('x_operation', '=', 'ota_snapshot_put'), ('x_result', 'in', ('ok', 'snapshot_released'))], order='id asc'):
            try:
                entry = json.loads(snap.x_request or '{}')
            except Exception:
                continue
            if entry.get('source') == source and entry.get('canonical_unit_id') == canonical and entry.get('idempotency_key'):
                latest[entry['idempotency_key']] = entry
        res['ok'] = True
        res['data'] = {'entries': list(latest.values())}
    elif op == 'ota_snapshot_put':
        entry = pl.get('entry') or {}
        snap = LOG.create({'x_name': 'ota_snapshot_put %s' % ikey, 'x_user_id': env.uid, 'x_ts': now, 'x_operation': 'ota_snapshot_put', 'x_correlation_id': corr, 'x_idempotency_key': ikey, 'x_source_channel': str(entry.get('source') or ''), 'x_request': json.dumps(entry, ensure_ascii=False, default=str)[:4000], 'x_response': json.dumps({'ok': True, 'data': entry}, ensure_ascii=False, default=str)[:20000], 'x_result': 'ok'})
        res['ok'] = True
        res['data'] = {'stored': True, 'snapshot_id': snap.id, 'replay': False}
        logv.update({'x_unit_id': int(pl.get('odoo_unit_id') or 0) or False})
if err != 'REPLAYED':
    logv.update({'x_result': 'ok' if res['ok'] else 'error', 'x_error_code': res['error_code'] or False, 'x_response': json.dumps(res, ensure_ascii=False, default=str)[:20000]})
    LOG.create(logv)
    action = {'type': 'ir.actions.client', 'tag': 'display_notification', 'params': {'title': 'HOTEL API', 'message': op, 'result': res}}

if err == 'REPLAYED':
    action = {'type': 'ir.actions.client', 'tag': 'display_notification', 'params': {'title': 'HOTEL API', 'message': op, 'result': res}}