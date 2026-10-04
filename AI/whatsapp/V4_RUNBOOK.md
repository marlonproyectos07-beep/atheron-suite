# V4 — runbook exacto (importar, validar, congelar, medir)

Estado: **esperando el corpus V4 anonimizado.** No hay casos V4 en el repositorio y no se crean sintéticos.
Rama: `feature/ath-whatsapp-shadow-agent-canonical`. Ningún proveedor real está habilitado: no hay claves, gasto ni envío de datos.

Todos los comandos se ejecutan desde `integrations/whatsapp-shadow-agent/`. Requiere solo Node (sin instalar nada). Ningún comando imprime texto del corpus ni envía nada a la red.

## 0. Preparación (una vez por sesión)

```bash
git checkout feature/ath-whatsapp-shadow-agent-canonical && git pull
cd integrations/whatsapp-shadow-agent
npm test          # debe dar 332/332 en verde antes de recibir V4
```

El corpus debe cumplir [V4_CORPUS_SCHEMA.md](V4_CORPUS_SCHEMA.md). Guardarlo **fuera del repo** (por ejemplo `~/corpus-v4.json`); nunca pegarlo en el chat.

## 1. Privacidad primero (no importa nada)

```bash
node scripts/validate-corpus.mjs ~/corpus-v4.json /tmp/v4-privacy-preview.json
echo "exit=$?"     # 0 aceptado · 2 CORPUS_REJECTED_FOR_PRIVACY · 3 inválido
```

Si sale `2` o `3`: **no seguir.** El informe lista caso, campo y tipo de cada hallazgo (nunca el valor). Re-anonimizar y repetir.

## 2. Importar

```bash
node scripts/v4.mjs import ~/corpus-v4.json
```

Valida de nuevo (estructura + privacidad). Solo si es `CORPUS_ACCEPTED` copia a `AI/whatsapp/v4/corpus.v4.json` y escribe `V4_PRIVACY_REPORT.json`. Si ya existe un corpus en el destino se niega (sobrescribir requiere autorización).
Con rechazo escribe `V4_PRIVACY_REPORT.rejected.json` (sin valores) y **no copia nada**; ese archivo no se versiona.

## 3. Congelar (SHA256 + commit + push) — ANTES de medir

```bash
node scripts/v4.mjs freeze
```

Recalcula el SHA256, escribe `corpus.v4.sha256` y `V4_FREEZE.json`, y **muestra** (no ejecuta) los comandos de Git:

```bash
git add AI/whatsapp/v4/corpus.v4.json AI/whatsapp/v4/corpus.v4.sha256 AI/whatsapp/v4/V4_FREEZE.json AI/whatsapp/v4/V4_PRIVACY_REPORT.json
git commit -m "test(whatsapp-v4): congelar corpus V4 anonimizado (sha256 <hash>)"
git push -u origin feature/ath-whatsapp-shadow-agent-canonical
git rev-parse HEAD        # anotar como V4_COMMIT
```

`freeze` se niega si ya está congelado o si existe un resultado previo. Desde aquí cualquier cambio al corpus se detecta (exit 6) y **no se mide**.
Como en V2/V3: no mirar resultados antes de congelar; una sola primera pasada.

## 4. RULES_ONLY (línea base)

```bash
node scripts/v4.mjs rules
```

Escribe `V4_RULES_ONLY_RESULT.json` con `FIRST_PASS_TOTAL/PASS/FAIL/PERCENT` y `HIGH_RISK_FAIL_COUNT` (mismas reglas de riesgo de V3). **Commitear el resultado crudo antes de analizar o corregir código.**

## 5. HYBRID con proveedor futuro

```bash
node scripts/v4.mjs provider --provider <nombre>
```

Hoy, `openai`, `anthropic`, `gemini`, `local_ollama` y `other` terminan con **exit 5 `PROVIDER_DISABLED`**: no hay implementación, claves ni red. Solo `mock-benign` y `mock-adversarial` corren, y únicamente para probar el cableado (no son un LLM).
Habilitar un proveedor real requiere, antes: autorización de Control Maestro, tarifa real con fuente (si no, costo = `DATA_GAP`), términos de datos revisados e implementación del proveedor tras la interfaz `LanguageUnderstandingProvider`. Mientras tanto el fallo cerrado de privacidad impide enviar PII sensible a cualquier proveedor.

## 6. Comparativo

```bash
node scripts/v4.mjs compare
```

Genera `V4_BENCHMARK_COMPARISON.json` y `.md` (RULES_ONLY vs cada proveedor medido + modelo de decisión: HIGH_RISK > 0 nunca gana).

## Archivos esperados (todos en `AI/whatsapp/v4/`)

| Archivo | Lo genera | ¿Se versiona? |
|---|---|---|
| `corpus.v4.json` | `import` | sí (anonimizado) |
| `V4_PRIVACY_REPORT.json` | `import` | sí |
| `V4_PRIVACY_REPORT.rejected.json` | `import` (solo si se rechaza) | no |
| `corpus.v4.sha256`, `V4_FREEZE.json` | `freeze` | sí (en el commit de congelación) |
| `V4_RULES_ONLY_RESULT.json` | `rules` | sí (resultado crudo) |
| `V4_PROVIDER_<NOMBRE>_RESULT.json` | `provider` | sí |
| `V4_BENCHMARK_COMPARISON.json` / `.md` | `compare` | sí |

## Códigos de salida

`0` ok · `2` privacidad · `3` inválido · `4` falta archivo/congelación (o ya existe) · `5` proveedor deshabilitado · `6` el corpus cambió tras congelar · `64` uso.

## Después de medir

Diagnosticar causas generales y corregir solo si Control Maestro lo autoriza; distinguir siempre `FIRST_PASS_GENERALIZATION` de `POST_FIX_REGRESSION`. Gate para considerar SUPERVISED: **≥ 90 % en primera pasada y 0 HIGH_RISK real.** No cambia ningún modo automáticamente.
