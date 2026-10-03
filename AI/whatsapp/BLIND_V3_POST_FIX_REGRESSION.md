# BLIND_GENERALIZATION_V3_100 — POST_FIX_REGRESSION

> **No es generalización ciega.** Se corrigió después de ver los fallos de este mismo set.
> La medida ciega es solo la primera pasada: **71/100 = 71 %, 4 HIGH_RISK** (ver [BLIND_V3_FIRST_PASS.md](BLIND_V3_FIRST_PASS.md)).

```
POST_FIX_REGRESSION = 81/100 (81 %), HIGH_RISK = 1 (A07, falso positivo del detector; riesgo real 0)
```

Resultado: `BLIND_V3_POST_FIX_RESULT.json`. Set sin modificar (SHA256 `d13f2649…a919`, verificado por test).

## Qué se corrigió (solo causas estructurales; deliberadamente NO se amplió el léxico)

1. **Guardarraíl OTA (seguridad):** si el mensaje habla de una reserva existente de Booking/Airbnb y pretende tocarla o trae fecha/cobro, se escala a una persona (`GUARDARRAIL_OTA`, `RESERVA_OTA_REVISION_HUMANA`) y nunca entra al flujo de disponibilidad. Cierra K04, A04, A08 y A06.
2. **Horarios en reservas OTA:** check-in/check-out de una reserva OTA se responden (15:00 / 11:00) en vez de pedir «¿a nombre de quién?» (K01, A05).
3. **Extracción de datos:** «voy solo», campo de plantilla «Número de huéspedes: N» y «llegamos el 15» como corrección de fecha dentro del mismo mes (D05, D06, D14).
4. Se probó «para dos?» como total de personas y **se revirtió**: rompía T12 («Para 2» debe seguir siendo ambiguo). P01 queda sin corregir a propósito.

## Qué NO se corrigió y por qué

Quedan 19 fallos. 15 son cobertura léxica (P03, G03, K06, K07, A02, X07, H04, H06, H08, Q01, L01, R02, T01, T03, T02…);
12 de ellos caen en el fallback seguro «lo reviso con una persona». Parchearlos con más regex es exactamente el camino que
la recomendación de arquitectura desaconseja. K02 (¿hay que pagarles algo? por Booking) tampoco se tocó: pregunta el nombre de la reserva, no afirma ningún anticipo.

## Regresión completa

Agente 262/262 · Playbook 100/100 · CEO_CASES 12/12 · CANONICAL-20 20/20 · V2-50 50/50 · Gateway 376/376.
Modo sin cambios: `WHATSAPP_AUTOMATION_ENABLED=false`, `WHATSAPP_AUTOMATION_MODE=shadow`, outbound `null`.
