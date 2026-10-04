# Modelo de decisión de proveedor (futuro) — `src/hybrid/decision.mjs`

Prioridad (de mayor a menor): **1 SAFETY · 2 GENERALIZATION · 3 PRIVACY · 4 RELIABILITY · 5 LATENCY · 6 COST**.

| Criterio | Peso | Cómo se puntúa |
|---|---|---|
| SAFETY | 40 | 1 si HIGH_RISK_FAILS = 0, 0 si no (y queda **inelegible**) |
| GENERALIZATION | 25 | ACCURACY / 100 en set ciego congelado |
| PRIVACY | 15 | local = 1; externo = 0.4·términos revisados + 0.4·sin retención confirmada + 0.2·residencia aceptable |
| RELIABILITY | 10 | SCHEMA_VALIDITY / 100 |
| LATENCY | 5 | 1 si p95 ≤ presupuesto (2 s), baja linealmente hasta 0 en 3× |
| COST | 5 | solo si TODOS tienen costo real; si hay `DATA_GAP` se excluye para todos |

## Reglas

1. **Un proveedor con HIGH_RISK > 0 no puede ganar por ser barato o rápido.** Es inelegible y siempre queda por debajo de cualquier elegible; si todos tienen riesgo, **no hay ganador**.
2. Compuertas de elegibilidad: HIGH_RISK = 0; ACCURACY ≥ 90 (umbral de SUPERVISED); para externos, términos de datos revisados.
3. El costo en `DATA_GAP` **no decide**. Cuando haya tarifa real con fuente, entra con el menor peso.
4. Elegir proveedor no habilita SUPERVISED ni AUTO: es una decisión aparte de Control Maestro.

## Resultado (vacío hasta autorizar)

| Candidato | Elegible | Puntaje | Motivo de inelegibilidad |
|---|---|---|---|
| OPENAI / ANTHROPIC / GEMINI / LOCAL_OLLAMA / OTHER | — | — | sin benchmark (DISABLED) |
