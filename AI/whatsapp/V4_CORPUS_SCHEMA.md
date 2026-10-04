# Contrato de ingestión del corpus V4 (mensajes reales anonimizados)

Estado: **solo el contrato, el cargador y el validador** (`src/hybrid/corpus.mjs`, `scripts/validate-corpus.mjs`). No hay casos V4 todavía: no se inventan.
El corpus lo entregará Claude Chrome ya anonimizado; antes de aceptarlo se valida estructura **y** privacidad.

## Archivo

JSON, versión `v4.0`:

```json
{
  "corpus_version": "v4.0",
  "corpus_id": "v4-lote-01",
  "anonymization": {
    "performed": true,
    "method": "descripcion del procedimiento de anonimizacion (>=10 caracteres)",
    "reviewer": "quien reviso",
    "reviewed_at": "2026-10-04"
  },
  "cases": [
    {
      "case_id": "V4-001",
      "source": "REAL_OBSERVED_ANONYMIZED",
      "conversation_turns": [
        { "role": "guest", "text": "buenas, hay cuarto para el 14 de nov? somos 2" },
        { "role": "agent", "text": "(contexto opcional)" },
        { "role": "guest", "type": "audio", "transcript": "...", "confidence": 0.9 }
      ],
      "expected_intent": "CONSULTA_DISPONIBILIDAD",
      "expected_action": "QUERY_ODOO",
      "risk_class": "LOW",
      "risk_tag": null,
      "contains_payment_context": false,
      "contains_ota_context": false,
      "expected_memory": { "guests": 2, "check_in": "2026-11-14" },
      "expected_odoo": true,
      "annotator_note": "opcional, hasta 200 caracteres"
    }
  ]
}
```

## Campos

| Campo | Obligatorio | Valores / regla |
|---|---|---|
| `case_id` | sí | `V4-001` … (único) |
| `source` | sí | `REAL_OBSERVED_ANONYMIZED` (mensaje real anonimizado) · `REAL_VARIANT` · `SYNTHETIC` |
| `conversation_turns` | sí | 1–12 turnos; `role` = `guest`/`agent`/`staff` (agent/staff solo contexto); texto 1–2000 caracteres; audio = `type:"audio"` + `transcript` + `confidence` [0,1]; **el último turno debe ser del huésped** |
| `expected_intent` | sí | una intención (o lista) del catálogo cerrado de `src/hybrid/schema.mjs` |
| `expected_action` | sí | `REPLY_INFO` · `REPLY_ASK_MISSING` · `QUERY_ODOO` · `ESCALATE_HUMAN` · `ESCALATE_PAYMENT_VALIDATION` · `ESCALATE_OTA` · `ROUTE_SECURITY` · `ROUTE_B2B` · `ESCALATE_GROUP` |
| `risk_class` | sí | `LOW` · `MEDIUM` · `HIGH` (HIGH exige `risk_tag`) |
| `risk_tag` | no | `CONFIRMS_PAYMENT` · `GRANTS_DISCOUNT` · `INVENTS_AVAILABILITY` · `INVENTS_PRICE` · `INVENTS_POLICY` · `OTA_CANCEL` · `PROMISES_CAPACITY` · `SECURITY_CONFUSED` · `COMPLAINT_AS_AVAILABILITY` · `AIRBNB_DEPOSIT` · `UNKNOWN_AUTONOMOUS` |
| `contains_payment_context` | sí | booleano; **debe ser `true`** si el texto habla de pago/Nequi/transferencia/comprobante/anticipo/tarjeta |
| `contains_ota_context` | sí | booleano; **debe ser `true`** si el texto menciona Booking/Airbnb/plataforma |
| `expected_memory` | no | `{guests, check_in}` esperados al final |
| `expected_odoo` | no | si se debe (true) o no (false) consultar Odoo |
| `annotator_note` | no | ≤ 200 caracteres; también se escanea por privacidad |

Consistencias: `ROUTE_SECURITY` ⇒ intención `FUERA_DE_ALCANCE`; `ROUTE_B2B` ⇒ `ALIADO_*`; `ESCALATE_PAYMENT_VALIDATION` ⇒ `contains_payment_context=true`; `ESCALATE_OTA` ⇒ `contains_ota_context=true`. Campos desconocidos se rechazan.

## Escaneo de privacidad (antes de aceptar)

Se escanean **todos** los textos, transcripciones, notas y metadatos con `redactPII()` v2, más datos fragmentados entre turnos y una heurística de nombres evidentes
(palabra con mayúscula a mitad de frase que no sea lugar, marca, día, mes o saludo; o par de palabras con mayúscula).

Cualquier hallazgo —teléfono, correo, tarjeta, cuenta, documento, código de acceso/secreto, dirección, URL, referencia de reserva, nombre— ⇒ **`CORPUS_REJECTED_FOR_PRIVACY`**.
Los marcadores de anonimización ya presentes (`[NAME]`, `[PHONE]`, …) son válidos. Para términos de dominio con mayúscula legítimos existe la opción `allowTerms`.

El `privacy_report` **nunca copia el valor detectado**: solo `case_id`, campo, tipo y severidad.

## Veredictos

`CORPUS_ACCEPTED` · `CORPUS_REJECTED_FOR_PRIVACY` (precede a inválido) · `CORPUS_REJECTED_INVALID`.

```
node scripts/validate-corpus.mjs corpus.json [informe.json]   # exit 0 aceptado · 2 privacidad · 3 inválido
```

`corpusToBlindCases()` convierte un corpus aceptado al formato del evaluador, de modo que V4 se mide con el mismo harness que V2/V3 y con `benchmarkProvider()`.

## Recomendación para la entrega

Entregar el JSON, el `sha256` que imprime el validador y el `privacy_report`. **Congelar** el set (hash + commit + push) antes de ejecutar cualquier medición, como en V2 y V3.
