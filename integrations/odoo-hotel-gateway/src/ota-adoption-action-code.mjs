import { createHash } from 'node:crypto';

export const ACTION_1967_BASE_SHA256 = '9b053e02f123bc8879192e7758367fae1146ab4b0510567c06567f5a05785e25';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function replaceOnce(code, needle, replacement) {
  if (code.split(needle).length !== 2) throw new Error('ACTION_ANCHOR_CHANGED');
  return code.replace(needle, replacement);
}

// Odoo guarda x_request de ota_snapshot_put plano o envuelto en {entry, correlation_id}.
const UNWRAP_SNAPSHOT = `def unwrap_snapshot(item):
    return item['entry'] if isinstance(item, dict) and isinstance(item.get('entry'), dict) else item
`;

const ACTIVE_ADOPTIONS = `def active_adoptions():
    by_key = {}; by_slot = {}
    for row in LOG.search([('x_operation', 'in', ('ota_block_adopt', 'ota_block_unadopt')), ('x_result', '=', 'ok')], order='id asc'):
        try:
            item = json.loads(row.x_request or '{}')
            key = str(row.x_idempotency_key or '')
            sid = int(item.get('slot_id') or 0)
            if not key or sid < 1:
                return None, None
            if row.x_operation == 'ota_block_adopt':
                if key in by_key or sid in by_slot:
                    return None, None
                item['slot_id'] = sid
                by_key[key] = item; by_slot[sid] = key
            else:
                if key not in by_key or by_key[key]['slot_id'] != sid or by_slot.get(sid) != key:
                    return None, None
                by_key.pop(key, None); by_slot.pop(sid, None)
        except Exception:
            return None, None
    return by_key, by_slot
`;

const ADOPTION_VALIDATION = `if not err and op in ('ota_block_adopt', 'ota_block_unadopt'):
    if env.cr.dbname != 'atheron1-hotel-staging-20260923' or not is_api:
        err = fail('STAGING_ONLY', 'adopción OTA permitida solo al usuario técnico en STAGING')
    elif len(ikey) != 64 or any(c not in '0123456789abcdef' for c in ikey):
        err = fail('INVALID_PARAM', 'idempotency_key OTA inválida')
    elif not str(pl.get('slot_id') or '').isdigit():
        err = fail('INVALID_PARAM', 'slot_id OTA inválido')
    elif op == 'ota_block_adopt' and str(pl.get('slot_id') or '') == '40159' and (str(pl.get('source') or '') != 'booking' or str(pl.get('canonical_unit_id') or '') != 'AHS-301' or str(pl.get('odoo_unit_id') or '') != '4' or str(pl.get('check_in') or '') != '2026-10-12' or str(pl.get('check_out') or '') != '2026-10-13'):
        err = fail('PILOT_SCOPE_VIOLATION', 'solo 40159 para Booking/AHS-301/12-13 oct')
    elif str(pl.get('slot_id') or '') not in ('40142', '40140', '40159') and op == 'ota_block_adopt':
        err = fail('PILOT_SCOPE_VIOLATION', 'solo slots Booking verificados')
    elif op == 'ota_block_adopt' and str(pl.get('slot_id') or '') != '40159' and (str(pl.get('source') or '') != 'booking' or str(pl.get('canonical_unit_id') or '') != 'AHS-302' or str(pl.get('odoo_unit_id') or '') != '5'):
        err = fail('PILOT_SCOPE_VIOLATION', 'solo Booking/AHS-302/Odoo 5')
    elif op == 'ota_block_adopt' and str(pl.get('slot_id') or '') != '40159' and (str(pl.get('check_in') or '') not in ('2026-10-01', '2026-10-17') or str(pl.get('check_out') or '') not in ('2026-10-05', '2026-10-18')):
        err = fail('PILOT_SCOPE_VIOLATION', 'solo ventanas del piloto 302')
`;

const BLOCKS_AND_ADOPTION = `    elif op == 'ota_blocks_list':
        UNIT = env['x_hotel_unit'].sudo(); PS = env['planning.slot'].sudo()
        CANON = {'201': 'AHS-201', '202': 'AHS-202', '203': 'AHS-203', '301': 'AHS-301', '302': 'AHS-302'}
        adopted_by_key, adopted_by_slot = active_adoptions()
        if adopted_by_key is None:
            err = fail('AMBIGUOUS_STATE', 'mapeo de adopción OTA inconsistente')
        else:
            for adopted_key, item in adopted_by_key.items():
                adopted_slot = PS.browse(item['slot_id']).exists()
                is301 = item['slot_id'] == 40159
                pilot_unit = UNIT.browse(4 if is301 else 5).exists()
                want_res, want_role = (31, 37) if is301 else (32, 18)
                want_canon, want_odoo = ('AHS-301', '4') if is301 else ('AHS-302', '5')
                kind_ok = (adopted_slot.x_channel in (False, '') and adopted_slot.x_hotel_block_kind in (False, '')) if is301 else (adopted_slot.x_channel == 'booking' and adopted_slot.x_hotel_block_kind == 'external')
                if not pilot_unit or pilot_unit.x_resource_id.id != want_res or pilot_unit.x_role_id.id != want_role or not adopted_slot or adopted_slot.resource_id.id != want_res or adopted_slot.role_id.id != want_role or adopted_slot.state != 'published' or not kind_ok or adopted_slot.x_checkin_state == 'cancelled' or adopted_slot.x_hotel_order_id or adopted_slot.x_guest_id or item.get('source') != 'booking' or item.get('canonical_unit_id') != want_canon or str(item.get('odoo_unit_id')) != want_odoo or str(adopted_slot.start_datetime)[:19] != str(item.get('check_in')) + ' 20:00:00' or str(adopted_slot.end_datetime)[:19] != str(item.get('check_out')) + ' 16:00:00':
                    err = fail('AMBIGUOUS_STATE', 'slot adoptado cambió o falta')
                    break
        if not err:
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
                    if slot.x_hotel_block_kind not in ('external', 'manual', 'reservation', 'hold') and slot.id not in adopted_by_slot and slot.id != 40159:
                        continue
                    slot_key = adopted_by_slot.get(slot.id, '')
                    if not slot_key:
                        for audit_row in LOG.search([('x_operation', '=', 'ota_block_apply'), ('x_unit_id', '=', unit.id), ('x_result', '=', 'ok')], order='id desc'):
                            try:
                                saved = json.loads(audit_row.x_response or '{}')
                                if int((saved.get('data') or {}).get('slot_id') or 0) == slot.id:
                                    slot_key = audit_row.x_idempotency_key
                                    break
                            except Exception:
                                continue
                    rows.append({'slot_id': slot.id, 'canonical_unit_id': cname, 'check_in': str(slot.start_datetime)[:10], 'check_out': str(slot.end_datetime)[:10], 'status': 'blocked', 'source': slot.x_channel or ('booking' if (slot.id == 40159 and slot_key) else 'odoo'), 'idempotency_key': slot_key})
            res['ok'] = True
            res['data'] = {'blocks': rows}
    elif op == 'ota_block_adopt' and str(pl.get('slot_id') or '') == '40159':
        UNIT = env['x_hotel_unit'].sudo(); PS = env['planning.slot'].sudo()
        lock = env['x_hotel_api_lock'].sudo().search([('x_user_id', '=', env.uid)], limit=1)
        if not lock:
            lock = env['x_hotel_api_lock'].sudo().create({'x_name': 'lock %s' % env.uid, 'x_user_id': env.uid})
        lock.write({'x_touch': now})
        adopted_by_key, adopted_by_slot = active_adoptions()
        slot_id = 40159
        check_in = str(pl.get('check_in') or ''); check_out = str(pl.get('check_out') or '')
        unit = UNIT.browse(4).exists()
        feeds = env['x_hotel_ota_feed'].sudo().search([('x_source', '=', 'booking'), ('x_canonical_unit_id', '=', 'AHS-301')], limit=2)
        if adopted_by_key is None:
            err = fail('AMBIGUOUS_STATE', 'mapeo de adopción inconsistente')
        elif check_in != '2026-10-12' or check_out != '2026-10-13' or not unit or unit.x_resource_id.id != 31 or unit.x_role_id.id != 37 or str(unit.x_name or '') != '301' or len(feeds) != 1 or feeds.x_odoo_unit_id.id != 4 or not feeds.x_external_listing_id:
            err = fail('MAPPING_REQUIRED', 'feed/unidad/ventana 301 no verificable')
        elif ikey in adopted_by_key and adopted_by_key[ikey]['slot_id'] != slot_id:
            err = fail('IDEMPOTENCY_KEY_REUSED', 'clave ya asociada a otro slot')
        elif slot_id in adopted_by_slot and adopted_by_slot[slot_id] != ikey:
            err = fail('SLOT_ALREADY_ADOPTED', 'slot ya asociado a otra clave')
        else:
            slot = PS.browse(slot_id).exists()
            st = datetime.datetime.strptime('2026-10-12 20:00:00', '%Y-%m-%d %H:%M:%S')
            en = datetime.datetime.strptime('2026-10-13 16:00:00', '%Y-%m-%d %H:%M:%S')
            overlaps = PS.search([('resource_id', '=', 31), ('start_datetime', '<', en), ('end_datetime', '>', st), ('state', '=', 'published')])
            if (not slot or len(overlaps) != 1 or overlaps.id != slot_id or slot.resource_id.id != 31 or slot.role_id.id != 37
                    or slot.state != 'published' or slot.x_checkin_state == 'cancelled' or slot.x_hotel_order_id or slot.x_guest_id
                    or slot.x_channel not in (False, '') or slot.x_hotel_block_kind not in (False, '')
                    or str(slot.start_datetime)[:19] != '2026-10-12 20:00:00' or str(slot.end_datetime)[:19] != '2026-10-13 16:00:00'):
                err = fail('AMBIGUOUS_STATE', 'slot 40159 no coincide de forma única')
            else:
                snaps = LOG.search([('x_operation', '=', 'ota_snapshot_put'), ('x_idempotency_key', '=', ikey), ('x_result', '=', 'ok')], order='id desc', limit=1)
                try:
                    sentry = unwrap_snapshot(json.loads(snaps.x_request or '{}')) if snaps else {}
                except Exception:
                    sentry = {}
                if sentry.get('source') != 'booking' or sentry.get('canonical_unit_id') != 'AHS-301' or sentry.get('state') != 'CONFLICT' or sentry.get('check_in') != '2026-10-12' or sentry.get('check_out') != '2026-10-13' or not sentry.get('external_uid'):
                    err = fail('SNAPSHOT_ERROR', 'snapshot CONFLICT del UID 301 no coincide')
                elif adopted_by_key.get(ikey):
                    res['ok'] = True
                    res['data'] = {'slot_id': slot_id, 'replay': True, 'adopted': True}
                    logv['x_operation'] = 'ota_block_adopt_replay'
                    logv.update({'x_unit_id': 4, 'x_source_channel': 'booking'})
                else:
                    res['ok'] = True
                    res['data'] = {'slot_id': slot_id, 'replay': False, 'adopted': True}
                    logv.update({'x_unit_id': 4, 'x_source_channel': 'booking'})
    elif op == 'ota_block_adopt':
        UNIT = env['x_hotel_unit'].sudo(); PS = env['planning.slot'].sudo()
        lock = env['x_hotel_api_lock'].sudo().search([('x_user_id', '=', env.uid)], limit=1)
        if not lock:
            lock = env['x_hotel_api_lock'].sudo().create({'x_name': 'lock %s' % env.uid, 'x_user_id': env.uid})
        lock.write({'x_touch': now})
        adopted_by_key, adopted_by_slot = active_adoptions()
        slot_id = int(pl.get('slot_id') or 0)
        check_in = str(pl.get('check_in') or ''); check_out = str(pl.get('check_out') or '')
        pair_ok = (slot_id == 40142 and check_in == '2026-10-01' and check_out == '2026-10-05') or (slot_id == 40140 and check_in == '2026-10-17' and check_out == '2026-10-18')
        unit = UNIT.browse(5).exists()
        feeds = env['x_hotel_ota_feed'].sudo().search([('x_source', '=', 'booking'), ('x_canonical_unit_id', '=', 'AHS-302')], limit=2)
        if adopted_by_key is None:
            err = fail('AMBIGUOUS_STATE', 'mapeo de adopción inconsistente')
        elif not pair_ok or not unit or unit.x_resource_id.id != 32 or unit.x_role_id.id != 18 or str(unit.x_name or '') != '302' or len(feeds) != 1 or feeds.x_odoo_unit_id.id != 5 or not feeds.x_external_listing_id:
            err = fail('MAPPING_REQUIRED', 'feed/unidad/ventana OTA no verificable')
        elif ikey in adopted_by_key and adopted_by_key[ikey]['slot_id'] != slot_id:
            err = fail('IDEMPOTENCY_KEY_REUSED', 'clave ya asociada a otro slot')
        elif slot_id in adopted_by_slot and adopted_by_slot[slot_id] != ikey:
            err = fail('SLOT_ALREADY_ADOPTED', 'slot ya asociado a otra clave')
        else:
            slot = PS.browse(slot_id).exists()
            st = datetime.datetime.strptime(check_in + ' 20:00:00', '%Y-%m-%d %H:%M:%S')
            en = datetime.datetime.strptime(check_out + ' 16:00:00', '%Y-%m-%d %H:%M:%S')
            overlaps = PS.search([('resource_id', '=', 32), ('start_datetime', '<', en), ('end_datetime', '>', st), ('state', '=', 'published')])
            if not slot or len(overlaps) != 1 or overlaps.id != slot_id or slot.resource_id.id != 32 or slot.role_id.id != 18 or slot.state != 'published' or slot.x_channel != 'booking' or slot.x_hotel_block_kind != 'external' or slot.x_checkin_state == 'cancelled' or slot.x_hotel_order_id or slot.x_guest_id or str(slot.start_datetime)[:19] != check_in + ' 20:00:00' or str(slot.end_datetime)[:19] != check_out + ' 16:00:00':
                err = fail('AMBIGUOUS_STATE', 'slot Booking 302 no coincide de forma única')
            else:
                if adopted_by_key.get(ikey):
                    res['ok'] = True
                    res['data'] = {'slot_id': slot_id, 'replay': True, 'adopted': True}
                    logv['x_operation'] = 'ota_block_adopt_replay'
                    logv.update({'x_unit_id': 5, 'x_source_channel': 'booking'})
                else:
                    snap = LOG.search([('x_operation', '=', 'ota_snapshot_put'), ('x_idempotency_key', '=', ikey), ('x_result', '=', 'ok')], order='id desc', limit=1)
                    try:
                        sentry = unwrap_snapshot(json.loads(snap.x_request or '{}')) if snap else {}
                    except Exception:
                        sentry = {}
                    if sentry.get('source') != 'booking' or sentry.get('canonical_unit_id') != 'AHS-302' or sentry.get('state') != 'CONFLICT' or sentry.get('check_in') != check_in or sentry.get('check_out') != check_out or not sentry.get('external_uid'):
                        err = fail('SNAPSHOT_ERROR', 'snapshot CONFLICT del UID no coincide')
                if not err and not adopted_by_key.get(ikey):
                    apply_rows = LOG.search([('x_operation', '=', 'ota_block_apply'), ('x_result', '=', 'ok'), '|', ('x_idempotency_key', '=', ikey), ('x_unit_id', '=', 5)])
                    apply_conflict = False
                    for prior_apply in apply_rows:
                        try:
                            prior_saved = json.loads(prior_apply.x_response or '{}')
                            if prior_apply.x_idempotency_key == ikey or int((prior_saved.get('data') or {}).get('slot_id') or 0) == slot_id:
                                apply_conflict = True
                                break
                        except Exception:
                            apply_conflict = True
                            break
                    if apply_conflict:
                        err = fail('IDEMPOTENCY_KEY_REUSED', 'clave o slot ya pertenece a APPLY')
                    else:
                        res['ok'] = True
                        res['data'] = {'slot_id': slot_id, 'replay': False, 'adopted': True}
                        logv.update({'x_unit_id': 5, 'x_source_channel': 'booking'})
    elif op == 'ota_block_unadopt':
        lock = env['x_hotel_api_lock'].sudo().search([('x_user_id', '=', env.uid)], limit=1)
        if not lock:
            lock = env['x_hotel_api_lock'].sudo().create({'x_name': 'lock %s' % env.uid, 'x_user_id': env.uid})
        lock.write({'x_touch': now})
        adopted_by_key, adopted_by_slot = active_adoptions()
        slot_id = int(pl.get('slot_id') or 0)
        if adopted_by_key is None:
            err = fail('AMBIGUOUS_STATE', 'mapeo de adopción inconsistente')
        elif ikey not in adopted_by_key or adopted_by_key[ikey]['slot_id'] != slot_id or adopted_by_slot.get(slot_id) != ikey:
            err = fail('NOT_FOUND', 'vínculo de adopción no encontrado')
        else:
            res['ok'] = True
            res['data'] = {'slot_id': slot_id, 'unadopted': True}
            logv.update({'x_unit_id': 5, 'x_source_channel': 'booking'})
`;

export function patchActionCode(before) {
  if (sha256(before) !== ACTION_1967_BASE_SHA256) throw new Error('ACTION_BASE_CHANGED');
  let code = before;
  code = replaceOnce(code,
    "'ota_snapshot_put': ['entry', 'property_id']}",
    "'ota_snapshot_put': ['entry', 'property_id'],\n            'ota_block_adopt': ['source', 'canonical_unit_id', 'odoo_unit_id', 'slot_id', 'check_in', 'check_out'],\n            'ota_block_unadopt': ['slot_id']}");
  code = replaceOnce(code,
    "def fail(code, msg):\n    res['error_code'] = code\n    res['message'] = msg\n    return res\n",
    "def fail(code, msg):\n    res['error_code'] = code\n    res['message'] = msg\n    return res\n" + UNWRAP_SNAPSHOT + ACTIVE_ADOPTIONS);
  code = replaceOnce(code,
    "                entry = json.loads(snap.x_request or '{}')\n",
    "                entry = unwrap_snapshot(json.loads(snap.x_request or '{}'))\n");
  code = replaceOnce(code,
    "                        sentry = json.loads(snap.x_request or '{}')\n",
    "                        sentry = unwrap_snapshot(json.loads(snap.x_request or '{}'))\n");
  code = replaceOnce(code,
    "op in ('ota_block_apply', 'ota_block_release') and not ikey",
    "op in ('ota_block_apply', 'ota_block_release', 'ota_block_adopt', 'ota_block_unadopt') and not ikey");
  code = replaceOnce(code,
    "if not err and ikey and op in ('quote', 'hold'):",
    ADOPTION_VALIDATION + "if not err and ikey and op in ('quote', 'hold'):");
  const start = code.indexOf("    elif op == 'ota_blocks_list':\n");
  const end = code.indexOf("    elif op == 'ota_block_apply':\n", start);
  if (start < 0 || end < 0 || code.indexOf("    elif op == 'ota_blocks_list':\n", start + 1) !== -1) {
    throw new Error('ACTION_BRANCH_CHANGED');
  }
  code = code.slice(0, start) + BLOCKS_AND_ADOPTION + code.slice(end);
  return code;
}
