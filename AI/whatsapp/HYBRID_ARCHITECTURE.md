# GOAL-WHATSAPP-HYBRID-001 — Arquitectura híbrida LLM + reglas (SHADOW)

```
WHATSAPP_AUTOMATION_ENABLED=false      WHATSAPP_AUTOMATION_MODE=shadow
WHATSAPP_UNDERSTANDING_MODE=rules      (hybrid_shadow existe, NO está activo por defecto)
Proveedor real conectado: NINGUNO      Claves/API/gasto/datos externos: NINGUNO
```

> Esto valida **arquitectura y seguridad con mocks**. **No** mide la mejora de ningún LLM real.

## Regla fundamental

El LLM propone una interpretación. El motor de reglas es la autoridad final y **solo puede restringir o escalar**. El LLM nunca debilita al motor de reglas.
El LLM no decide precios, descuentos, disponibilidad, cupos, políticas, pagos, cancelaciones, anticipos, reservas ni modificaciones OTA: solo dice qué entendió.

## Pipeline (`src/hybrid/pipeline.mjs`)

```
INBOUND → normalización + redactPII → LLM (proveedor abstracto) → validación de esquema
        → reglas deterministas (el mismo motor de siempre) → guardarraíles de política
        → validación de memoria → SHADOW_RESPONSE → escalamiento humano  (nunca outbound)
```

| Etapa | Módulo | Qué hace |
|---|---|---|
| Contrato | `schema.mjs` | Esquema estricto y versionado (`1.0`): intención del catálogo cerrado, `confidence`, `entities{dates,pax,property,channel,amount}`, `reservation_action`, `payment_claim`, `payment_state`, `reservation_state`, `requires_human`, `ambiguities` (solo códigos). Campo desconocido, tipo o rango inválido, o texto libre → toda la interpretación se descarta |
| Proveedor | `provider.mjs` | `LanguageUnderstandingProvider`: `interpretMessage()`, `interpretConversation()`, `health()`. Solo existe `MockUnderstandingProvider`. OpenAI/Anthropic/Gemini/otros: **DISABLED** (`getRealProvider` lanza `ProviderDisabledError`) |
| Privacidad | `pii.mjs` | `redactPII()` antes de cualquier envío y antes de guardar el texto (el historial ya guarda solo texto redactado) |
| Fusión | `merge.mjs` | El LLM **añade** intenciones de seguridad siempre; **resuelve** mensajes que las reglas no entienden solo con confianza ≥ 0.75, evidencia textual y sin vocabulario sensible; nunca quita lo que las reglas detectaron |
| Memoria | `memory.mjs` | `validateMemoryUpdate()`: dato del LLM solo entra si está fundamentado en el texto (fecha coherente con el día de la semana/hoy/mañana, pax citado, propiedad nombrada); rechaza monto siempre, comentario casual, reemplazo dudoso de pax |
| Autoridad de reglas | `pipeline.mjs` `enforce()` | Piso duro: si las reglas escalaron por un motivo que no sea «no entendí», el híbrido debe escalar; si no, se **restaura la decisión de reglas** (`RULES_OVERRIDE`). Además parches de seguridad |
| Dual run | `dual-run.mjs`, `scripts/compare-rules-vs-hybrid.mjs` | Mismo caso en RULES_ONLY y HYBRID_SHADOW; guarda `rules_intent`, `hybrid_intent`, `rules_action`, `hybrid_action`, `expected`, `risk` |
| Benchmark | `benchmark.mjs` | Contrato: FIRST_PASS_ACCURACY, HIGH_RISK_FAILS, LATENCY, TOKENS, ESTIMATED_COST, SCHEMA_FAILURES, PRIVACY_MODE. Rechaza proveedores reales |

## Si la comprensión falla → ESCALATE_HUMAN

Esquema inválido, respuesta malformada/texto libre, error del proveedor, timeout (2 s) o confianza < 0.6 → decisión de reglas **más** escalamiento forzado (`HYBRID_FALLBACK:<código>`). El texto de reglas queda como propuesta para la persona.

## Overrides de seguridad (aunque el LLM diga otra cosa)

| Situación | Resultado |
|---|---|
| Pago declarado (reglas o LLM) | `PAYMENT_VALIDATION_REQUIRED` → humano; tras eso todo seguimiento de pago sigue en humano |
| Descuento | humano |
| Cambio/cancelación/no-show de Booking/Airbnb | humano (`GUARDARRAIL_OTA`) |
| Airbnb + anticipo | nunca se pide anticipo adicional |
| Duda/baja confianza/no entendido | humano |
| Security | línea `ATHERON_SECURITY` + humano |
| Grupos ≥11 / ≥30 / ≥100 | política determinista de grupos; sin cupo ni descuento |
| Intenciones siempre humanas (reclamo, incidencia, reembolso, B2B, llegada inminente, grupo…) | humano |
| Monto en la respuesta que no venga de Odoo/política | se restaura la decisión de reglas |
| Caso ya traspasado a una persona | el LLM no lo re-automatiza |

## Hallazgo del comparador (valioso, ya corregido)

Con un LLM *adversarial* (siempre «disponibilidad», confianza 0.99, datos inventados) la primera versión del híbrido daba **8** HIGH_RISK en V3 frente a **1** de reglas solas: el LLM «resolvía» quejas y mensajes casuales como consultas de disponibilidad.
Se añadió la verificación de evidencia textual, el vocabulario sensible, la fundamentación estricta de fechas y el traspaso pegajoso. Resultado final con los 4 mocks sobre V2+V3: **el híbrido nunca suma HIGH_RISK sobre reglas** y hay **0 violaciones del piso de escalamiento**.

| Mock | V2-50 reglas→híbrido | V3-100 reglas→híbrido | HIGH_RISK V3 (reglas→híbrido) |
|---|---|---|---|
| Oracle («LLM perfecto», cota superior de la plomería) | 50→50 | 81→92 | 1→1 |
| Adversarial | 50→50 | 81→83 | 1→1 |
| Benigno (dice SALUDO a todo) | 50→50 | 81→81 | 1→1 |
| Caos (errores/timeouts/formato roto) | 50→35 | 81→58 | 1→1 |

El 1 HIGH_RISK de V3 es **A07, falso positivo conocido del detector** (riesgo real 0). En el mock «caos» baja el acierto porque todo fallo escala a humano: es el comportamiento seguro buscado, no una regresión.
**El 92 % del oracle no es una predicción de un LLM real**: es lo que daría un intérprete perfecto con esta plomería y reglas. La mejora real solo se mide con un proveedor, tras autorización.

## Límites conocidos

- El vocabulario sensible y la evidencia textual son regex de **veto/verificación** (dirección segura: ante la duda, más humano); siguen siendo reglas y habrá falsos vetos.
- El pipeline ejecuta reglas e híbrido por mensaje: dobla las lecturas a Odoo (read-only). Aceptable en SHADOW; optimizable.
- Un LLM real puede equivocarse de formas que los mocks no cubren; por eso el siguiente paso es SHADOW paralelo con proveedor autorizado y set ciego nuevo.

## Privacidad v2 y preparación de benchmark (HYBRID-PRIVACY-002)

- `redactPII()` v2 y **fallo cerrado**: ver [PRIVACIDAD_HYBRID.md](PRIVACIDAD_HYBRID.md). Un mensaje con PII sensible no llega a ningún proveedor y pasa a humano.
- Corpus V4: [V4_CORPUS_SCHEMA.md](V4_CORPUS_SCHEMA.md). Benchmark: [PROVIDER_BENCHMARK_MATRIX.md](PROVIDER_BENCHMARK_MATRIX.md). Decisión: [PROVIDER_DECISION_MATRIX.md](PROVIDER_DECISION_MATRIX.md). Local: [LOCAL_OLLAMA_CONTRACT.md](LOCAL_OLLAMA_CONTRACT.md). Reporte dual: [DUAL_SHADOW_REPORT_FORMAT.md](DUAL_SHADOW_REPORT_FORMAT.md).
