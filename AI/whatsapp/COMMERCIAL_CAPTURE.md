# ATH-WHATSAPP-COMMERCIAL-001 — Captura de reservas y grupos en SHADOW

Convierte una conversación de WhatsApp en un **lead estructurado**, lo **clasifica** y arma un **payload DRY_RUN** para Odoo/Gateway.
**No decide, no escribe y no envía:** sin autonomía, sin proveedor, sin claves, sin escritura en Odoo, sin outbound. Código en `src/commercial/`.

```
WHATSAPP_AUTOMATION_ENABLED=false   WHATSAPP_AUTOMATION_MODE=shadow   WHATSAPP_UNDERSTANDING_MODE=rules
WHATSAPP_COMMERCIAL_CAPTURE=off     (por defecto; `shadow` solo adjunta decision.commercial)
```

## Uso

```js
import { captureReservation } from './src/commercial/index.mjs';
const r = captureReservation(turns, { today, conversation_id, agreements, payment_confirmations, odoo_quote, odoo_ids });
// r = { lead, classification, odoo_payload, payload_validation, outbound: null, mode: 'SHADOW' }
```

`turns`: `{ role: 'guest' | 'staff' | 'agent' | 'finance', text?, type?: 'text'|'image'|'document'|'audio', transcript? }`.
`finance` = Cartera/Banco, **la única fuente que confirma pagos**.

## LEAD_SCHEMA (`ath.commercial-lead/1.0`)

| Bloque | Campos |
|---|---|
| `guest` | `name_as_stated` (solo si lo dijo; marcado PII), `ref` (hash), `contains_pii` |
| `stay` | `check_in`, `check_out`, `nights`, `pax`, `adults`, `children`, `party_type` (COUPLE/FAMILY/FRIENDS/COMPANY/SCHOOL/WEDDING), `date_ambiguous` + motivos, `date_changes`, `pax_changes`, `property` (+ `property_assumed`) |
| `unit` | `requested_unit` (201/202/203/301/302), `whole_house`, `room_unidentified`, `unknown_room_numbers`, `capacity_of_unit` |
| `channel` | `origin` (`DIRECT_WHATSAPP` por defecto; BOOKING/AIRBNB si lo dice), `source=DIRECT_WHATSAPP` |
| `pricing` | `agreed_price` (COP, **dicho en el chat**), `verified=false` (solo una cotización de Odoo la verifica), `conflict`, `discount_requested`, `price_agreement_historical` |
| `payment` | ver abajo |
| `availability` | `NOT_VERIFIED` siempre, hasta que Odoo la confirme |
| `data_gaps` | lo que falta (nombre, fechas, pax, precio, disponibilidad, `UNIT_ID_NOT_MAPPED`); **nunca se rellena** |

Fechas dia-primero (04/10/2026), «del 10 al 12 de octubre», «N noches». Nada de lo que no se dijo se inventa.

## PAYMENT_SCHEMA

| Campo | Significado |
|---|---|
| `state` | `NONE` · `DEPOSIT_REQUESTED` · `PAYMENT_REPORTED` · `PAYMENT_CONFIRMED` |
| `deposit_requested` | anticipo que **pidió el staff/agente** |
| `deposit_offered_by_guest` | lo que el huésped propone abonar |
| `deposit_reported` | lo que el huésped dice haber pagado (**pantallazo, «ya pagué»**) → solo `PAYMENT_REPORTED` |
| `deposit_received` / `confirmations` | **solo** confirmación de `finance` (Cartera/Banco) o estructurada → `PAYMENT_CONFIRMED`. Recepción que dice «recibimos» **no** confirma |
| `balance` | precio − lo **confirmado**; `balance_if_deposit_confirmed` = precio − anticipo candidato |
| `policy` | objetivo 50 %; estado: `MEETS_POLICY` · `ABOVE_POLICY` · `BELOW_POLICY_HISTORICAL_AGREEMENT` (acuerdo explícito, **respetado**) · `BELOW_POLICY_NO_AGREEMENT` (→ revisión) · `EXCEEDS_PRICE` · `UNKNOWN`; `matches_legacy_odoo_percent` (30 % anterior: informativo, **no** es acuerdo) |

Acuerdo histórico: frase explícita («acuerdo previo», «como quedamos»…) o `agreements.historical_deposit` estructurado.

## Clasificación comercial

Una primaria: `STANDARD_LEAD` · `GROUP_LEAD` · `CORPORATE_LEAD` · `STRATEGIC_GROUP_LEAD`. Banderas: `CAPACITY_GAP` · `PAYMENT_REPORTED` · `PAYMENT_CONFIRMED` · `MANUAL_REVIEW_REQUIRED`.

### GROUP_ROUTING

| Pax | Etiquetas | Flujo | Humano |
|---|---|---|---|
| 1–10 | STANDARD_LEAD | — | solo si hay anomalía o pago reportado |
| 11–29 | GROUP_LEAD | `GROUP_SALES_FLOW` | sí, prioridad NORMAL, cola `GROUP_SALES` |
| 30–99 | GROUP_LEAD | `LARGE_GROUP_FLOW` | sí, **prioridad HIGH + alerta humana** |
| 100+ | STRATEGIC_GROUP_LEAD (+GROUP_LEAD) | `STRATEGIC_GROUP_LEAD` | sí, prioridad **STRATEGIC**, cola `STRATEGIC_ACCOUNTS` |
| empresa/NIT/evento corporativo | CORPORATE_LEAD | `CORPORATE_SALES` | sí |

Siempre: `pricing_approval=GROUP_PRICING_APPROVAL` (11+), `auto_discount=false`, `can_promise_capacity=false`, `hold_allowed=false`.

### CAPACITY_GAP

Demanda > capacidad **conocida y verificada**: hoy solo Hotel Atheron Suite, casa completa = 22 (Odoo). 200 pax → brecha 178; 35 pax → 13.
Las capacidades de la web de otras propiedades **no cuentan** (no se afirma brecha ni cupo; queda `capacity_known=false` y va a humano). Una habitación con menos capacidad que los pax → `ROOM_CAPACITY_EXCEEDED`.

### MANUAL_REVIEW_REQUIRED (anomalías)

`DISCOUNT_REQUESTED` · `ROOM_UNIDENTIFIED` · `DATE_AMBIGUOUS` · `DATE_IN_PAST` · `DATE_CHANGED_AFTER_PAYMENT` · `PRICE_CONFLICT` · `BALANCE_MISMATCH` · `DEPOSIT_BELOW_POLICY_NO_AGREEMENT` · `DEPOSIT_EXCEEDS_PRICE` · `CAPACITY_GAP` · `ROOM_CAPACITY_EXCEEDED` · `OTA_RESERVATION_PLATFORM_RULES` · `SENSITIVE_DATA_SHARED` · `PAYMENT_NOT_FOUND_BY_FINANCE` · `MULTIPLE_PAYMENT_REPORTS` · `PAYMENT_WITHOUT_PRICE` · `CONFIRMED_AMOUNT_MISMATCH` · `OVERPAID`.
Un pago reportado además exige `PAYMENT_VALIDATION_REQUIRED` (lo valida Cartera).

## ODOO_PAYLOAD (`ath.odoo.reservation-capture/1.0`)

Borrador **DRY_RUN**: `write_enabled=false`, `ready_to_send=false`, `target_environment=NONE`, `blocked_by` (SHADOW_ONLY, WRITE_DISABLED, AVAILABILITY_NOT_VERIFIED, UNIT_ID_NOT_MAPPED, NO_ODOO_QUOTE, HUMAN_REVIEW_PENDING).
Bloques: `provenance`, `guest`, `stay`, `unit`, `channel`, `commercial`, `financial` (COP enteros), `review`, `availability`, `data_gaps`, `idempotency_key` (`cap-<hash>`, determinista).
`gateway_hold_candidate` = `{quote_id, unit_id, idempotency_key}` (contrato `HoldRequest` del Gateway) **solo** si se aportan ids verificados; si no, `null`. Sin texto crudo de la conversación. `validateOdooPayload()` rechaza modo no seguro, escritura habilitada, destino, fechas/montos inválidos y texto crudo. `commitToOdoo()` lanza `ShadowViolation`.

## Reglas respetadas

Nunca inventa disponibilidad ni tarifa · descuentos = humano · pantallazo = `PAYMENT_REPORTED` · Cartera/Banco = `PAYMENT_CONFIRMED` · política directa objetivo 50 % · acuerdos históricos explícitos respetados · OTA: rige la plataforma.

## Privacidad

El historial de la sesión guarda texto redactado (sin nombres): `captureFromSession()` deja `GUEST_NAME_MISSING` y una persona completa el nombre en Odoo.
Con turnos crudos de un contexto interno de confianza, `name_as_stated` queda marcado como PII y `redactPayload()` lo oculta para registros. Datos sensibles (tarjeta, cuenta, documento…) **no** se copian y fuerzan revisión.

## Pendiente (no hecho a propósito)

Mapear `UNIT_ID_MAP` de las 5 habitaciones, cotizar con Odoo (`odoo_quote`/`odoo_ids`), definir el contrato de escritura de la reserva en Odoo y el flujo de confirmación de Cartera. Nada de eso se activa sin autorización.
