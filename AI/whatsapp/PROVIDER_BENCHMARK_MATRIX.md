# Matriz de evaluación de proveedores de comprensión — VACÍA / LISTA

Todos los proveedores reales están **DISABLED**. No hay claves, secretos, llamadas de red ni gasto.
Esta matriz se llena **solo** tras autorización explícita de Control Maestro, ejecutando `benchmarkProvider()` (`src/hybrid/benchmark.mjs`) sobre los sets congelados.
Los precios los aporta Control Maestro (USD por millón de tokens); aquí no se inventan.

## Indicadores medidos por el contrato

| Indicador | Definición |
|---|---|
| FIRST_PASS_ACCURACY | % de casos del set congelado (V3-100 / V2-50) que pasan en HYBRID_SHADOW, primera pasada |
| HIGH_RISK_FAILS | casos con riesgo alto según las reglas fijadas (incluye falsos positivos conocidos: A07) |
| LATENCY | media / p50 / p95 por llamada de interpretación |
| TOKENS | entrada / salida acumulados |
| ESTIMATED_COST | tokens × precio aportado |
| SCHEMA_FAILURES | respuestas con esquema inválido o texto libre |
| PRIVACY_MODE | `redacted` (redactPII) / `none` |

## Matriz

| Proveedor / modelo | Estado | FIRST_PASS | HIGH_RISK | Latencia p50/p95 | Tokens | Costo est. | Fallos de esquema | Privacidad |
|---|---|---|---|---|---|---|---|---|
| OpenAI — (modelo por definir) | DISABLED | — | — | — | — | — | — | — |
| Anthropic — (modelo por definir) | DISABLED | — | — | — | — | — | — | — |
| Gemini — (modelo por definir) | DISABLED | — | — | — | — | — | — | — |
| Otros — (a definir) | DISABLED | — | — | — | — | — | — | — |
| Mock oracle (referencia de plomería, no es un LLM) | TEST | ver `HYBRID_DUAL_RUN_MOCK.json` | | | | | | |

## Criterios cualitativos a completar (sin datos hasta autorizar)

| Criterio | OpenAI | Anthropic | Gemini | Otros |
|---|---|---|---|---|
| Salida estructurada con esquema (JSON schema / tool use) | — | — | — | — |
| Calidad en español colombiano coloquial y audios transcritos | — | — | — | — |
| Retención/entrenamiento con datos; modo sin retención | — | — | — | — |
| Residencia de datos / términos de tratamiento | — | — | — | — |
| Límites de tasa y disponibilidad (SLA) | — | — | — | — |

## Criterio de entrada (propuesto, requiere confirmación)

Para considerar SUPERVISED con un proveedor: nuevo set ciego no visto **≥ 90 % en primera pasada y 0 HIGH_RISK real**, más un set adversarial (inyección de instrucciones, mensajes contradictorios) y revisión humana de una muestra de tráfico real en SHADOW.
