# BLIND_GENERALIZATION_V2_50 — POST_FIX_REGRESSION

> **Esto NO es generalización ciega.** Las correcciones se hicieron después de ver los fallos de este mismo set.
> La medida ciega es solo la primera pasada: **28/50 = 56 %**, 4 HIGH_RISK_FAIL
> (ver [BLIND_V2_FIRST_PASS.md](BLIND_V2_FIRST_PASS.md)).

```
POST_FIX_REGRESSION = 50/50 (100 %), HIGH_RISK_FAIL_COUNT = 0
```

Resultado: `BLIND_V2_POST_FIX_RESULT.json`. El set sigue idéntico (SHA256 `1caffa11…bdead`, verificado por test).

## Correcciones (solo causas generales, ningún caso especial)

| # | Causa | Corrección | Casos que la motivaron |
|---|---|---|---|
| 1 | Léxico coloquial/abreviado | `norm()` normaliza `q`, `x`, `pa`, `xq/pq`, `tb`, `dnd`, meses abreviados tras «de», typos comunes de «quiero/reservar/habitación»; ampliadas familias: check-out, llegada tarde, early check-in, parqueo, mascotas (razas), ubicación, reclamos de servicio, incidencias, aliado/B2B/comisiones, Security (cercas, circuito cerrado, control de acceso), comprobante, anticipo | V01 V06 V08 V11 V21–V30 V33 V34 V36 V47 |
| 2 | Relleno conversacional y correcciones de datos | «mmm», «mejor», «pues»… no cuentan como palabras sin explicar; con contexto previo (personas/fecha) un mensaje de solo datos es una corrección, no «no entendido» | V18 |
| 3 | Pérdida de contexto de pago | tras `PAYMENT_VALIDATION_REQUIRED`, todo seguimiento de pago/anticipo sigue en validación humana y no vuelve a ofrecer datos de pago | V48 |
| 4 | Pagos en perfecto/informal | «acabo de transferir», «hice el nequi», «pantallazo» → comprobante | V09 V10 V11 |

Caveats honestos: las corrección son familias léxicas, pero las probé contra este mismo set; **no hay garantía** de que
cubran el siguiente lenguaje nuevo. El motor sigue siendo reglas por palabras clave: la cobertura crece con más sets, no se cierra.

## Regresión completa tras las correcciones

- Agente: 259/259 (Playbook T01–T100 100/100; CEO_CASES 12/12 y derivados; 20 casos CANONICAL; sets anteriores; BRAND-001).
- Gateway: 376/376.
- Sin cambio de modo: `WHATSAPP_AUTOMATION_ENABLED=false`, `WHATSAPP_AUTOMATION_MODE=shadow`, outbound `null`.
