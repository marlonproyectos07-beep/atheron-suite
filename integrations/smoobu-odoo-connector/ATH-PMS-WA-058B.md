# ATH-PMS-WA-058B — GET rates (solo lectura, no activo)

- Verificado en GitHub Actions #55: `GET /api/apartments` HTTP 200; se recibieron SOLO cinco IDs fisicos. Identidad nominal aun sin comprobar. Casa Completa (3557501) y Carrera 19 (3567496) ausentes; no alterar el mapa ni declararlos libres.
- El metodo `SmoobuClient.getRates` usa exclusivamente `GET /api/rates`, fechas de calendario y parametros repetidos `apartments[]`, firmados por HMAC con la misma cadena enviada en la URL.
- `GET /api/rates` y la interpretacion del contenido NO se han comprobado en la cuenta real. El esquema documentado es `data[apartment_id][date] = {price, available, min_length_of_stay}`.
- `inspectDailyRates` usa checkout exclusivo, precio diario en suma INFORMATIVA, no moneda ni precio final de venta. Toda tarifa es CANDIDATA: impuestos, extras, reglas del canal, ocupacion de Casa y condiciones adicionales siguen sin validar.
- `npm run rates-once` requiere `RATES_READONLY_ARM=ATH-PMS-WA-058C-LECTURA`, `RATES_FROM`, `RATES_TO` y las credenciales Smoobu en almacen seguro. No hay paso del workflow de produccion que lo ejecute. No ejecutar contra Smoobu sin nueva autorizacion de gerencia.
- Las cinco habitaciones tienen IDs del mapa existente, sin nombres confirmados. No se incluye Carrera 19 ni Casa Completa en la solicitud. No se activa ningun webhook, respuesta de WhatsApp, reserva, pago ni cambio en Odoo.
- El workflow de PR solo ejecuta `npm test` SIN secretos y SIN llamadas a la API.
- Siguiente etapa 058C: lectura real GET /api/rates acotada y validacion de la codificacion `apartments[]`, despues contraste de nombres y Casa Completa.
