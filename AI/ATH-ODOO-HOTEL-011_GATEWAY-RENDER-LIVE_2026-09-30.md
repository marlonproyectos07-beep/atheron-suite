# ATH-ODOO-HOTEL-011 — Gateway público en Render, en vivo (2026-09-30)

Cadena real probada de punta a punta hoy:

```
Vercel Preview (/api/hotel/availability, /api/hotel/webhook)
  -> Render (atheron-hotel-gateway-staging.onrender.com)
    -> Odoo STAGING (atheron1-hotel-staging-20260923)
```

## Identidad técnica nueva (no reutilizada)

`vercel-whatsapp-staging` — generada hoy (`crypto.randomBytes(32)`),
NUNCA la `ff1ba8f5` histórica ni ninguna otra clave ya usada. Solo el
**hash** SHA-256 vive en Render (`GATEWAY_TECHNICAL_IDENTITIES`); la
clave en claro vive SOLO en Vercel Preview, server-side
(`HOTEL_WEB_AGENT_KEY`, nunca `PUBLIC_*`). Ninguna de las dos se
imprimió en ningún momento (transferencia por stdin/portapapeles, no
por argumento de texto ni por pantalla).

## Render — variables configuradas

`DRY_RUN=false`, `ODOO_BASE_URL`, `ODOO_DATABASE`, `ODOO_TECHNICAL_USER`,
`ODOO_TECHNICAL_SECRET` (reutilizadas del secure-store local existente,
auditadas hoy y siguen válidas), `ODOO_ACTION_ID=1967`,
`GATEWAY_TECHNICAL_IDENTITIES` (solo el hash de la identidad nueva).

## Pruebas reales (no simuladas)

- `/health` → `{"status":"ok"}` (200)
- `/ready` → `{"ready":true}` (200)
- Auth negativa (identidad desconocida) → 401 `UNAUTHORIZED`
- `availability` real vía Render → Odoo STAGING: 6 unidades, todas
  reales, con nombres/capacidades reales.
- `quote` real: `quote_id 152`, precios reales (p.ej. $160.000 unidad
  201).
- `HOLD` real de prueba: `hold_id 22232`, `COT/2026/03825` — liberado
  de inmediato con el botón real `HOTEL v1 — CANCELAR`, disponibilidad
  reconfirmada restaurada.
- Vercel Preview → Render → Odoo STAGING real:
  `POST /api/hotel/availability` con `unit=201` → `requested_available:
  true` (deploy `atheron-suite-pl20ktei7-marlon-atheron.vercel.app`).
- Webhook (`POST /api/hotel/webhook`) confirmado `routed: true` contra
  el mismo Gateway ya alcanzable.

## Limitación documentada: cold start (Render Free)

La instancia Free de Render se suspende con inactividad; el primer
request tras dormir puede tardar hasta ~50s. Aceptado explícitamente
para la prueba piloto. Antes de operación real con Ángela/WhatsApp
oficial, evaluar un plan pago (no autorizado todavía).

## Qué NO se hizo (a propósito)

- Meta NO conectado.
- Ningún mensaje de WhatsApp real enviado.
- Producción no tocada (Vercel Preview únicamente, Render solo el
  servicio STAGING nuevo).
- Ninguna credencial (Odoo, Render, Vercel) impresa en chat/log/commit.
