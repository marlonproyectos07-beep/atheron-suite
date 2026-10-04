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

## 2026-10-03 — HYBRID-001: piloto híbrido LLM + reglas en SHADOW (arquitectura)

- Nuevo `src/hybrid/`: esquema estricto versionado, interfaz `LanguageUnderstandingProvider` + mock (proveedores reales DISABLED), `redactPII`, `validateMemoryUpdate`, pipeline con piso duro de reglas, dual run y contrato de benchmark.
- `WHATSAPP_UNDERSTANDING_MODE=rules` por defecto; `hybrid_shadow` no se activa solo y exige proveedor inyectado.
- El historial de sesión ahora guarda texto redactado (también en modo `rules`).
- Sin proveedor real, sin claves, sin datos externos, sin outbound.

## 2026-10-04 — HYBRID-PRIVACY-002: privacidad y preparación del benchmark real (sin proveedor)

- `redactPII()` v2 (10 marcadores, ofuscación, fragmentos entre mensajes) y **fallo cerrado**: PII sensible → el proveedor no se llama y el caso pasa a humano.
- Contrato y validador del corpus V4 (`CORPUS_REJECTED_FOR_PRIVACY` / inválido) con informe que nunca copia valores.
- Harness de benchmark (10 indicadores; costo `DATA_GAP`), configuración de candidatos (todos DISABLED), contrato `LOCAL_OLLAMA`, modelo de decisión (HIGH_RISK > 0 nunca gana) y formato de reporte dual.
- Métricas del benchmark renombradas (`ACCURACY`, `SCHEMA_VALIDITY`, …). Sin proveedor real, claves, gasto ni datos externos.
