# ATH-ODOO-HOTEL-007 — Gateway técnico Odoo Hotel

Estado: **implementado y probado en local / no desplegado / no conectado a un Odoo real**.

Este directorio elimina la dependencia de una pestaña de Chrome autenticada
para operar el frente Odoo Hotel. Expone un contrato técnico único de mínimo
privilegio para que distintos agentes (ChatGPT, Claude, Codex/OpenCode y,
más adelante, Sofía) puedan:

1. consultar disponibilidad;
2. solicitar cotización;
3. crear HOLD idempotente;
4. consultar estado.

El gateway **no** confirma reservas, no cancela, no aprueba tarifas ni
capacidad extraordinaria, no toca Planning ni Master Data, y no acepta
precio, descuento, impuesto, canal, modo ni overrides enviados por el
cliente. Todo eso se bloquea en el validador de contrato (`src/contract.mjs`,
fail-closed).

## Arquitectura

```
AGENTE (Claude / ChatGPT / Codex / OpenCode / Sofía)
  │  HTTP + Authorization: Bearer <clave> + X-Agent-Id
  ▼
SERVIDOR (src/server.mjs)
  │  enruta /hotel/* y /health, /ready
  ▼
HotelGateway (src/gateway.mjs)
  │  1. IdentityStore.authenticate()   -> UNAUTHORIZED si falla
  │  2. RateLimiter.consume()          -> RATE_LIMITED si excede
  │  3. validateRequest() (contract)   -> FORBIDDEN_FIELD/UNKNOWN_FIELD/...
  │  4. IdempotencyStore.run()         -> solo quote/hold
  │  5. OdooHotelAdapter.<operacion>() -> DRY_RUN fixtures o Odoo real
  │  6. AuditLog.record()              -> siempre, éxito o error
  ▼
OdooHotelAdapter (src/odoo-adapter.mjs)
  │  DRY_RUN=true  -> fixtures locales, HOLD nunca escribe en Odoo real
  │  DRY_RUN=false -> acción 1967 vía transporte inyectable (probado con
  │                    transporte simulado; Odoo real aún sin credenciales)
  ▼
GATEWAY ODOO 1967 -> MASTER DATA / RATE ENGINE / INVENTARIO
```

Principio que gobierna todo el diseño: **la IA conversa/orquesta, Odoo
calcula y garantiza inventario.** Nada de tarifas, capacidad, disponibilidad,
exclusiones, HOLD ni anti-overbooking se reimplementa aquí.

## Endpoints

- `POST /hotel/availability`
- `POST /hotel/quote`
- `POST /hotel/hold`
- `POST /hotel/status`
- `GET /health` — liveness, sin autenticación, sin secretos.
- `GET /ready` — listo para tráfico (en DRY_RUN siempre `true`).

Ver `openapi.yaml` para el contrato completo.

## Autenticación técnica

Cada agente autorizado tiene una **identidad técnica propia del gateway**
(no son credenciales de Odoo): `agent_id` + clave opaca. El gateway solo
guarda el hash SHA-256 de la clave (`src/identity.mjs`), nunca la clave en
claro. Se envía como:

```
X-Agent-Id: claude-hotel-007
Authorization: Bearer <clave>
```

Propiedades:
- **Revocable**: `identityStore.revoke(agentId)` — desde ese momento
  cualquier llamada de ese agente devuelve `UNAUTHORIZED`, sin tocar código
  (ver `test/revocation.test.mjs`).
- **Rotable**: `identityStore.rotate(agentId, nuevaClave)` invalida la clave
  anterior de inmediato.
- **Mínimo privilegio**: todas las identidades comparten exactamente las
  mismas 4 operaciones (`availability/quote/hold/status`); ningún agente
  tiene privilegios especiales, replicando el grupo 149 `Hotel v1 / API
  Sofía` de HOTEL-006 (sin grupo 148, sin admin, sin API keys de otros
  usuarios).
- **Separada por entorno**: las identidades se cargan por variable de
  entorno (`GATEWAY_TECHNICAL_IDENTITIES`), nunca desde código ni desde este
  repositorio.

## Gestión de secretos

- Nunca hay claves, tokens ni contraseñas reales en este repositorio, en
  los tests ni en los logs.
- `.env.example` solo documenta nombres de variables, con valores vacíos.
- La auditoría (`src/audit-log.mjs`) tiene una lista cerrada de campos
  permitidos; `password`, `token`, `cookie`, `secret` y el prompt completo
  nunca se registran, aunque un llamador los envíe por error.
- La conexión real a Odoo (`ODOO_BASE_URL`, `ODOO_DATABASE`,
  `ODOO_TECHNICAL_USER`, `ODOO_TECHNICAL_SECRET`) es
  **`PENDIENTE_CREDENCIAL_SEGURA`**: no existe en ningún entorno de este
  proyecto todavía. Ver el bloque correspondiente en `.env.example` para
  qué secreto hace falta, dónde cargarlo, con qué permisos mínimos y cómo
  revocarlo.

## Idempotencia y concurrencia (Fase 6)

- `availability` no requiere `idempotency_key`.
- `quote` y `hold` sí lo requieren (`IDEMPOTENCY_KEY_REQUIRED` si falta).
- `status` consulta por `operation_id` (quote_id u hold_id).

`src/idempotency-store.mjs` garantiza:
- **A.** misma request + misma key → mismo resultado (replay).
- **B.** misma key + payload distinto → `IDEMPOTENCY_KEY_REUSED`.
- **C/D.** 2 o 3 HOLD simultáneos con la misma key → exactamente una
  ejecución real, un solo HOLD; el resto recibe el mismo resultado.

Esto se prueba con concurrencia real (`Promise.all`) en
`test/idempotency.test.mjs`.

## Rate limit (Fase 8)

`src/rate-limiter.mjs`: ventana deslizante en memoria, por `agent_id`.
Evita loops accidentales y flood sin romper el uso normal. Error:
`RATE_LIMITED` (HTTP 429).

## Auditoría (Fase 9)

`src/audit-log.mjs` registra, para cada llamada (éxito o error):
`request_id, correlation_id, actor, agent_id, operation, timestamp,
source_channel, idempotency_key, query_id, quote_id, hold_id, order_id,
property_id, unit_id, result, error_code, latency_ms`.

Esta bitácora vive en el gateway y complementa —no reemplaza— a
`x_hotel_api_log` dentro de Odoo, ya aprobada en HOTEL-006 para lo que pasa
dentro de Odoo.

## Errores (Fase 10)

Catálogo mínimo centralizado en `src/errors.mjs`, con mapeo a status HTTP.
Ningún error expone stack trace (`test/*.test.mjs` lo verifica
explícitamente). Nota de nomenclatura: el validador de contrato (ya
aprobado en el scaffold original) usa `FORBIDDEN_FIELD`/`UNKNOWN_FIELD` como
variante fina de `FORBIDDEN_PARAM`/`UNKNOWN_PARAM`; `src/errors.mjs` deja
esa equivalencia explícita en vez de romper el contrato ya revisado.

## DRY RUN (Fase 12)

`DRY_RUN=true` es el modo por defecto y el único ejercitado en este
repositorio. `availability`, `quote` y `status` responden con fixtures
deterministas (`fixtures/dry-run-fixtures.mjs`), marcadas siempre con
`dry_run: true` y una nota explícita — **no son datos reales** de Atheron
Suite (ni tarifas, ni disponibilidad, ni capacidad reales). `hold` en DRY_RUN
**nunca** escribe en Odoo real.

`DRY_RUN=false` activa el camino LIVE (`OdooHotelAdapter#callOdooAction1967`
en `src/odoo-adapter.mjs`), que reutiliza la acción 1967 ya aprobada vía
JSON-RPC (`common.login` + `object.execute_kw` sobre `ir.actions.server`).
El transporte JSON-RPC es inyectable (`src/odoo-transport.mjs`,
`HttpOdooTransport` por defecto): `test/odoo-live-pipeline.test.mjs` prueba
todo el pipeline LIVE (gateway → contrato → idempotencia → adapter → borde
Odoo) con un transporte simulado (`FakeOdooTransport`), sin red y sin
credenciales reales, y demuestra que `source_channel='sofia'` llega forzado
al `execute_kw` mientras que un `source_channel` enviado por el cliente, o
cualquier otro campo prohibido, nunca llega al transporte.

**Estado real verificado contra `atheron1-hotel-staging-20260923` (25/09/2026):**
- `availability`: PASS. Llamada real de solo lectura, `HttpOdooTransport`
  real (no simulado), usuario técnico Sofía API STAGING (grupo 149, sin
  admin). Devolvió disponibilidad real de las unidades piloto.
- `status` de HOLD: contrato confirmado — Odoo espera `hold_id`, no
  `operation_id` ni `order_id` (ambos devuelven `UNKNOWN_PARAM`). El adapter
  ya traduce correctamente (ver `#callOdooAction1967` en
  `src/odoo-adapter.mjs`).
- `status` de una cotización (quote), `quote` real y `hold` real: **todavía
  no probados contra staging** (`PENDIENTE_VERIFICAR_CONTRA_STAGING`). El
  adapter incluye un fallback de solo lectura para `status` (intenta
  `hold_id` primero, y solo si Odoo responde `NOT_FOUND`/`UNKNOWN_PARAM`
  intenta `quote_id`), documentado en el código y probado con
  `FakeOdooTransport`, pero el candidato `quote_id` en sí no está
  confirmado contra un Odoo real todavía.

## Clientes técnicos (Fase 14 — relevo multiagente)

- `clients/claude-client.mjs` — Cliente A (Claude).
- `clients/generic-client.mjs` — Cliente B, genérico para ChatGPT, Codex u
  OpenCode (motores intercambiables, D-002/D-003 en `AI/DECISIONS.md`).

Ambos son wrappers delgados sobre `clients/base-client.mjs`: mismo contrato,
mismo camino de código, solo cambia el `agent_id`.

`test/relay.test.mjs` prueba el relevo completo:
1. A consulta disponibilidad.
2. A genera cotización.
3. B consulta el estado de la cotización de A.
4. B genera su propia cotización.
5. A crea el HOLD.
6. B consulta el estado del HOLD creado por A.

El estado vive en el adapter compartido (que simula a Odoo como fuente
única), no en el cliente — así se prueba que el relevo funciona sin sesión
de navegador y sin lógica especial por agente.

## Revocación (Fase 15)

`test/revocation.test.mjs`: revocar una identidad basta para que **toda**
llamada posterior de ese agente (lectura y escritura) devuelva
`UNAUTHORIZED`, sin ningún cambio de código.

## Rollback

Ver `ROLLBACK.md`.

## Cómo correr

```bash
cd integrations/odoo-hotel-gateway
npm test        # 70/70 PASS (incluye regresion LIVE simulada + fallback de status)
npm start        # levanta el servidor (DRY_RUN=true por defecto, PORT=8787)
```

Para levantar el servidor con una identidad de prueba:

```bash
node -e "import('./src/identity.mjs').then(({hashKey}) => console.log(hashKey('demo-key')))"
# copiar el hash resultante dentro de GATEWAY_TECHNICAL_IDENTITIES
GATEWAY_TECHNICAL_IDENTITIES='[{"agentId":"claude-hotel-007","actor":"claude","keyHash":"<hash>"}]' \
  npm start
```

## Qué falta antes del siguiente gate

Ver la sección "Pendientes CEO" en `AI/ODOO_HOTEL_STATE.md` (rama
`chore/ai-orchestration-foundation`) y el reporte final de este gate: no se
resuelven aquí duración oficial de HOLD, vigencia de cotización, mínimo de
Casa Completa Magia, impuestos ni Master Data 132/135/137.
