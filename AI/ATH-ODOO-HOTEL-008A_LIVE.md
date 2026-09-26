# ATH-ODOO-HOTEL-008A — LIVE staging gate

Esta rama nace directamente de `feature/ath-odoo-hotel-007-gateway` para que el runner de Claude tenga el gateway HOTEL-007 en su checkout desde el inicio.

## Objetivo
Validar en staging el inventario compartido Hotel Atheron Suite:
201, 202, 203, 301, 302 y Casa Completa.

## Fail-closed
- Base permitida: `atheron1-hotel-staging-20260923`.
- `ODOO_ACTION_ID` debe ser explícito; no usar fallback.
- Sin credenciales: STOP antes de red.
- No producción, no Atheron Security, no Booking/Airbnb/WhatsApp.
- No merge automático.

## Gates
1. baseline disponibilidad.
2. HOLD 201 bloquea 201 y Casa Completa, no las otras habitaciones.
3. liberación/expiración restaura.
4. HOLD Casa Completa bloquea las cinco habitaciones.
5. liberación restaura las cinco.
6. availability → quote → HOLD → status; precio proviene de Odoo/regla determinista.
