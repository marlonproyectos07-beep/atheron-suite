# ATH-ODOO-HOTEL-008 — APROBADO (FINAL_GATE: PASS)

> Cierre oficial. Este documento es la referencia unica para no
> reabrir HOTEL-008 salvo regresion demostrada (orden explicita del
> CEO al abrir ATH-ODOO-HOTEL-009).

## Commit final aprobado

```
765ac45  fix(hotel-008): opciones vive doblemente anidada en la respuesta real del gateway
rama:    night/ath-odoo-hotel-008-level1-20260929
```

## Arquitectura demostrada (E2E real, no simulada)

```
Navegador / Vercel Preview
  -> POST /api/hotel/availability (src/pages/api/hotel/availability.ts)
    -> WebHotelClient (integrations/odoo-hotel-gateway/clients/web-client.mjs)
      -> Hotel Gateway HTTP (localhost:8787, GATEWAY_TECHNICAL_IDENTITIES=web-hotel-007)
        -> tunel Cloudflare (https://utility-submitted-garage-christ.trycloudflare.com)
          -> [el mismo proceso local expone el tunel]
        -> Odoo STAGING (atheron1-hotel-staging-20260923, accion 1967)
          -> inventario real
        <- respuesta real
      <- envelope del adapter
    <- respuesta al navegador (sin secretos)
```

## Prueba canaria (E2E, evidencia real)

- Unidad: 201 (Hotel Atheron Suite, unit_id 1)
- Fechas: 2026-11-10 -> 2026-11-12
- Huespedes: 2
- Resultado: `HTTP 200`, `{"ok":true,"requested_unit":"201","requested_available":true,"alternatives":[]}`
- Gateway: `health: ok`, `ready: true`
- Deployment: Preview (`target: preview`, nunca Production)

## Tests

- `integrations/odoo-hotel-gateway`: 167/167 PASS
- Canario web (`npm run prueba-canario` + `prueba-canario-seguridad`): 12/12 + 2/2 PASS
- 0 secretos detectados en cada build (`scan-for-secret-leak.mjs`)

## Bugs reales encontrados y corregidos (con evidencia, no hipotesis)

1. **BOM U+FEFF en la credencial.** Al sincronizar `HOTEL_WEB_AGENT_KEY` a
   Vercel via `stdin` desde PowerShell 5.1, se inyectaba un caracter BOM
   invisible al inicio del valor. Sintoma real en logs de Vercel:
   `Cannot convert argument to a ByteString because the character at
   index 7 has a value of 65279`. Corregido escribiendo los bytes UTF-8
   sin BOM desde un proceso Node.js dedicado en vez de un pipe de texto
   de PowerShell.
2. **`unit_id` enviado a operaciones que no lo aceptan.** El contrato
   real (`src/contract.mjs`) solo permite `unit_id` en `/hotel/hold`;
   `/hotel/availability` y `/hotel/quote` son consultas por PROPIEDAD
   (devuelven todas las unidades) y el llamador filtra localmente.
   Enviarlo producia `UNKNOWN_FIELD` (visto en `vercel logs`, real).
3. **Respuesta del Gateway doblemente anidada.** `opciones` vive en
   `response.data.data.opciones`, no en `response.data.opciones` (el
   sobre HTTP envuelve el envelope propio del adapter). Con un solo nivel
   de desenvuelto, TODAS las unidades se reportaban como no disponibles
   aunque Odoo y el Gateway estuvieran sanos. Corregido con un helper
   compartido (`src/gateway-response-utils.mjs`, `findOpciones`/
   `unitAvailability`) que no asume profundidad fija.

## Restricciones de produccion respetadas durante todo HOTEL-008

- Base Odoo usada: **exclusivamente** `atheron1-hotel-staging-20260923`.
- Ningun deployment se promovio a Production (`target: preview` en cada
  uno, verificado).
- No se toco Booking, Airbnb, NOBEDS, WhatsApp real, Atheron Security.
- 0 secretos expuestos en commits, consola, historial o reportes (varias
  capas de verificacion: `scan-for-secret-leak.mjs`, revision manual del
  diff antes de cada commit, credenciales manejadas via DPAPI/secure-store
  y borradas de memoria tras usarlas).

## Hallazgos de seguridad locales (reportados, no corregidos por decision
explicita del CEO — quedan para un gate separado)

- `C:\Users\HP\Downloads\atheron-suite-feature-ath-odoo-hotel-007-gateway\...\.env`
  contiene credenciales `ODOO_*` reales en texto plano, fuera de git.
  **No tocado**, pendiente de un gate de seguridad separado (orden
  explicita: "NO tocar todavia el .env antiguo de Downloads").
- Un valor con forma de clave quedo expuesto en texto plano en
  `ConsoleHost_history.txt` (historial de PowerShell) durante un intento
  de rotacion anterior. Fingerprint documentado en el turno
  correspondiente; tratado como comprometido, nunca reutilizado.

## Que reutilizar en ATH-ODOO-HOTEL-009 (no reconstruir)

- El motor de disponibilidad/HOLD/anti-overbooking real vive **dentro de
  Odoo** (accion 1967, HOTEL-002/003). El Gateway es un passthrough.
- `integrations/odoo-hotel-gateway`: contrato, cliente web, motor de
  alternativas, rate limiter, identidad tecnica — todo probado.
- `src/pages/api/hotel/availability.ts`: puente seguro web -> gateway,
  ya con los 3 bugs corregidos.
- El mapeo real de unidades (201=unit_id 1 ... CASA_COMPLETA=6) ya esta
  confirmado y en codigo (`UNIT_ID_MAP` en el endpoint).
