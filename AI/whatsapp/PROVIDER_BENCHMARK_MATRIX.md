# Matriz de evaluación de proveedores de comprensión — VACÍA / LISTA

Todos los candidatos están **DISABLED**: `OPENAI`, `ANTHROPIC`, `GEMINI`, `LOCAL_OLLAMA`, `OTHER` (`src/hybrid/provider-config.mjs`). Sin claves, sin red, sin gasto.
Se llena solo tras autorización explícita de Control Maestro, ejecutando `benchmarkProvider()` (`src/hybrid/benchmark.mjs`) sobre sets congelados (V4 cuando exista).
**Costo = `DATA_GAP`** hasta que Control Maestro aporte una tarifa real **con su fuente**; sin fuente, el costo no se calcula. No se inventan precios.

## Indicadores

| Indicador | Definición |
|---|---|
| ACCURACY | % de casos que pasan en HYBRID_SHADOW, primera pasada |
| HIGH_RISK_FAILS | casos con riesgo alto según las reglas fijadas |
| SCHEMA_VALIDITY | % de llamadas al proveedor con respuesta que cumple el esquema |
| LOW_CONFIDENCE_RATE | % de llamadas con confianza < 0.6 |
| FALSE_ESCALATION | casos que debían resolverse sin humano y se escalaron (cantidad y tasa) |
| LATENCY | media / p50 / p95 por llamada |
| INPUT_TOKENS / OUTPUT_TOKENS | acumulados |
| ESTIMATED_COST | tokens × tarifa aportada; `DATA_GAP` si no hay tarifa con fuente |
| PRIVACY_REJECTIONS | mensajes que el fallo cerrado impidió enviar al proveedor |

## Matriz

| Candidato | Tipo | Estado | ACCURACY | HIGH_RISK | SCHEMA | LOW_CONF | FALSE_ESC | Latencia p50/p95 | Tokens in/out | Costo | Priv. rechazos |
|---|---|---|---|---|---|---|---|---|---|---|---|
| OPENAI | externo | DISABLED | — | — | — | — | — | — | — | DATA_GAP | — |
| ANTHROPIC | externo | DISABLED | — | — | — | — | — | — | — | DATA_GAP | — |
| GEMINI | externo | DISABLED | — | — | — | — | — | — | — | DATA_GAP | — |
| LOCAL_OLLAMA | local | DISABLED | — | — | — | — | — | — | — | DATA_GAP (sin costo por token; falta costo de hardware) | — |
| OTHER | externo | DISABLED | — | — | — | — | — | — | — | DATA_GAP | — |

Cómo decidir: ver [PROVIDER_DECISION_MATRIX.md](PROVIDER_DECISION_MATRIX.md). Contrato local: [LOCAL_OLLAMA_CONTRACT.md](LOCAL_OLLAMA_CONTRACT.md).

> Nota: en HYBRID-001 las métricas se llamaban `FIRST_PASS_ACCURACY`, `TOKENS` y `SCHEMA_FAILURES`; ahora son `ACCURACY`, `INPUT_TOKENS`/`OUTPUT_TOKENS` y `SCHEMA_VALIDITY`.
