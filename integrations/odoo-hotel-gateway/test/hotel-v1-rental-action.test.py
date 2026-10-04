"""Offline execution tests for the staged Odoo server-action replacement.

The fakes exercise our Python code; they do not certify Odoo's rental internals.
"""
import datetime
import pathlib
import unittest
from zoneinfo import ZoneInfo


ACTION = pathlib.Path(__file__).resolve().parents[1] / "odoo-patches" / "hotel-v1-confirm-rental.py"


class UserError(Exception):
    pass


class Timezone(datetime.tzinfo):
    def __init__(self, name):
        self.zone = ZoneInfo(name)

    def localize(self, value):
        return value.replace(tzinfo=self)

    def utcoffset(self, value):
        return self.zone.utcoffset(value.replace(tzinfo=self.zone))

    def dst(self, value):
        return self.zone.dst(value.replace(tzinfo=self.zone))

    def tzname(self, value):
        return self.zone.tzname(value.replace(tzinfo=self.zone))

    def fromutc(self, value):
        return self.zone.fromutc(value.replace(tzinfo=self.zone)).replace(tzinfo=self)

    def __str__(self):
        return str(self.zone)


def timezone(name):
    return Timezone(name)


class Row:
    def __init__(self, **values):
        self.__dict__.update(values)

    def write(self, values):
        self.__dict__.update(values)


class Line(Row):
    def write(self, values):
        self.__dict__.update(values)

    def exists(self):
        return True


class Planning:
    def __init__(self):
        self.slots = []

    def sudo(self):
        return self

    def search(self, domain):
        return [slot for slot in self.slots if all(
            getattr(slot, field) == value for field, operator, value in domain if operator == "="
        )]


class Env:
    def __init__(self, planning):
        self.planning = planning

    def __getitem__(self, model):
        if model != "planning.slot":
            raise AssertionError(model)
        return self.planning


class Order(Row):
    def __init__(self, unit, planning, *, date_in=datetime.date(2026, 10, 4),
                 date_out=datetime.date(2026, 10, 5), source="whatsapp", line=True):
        product = unit.x_product_tmpl_id.product_variant_id
        lines = [Line(id=501, product_id=product, product_uom_qty=1,
                      price_unit=130000.0, discount=0.0, is_rental=False)] if line else []
        super().__init__(name="TEST-HOTEL-301", x_hotel_unit_id=unit, x_reservation_status="draft",
                         x_checkin=date_in, x_checkout=date_out, x_booking_source=source,
                         x_quote_ref="TEST-REF", partner_id=Row(name="TEST GUEST"), order_line=lines,
                         is_rental_order=False, rental_start_date=None, rental_return_date=None,
                         rental_status=None, state="draft")
        self.planning = planning
        self.pickup_calls = 0
        self.native_reprices = False
        self.native_omits_slot = False

    @property
    def amount_total(self):
        return sum(line.product_uom_qty * line.price_unit * (1 - line.discount / 100)
                   for line in self.order_line)

    def write(self, values):
        self.__dict__.update(values)

    def action_confirm(self):
        if self.is_rental_order and self.order_line and self.order_line[0].is_rental:
            self.state = "sale"
            self.rental_status = "pickup"  # Odoo UI: Reservado
            line = self.order_line[0]
            if self.native_reprices:
                line.write({"product_uom_qty": 2, "price_unit": 999999.0})
            if not self.planning.slots and not self.native_omits_slot:
                self.planning.slots.append(Row(sale_line_id=line.id, state="published",
                    resource_id=self.x_hotel_unit_id.x_resource_id.id,
                    start_datetime=self.rental_start_date, end_datetime=self.rental_return_date))


def unit(name="301", *, rentable=True):
    product = Row(id=3010 if name == "301" else 6000)
    template = Row(rent_ok=rentable, product_variant_id=product)
    return Row(x_name=name, x_resource_id=Row(id=4 if name == "301" else 6),
               x_role_id=Row(id=44), x_product_tmpl_id=template,
               x_property_id=Row(x_tz="America/Bogota", x_checkin_time=15.0, x_checkout_time=11.0))


def run(order, planning):
    exec(compile(ACTION.read_text(encoding="utf-8"), str(ACTION), "exec"),
         {"env": Env(planning), "records": [order], "UserError": UserError,
          "datetime": datetime, "timezone": timezone})


class HotelRentalActionTests(unittest.TestCase):
    def test_301_new_hotel_reservation_becomes_reserved_rental_and_one_planning_slot(self):
        planning = Planning()
        order = Order(unit(), planning)
        run(order, planning)
        self.assertTrue(order.is_rental_order)
        self.assertEqual(order.x_reservation_status, "confirmed")
        self.assertEqual(order.rental_status, "pickup")
        self.assertEqual(order.rental_start_date, datetime.datetime(2026, 10, 4, 20))
        self.assertEqual(order.rental_return_date, datetime.datetime(2026, 10, 5, 16))
        self.assertEqual(len(planning.slots), 1)
        self.assertEqual(planning.slots[0].resource_id, 4)
        self.assertEqual(order.amount_total, 130000)
        self.assertEqual(order.x_booking_source, "whatsapp")
        self.assertEqual(order.partner_id.name, "TEST GUEST")
        self.assertEqual(order.x_quote_ref, "TEST-REF")
        self.assertEqual(order.pickup_calls, 0)

    def test_casa_uses_its_own_resource_and_rental_period(self):
        planning = Planning()
        order = Order(unit("CASA_COMPLETA"), planning)
        run(order, planning)
        self.assertEqual(order.rental_status, "pickup")
        self.assertEqual(len(planning.slots), 1)
        self.assertEqual(planning.slots[0].resource_id, 6)

    def test_missing_unit_product_line_fails_before_confirming(self):
        planning = Planning()
        order = Order(unit(), planning, line=False)
        with self.assertRaisesRegex(UserError, "exactamente una linea"):
            run(order, planning)
        self.assertEqual(order.state, "draft")
        self.assertEqual(len(planning.slots), 0)

    def test_non_rentable_product_fails_closed(self):
        planning = Planning()
        order = Order(unit(rentable=False), planning)
        with self.assertRaisesRegex(UserError, "no esta habilitado para alquiler"):
            run(order, planning)
        self.assertEqual(order.state, "draft")

    def test_duplicate_or_wrong_planning_slot_is_rejected(self):
        planning = Planning()
        order = Order(unit(), planning)
        planning.slots.extend([Row(sale_line_id=501, state="published", resource_id=4,
            start_datetime=datetime.datetime(2026, 10, 4, 20), end_datetime=datetime.datetime(2026, 10, 5, 16))
            for _ in range(2)])
        with self.assertRaisesRegex(UserError, "exactamente un bloque Planning"):
            run(order, planning)

    def test_single_legacy_noon_slot_is_adjusted_to_hotel_checkin_checkout(self):
        planning = Planning()
        order = Order(unit(), planning)
        planning.slots.append(Row(sale_line_id=501, state="published", resource_id=4,
            start_datetime=datetime.datetime(2026, 10, 4, 12), end_datetime=datetime.datetime(2026, 10, 5, 12)))
        run(order, planning)
        self.assertEqual(planning.slots[0].start_datetime, datetime.datetime(2026, 10, 4, 20))
        self.assertEqual(planning.slots[0].end_datetime, datetime.datetime(2026, 10, 5, 16))

    def test_agreed_price_is_preserved_if_native_rental_reprices(self):
        planning = Planning()
        order = Order(unit(), planning)
        order.native_reprices = True
        run(order, planning)
        self.assertEqual(order.order_line[0].product_uom_qty, 1)
        self.assertEqual(order.order_line[0].price_unit, 130000)
        self.assertEqual(order.amount_total, 130000)

    def test_native_rental_without_planning_slot_fails_closed(self):
        planning = Planning()
        order = Order(unit(), planning)
        order.native_omits_slot = True
        with self.assertRaisesRegex(UserError, "exactamente un bloque Planning"):
            run(order, planning)

    def test_repeating_confirmation_does_not_create_second_slot(self):
        planning = Planning()
        order = Order(unit(), planning)
        run(order, planning)
        with self.assertRaisesRegex(UserError, "transicion no permitida"):
            run(order, planning)
        self.assertEqual(len(planning.slots), 1)


if __name__ == "__main__":
    unittest.main()
