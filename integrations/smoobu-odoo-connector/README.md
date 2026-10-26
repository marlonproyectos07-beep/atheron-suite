# Conector Smoobu <-> Odoo 19 (ATH-DEV-001)

Solo lectura. Sin dependencias. `npm test` (Node >= 20). No activa webhooks ni escrituras;
no toca NOBEDS ni las automatizaciones 167/169.

## Estado honesto
| Pieza | Estado |
|---|---|
| Cliente Smoobu (GET, paginacion, errores saneados) | HECHO, probado con fetch simulado |
| Firma HMAC-SHA256 | HECHO, **formato canonico NO verificado**: docs.smoobu.com no fue accesible desde la sesion. Ajustar `src/smoobu-hmac.mjs` (`canonicalString`, `HEADER_NAMES`) al contrastar. `SMOOBU_AUTH_MODE=api-key` como alternativa (tambien sin verificar) |
| Cliente Odoo JSON-2 (solo `search_read`, `read`, `fields_get`...) | HECHO, probado simulado. Depende de que el plan de atheron1.odoo.com ofrezca JSON-2 |
| Mapa de 6 unidades (Carrera 19 excluida) | HECHO, `src/unit-map.mjs` |
| Plan entrante/saliente, dedupe, anti-bucle | HECHO como funciones puras (`src/sync-plan.mjs`); nada se aplica |
| Consultas reales / reserva 161419736 vs rol 37 | **NO EJECUTADO**: sin credenciales en el entorno (`npm run probe` -> BLOCKED) |

## Mapa
201: 3557506 -> rol 29 | 202: 3557511 -> 19 | 203: 3557516 -> 30 | 301: 3557521 -> 37 | 302: 3557526 -> 18 | Casa Completa: 3557501 -> 69

## Variables de entorno (nombres; los valores nunca van al chat ni al repo)
| Variable | Uso |
|---|---|
| `SMOOBU_BASE_URL` | URL base de la API de Smoobu |
| `SMOOBU_KEY_ID` | Identificador de clave (modo hmac) |
| `SMOOBU_SECRET` | Secreto HMAC (o clave API en modo api-key) |
| `SMOOBU_AUTH_MODE` | `hmac` (defecto) o `api-key` |
| `ODOO_BASE_URL` | https://atheron1.odoo.com |
| `ODOO_DATABASE` | Nombre de la base (cabecera `X-Odoo-Database`) |
| `ODOO_API_KEY` | API key de Odoo de un usuario con permiso de solo lectura |

Configurarlas en el secret store del entorno de Claude Code en la nube (Ajustes del entorno ->
variables/secretos) o, en local, con el store de `integrations/odoo-hotel-gateway/scripts/secure-store`.
Luego: `npm run probe` imprime solo fechas, unidad, rol esperado y conteo de turnos, sin datos de huesped.

## Diseno bidireccional (resumen)
- Entrante: huella por reserva (`fingerprint`) -> duplicado ignorado; claves de turno `SMOOBU-<id>:<unidad>:<noche>` hacen la creacion idempotente; modificar solo anade/quita noches; cancelar libera las claves.
- Un turno por noche; todos comparten el identificador de estancia `SMOOBU-<id>`.
- Casa Completa bloquea las cinco fisicas y viceversa (`blocks`).
- Anti-bucle: reservas originadas en Odoo (`ownOrigin`) se ignoran al volver como evento.
- Saliente: `PENDING_PMS` -> `CONFIRMED` solo con respuesta positiva del PMS; `writesEnabled:false`.
