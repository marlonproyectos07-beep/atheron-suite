# ATH-ODOO-HOTEL-011 — WhatsApp Controlled Pilot (laboratorio, 2026-09-30)

> Continua desde HOTEL-009 CERRADO (`AI/ATH-ODOO-HOTEL-009_FINAL_APPROVED.md`,
> commit `cd824a6`, 274/274 tests). Rama independiente:
> `feature/ath-odoo-hotel-011-whatsapp-controlled-pilot`. WhatsApp/Meta
> real: **NO conectado** en este gate, a proposito -- ver Fase 15/16.

## Fase 1 — auditoria de lo que ya existia (HOTEL-009/010)

| Componente | Estado |
|---|---|
| `nlu-lite.mjs` (interpretacion de texto) | EXISTS, REUSABLE -- sin cambios |
| `conversation-engine.mjs` (estado conversacional) | EXISTS, REUSABLE -- sin cambios de logica |
| `ai-tool-adapters.mjs` (availability/quote/hold/cancel) | EXISTS, REUSABLE -- `cancel` sigue `NOT_IMPLEMENTED` (decision de arquitectura ya documentada, HOTEL-009) |
| `messaging-provider.mjs` (contrato de mensajeria) | EXISTS, **NEEDS_CHANGE** -- ampliado con `markDelivered`/`deduplicate`/`correlationId` (ver Fase 2) |
| Simulador 25/25 (HOTEL-010) | EXISTS, REUSABLE -- se agrega uno nuevo de 30, no se reemplaza |
| E2E conversacional real (HOTEL-009/010) | EXISTS, REUSABLE -- patron reutilizado para el E2E de WhatsApp (Fase 14) |
| Gateway (`availability/quote/hold/status`) | EXISTS, REUSABLE -- probado LIVE de nuevo en este gate |
| Idempotencia (Gateway) | EXISTS, REUSABLE -- probada desde HOTEL-007 |
| `correlation_id` (Gateway + `observability-events.mjs`) | EXISTS, REUSABLE |
| `human-handoff.mjs` | EXISTS, REUSABLE -- consumido por el orquestador nuevo |
| `ai-autonomy-policy.mjs` (HUMAN_REQUIRED) | EXISTS, REUSABLE |
| Adaptador real de WhatsApp Cloud API | **MISSING** -- construido en este gate (Fase 3) |
| Webhook (verificacion + parseo de payload real) | **MISSING** -- construido en este gate (Fase 3/4) |
| Orquestador end-to-end (mensaje -> motor -> Gateway -> respuesta) | **MISSING** -- construido en este gate (Fase 5) |

No se duplico nada: todo lo marcado REUSABLE se uso tal cual.

## Fase 2 — MessagingProvider ampliado

`src/messaging-provider.mjs`: el contrato ahora exige tambien
`markDelivered`, `deduplicate`, `correlationId` (ademas de
`receiveMessage`/`sendMessage`/`markRead`/`verifyWebhook` ya
existentes). `LabMessagingProvider` los implementa en memoria
(`Set`/`Map`, sin red). 8 tests.

## Fase 3/4 — Adaptador WhatsApp Cloud API + Webhook

`src/whatsapp-cloud-adapter.mjs` (`WhatsAppCloudProvider`), implementa
el MISMO contrato que el LAB provider:

- `verifyWebhook(query)`: handshake real de Meta
  (`hub.mode`/`hub.verify_token`/`hub.challenge`), puro, sin red.
- `parseInboundPayload(payload)`: traduce la forma REAL de un payload
  de Meta (documentada publicamente) a nuestro mensaje interno; ignora
  de forma segura tipos no-texto o payload corrupto -- nunca lanza.
- `receiveMessage`: deduplica por `message_id` antes de entregar a los
  handlers (protege contra reintentos de Meta).
- `sendMessage`/`markRead`: arman el request REAL (`Authorization:
  Bearer`, shape exacto de Meta) pero requieren un `httpClient`
  inyectado explicitamente -- **sin el, nunca llaman a Meta por su
  cuenta** (`WHATSAPP_ADAPTER_NOT_CONNECTED`). Sin `accessToken`/
  `phoneNumberId`, fallan cerrado (`WHATSAPP_ADAPTER_MISCONFIGURED`).
- `markDelivered`: no-op documentado -- Meta no expone ese endpoint
  desde el lado del negocio (la entrega la reporta Meta por su propio
  webhook de status), no se inventa uno.
- Ningun secreto se imprime nunca (los errores solo nombran el campo
  que falta, nunca su valor).

10 tests, incluyendo el payload real de Meta y el request real armado
contra un `httpClient` fake (nunca red real).

## Fase 5-11 — Motor conversacional real, orquestado

`src/whatsapp-orchestrator.mjs` (`createWhatsAppOrchestrator`): conecta
`MessagingProvider -> nlu-lite -> conversation-engine ->
ai-tool-adapters -> Gateway -> whatsapp-copy -> respuesta`, con una
conversacion por telefono. 12 tests, cubriendo exactamente lo pedido:

- **Fase 5 (golden path)**: mensaje completo llega hasta `HOLD_CREATED`
  y responde.
- **Fase 6 (datos faltantes)**: pregunta solo lo que falta, nunca
  repite lo que ya sabe.
- **Fase 7 (cambios a mitad de conversacion)**: recalcula real, nunca
  reutiliza disponibilidad vieja (verificado contando llamadas al
  Gateway).
- **Fase 8 (HUMAN_REQUIRED)**: escala y arma la ficha de handoff
  completa (`human-handoff.mjs`, sin cambios).
- **Fase 9 (idempotencia)**: el MISMO `message_id` (reintento de Meta)
  nunca duplica una operacion -- deduplicado a nivel de orquestador
  (funciona igual con cualquier `MessagingProvider`).
- **Fase 10 (concurrencia)**: cliente A y cliente B piden la misma
  unidad -- maximo uno consigue el HOLD, cero sobreventa.
- **Fase 11 (fallas)**: un error del Gateway se captura, el cliente
  recibe una respuesta corta y sin tecnicismos, la conversacion se
  conserva para reintentar -- nunca se afirma algo que Odoo no
  confirmo.

## Fase 12 — Seguridad

0 `console.log` en `src/` (grep confirmado, incluye todos los archivos
nuevos de este gate). `WhatsAppCloudProvider` nunca imprime
`accessToken`/`verifyToken` -- los errores solo nombran el campo
faltante. Deduplicacion/idempotencia/correlation IDs ya probados
(Fase 9). PII: el orquestador NUNCA agrega telefono a
`customer.phone` automaticamente desde el `from` de WhatsApp (se
confirmo con test explicito) -- evita que un numero de telefono entre
sin control al modelo de conversacion; si se necesita, es una decision
de diseno pendiente, no un descuido.

## Fase 13 — Simulador v2 (30/30)

`scripts/whatsapp-simulator-v2.mjs` (`npm run
hotel:whatsapp-simulator-v2`), corre el pipeline COMPLETO
(texto crudo -> orquestador) para 30 escenarios: pareja/familia/grupo,
Casa Completa explicita, fechas incompletas/invalidas, cambio de
fecha/personas, sin disponibilidad, varias/una alternativa, precio,
descuento, reservar, HOLD (creado/repetido/expirado), duplicado,
concurrencia, timeout/error Odoo/malformado, cancelacion, reclamacion,
humano solicitado, abandono/reanudacion, grupo excesivo,
`requires_manual_confirmation`, numeros en palabra, correccion de
personas, y liberacion de HOLD con inventario restaurado.
**30/30 PASS.**

## Fase 14 — E2E REAL contra Odoo STAGING (sin WhatsApp real)

`scripts/e2e-whatsapp-live.mjs`: `LabMessagingProvider` recibe el
mensaje EXACTO del mandato ("Hola, necesito habitación del ... al ...
para 2 personas.") -> orquestador -> Gateway LIVE real -> Odoo STAGING
real. Resultado real (2026-09-30):

```
availability REAL: 201 disponible (verificado, no asumido)
quote REAL: $80.000 COP, quote_id 150
HOLD REAL TEST: hold_id 22230, COT/2026/03823
```

Liberado con el boton real `Hotel: CANCELAR` (Odoo), reconfirmado
disponible de nuevo via `scripts/prueba-reina-201.mjs`. Sin residuos.

## Fase 15 — que falta EXACTAMENTE para conectar Meta real

Investigado en esta maquina (solo lectura): el secure-store
(`%LOCALAPPDATA%\AtheronSecrets`) SOLO tiene `odoo-hotel-staging.cred`
-- **no existe ninguna credencial de Meta/WhatsApp todavia**, en
ningun lado. Falta, concretamente:

| Variable | Para que |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Autenticar `sendMessage`/`markRead` contra la Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | El numero de WhatsApp Business que va a contestar |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Administrar la cuenta de WhatsApp Business en Meta |
| `WHATSAPP_VERIFY_TOKEN` | El secreto que Meta usa para verificar el webhook (lo define Marlon, no Meta) |
| `WEBHOOK_PUBLIC_URL` | Una URL publica HTTPS donde Meta pueda entregar los mensajes (hoy no existe ninguna -- el Gateway corre local) |
| `META_APP_ID` | La app de Meta for Developers donde se configura todo lo anterior |

Nada de esto existe hoy. No se puede avanzar la Fase 17 sin que Marlon
cree la app en Meta for Developers y decida donde correra el webhook
publico (infraestructura nueva, fuera del alcance de este gate).

## Fase 16 — GATE CEO

**Detenido aqui.** No se toco Meta/WhatsApp real, no se crearon
credenciales, no se desplego ningun webhook publico.

## Fase 18 — Observabilidad

Cada mensaje se traza con `conversation_id` (`wa-<telefono>`),
`correlation_id` (derivado del `message_id` real de WhatsApp, via
`provider.correlationId()`), y los eventos ya existentes
(`availability_checked`/`quote_generated`/`hold_created`/
`human_handoff`/`gateway_error`) -- verificado en el E2E real (Fase
14): la secuencia completa de eventos quedo trazable de punta a punta,
sin exponer telefono/nombre en los eventos (solo IDs tecnicos).

## Tests

294/294 (274 baseline HOTEL-009 + 20 nuevos: 3 messaging-provider + 10
whatsapp-cloud-adapter + 7 whatsapp-orchestrator), mas
`whatsapp-simulator-v2.mjs` 30/30 y el E2E real (Fase 14) PASS.

## REAL / SIMULATED / TESTED / BLOCKED / CEO_REQUIRED

- **REAL**: availability/quote/HOLD/liberacion contra Odoo STAGING
  (Fase 14); el parseo de payload de Meta (forma real, documentada);
  el handshake de verificacion de webhook (logica real de Meta).
- **SIMULATED**: el canal de WhatsApp en si (via `LabMessagingProvider`
  en todos los tests y en el simulador); los 2 clientes concurrentes
  (Fase 10, misma logica que ya se probo REAL en HOTEL-009 con
  `prueba-doble-intento-real.mjs`).
- **TESTED**: las 20 piezas nuevas (33 tests) + 30/30 del simulador v2.
- **BLOCKED**: conectar Meta real (falta TODA la configuracion, ver
  Fase 15 -- no es un bloqueo tecnico nuestro, es infraestructura que
  no existe todavia).
- **CEO_REQUIRED**: decidir cuando crear la app en Meta for Developers
  y donde alojar el webhook publico -- unica accion que falta para
  pasar a un piloto real.
