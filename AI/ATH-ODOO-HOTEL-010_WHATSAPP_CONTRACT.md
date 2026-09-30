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

## Actualizacion 2026-09-29 -- Frentes G-L construidos en laboratorio

Construido y probado (todo SIMULADO, sin WhatsApp/Meta real, sin tocar
produccion ni Odoo real):

- `src/conversation-engine.mjs` -- maquina de estados conversacional
  (`STATES`: NEW/COLLECTING_DATES/COLLECTING_GUESTS/
  CHECKING_AVAILABILITY/OPTIONS_PRESENTED/QUOTING/
  COLLECTING_GUEST_DATA/READY_FOR_HOLD/HOLD_CREATED/HUMAN_REQUIRED/
  COMPLETED/EXPIRED). Recibe el mensaje YA PARSEADO (la capa de NLU
  sigue fuera de alcance) y solo orquesta llamadas a las herramientas
  de abajo -- nunca calcula disponibilidad/tarifa por su cuenta. 17
  tests, cubriendo los 10 casos de conversacion pedidos por el CEO.
- `src/ai-tool-adapters.mjs` -- `check_availability`/`quote`/
  `create_hold` delegan en el Gateway real; `hold_status` reutiliza la
  operacion real `status` (por `operation_id`); `cancel_hold`,
  `create_reservation` y `reservation_status` estan marcados
  `NOT_IMPLEMENTED_REQUIRES_HOTEL_009` porque el contrato real del
  Gateway (`src/contract.mjs`) todavia no las define -- no se inventa
  un comportamiento para ellas.
- `src/human-handoff.mjs` -- arma el contexto estructurado para Angela/
  Marlon (nombre/telefono/fechas/personas/opcion/precio cotizado/
  motivo de escalamiento/ultimo mensaje), nunca inventa un dato que la
  conversacion no trae.
- `src/observability-events.mjs` -- constructores puros de los 8
  eventos pedidos (`availability_checked`, `quote_generated`,
  `option_selected`, `hold_created`, `hold_expired`, `human_handoff`,
  `reservation_created`, `reservation_cancelled`), con trazabilidad
  completa (`conversation_id`/`correlation_id`/`channel`/`timestamp`) y
  nunca datos sensibles.
- `scripts/whatsapp-simulator.mjs` (`npm run hotel:whatsapp-simulator`)
  -- corre los 10 casos de conversacion end-to-end contra herramientas
  falsas deterministas. 10/10 PASS.

## Actualizacion 2026-09-29 (segunda pasada) -- Mandato MASTER AUTONOMOUS COMPLETION (Gates 010-A a 010-K)

Con HOTEL-009 avanzado y `ODOO_STAGING_UI_BLOCKED` todavia vigente (sin
sesion de navegador contra `atheron1-hotel-staging-20260923`), se
completo todo lo que no depende de esa sesion:

- **Gate 010-A (auditoria de transiciones)**: se encontraron y cerraron
  2 huecos reales -- mensajes duplicados/repetidos ya eran idempotentes
  (verificado con tests nuevos), pero faltaba una salida real para
  `HOLD_CREATED` (nunca llegaba a `EXPIRED`) y para una cancelacion
  pedida por el cliente (no existia transicion, ahora escala a humano).
- **Gate 010-B (NLU de laboratorio)**: `src/nlu-lite.mjs`, desacoplado
  del motor y de WhatsApp. Basado en reglas (determinista, sin red);
  convierte texto libre a `{intent, check_in, check_out, guests,
  missing_fields, confidence}`. Nunca inventa un dato ausente; si no
  reconoce el mensaje, `intent: 'needs_clarification'`. 14 tests,
  cubriendo los 11 mensajes de ejemplo del CEO (incluye "somos 7, no 5"
  -> se queda con el ultimo numero, y numeros en palabra como "dos").
- **Gate 010-C (politica de autonomia)**: `src/ai-autonomy-policy.mjs`,
  catalogo GREEN/YELLOW/RED explicito y consultable (`classify()`), no
  solo prosa. Una accion no catalogada nunca se asume segura.
- **Gate 010-D (handoff humano, ampliado)**: `human-handoff.mjs` ahora
  incluye `hold` y `saldo_condicion` (null si la fuente no lo trae,
  nunca inventado) en la ficha operativa. Se agrego
  `resumeFromHuman()` en `conversation-engine.mjs`: reconstruye el
  estado mas avanzado que los datos YA CONFIRMADOS soportan cuando
  Angela devuelve la conversacion a la IA.
- **Gate 010-E (simulador ampliado)**: `scripts/whatsapp-simulator.mjs`
  paso de 10 a **25 escenarios** (los 25 exactos pedidos por el CEO),
  25/25 PASS. Incluye timeout de Gateway, error de Odoo y respuesta
  malformada -- estos tres se probaron ademas como tests reales en
  `test/conversation-engine-faults.test.mjs` (no solo en el script).
- **Gate 010-F (E2E sin WhatsApp)**: `test/e2e-without-whatsapp.test.mjs`
  recorre el mensaje de ejemplo del CEO ("...para dos personas") a
  traves de NLU -> motor -> adaptadores -> "Gateway" completo, incluye
  HOLD TEST, verificacion de inventario y liberacion del TEST (via
  expiracion del HOLD -- ver Gate 009-D para por que no via
  cancelacion). SIMULADO: el "Gateway" es un fake que imita las formas
  de respuesta ya confirmadas LIVE en HOTEL-008A: el mismo test sirve
  el dia que haya sesion real, cambiando solo las funciones inyectadas.
- **Gate 010-G (copy conversacional)**: `src/whatsapp-copy.mjs`, 11
  mensajes cortos (todos <220 caracteres), ninguno afirma una reserva
  confirmada sin confirmacion real.
- **Gate 010-H (seguridad/privacidad)**: auditado. Cero `console.log`
  en todo `src/` (grep confirmado). Los eventos de observabilidad
  (`observability-events.mjs`) nunca cargan PII (solo IDs tecnicos). La
  ficha de handoff (`human-handoff.mjs`) SI trae nombre/telefono a
  proposito (es su funcion: Angela necesita contactar al cliente), pero
  solo existe en memoria dentro de una conversacion escalada, nunca se
  persiste ni se loguea en este gate. Idempotencia/rate limit/
  correlation IDs siguen siendo los mismos ya probados en HOTEL-007
  (`idempotency.test.mjs`, `rate-limiter.test.mjs`).
- **Gate 010-I (MessagingProvider)**: `src/messaging-provider.mjs` --
  interfaz (`receiveMessage/sendMessage/markRead/verifyWebhook`) +
  `LabMessagingProvider` (memoria, sin red). Ningun cliente de Meta,
  ningun token, ningun webhook publico.
- **Gate 010-J (tests)**: 266/266 PASS (39 nuevos sobre los 227 de la
  pasada anterior). Nada roto.

**Hallazgo real de Gate 009-D (relevante tambien para 010-I/G):** se
intento agregar `cancel` como operacion real del Gateway (DRY_RUN) y se
revirtio de inmediato al chocar con una prueba deliberada de HOTEL-007
(`test/contract.test.mjs`, "unsupported operations (confirm/cancel) are
never in the whitelist"). No es un bug: es una decision de arquitectura
que protege contra cancelaciones no autorizadas. Levantarla requiere
decision explicita de Marlon, no una correccion tecnica.

## Estado

Documentado + motor conversacional/NLU/politica de autonomia/
adaptadores/handoff/observabilidad/MessagingProvider/simulador (25
casos)/E2E construidos y probados en laboratorio. Cero WhatsApp/Meta
real conectado. `WHATSAPP_CONNECTED: NO`. `META_REAL_CONNECTED: NO`.
