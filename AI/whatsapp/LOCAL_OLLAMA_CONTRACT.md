# Contrato LOCAL_OLLAMA — solo contrato (`src/hybrid/local-provider.mjs`)

**No se descarga ningún modelo, no se instala nada, no se abre ninguna conexión.** Permite comparar después, con el mismo benchmark, *cloud LLM vs local LLM*.

| Punto | Contrato |
|---|---|
| Estado | `enabled=false`; `install=NOT_PERFORMED`; `model.download=NOT_PERFORMED`; modelo por definir |
| Transporte | solo **loopback** (`127.0.0.1`, puerto 11434, `/api/chat`); un endpoint fuera de loopback incumple el contrato (`ENDPOINT_NOT_LOOPBACK`) |
| Capacidades requeridas | salida restringida a JSON schema, temperatura 0, timeout por solicitud, sin tráfico de red hacia fuera |
| Interfaz | la misma `LanguageUnderstandingProvider` + `lastUsage()` (para tokens) |
| Esquema | el mismo esquema estricto `1.0`; respuesta inválida → `ESCALATE_HUMAN` |
| Privacidad | el fallo cerrado de PII aplica igual (no se prefiere «enviar por ser local») |
| Verificación | `assertLocalProviderContract()` rechaza: no local, red que no sea loopback-only, endpoint no loopback, sin nombre, sin reporte de uso |
| Prueba | `MockLocalProvider` cumple el contrato; `createLocalOllamaProvider()` lanza `ProviderDisabledError` |

Costo por token: ninguno, pero el costo de hardware y operación es `DATA_GAP`.
