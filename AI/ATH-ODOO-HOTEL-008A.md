# ATH-ODOO-HOTEL-008A — Odoo ↔ Web preflight

Estado: PASS_PREP / implementación en curso.

## Objetivo
Validar el contrato Odoo ↔ Web para Hotel Atheron Suite sin tocar producción.

## Inventario lógico piloto
201, 202, 203, 301, 302 y Casa Completa.

Los IDs de staging/fixtures no son IDs promovibles a producción. No inventar IDs.

## Contrato
fechas + personas → availability → quote determinista → HOLD → status.

La IA conversa/orquesta. Odoo/reglas deterministas calculan precio e inventario.

## Gates anti-overbooking
- 008A-1: HOLD habitación → Casa Completa no disponible.
- 008A-2: HOLD Casa Completa → 201/202/203/301/302 no disponibles.
- 008A-3: expiración HOLD Casa Completa → libera las 5 habitaciones.
- 008A-4: HOLD de una habitación no bloquea/libera incorrectamente las otras habitaciones.

## Guardrails
No producción. No Booking/Airbnb/WhatsApp. No secretos. No merge automático.
