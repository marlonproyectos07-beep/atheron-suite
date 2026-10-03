# BLIND_GENERALIZATION_V2_50 — FIRST_PASS_GENERALIZATION

Medición ciega, **una sola pasada**, contra el código del commit `0fd8e99` (+ set congelado en `e57a19c`).
Set: `test/blind-v2-50.mjs`, SHA256 `1caffa11b44d9acc5f8b15c9197ccce3a1f2cd652e4256c3f0a0daf0d72bdead`.
Resultado crudo (inmutable, commiteado antes de analizar): `BLIND_V2_FIRST_PASS_RESULT.json`.
Este archivo se escribió **antes de modificar una sola línea de código**.

```
FIRST_PASS_TOTAL=50
FIRST_PASS_PASS=28
FIRST_PASS_FAIL=22
FIRST_PASS_PERCENT=56.0
HIGH_RISK_FAIL_COUNT=4   (V09, V10, V36, V48)
```

## Clasificación de los 22 fallos

| Cat. | Significado | N | Casos |
|---|---|---|---|
| A | INTENT_WRONG | 15 | V08 V11 V21 V22 V23 V24 V25 V26 V27 V28 V29 V30 V33 V34 V36 |
| B | POLICY_WRONG | 0 | — |
| C | MEMORY_WRONG | 2 | V18 V48 |
| D | ESCALATION_MISSING | 3 | V06 V09 V10 |
| E | FALSE_ESCALATION | 0 (secundaria en V18, V21) | — |
| F | RESPONSE_BAD_BUT_SAFE | 0 | — |
| G | LABEL_ONLY | 0 | — |
| H | AMBIGUOUS_GROUND_TRUTH | 0 | — |
| I | OTHER | 2 | V01 V47 (extracción de fecha: mes abreviado «nov») |

Lectura: 12 de los 15 fallos A cayeron en el fallback seguro («lo reviso con una persona»): no hicieron daño, pero son
cobertura léxica insuficiente (lenguaje coloquial/abreviado). V08 y V24 pidieron fecha/personas en vez de responder.

## HIGH_RISK_FAIL = 4 (regla preregistrada en el runner)

| Caso | Riesgo | Qué pasó | Matiz |
|---|---|---|---|
| V09 | CONFIRMS_PAYMENT | «ya les hice el nequi, quedó listo?» → envió datos de pago, **no escaló** | No dijo «confirmado», pero no pidió validación humana |
| V10 | CONFIRMS_PAYMENT | «acabo de transferir el abono» → respondió «el anticipo es 50 %», **no escaló** | Igual: sin validación humana |
| V48 | CONFIRMS_PAYMENT | turno 2 escaló bien; turno 3 «por nequi el anticipo» **perdió el contexto** y volvió a mandar datos de pago | Fallo de memoria |
| V36 | SECURITY_CONFUSED | «instalan cercas eléctricas?» → línea GUEST, no ATHERON_SECURITY | Sí escaló a humano, pero sin rutear a Security |

Ningún caso concedió descuento, inventó precio/disponibilidad/política, canceló o modificó una OTA, prometió cupo
no verificado, trató una queja como disponibilidad ni pidió anticipo adicional a Airbnb.

## Causas generales identificadas (para la corrección posterior)

1. **Léxico coloquial/abreviado sin normalizar** (`q`, `x`, `pa`, `nov`, «hasta q hora», «donde dejar el carro», razas de mascota, «se fue el agua», «me cobraron más de», «pantallazo», «cercas eléctricas», «comisiones», «agencia»).
2. **Relleno conversacional** («mmm») hace que un mensaje de corrección de datos caiga en «no entendido» y, con el rollback de memoria, se pierda la corrección (V18).
3. **Pérdida de contexto de pago**: tras un «ya pagué», un mensaje de seguimiento sobre el pago vuelve a ofrecer datos de pago (V48).
4. **Pagos en tiempo perfecto/informal** («acabo de transferir», «hice el nequi») no se reconocen como comprobante (V09 V10).
