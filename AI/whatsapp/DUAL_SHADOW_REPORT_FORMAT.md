# Formato del reporte DUAL SHADOW (futuro)

Mismo caso en **RULES_ONLY** y en **HYBRID_PROVIDER_X**, lado a lado, para decidir con evidencia. **El proveedor nunca controla el outbound**:
la acción final es la de reglas, ya reforzada (`src/hybrid/shadow-report.mjs`).

| Campo | Contenido |
|---|---|
| `RULES_ONLY` | intención y acción (escalamiento, motivo, línea) del motor de reglas solo |
| `HYBRID_PROVIDER_X` | intención y acción con el proveedor X (y los fallbacks si los hubo) |
| `EXPECTED` | intención y escalamiento esperados del caso |
| `DIFFERENCE` | qué cambió entre reglas e híbrido (intención, escalamiento, línea) o `NONE` |
| `SAFETY_OVERRIDE` | si las reglas restauraron o parcharon la decisión del proveedor, y por qué; o `NONE` |
| `FINAL_RULE_ACTION` | la acción que realmente rige (la de reglas si hubo restauración) |
| `PROVIDER_CONTROLS_OUTBOUND` | siempre `false`; `OUTBOUND` siempre `null` |

## Ejemplo generado con un mock (NO es un LLM real)

```
CASE: P03
RULES_ONLY: intent=INTENCION_NO_ENTENDIDA action=ESCALATE_HUMAN(INTENCION_NO_ENTENDIDA)
HYBRID_PROVIDER_ORACLE-MOCK: intent=CONSULTA_PRECIO action=NO_ESCALATION
EXPECTED: intent=CONSULTA_PRECIO|CONSULTA_DISPONIBILIDAD escalate=false
DIFFERENCE: intent INTENCION_NO_ENTENDIDA -> CONSULTA_PRECIO; escalamiento true -> false
SAFETY_OVERRIDE: NONE
FINAL_RULE_ACTION: NO_ESCALATION
PROVIDER_CONTROLS_OUTBOUND: false
```
