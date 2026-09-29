# ATH-ODOO-HOTEL-010 — Contrato WhatsApp/IA (preparacion, NO activacion)

> Documentado en HOTEL-009, Fase 6. WhatsApp real, Meta y Sofia en
> produccion siguen SIN conectar. Esto es solo el contrato/arquitectura
> para que HOTEL-010 (gate futuro) pueda construir sobre esto sin
> reinventarlo.

## Principio (ya aprobado desde HOTEL-006/007)

> La IA conversa/orquesta. Odoo calcula y garantiza inventario.

La IA de WhatsApp NUNCA calcula disponibilidad, tarifa ni aprueba
excepciones. Solo formatea lo que el Gateway/Odoo ya respondio.

## Flujo

```
Cliente
  -> WhatsApp (Meta Business API, NO activado)
    -> capa conversacional / IA (parsea intencion: fechas, personas, unidad)
      -> integrations/odoo-hotel-gateway/src/sofia-adapter.mjs (YA EXISTE, probado)
        -> alternatives-engine.mjs (YA EXISTE, probado) + WebHotelClient/SofiaHotelClient
          -> Hotel Gateway -> Odoo STAGING/produccion (accion 1967)
      <- {requested_unit, available, alternatives, tarifa (via quote)}
    <- capa conversacional redacta el mensaje (presentAvailabilityMessage
       ya existe como ejemplo separado de datos/presentacion)
  <- WhatsApp
```

## Que YA existe y NO hay que reconstruir

- `clients/sofia-client.mjs`: identidad tecnica `sofia-hotel-007`
  (agent_id), mismo contrato de minimo privilegio.
- `src/sofia-adapter.mjs`: `sofiaAvailabilityQuery()` (datos) +
  `presentAvailabilityMessage()` (presentacion, separada a proposito).
- `src/alternatives-engine.mjs`: nunca inventa disponibilidad, filtra
  por capacidad, nunca ofrece habitaciones sueltas por Casa Completa.
- `src/gateway-response-utils.mjs`: interpreta la respuesta real
  (doblemente anidada) del Gateway -- correccion de HOTEL-008, ya
  disponible para reutilizar aqui.
- Para tarifa estructurada: el Gateway ya expone `/hotel/quote`
  (probado en HOTEL-008A: price-tiers PASS, precios reales de Odoo).

## Que falta para HOTEL-010 (NO se construye en este gate)

1. Integracion real con Meta WhatsApp Business API (credenciales,
   webhook, verificacion) -- fuera de alcance, requiere decision/acceso
   de Marlon.
2. Capa de parseo de lenguaje natural -> `{unit, checkIn, checkOut,
   guests}` estructurado (la IA convierte texto libre a esto; el
   contrato de abajo es lo que recibe DESPUES de ese parseo).
3. Conectar `quote` estructurado a la respuesta (hoy `sofia-adapter`
   solo cubre `availability`; falta el mismo patron para `quote` con
   datos/presentacion separados).
4. Decision de negocio: que hacer si `requires_manual_confirmation:
   true` viene en la respuesta de Odoo (ya lo devuelve el adapter real,
   visto en HOTEL-008) -- la IA NO debe aprobar sola, debe escalar a
   Angela/Marlon.

## Contrato de entrada/salida propuesto para HOTEL-010

**Entrada** (lo que la capa de IA debe entregarle al adapter, ya
parseado desde el mensaje de WhatsApp):

```json
{
  "unit": "201",
  "checkIn": "2026-12-10",
  "checkOut": "2026-12-12",
  "guests": 2
}
```

**Salida** (lo que el adapter devuelve, dato crudo, sin texto comercial):

```json
{
  "requested_unit": "201",
  "available": false,
  "alternatives": [{ "unit": "202", "capacity": 4 }],
  "requires_manual_confirmation": false
}
```

La capa de presentacion (ya existe el patron en
`presentAvailabilityMessage`) redacta el mensaje final en espanol a
partir de esto, nunca al reves.

## Reglas que la IA nunca puede romper (ya garantizadas por el Gateway,
no por la IA)

- No inventa disponibilidad: `alternatives-engine.mjs` solo devuelve lo
  que `checkAvailability` (respaldado por Odoo real) confirmo.
- No inventa tarifa: el Gateway bloquea `price`/`discount`/`tax` desde
  el cliente (`src/contract.mjs`, ya probado).
- No se salta anti-overbooking: vive dentro de Odoo (accion 1967), el
  Gateway nunca lo reimplementa.
- No concede descuentos: mismo bloqueo de contrato de arriba.

## Estado

Documentado, cero codigo nuevo activado. `WHATSAPP_CONNECTED: NO`.
