# GOAL-WHATSAPP-CANONICAL-002 — Consolidación del agente SHADOW

```
CANONICAL_LINEAGE=bdb6a4c
REFERENCE_ONLY_IMPLEMENTATION=4935d59
WHATSAPP_AUTOMATION_MODE=shadow
WHATSAPP_AUTOMATION_ENABLED=false
ODOO_STAGING_LIVE_VALIDATION=PENDING_EXTERNAL_AUTHENTICATED_TEST
```

Rama técnica: `feature/ath-whatsapp-shadow-agent-canonical` (desde `bdb6a4c`).
La rama `claude/atero-whatsapp-shadow-agent-0v0yho` **no se borra ni se fusiona**: queda como referencia de solo lectura.

## Qué se portó de 4935d59 (a mano, sin cherry-pick)

| Pieza | Archivo nuevo | Qué se tomó | Qué NO se tomó |
|---|---|---|---|
| Kill switch | `src/config.mjs`, `src/runtime.mjs` | `WHATSAPP_AUTOMATION_ENABLED` (defecto `false`), modos, falla cerrada | validación de base Odoo (no se toca Odoo); texto de marca |
| Eventos de llamada | `src/calls.mjs` | `MISSED_CALL`, `CALL_REQUEST`, prioridad, tarea `CALLBACK_HUMAN` | marca «Hoteles Atero»; no hay Calling API |
| Puerto de audio | `src/audio.mjs` | contrato `transcribe()`, `NullTranscription`, umbral | proveedor, API, audio real; umbral 0.7 → 0.6 |

No se importó: check-in 00:00, política antigua, clasificador alternativo, tests duplicados, configuración contradictoria.

## Marca

Todo texto al cliente dice **Hoteles Atheron**; la propiedad conserva **Hotel Atheron Suite**. Prueba `BRAND-001`.
`CEO_CASES_V1.md` (fuente canónica) también dice «Hoteles Atheron»; trazabilidad en [CHANGELOG_WHATSAPP.md](CHANGELOG_WHATSAPP.md).

## Anticipo por canal

| Canal | Comportamiento |
|---|---|
| Directo / WhatsApp / web directa | 50 % |
| Booking | `DEPOSIT_REQUIRED_POLICY_PENDING_CHANNEL_VALIDATION` → humano; no afirma 50 %, no confirma pago, no cancela |
| Airbnb | sin anticipo adicional; el cobro lo gestiona Airbnb |

## Otros cambios sobre la línea canónica

- Grupos: `GROUP_SALES_FLOW` (≥11), `LARGE_GROUP_FLOW` + `HUMAN_ALERT_LARGE_GROUP` (≥30), `STRATEGIC_GROUP_LEAD` (≥100).
- Un mensaje que no se entiende ya no deja fecha/personas en la memoria («el jueves nos vemos en la plaza»).
- Nuevas intenciones/ampliaciones generales: horas de llegada/salida («a qué horas puedo llegar», «toca desocupar»), reclamo por falta de respuesta, comprobante en pasado («consigné», «transferí»), «quedamos N», alarmas/cámaras → Atheron Security, turismo local → humano (sin datos verificados).

## Generalización

`FIRST_PASS_GENERALIZATION = 7/20 (35 %)`, medido una sola vez antes de corregir. Detalle en
[CANONICAL_002_FIRST_PASS.md](CANONICAL_002_FIRST_PASS.md). Los 20 casos tras corregir ya no son
ciegos y **no** prueban generalización. Con 35 % en primera pasada (y 53–77 % en las medidas previas):
**SHADOW ONLY. No autorizado SUPERVISED ni AUTO.**
