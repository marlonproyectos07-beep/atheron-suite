# WhatsApp Shadow Concierge — Hoteles Atero (GOAL-WHATSAPP-AGENT-001)

Agente conversacional **solo en modo SHADOW**: analiza, recuerda, consulta
disponibilidad/tarifa y **produce la respuesta que habría enviado**
(`SHADOW_RESPONSE`). No existe ninguna ruta de salida.

```bash
cd integrations/whatsapp-shadow-agent
npm test                 # 59 pruebas (1 omitida: contrato del Playbook, BLOQUEADO)
npm run suite            # corre los casos y regenera evidence/shadow-run.jsonl + summary.json
```
Node ≥ 20, **sin dependencias**.

## Qué hace

`mensaje → clasificar → intenciones → contexto → (esperar fragmentos) → entidades → datos faltantes → Gateway/Odoo → opciones → cotizar + anticipo 50% → escalar → SHADOW_RESPONSE → evidencia`

| Módulo | Función |
|---|---|
| `src/config.mjs` | kill switch `WHATSAPP_AUTOMATION_ENABLED` (def. `false`), `WHATSAPP_AUTOMATION_MODE` (def. `shadow`); los 4 modos existen, solo `shadow` arranca; guard de base staging |
| `src/classifier.mjs` | GUEST_LEAD, GUEST_RESERVED, ALLY_B2B, ATHERON_SECURITY, SUPPLIER, STAFF, SPAM_OTHER, UNKNOWN (registro de contactos > palabras clave) |
| `src/nlu.mjs` | fechas relativas/explícitas, personas (palabras y cifras), niños, noches, intenciones |
| `src/context.mjs` | memoria: lo ya dicho no se pregunta; cambios (“ya no somos dos”) reemplazan, se registran y **invalidan la cotización** |
| `src/policies.mjs` | anticipo 50%, cancelación 48 h / saldo 6 meses, OTA |
| `src/groups.mjs` | ≥11 `GROUP_SALES_FLOW`, ≥30 `LARGE_GROUP_FLOW`, ≥100 `STRATEGIC_GROUP_LEAD`; reparto multipropiedad sin exceder capacidad |
| `src/gateway-port.mjs` | puerto `searchOptions` + `quote` (**sin** HOLD/cancel/confirm; el puerto los rechaza) y adaptador sobre las `tools` de HOTEL-016 |
| `src/calls.mjs` | `MISSED_CALL` / `CALL_REQUEST`: solo modelado (prioridad, mensaje posterior, callback humano) |
| `src/audio.mjs` | puerto de transcripción preparado; sin STT no se inventa texto |
| `src/evidence.mjs` | evidencia JSONL con id anonimizado y PII enmascarada |

## Reglas CEO implementadas

- **Descuento / “mejor precio” / igualar Booking-Airbnb** → `ESCALATE_HUMAN` + `ALERTA_HUMANO`; el texto nunca lleva cifras ni porcentajes.
- **Anticipo** = 50% del total que devuelve Odoo (enteros; `anticipo + saldo = total`).
- **Cancelación directa**: ≥48 h → política (sin efectivo, saldo a favor 6 meses, recalcula tarifa); <48 h → `CANCELLATION_EXCEPTION`; OTA → condiciones de la plataforma, sin cambio automático.
- **“Ya pagué”** nunca confirma: `PAYMENT_VALIDATION` a humano.
- **Grupos**: precio base solo de Odoo; **cero descuentos inventados**; `GROUP_PRICING_APPROVAL` siempre; ≥30 siempre alerta humana; si el inventario no alcanza no promete y pide búsqueda con aliados; ≥100 trae resumen ejecutivo.
- **Bot**: si preguntan, responde que es el asistente de atención de Hoteles Atero y ofrece persona. No se hace pasar por nadie.
- Una sola noche supuesta cuando solo dan la fecha de entrada: se marca `noches_assumed`, el precio dice “por una noche” y se pregunta si serán más.

## Garantías de seguridad (con prueba)

`test/safety.test.mjs`: sin `send*`; toda respuesta `send:false` y congelada; `src/` sin imports de red/proceso; puerto rechaza escritura; solo `searchOptions`/`quote`; guard staging; sin patrones de secretos; `process.env` solo lee las 3 banderas.

## Cómo conectarlo a STAGING (pendiente, requiere credenciales)

1. Rama con el Gateway: `feature/ath-odoo-hotel-016-whatsapp-natural-media` (aún no mergeada).
2. `fromHotel016Tools({ tools: buildWhatsAppQuoteOnlyTools(cfg), catalog })`, con `catalog` de `catalogFromOdooMasterData` (formato de `AI/staging-backup/master-data-x_hotel_*.json` de esa rama).
3. **Limitación real**: `UNIT_ID_MAP` de HOTEL-016 solo mapea Hotel Atheron Suite; para multipropiedad en vivo hay que extenderlo desde Odoo. Aquí no se inventó.

## Contrato del Playbook (BLOQUEADO)

`ATHERON_WHATSAPP_PLAYBOOK_v0.1.md` **no está** en el repo, en ninguna rama remota ni en esta sesión. El cargador `cases/playbook-loader.mjs` espera `cases/playbook-cases.json` (`{playbook_version, cases:[…100…]}`, mismo formato que `cases/ceo-extra.mjs`, regex como `"/texto/i"`). Mientras no exista, se reporta `BLOCKED`; no se fabrican casos.
