# ATH-DEV-022 — Auditoria final de autenticacion Smoobu (2026-10-27)

Sin ninguna solicitud a Smoobu. Base: commit 54b8271. Cuenta 1923561.

## Fuentes
| Fuente | Estado |
|---|---|
| Articulo oficial `support.smoobu.com/.../360003170740` | **NO accesible desde el sandbox** (DNS bloqueado; tampoco `docs.smoobu.com`). Solo se leyeron resumenes de buscador de esos mismos textos. NO se leyo la pagina completa ni sus ejemplos de codigo |
| Resumenes oficiales via buscador (docs.smoobu.com y el articulo de soporte) | Cabeceras, cadena canonica, base64, UTC ISO, ventana de 5 min, nonce unico |
| README de un tercero (smoobu-rate-setter) | Misma cadena canonica y formula; base `https://login.smoobu.com`, ruta `/api/...` |
| PR de dos terceros (descripcion, no el diff) | Mismas cabeceras y esquema; ninguno informa un HTTP 200 real |

## Comparacion documentacion / codigo (`src/smoobu-hmac.mjs`, `src/smoobu-client.mjs`)
| Elemento | Documentacion (segun resumenes) | Codigo | Resultado |
|---|---|---|---|
| Cabeceras | `X-API-Key`, `X-Timestamp`, `X-Nonce`, `X-Signature` | identicas | coincide |
| Cadena canonica | `METHOD \n PATH \n QUERY \n TIMESTAMP \n NONCE \n SHA256_HEX(body) \n API_KEY` | identica, 7 lineas, sin salto final, sin `\r` | coincide |
| Query vacia | linea vacia | linea vacia | coincide |
| Firma | Base64(HMAC-SHA256(secreto, cadena)) | igual (clave HMAC = secreto UTF-8) | coincide |
| Timestamp | UTC ISO 8601, +-5 min | `2026-10-27T13:16:51Z` (sin milisegundos) | coincide (la docs no precisa milisegundos: NO DEMOSTRADO que importe) |
| Nonce | UUID v4 irrepetible | `randomUUID()` por solicitud | coincide |
| Hash del cuerpo | SHA-256 hex del cuerpo, vacio en GET | `e3b0c442...b855` | coincide |
| Ruta | `/api/...`; una copia traducida de la docs usa `/api/v1/...` | `/api`, `/api/v1` ya probada: 404 | sin discrepancia demostrada |
| Host | `https://login.smoobu.com` | idem (variable `SMOOBU_BASE_URL` vacia, usa el valor por defecto) | coincide |
| Query | ordenada por clave | ordenada, `encodeURIComponent`; la misma cadena se firma y se envia | coincide. NO DEMOSTRADO como Smoobu trata `[]` (p. ej. `apartments[]`); no afecta a `/api/apartments` |

## Vectores independientes (credenciales ficticias)
Tres firmas calculadas con Python (`hmac`/`hashlib`) y comprobadas con `openssl dgst -sha256 -hmac` (coinciden entre si)
estan fijadas en `test/smoobu-auth-audit.test.mjs`; el codigo Node las reproduce exactamente. Ademas el cliente se prueba
contra un `fetch` falso: una sola solicitud `GET https://login.smoobu.com/api/apartments`, cuatro cabeceras, firma
recalculada con el nonce realmente enviado, el secreto no viaja. Tests: **147 aprobados, 0 fallidos**.

## Credenciales: solo metadatos (run 40513966648, sin red)
| Dato | Clave | Secreto |
|---|---|---|
| Presente (valor enmascarado por GitHub) | si | si |
| Longitud | 44 | 41 |
| Espacios/saltos exteriores o interiores, comillas, no ASCII | no | no |
| Mayusculas / minusculas / digitos / simbolos | si/si/si/si | **no**/si/si/si |
| Clave == secreto | no | |
| Pertenencia al mismo par HMAC | **NO VERIFICABLE**: solo el servidor de Smoobu puede confirmarlo | |

El secreto no tiene mayusculas, a diferencia de la clave. No es una anomalia demostrada (el formato no esta documentado
en lo que se pudo leer), pero es el unico dato de forma que merece confirmarse con Smoobu.

## Condicion de habilitacion en prueba gratuita
Segun el articulo oficial (resumen de buscador): **en una prueba gratuita no se pueden generar claves API**; hay que tener cuenta de pago o pedir
a Smoobu Support que habilite la API en la prueba. Ruta: Ajustes > Avanzado > Claves API > crear clave > generar secreto
(se muestra una vez). El documento para desarrolladores menciona ademas una clave "legacy" en Perfil, retirada.
Que las credenciales existan en GitHub no demuestra que la API este habilitada en la cuenta.

## Conclusion
- **Error de implementacion: NO DEMOSTRADO.** Codigo y documentacion (en lo legible) coinciden y los vectores independientes coinciden.
- Limite de la auditoria: la pagina oficial completa y sus ejemplos no se pudieron leer.
- **Decision: no corregir codigo; consulta tecnica a soporte.** La causa del 401 sigue sin atribuirse.
- API operativa: **NO** (sin HTTP 200 real).

## Diagnostico para soporte (para que Marlon lo envie; no se envio)
Cuenta 1923561 (prueba gratuita). Solicitud `GET https://login.smoobu.com/api/apartments` con `X-API-Key`, `X-Timestamp`
(UTC ISO sin milisegundos), `X-Nonce` (UUID v4) y `X-Signature` (Base64 de HMAC-SHA256 del secreto sobre
`GET\n/api/apartments\n\n<timestamp>\n<nonce>\n<sha256 hex del cuerpo vacio>\n<clave>`). Respuesta:
`401 {"status":401,"title":"Unauthorized","detail":"Authentication required"}` (ejecuciones del 2026-10-27, una solicitud cada una).
Preguntas: 1) ¿Esta habilitada la API en esta prueba? 2) ¿La clave y el secreto generados pertenecen al mismo par y estan activos?
3) ¿Que ve su servidor en la solicitud rechazada (motivo concreto)? 4) ¿La ruta correcta es `/api/apartments`?

---

## ATH-DEV-025 — Credenciales intercambiadas (2026-10-27)
Diagnostico sin red (`npm run credential-swap`, modo `credential-swap` del workflow de diagnostico, run 40520451829):
huella SHA-256 (12 primeros caracteres) contra la referencia de la clave real de Smoobu, sin imprimir huellas ni valores.

```
SMOOBU_API_KEY: NO MATCH
SMOOBU_API_SECRET: MATCH
FORMATO_CORRECTO: SMOOBU_API_SECRET
RESULTADO: CREDENCIALES PROBABLEMENTE INTERCAMBIADAS
```
Esto explica el 401: la cabecera `X-API-Key` y el ultimo campo de la cadena canonica llevaban el valor equivocado, y
el HMAC se calculaba con la clave `usr_live_...` en lugar del secreto.
HIPOTESIS no verificada: el valor de 44 caracteres guardado en `SMOOBU_API_KEY` es el secreto HMAC (no se comprobo; solo el servidor puede confirmarlo).

Cambio minimo recomendado (NO realizado): que Marlon intercambie directamente en GitHub los **valores** de los dos secretos
(`SMOOBU_API_KEY` <- la clave `usr_live_...`; `SMOOBU_API_SECRET` <- el valor de 44 caracteres), sin pegarlos en el chat.
Alternativa en codigo (peor, deja nombres engañosos): cruzar las dos referencias `secrets.*` en los workflows que usan Smoobu.
Despues, una unica comprobacion `apartments-once`; solo un HTTP 200 real declara la API operativa.

---

## ATH-DEV-026 — Prueba controlada con asignacion invertida (2026-10-27)
Modo `apartments-once-swapped` del workflow de diagnostico (cruce `apiKey = secrets.SMOOBU_API_SECRET`,
`apiSecret = secrets.SMOOBU_API_KEY` SOLO en ese paso; secretos sin modificar). Run 40521652324, una solicitud.

- `GET /api/apartments` -> **HTTP 200**, par autenticado, **7 apartamentos**.
- Ids tecnicos: 3557501, 3557506, 3557511, 3557516, 3557521, 3557526, 3567496. Los cinco de unidades mas la Casa
  (3557501) estan en `unit-map.mjs`; 3557506 coincide con la unidad restante del mapa de seis y 3567496 es Carrera 19 (excluida del mapa).
- Resultado: **API OPERATIVA EN LECTURA CON ASIGNACION INVERTIDA**. Queda demostrado que el valor de 44 caracteres es el secreto HMAC.
- No se consultaron reservas ni huespedes; sin escrituras; sin Odoo.
- Pendiente (accion posterior, no hecha): corregir la asignacion permanente de los GitHub Secrets (intercambiar sus valores).
