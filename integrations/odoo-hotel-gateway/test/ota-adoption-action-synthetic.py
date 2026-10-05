"""Execute the generated Odoo server action against a tiny in-memory ORM.

No network, production database, OTA feed, commercial model or real UID.
"""
import datetime
import json
import pathlib
import unittest


BACKUPS = pathlib.Path(__file__).parents[1] / '.local-action-backups'
ACTION = max(BACKUPS.glob('action-1967-with-adoption-*.py'), key=lambda path: path.stat().st_mtime)
CODE = ACTION.read_text(encoding='utf-8')
compile(CODE, str(ACTION), 'exec')


class Row:
    def __init__(self, model=None, **values):
        self._model = model
        self.__dict__.update(values)

    def __getattr__(self, name):
        if name.startswith('x_'):
            return False
        raise AttributeError(name)

    def sudo(self):
        return self

    def exists(self):
        return self

    def write(self, values):
        self.__dict__.update(values)
        return True

    def unlink(self):
        self._model.deleted.append(self.id)
        self._model.rows = [row for row in self._model.rows if row.id != self.id]
        return True


class Rows(list):
    @property
    def id(self):
        return self[0].id if len(self) == 1 else 0

    def __getattr__(self, name):
        if len(self) == 1:
            return getattr(self[0], name)
        if len(self) == 0 and name == 'user_ids':
            # Odoo: un recordset vacio devuelve un recordset vacio, no un error.
            return Rows()
        if name.startswith('x_'):
            return False
        raise AttributeError(name)

    def sudo(self):
        return self

    def exists(self):
        return self

    def filtered(self, fn):
        return Rows(row for row in self if fn(row))


def comparable(value):
    return value.id if isinstance(value, Row) else value


def condition(row, expr):
    field, operator, wanted = expr
    value = comparable(getattr(row, field, False))
    wanted = comparable(wanted)
    if operator == '=':
        return value == wanted
    if operator == 'in':
        return value in wanted
    if operator == '<':
        return value < wanted
    if operator == '>':
        return value > wanted
    raise AssertionError(operator)


def matches(row, domain):
    if '|' in domain:
        i = domain.index('|')
        base = domain[:i] + domain[i + 3:]
        return all(condition(row, expr) for expr in base) and (
            condition(row, domain[i + 1]) or condition(row, domain[i + 2]))
    return all(condition(row, expr) for expr in domain)


class Model:
    def __init__(self, rows=()):
        self.rows = list(rows)
        self.created = []
        self.deleted = []
        for row in self.rows:
            row._model = self

    def sudo(self):
        return self

    def search(self, domain, order=None, limit=None):
        result = [row for row in self.rows if matches(row, domain)]
        if order and order.startswith('id '):
            result.sort(key=lambda row: row.id, reverse=order.endswith('desc'))
        if limit:
            result = result[:limit]
        return Rows(result)

    def search_count(self, domain):
        return len(self.search(domain))

    def browse(self, value=None):
        if not value:
            return Rows()
        return Rows(row for row in self.rows if row.id == value)

    def create(self, values):
        row = Row(model=self, id=max([r.id for r in self.rows], default=499) + 1, **values)
        self.rows.append(row)
        self.created.append(row)
        return row


class Params(Model):
    def get_param(self, name):
        return None


class Env:
    def __init__(self):
        self.uid = 7
        self.user = Row(id=7)
        self.context = {}
        self.cr = Row(dbname='atheron1-hotel-staging-20260923')
        resource = Row(id=32)
        role = Row(id=18)
        unit = Row(id=5, x_active=True, x_name='302', x_resource_id=resource, x_role_id=role)
        def slot(slot_id, start, end):
            return Row(id=slot_id, name='Booking CLOSED', resource_id=resource, role_id=role,
                       start_datetime=datetime.datetime.fromisoformat(start + ' 20:00:00'),
                       end_datetime=datetime.datetime.fromisoformat(end + ' 16:00:00'),
                       state='published', x_channel='booking', x_hotel_block_kind='external',
                       x_checkin_state='pending', x_hotel_order_id=False, x_guest_id=False)
        self.models = {
            'res.groups': Model([Row(id=1, name='Hotel v1 / API Sofía', user_ids=[self.user])]),
            'ir.config_parameter': Params(),
            'x_hotel_api_log': Model(),
            'x_hotel_api_lock': Model(),
            'x_hotel_unit': Model([unit]),
            'planning.slot': Model([
                slot(40142, '2026-10-01', '2026-10-05'),
                slot(40140, '2026-10-17', '2026-10-18'),
            ]),
            'x_hotel_ota_feed': Model([Row(id=1, x_source='booking',
                x_canonical_unit_id='AHS-302', x_odoo_unit_id=unit,
                x_external_listing_id='synthetic-listing')]),
        }
        self.add_snapshot('a' * 64, '2026-10-01', '2026-10-05')
        self.add_snapshot('b' * 64, '2026-10-17', '2026-10-18')

    def __getitem__(self, name):
        if name not in self.models:
            raise AssertionError('Unexpected model access: ' + name)
        return self.models[name]

    def ref(self, name):
        assert name == 'base.user_root'
        return Row(id=1)

    def add_snapshot(self, key, start, end):
        entry = {'idempotency_key': key, 'source': 'booking',
                 'canonical_unit_id': 'AHS-302', 'external_uid': 'synthetic-' + key[0],
                 'check_in': start, 'check_out': end, 'state': 'CONFLICT'}
        self.models['x_hotel_api_log'].create({
            'x_operation': 'ota_snapshot_put', 'x_idempotency_key': key,
            'x_result': 'ok', 'x_request': json.dumps(entry),
        })

    def run(self, op, payload):
        self.context = {'op': op, 'payload': payload}
        space = {'env': self, 'datetime': datetime, 'json': json}
        exec(CODE, space)
        return space['action']['params']['result']


def adopt(key='a' * 64, slot_id=40142, start='2026-10-01', end='2026-10-05', **extra):
    return {'idempotency_key': key, 'source': 'booking',
            'canonical_unit_id': 'AHS-302', 'odoo_unit_id': 5,
            'slot_id': slot_id, 'check_in': start, 'check_out': end, **extra}


class AdoptionTests(unittest.TestCase):
    def setUp(self):
        self.env = Env()

    def assert_inventory_untouched(self):
        slots = self.env.models['planning.slot']
        self.assertEqual([row.id for row in slots.rows], [40142, 40140])
        self.assertEqual(slots.created, [])
        self.assertEqual(slots.deleted, [])

    def test_valid_adoption_and_duplicate_reimport_condition(self):
        response = self.env.run('ota_block_adopt', adopt())
        self.assertTrue(response['ok'])
        self.assertEqual(response['data']['slot_id'], 40142)
        blocks = self.env.run('ota_blocks_list', {})['data']['blocks']
        owned = [b for b in blocks if b['idempotency_key'] == 'a' * 64]
        self.assertEqual(len(owned), 1)
        self.assertEqual(owned[0]['check_in'], '2026-10-01')
        self.assertEqual(owned[0]['source'], 'booking')
        self.assert_inventory_untouched()

    def test_adoption_replay_is_not_second_mapping(self):
        self.env.run('ota_block_adopt', adopt())
        replay = self.env.run('ota_block_adopt', adopt())
        self.assertTrue(replay['ok'])
        self.assertTrue(replay['data']['replay'])
        mappings = self.env.models['x_hotel_api_log'].search([('x_operation', '=', 'ota_block_adopt')])
        self.assertEqual(len(mappings), 1)

    def test_key_already_used_for_other_slot(self):
        self.env.run('ota_block_adopt', adopt())
        other = adopt(slot_id=40140, start='2026-10-17', end='2026-10-18')
        response = self.env.run('ota_block_adopt', other)
        self.assertEqual(response['error_code'], 'IDEMPOTENCY_KEY_REUSED')

    def test_slot_already_adopted_by_other_key(self):
        self.env.run('ota_block_adopt', adopt())
        self.env.add_snapshot('c' * 64, '2026-10-01', '2026-10-05')
        response = self.env.run('ota_block_adopt', adopt(key='c' * 64))
        self.assertEqual(response['error_code'], 'SLOT_ALREADY_ADOPTED')

    def test_date_changed(self):
        self.env.models['planning.slot'].browse(40142)[0].start_datetime = datetime.datetime(2026, 10, 2, 20)
        response = self.env.run('ota_block_adopt', adopt())
        self.assertEqual(response['error_code'], 'AMBIGUOUS_STATE')

    def test_wrong_channel(self):
        self.env.models['planning.slot'].browse(40142)[0].x_channel = 'airbnb'
        response = self.env.run('ota_block_adopt', adopt())
        self.assertEqual(response['error_code'], 'AMBIGUOUS_STATE')

    def test_wrong_unit(self):
        response = self.env.run('ota_block_adopt', adopt(odoo_unit_id=6))
        self.assertEqual(response['error_code'], 'PILOT_SCOPE_VIOLATION')

    def test_missing_slot(self):
        self.env.models['planning.slot'].rows = [r for r in self.env.models['planning.slot'].rows if r.id != 40142]
        response = self.env.run('ota_block_adopt', adopt())
        self.assertEqual(response['error_code'], 'AMBIGUOUS_STATE')

    def test_rollback_only_mapping(self):
        self.env.run('ota_block_adopt', adopt())
        response = self.env.run('ota_block_unadopt', {'idempotency_key': 'a' * 64, 'slot_id': 40142})
        self.assertTrue(response['ok'])
        blocks = self.env.run('ota_blocks_list', {})['data']['blocks']
        self.assertEqual(next(b for b in blocks if b['slot_id'] == 40142)['idempotency_key'], '')
        self.assert_inventory_untouched()

    def test_release_does_not_delete_adopted_slot(self):
        self.env.run('ota_block_adopt', adopt())
        response = self.env.run('ota_block_release', {'idempotency_key': 'a' * 64})
        self.assertEqual(response['error_code'], 'NOT_FOUND')
        self.assert_inventory_untouched()


class ApiGroupMembershipTests(unittest.TestCase):
    """is_api = usuario del entorno pertenece al grupo 'Hotel v1 / API Sofia'.
    Solo el usuario tecnico miembro del grupo correcto puede adoptar; el resto se rechaza sin escribir vinculo."""

    API_GROUP = 'Hotel v1 / API Sofía'

    def setUp(self):
        self.env = Env()
        self.technical = self.env.user

    def set_group(self, name=None, members=None):
        group = self.env.models['res.groups'].rows[0]
        if name is not None:
            group.name = name
        if members is not None:
            group.user_ids = members

    def adopted_keys(self):
        return [b['idempotency_key'] for b in self.env.run('ota_blocks_list', {})['data']['blocks']
                if b['idempotency_key']]

    def assert_denied_without_link(self, response):
        self.assertFalse(response['ok'])
        self.assertEqual(response['error_code'], 'STAGING_ONLY')
        self.assertNotIn('a' * 64, self.adopted_keys())
        adopt_ok = [r for r in self.env.models['x_hotel_api_log'].rows
                    if r.x_operation == 'ota_block_adopt' and r.x_result == 'ok']
        self.assertEqual(adopt_ok, [])
        slots = self.env.models['planning.slot']
        self.assertEqual([row.id for row in slots.rows], [40142, 40140])
        self.assertEqual(slots.created, [])

    def test_membership_present_allows_adoption(self):
        self.set_group(members=[self.technical])
        response = self.env.run('ota_block_adopt', adopt())
        self.assertTrue(response['ok'], response)
        self.assertEqual(response['data']['slot_id'], 40142)
        self.assertIn('a' * 64, self.adopted_keys())

    def test_membership_absent_rejects_adoption(self):
        self.set_group(members=[])
        self.assert_denied_without_link(self.env.run('ota_block_adopt', adopt()))

    def test_wrong_group_rejects_adoption(self):
        self.set_group(name='Hotel v1 / Otro grupo', members=[self.technical])
        self.assert_denied_without_link(self.env.run('ota_block_adopt', adopt()))

    def test_wrong_user_rejects_adoption(self):
        self.set_group(members=[self.technical])
        other = Row(id=99)
        self.env.user = other
        self.env.uid = 99
        self.assert_denied_without_link(self.env.run('ota_block_adopt', adopt()))

    def test_membership_absent_still_allows_read_only_list(self):
        self.set_group(members=[])
        response = self.env.run('ota_blocks_list', {})
        self.assertTrue(response['ok'])


class Adoption301Tests(unittest.TestCase):
    """Adopcion estricta de UN slot de 301: 40159 para el evento Booking 12->13 oct. Nada mas."""

    KEY = 'e' * 64

    def setUp(self):
        self.env = Env()
        m = self.env.models
        unit4 = Row(id=4, x_active=True, x_name='301', x_resource_id=Row(id=31), x_role_id=Row(id=37))
        m['x_hotel_unit'].rows.append(unit4)
        unit4._model = m['x_hotel_unit']
        self.slot = Row(id=40159, resource_id=Row(id=31), role_id=Row(id=37),
                        start_datetime=datetime.datetime(2026, 10, 12, 20), end_datetime=datetime.datetime(2026, 10, 13, 16),
                        state='published', x_channel=False, x_hotel_block_kind=False, x_checkin_state=False,
                        x_guest_id=False, x_hotel_order_id=False)
        m['planning.slot'].rows.append(self.slot)
        self.slot._model = m['planning.slot']
        feed6 = Row(id=6, x_source='booking', x_canonical_unit_id='AHS-301', x_odoo_unit_id=unit4, x_external_listing_id='1655932506')
        m['x_hotel_ota_feed'].rows.append(feed6)
        feed6._model = m['x_hotel_ota_feed']
        self.add_wrapped_conflict(self.KEY)

    def add_wrapped_conflict(self, key):
        entry = {'idempotency_key': key, 'source': 'booking', 'canonical_unit_id': 'AHS-301', 'external_uid': 'uid-301-1217',
                 'check_in': '2026-10-12', 'check_out': '2026-10-13', 'state': 'CONFLICT', 'correlation_id': 'c301'}
        self.env.models['x_hotel_api_log'].create({'x_operation': 'ota_snapshot_put', 'x_idempotency_key': key,
                                                   'x_result': 'ok', 'x_request': json.dumps({'entry': entry, 'correlation_id': 'c301'})})

    def payload(self, **over):
        base = {'idempotency_key': self.KEY, 'source': 'booking', 'canonical_unit_id': 'AHS-301', 'odoo_unit_id': '4',
                'slot_id': 40159, 'check_in': '2026-10-12', 'check_out': '2026-10-13'}
        base.update(over)
        return base

    def links(self):
        return [r for r in self.env.models['x_hotel_api_log'].rows if r.x_operation == 'ota_block_adopt' and r.x_result == 'ok']

    def test_adopt_40159_ok_and_listed_as_linked(self):
        r = self.env.run('ota_block_adopt', self.payload())
        self.assertTrue(r['ok'], r)
        self.assertEqual(r['data'], {'slot_id': 40159, 'replay': False, 'adopted': True})
        blocks = self.env.run('ota_blocks_list', {})['data']['blocks']
        linked = [b for b in blocks if b['idempotency_key'] == self.KEY]
        self.assertEqual(len(linked), 1)
        self.assertEqual(linked[0]['slot_id'], 40159)
        self.assertEqual(linked[0]['canonical_unit_id'], 'AHS-301')
        self.assertEqual(len(self.links()), 1)

    def test_40159_listed_unlinked_before_adoption_so_importer_sees_conflict_locally(self):
        blocks = self.env.run('ota_blocks_list', {})['data']['blocks']
        row = [b for b in blocks if b['slot_id'] == 40159]
        self.assertEqual(len(row), 1)
        self.assertEqual(row[0]['canonical_unit_id'], 'AHS-301')
        self.assertEqual((row[0]['check_in'], row[0]['check_out']), ('2026-10-12', '2026-10-13'))
        self.assertEqual(row[0]['idempotency_key'], '')

    def test_unadopted_40159_listed_with_source_odoo(self):
        blocks = self.env.run('ota_blocks_list', {})['data']['blocks']
        self.assertEqual([b['source'] for b in blocks if b['slot_id'] == 40159], ['odoo'])

    def test_adopted_40159_listed_with_source_booking(self):
        self.env.run('ota_block_adopt', self.payload())
        blocks = self.env.run('ota_blocks_list', {})['data']['blocks']
        row = [b for b in blocks if b['slot_id'] == 40159]
        self.assertEqual(len(row), 1)
        self.assertEqual(row[0]['source'], 'booking')
        self.assertEqual(row[0]['idempotency_key'], self.KEY)

    def test_slot_is_not_modified_by_adoption(self):
        before = (self.slot.start_datetime, self.slot.end_datetime, self.slot.resource_id.id, self.slot.role_id.id,
                  self.slot.x_channel, self.slot.x_hotel_block_kind, self.slot.state)
        self.env.run('ota_block_adopt', self.payload())
        after = (self.slot.start_datetime, self.slot.end_datetime, self.slot.resource_id.id, self.slot.role_id.id,
                 self.slot.x_channel, self.slot.x_hotel_block_kind, self.slot.state)
        self.assertEqual(before, after)
        self.assertEqual(self.env.models['planning.slot'].created, [])
        self.assertEqual(self.env.models['planning.slot'].deleted, [])

    def test_replay_is_duplicate_not_second_link(self):
        self.env.run('ota_block_adopt', self.payload())
        r = self.env.run('ota_block_adopt', self.payload())
        self.assertTrue(r['ok'])
        self.assertTrue(r['data']['replay'])
        self.assertEqual(len(self.links()), 1)

    def test_without_conflict_snapshot_rejected(self):
        self.env.models['x_hotel_api_log'].rows = []
        r = self.env.run('ota_block_adopt', self.payload())
        self.assertEqual(r['error_code'], 'SNAPSHOT_ERROR')
        self.assertEqual(self.links(), [])

    def test_slot_with_sale_order_rejected(self):
        self.slot.x_hotel_order_id = Row(id=1)
        self.assertEqual(self.env.run('ota_block_adopt', self.payload())['error_code'], 'AMBIGUOUS_STATE')
        self.assertEqual(self.links(), [])

    def test_slot_with_guest_rejected(self):
        self.slot.x_guest_id = Row(id=2)
        self.assertEqual(self.env.run('ota_block_adopt', self.payload())['error_code'], 'AMBIGUOUS_STATE')

    def test_extra_overlap_in_301_rejected(self):
        extra = Row(id=40160, resource_id=Row(id=31), role_id=Row(id=37),
                    start_datetime=datetime.datetime(2026, 10, 12, 20), end_datetime=datetime.datetime(2026, 10, 13, 16),
                    state='published', x_channel=False, x_hotel_block_kind=False)
        self.env.models['planning.slot'].rows.append(extra)
        extra._model = self.env.models['planning.slot']
        self.assertEqual(self.env.run('ota_block_adopt', self.payload())['error_code'], 'AMBIGUOUS_STATE')

    def test_wrong_window_rejected(self):
        r = self.env.run('ota_block_adopt', self.payload(check_in='2026-10-13', check_out='2026-10-14'))
        self.assertEqual(r['error_code'], 'PILOT_SCOPE_VIOLATION')

    def test_wrong_unit_rejected(self):
        r = self.env.run('ota_block_adopt', self.payload(canonical_unit_id='AHS-302', odoo_unit_id='5'))
        self.assertEqual(r['error_code'], 'PILOT_SCOPE_VIOLATION')

    def test_slot_4_5_oct_40161_not_adoptable(self):
        r = self.env.run('ota_block_adopt', self.payload(slot_id=40161, check_in='2026-10-04', check_out='2026-10-05'))
        self.assertEqual(r['error_code'], 'PILOT_SCOPE_VIOLATION')
        self.assertEqual(self.links(), [])

    def test_unadopt_removes_only_the_link(self):
        self.env.run('ota_block_adopt', self.payload())
        r = self.env.run('ota_block_unadopt', {'idempotency_key': self.KEY, 'slot_id': 40159})
        self.assertTrue(r['ok'])
        blocks = self.env.run('ota_blocks_list', {})['data']['blocks']
        self.assertNotIn(self.KEY, [b['idempotency_key'] for b in blocks if b['idempotency_key']])
        self.assertEqual(self.slot.state, 'published')


class SandboxRestrictionTests(unittest.TestCase):
    """Odoo rechaza `del x[k]` (DELETE_SUBSCR) en el codigo de acciones servidor: el parche no debe usarlo."""

    def test_no_del_statements_in_action_code(self):
        import re
        self.assertIsNone(re.search(r'^\s*del\s', CODE, re.MULTILINE))


class WrappedSnapshotTests(unittest.TestCase):
    """Odoo guarda ota_snapshot_put como fila plana o envuelta en {entry, correlation_id}."""

    def setUp(self):
        self.env = Env()

    def assert_inventory_untouched(self):
        slots = self.env.models['planning.slot']
        self.assertEqual([row.id for row in slots.rows], [40142, 40140])
        self.assertEqual(slots.created, [])
        self.assertEqual(slots.deleted, [])

    def add_row(self, key, request):
        self.env.models['x_hotel_api_log'].create({
            'x_operation': 'ota_snapshot_put', 'x_idempotency_key': key,
            'x_result': 'ok', 'x_request': request,
        })

    def add_wrapped(self, key, start, end, state='CONFLICT'):
        entry = {'idempotency_key': key, 'source': 'booking', 'canonical_unit_id': 'AHS-302',
                 'external_uid': 'synthetic-' + key[0], 'check_in': start, 'check_out': end,
                 'state': state, 'correlation_id': 'corr'}
        self.add_row(key, json.dumps({'entry': entry, 'correlation_id': 'corr'}))

    def test_wrapped_latest_row_is_accepted(self):
        self.add_wrapped('a' * 64, '2026-10-01', '2026-10-05')
        response = self.env.run('ota_block_adopt', adopt())
        self.assertTrue(response['ok'])
        self.assertEqual(response['data']['slot_id'], 40142)

    def test_wrapped_latest_row_with_wrong_state_is_rejected(self):
        self.add_wrapped('a' * 64, '2026-10-01', '2026-10-05', state='ACTIVE')
        response = self.env.run('ota_block_adopt', adopt())
        self.assertEqual(response['error_code'], 'SNAPSHOT_ERROR')
        self.assert_inventory_untouched()

    def test_wrapped_latest_row_with_wrong_dates_is_rejected(self):
        self.add_wrapped('a' * 64, '2026-10-02', '2026-10-05')
        response = self.env.run('ota_block_adopt', adopt())
        self.assertEqual(response['error_code'], 'SNAPSHOT_ERROR')

    def test_malformed_entry_is_rejected_not_accepted(self):
        self.add_row('a' * 64, json.dumps({'entry': 'texto', 'correlation_id': 'corr'}))
        response = self.env.run('ota_block_adopt', adopt())
        self.assertEqual(response['error_code'], 'SNAPSHOT_ERROR')
        self.assert_inventory_untouched()

    def test_unreadable_json_row_is_rejected(self):
        self.add_row('a' * 64, '{no-es-json')
        response = self.env.run('ota_block_adopt', adopt())
        self.assertEqual(response['error_code'], 'SNAPSHOT_ERROR')
        self.assert_inventory_untouched()

    def test_snapshot_list_reads_wrapped_rows(self):
        self.add_wrapped('c' * 64, '2026-10-17', '2026-10-18')
        response = self.env.run('ota_snapshot_list', {'source': 'booking', 'canonical_unit_id': 'AHS-302'})
        self.assertTrue(response['ok'])
        keys = {entry['idempotency_key'] for entry in response['data']['entries']}
        self.assertIn('c' * 64, keys)
        self.assertIn('a' * 64, keys)


if __name__ == '__main__':
    unittest.main()
