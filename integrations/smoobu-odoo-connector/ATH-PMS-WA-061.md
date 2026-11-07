# ATH-PMS-WA-061 — Consulta oficial de disponibilidad Smoobu

Fecha de ejecución: 7 de noviembre de 2026. Rama experimental; no fusionado.

## Implementación

- `GET /api/me` obtiene el identificador de cuenta `customerId` real sin imprimir correo ni datos de cuenta.
- `POST /booking/checkApartmentAvailability` usa HMAC en la ruta documentada por Smoobu. Es una consulta de disponibilidad, precio y restricciones; no crea reservas.
- Lista blanca fija: 201 (3557506), 202 (3557511), 203 (3557516), 301 (3557521), 302 (3557526). Casa Completa y otras propiedades quedan fuera.
- `availability-once` se ofrece como ejecución manual en el workflow; no queda trigger push. Para consultar: elegir modo `availability-once`, fechas y huéspedes.

## Evidencia real (16–17/03/2027)

1. Dos huéspedes: Smoobu rechazó las cinco habitaciones con `The number of guests exceeds the limit of the apartment`.
2. Detalle de los cinco apartamentos: todos devuelven `maxOccupancy=1`, moneda `COP` y rango de precio de ficha `0.00–0.00`.
3. Un huésped: Smoobu incluyó los cinco IDs en `availableApartments` y no devolvió `errorMessages`; por tanto, los cinco están disponibles para una persona en esas fechas.
4. La respuesta `prices` no incluyó precio utilizable para ninguno; el resultado normalizado es `available_price_unverified`. No se puede cotizar todavía.
5. Ejecución: [GitHub Actions #42384158688](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/42384158688). Suite offline: 392/392 aprobadas.

## Conclusión y bloqueos

- La consulta oficial ya funciona y diferencia correctamente capacidad, disponibilidad y precio.
- La capacidad de Smoobu está en 1 huésped para todas las habitaciones, lo que contradice el objetivo comercial de vender algunas a dos personas. No se cambió: requiere confirmación de gerencia y ajuste explícito en Smoobu.
- La tarifa para las fechas consultadas no está configurada/devuelta por Smoobu. No usar `0.00` como precio ni inventar una tarifa. Hay que cargar/revisar el calendario de tarifas y repetir la consulta.
- El flujo de WhatsApp todavía no está conectado a un agente en producción. El piloto conversacional continúa en modo sombra. No se enviaron mensajes, no se escribieron reservas ni pagos, y no se tocó Odoo.

## Referencia oficial

Smoobu API docs: https://docs.smoobu.com/ (Smoobu Availability; HMAC Authentication).
