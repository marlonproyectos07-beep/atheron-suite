# Conector Smoobu <-> Odoo 19 (ATH-DEV-001)

Solo lectura. Sin dependencias. `npm test` (Node >= 20). No activa webhooks ni escrituras;
no toca NOBEDS ni las automatizaciones 167/169.

## Estado honesto (ATH-DEV-002)
| Pieza | Estado |
|---|---|
| Cliente Smoobu (GET, paginacion, errores saneados) | HECHO, probado con fetch simulado |
| Firma HMAC-SHA256 | CORREGIDA (ver abajo). Corroborada por fuentes secundarias; pagina oficial inaccesible desde el sandbox; sin vector de prueba oficial publicado |
| Cliente Odoo JSON-2 (solo lectura) | HECHO, simulado. Depende de que el plan de atheron1.odoo.com ofrezca JSON-2 |
| Diagnostico `npm run diagnose` | HECHO, probado con simulados |
| Consultas reales a Smoobu / Odoo | **NO EJECUTADAS**: sin credenciales en el entorno -> BLOCKED |

## HMAC (cambios respecto de ATH-DEV-001)
Antes: cabeceras inventadas (`X-Smoobu-*`), firma en hex, orden de campos distinto. Ahora:
```
CANONICAL = METHOD \n PATH \n QUERY \n TIMESTAMP \n NONCE \n SHA256_HEX(BODY) \n API_KEY
X-Signature = Base64( HMAC-SHA256( key = API_SECRET, CANONICAL ) )
```
Cabeceras: `X-API-Key`, `X-Timestamp` (UTC ISO 8601 sin milisegundos, tolerancia 5 min), `X-Nonce` (UUID v4), `X-Signature`.
Query ordenada por clave. El modo `api-key` se **elimino**: Smoobu retira la cabecera sola desde 2026-09-25.
Pendiente de confirmar con una llamada real: (a) prefijo de ruta `/api/...` vs `/api/v1/...` (la ruta entra en la firma), (b) codificacion exacta de la query con caracteres especiales (las consultas actuales solo usan fechas y enteros).

## Variables (6; ya no hay `SMOOBU_KEY_ID` ni `SMOOBU_AUTH_MODE`)
| Variable | Tipo | Nota |
|---|---|---|
| `SMOOBU_BASE_URL` | publica, opcional | por defecto `https://login.smoobu.com` |
| `ODOO_BASE_URL` | publica | https://atheron1.odoo.com |
| `ODOO_DATABASE` | publica | nombre de la base |
| `SMOOBU_API_KEY` | **SECRETA** | va en la cabecera `X-API-Key` y dentro de la firma |
| `SMOOBU_API_SECRET` | **SECRETA** | solo firma, nunca viaja |
| `ODOO_API_KEY` | **SECRETA** | API key de un usuario Odoo de solo lectura (Bearer) |

Donde configurarlas: (1) sesiones en la nube: Ajustes del entorno de Claude Code -> Variables/Secretos de entorno; (2) local Windows: el almacen de `integrations/odoo-hotel-gateway/scripts/secure-store`. Nunca en el chat, en `.env` versionado ni en el repo. Las publicas pueden ir como variables normales; las tres secretas solo como secretos.

## Diagnostico
`npm run diagnose` (salida 0 = OK, 1 = fallo, 2 = bloqueado por variables). Comprueba autenticacion Smoobu, que existan las seis unidades, lee la reserva 161419736 (debe ser 301), y en Odoo verifica `planning.role` 37 y los `planning.slot` del rol en esas fechas. Imprime solo ids, fechas, conteos y codigos.

## Ejecucion real (ATH-DEV-003)
El sandbox de Claude Code **no tiene salida** a login.smoobu.com ni atheron1.odoo.com (DNS bloqueado por la politica de red del entorno). Vercel aloja un sitio estatico: no se usa para esto (anadiria un endpoint con secretos y no hay necesidad). Runner elegido: **GitHub Actions** (`.github/workflows/smoobu-odoo-diagnose.yml`), solo lectura, permisos `contents: read`.
1. Marlon crea los 3 secretos en GitHub -> Settings -> Secrets and variables -> Actions -> Secrets: `SMOOBU_API_KEY`, `SMOOBU_API_SECRET`, `ODOO_API_KEY`; y las variables `ODOO_BASE_URL`, `ODOO_DATABASE` (y opcional `SMOOBU_BASE_URL`). Los valores se escriben solo en esa pantalla.
2. Re-ejecutar el flujo (Actions -> Re-run, o subir un cambio al conector). Sin secretos termina en BLOQUEADO.
3. `npm run connectivity` comprueba DNS/HTTPS sin credenciales. `npm run diagnose` prueba `/api` y, solo ante 404, `/api/v1`, e informa cual funciono.
Alternativa: levantar el entorno de Claude Code con red "Limited" + dominios permitidos `login.smoobu.com` y `atheron1.odoo.com`, y los secretos del entorno.

## Mapa
201: 3557506 -> rol 29 | 202: 3557511 -> 19 | 203: 3557516 -> 30 | 301: 3557521 -> 37 | 302: 3557526 -> 18 | Casa Completa: 3557501 -> 69

## Diseno bidireccional (resumen)
- Entrante: huella por reserva (`fingerprint`) -> duplicado ignorado; claves de turno `SMOOBU-<id>:<unidad>:<noche>` hacen la creacion idempotente; modificar solo anade/quita noches; cancelar libera las claves.
- Un turno por noche; todos comparten el identificador de estancia `SMOOBU-<id>`.
- Casa Completa bloquea las cinco fisicas y viceversa (`blocks`).
- Anti-bucle: reservas originadas en Odoo (`ownOrigin`) se ignoran al volver como evento.
- Saliente: `PENDING_PMS` -> `CONFIRMED` solo con respuesta positiva del PMS; `writesEnabled:false`.
