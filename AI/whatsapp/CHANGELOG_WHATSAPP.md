# Changelog — agente WhatsApp SHADOW

## 2026-10-03 — CANONICAL-002: marca canónica

- Decisión de Control Maestro: la marca oficial es **Hoteles Atheron**.
- El texto fuente de la política de cancelación (`CEO_CASES_V1.md`) venía de la fuente original con la errata «Hoteles Atero»; se corrigió en el contenido canónico y en el test que lo verifica.
- «Hoteles Atero» no se conserva en ningún contenido que consuman el agente o los tests; el historial está en Git (commits `bdb6a4c` y posteriores).

## 2026-10-03 — CANONICAL-002: gate de generalización SHADOW

- Set ciego V2 de 50 casos congelado (SHA256 `1caffa11…`), primera pasada 28/50 (56 %), 4 HIGH_RISK_FAIL.
- Correcciones generales de léxico coloquial, contexto de pago y correcciones de datos; POST_FIX_REGRESSION 50/50 (no es generalización ciega).
- Modo sin cambios: shadow, kill switch en false.

## 2026-10-03 — BLIND-V3-100: gate de generalización

- Set ciego V3 de 100 casos congelado (SHA256 `d13f2649…`, commit `4a653c0`). Primera pasada **71/100 (71 %)**, 4 HIGH_RISK (3 reales + 1 falso positivo del detector). Gate (≥90 % y 0 HIGH_RISK): **no cumple → SHADOW ONLY**.
- Correcciones estructurales: guardarraíl OTA, horarios en reservas OTA, extracción de datos. POST_FIX_REGRESSION 81/100 (no es generalización ciega).
- Recomendación de arquitectura: HYBRID_LLM_RULES (ver `ARQUITECTURA_RULES_VS_HYBRID.md`). Sin implementar.
