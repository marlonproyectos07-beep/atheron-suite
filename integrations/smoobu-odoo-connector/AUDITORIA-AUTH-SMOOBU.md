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
- Ids tecnicos: 3557501, 3557506, 3557511, 3557516, 3557521, 3557526, 3567496. Los seis primeros son exactamente los de `unit-map.mjs` (Casa 3557501, 201 3557506, 202 3557511, 203 3557516, 301 3557521, 302 3557526); el septimo, 3567496, es Carrera 19, excluida del mapa.
- Resultado: **API OPERATIVA EN LECTURA CON ASIGNACION INVERTIDA**. Queda demostrado que el valor de 44 caracteres es el secreto HMAC.
- No se consultaron reservas ni huespedes; sin escrituras; sin Odoo.
- Pendiente (accion posterior, no hecha): corregir la asignacion permanente de los GitHub Secrets (intercambiar sus valores).

---

## ATH-DEV-028 — Autenticacion normalizada y primera lectura de reservas (2026-10-27)
Cruce de referencias hecho **una sola vez**, a nivel de job, en `smoobu-odoo-diagnose.yml` (adaptacion TEMPORAL a los valores
invertidos que hoy guardan los secretos; los secretos no se tocaron; se eliminó el modo `apartments-once-swapped` para no invertir dos veces).
Test `smoobu-secret-mapping.test.mjs` vigila que el cruce aparezca una sola vez y que ningun otro workflow use los secretos de Smoobu.
Cuando se intercambien los valores en GitHub, hay que deshacer SOLO ese cruce.

- `GET /api/apartments` (modo normal `apartments-once`, run 40523290706): **HTTP 200, 7 apartamentos**.
- `GET /api/reservations` ventana 2026-10-26..2026-10-27, pagina 1 (run 40523444352): **HTTP 200**, 14 reservas, `page_count` 1, `page_size` 100, `total_items` 14.
- Tipos devueltos: `reservation` 8, `cancellation` 3, `modification of booking` 3. Los 14 registros pertenecen al mapa de unidades; ninguno a Carrera 19.
- **Reserva piloto 161419736: ENCONTRADA** — `reservation`, 2026-10-26 -> 2026-10-27, apartamento 3557521 = unidad 301 = rol 37, `blocked=false`.
- Esquema: `bookings[]` con `apartment`, `arrival`, `departure`, `channel`, `type`, `is-blocked-booking`, `modifiedAt`, `related`, etc. (los campos de huesped existen en la respuesta pero no se imprimen).

### Riesgos observados (HECHO) / por validar (HIPOTESIS)
- **Cancelaciones como registros aparte**: la misma unidad y fecha tiene a la vez `cancellation` y `reservation` (p. ej. 301 el 25 y el 26). Sin una regla por tipo y `modifiedAt`, se podria bloquear una noche ya cancelada o duplicarla.
- **`modification of booking`** llega como registro propio (3 de 14): hay que resolver cual version manda para el mismo huésped/estancia (`related`, `modifiedAt` — HIPOTESIS no verificada).
- **`is-blocked-booking=true`** aparece en 6 de 14 (canal 7192161), tambien en 301 y 302: son bloqueos, no estancias de huesped. Podrian ser el eco de bloqueos creados desde Odoo (HIPOTESIS); deben pasar por el echo-guard y nunca crear turnos nuevos.
- **Ventana**: entran estancias que empiezan antes (18-oct -> 1-nov), asi que el filtro `from/to` no es por fecha de llegada; hay que definir y probar la semantica antes de sincronizar.
- **Disponibilidad en Odoo**: con el cron 86 inactivo, borrar turnos no recalcula `x_booked`; las cancelaciones de Smoobu no liberarian inventario por si solas (HECHO, ATH-DEV-020).
- Sin escrituras en Odoo, sin turnos, conector sin activar.

---

## ATH-DEV-029 — Lectura y conciliacion real Smoobu -> Odoo, sin escrituras (2026-10-27)

### Semantica de `from`/`to` de GET /api/reservations
- Documentacion oficial: **no accesible** desde el sandbox (docs.smoobu.com y support.smoobu.com bloqueados); las busquedas solo confirman que existen `from`/`to` y que hay filtros por fechas de creacion, llegada, salida y modificacion, sin los nombres exactos. No aclara si `from`/`to` filtran llegada, salida o solapamiento.
- Una lectura adicional acotada (run 40524554514, ventana de un dia: 2026-10-20): 4 registros, todos con llegada <= 20 y salida >= 20; entre ellos 160905511 (llegada 18-oct, salida 1-nov, que abarca el dia). Ninguna de las 7 estancias que empiezan el 26-27 aparecio.
- Conclusion: **solapamiento de estancia CONFIRMADO EMPIRICAMENTE** para esta cuenta (dos ventanas coherentes: 26..27 y 20..20). Descartadas "solo llegada" y "solo salida". NO probado: tratamiento exacto de los extremos ni de `modifiedAt`. Marcado como empirico, no documental.

### Clasificacion de los 14 registros (26..27 oct; fixture `smoobu-window-2026-10-26-sanitized.json`)
| Clase | Cantidad |
|---|---|
| Estancias de huesped vigentes (`reservation` 7 + `modification of booking` 1) | 8 |
| Cancelaciones de huesped (`cancellation`, no bloqueo) | 1 |
| Bloqueos (`is-blocked-booking`=true): 3 vigentes (2 `modification of booking`, 1 `reservation`) + 2 canceladas | 5 |
| Carrera 19 / fuera del mapa | 0 |
**Correccion**: informes anteriores decian 6 bloqueos; los registros muestran **5**. Los 14 ids son distintos (sin duplicados de id ni estancias duplicadas por unidad+fechas).
Todos los bloqueos usan el canal 7192161 y ningun registro que no sea bloqueo lo usa (HECHO); que ese canal sea el "canal bloqueado" de Smoobu es HIPOTESIS.
Mapa confirmado: 201, 202, 203, 301, 302 y Casa (3557501) -> roles 29, 19, 30, 37, 18, 69; Carrera 19 (3567496) excluida.

### Piloto 161419736 (Smoobu)
`reservation`, 2026-10-26 -> 2026-10-27, apartamento 3557521 = 301 = rol 37, no es bloqueo, canal 7192171. En la misma unidad y fechas existe la cancelacion bloqueada 161416801 (sin efecto: las canceladas y los bloqueos no generan turnos).

### Conciliacion contra Odoo: **BLOQUEADA**
`reconcile-window` (run 40524678848) leyo Smoobu una vez y fallo al primer `fields_get` de Odoo con **HTTP 401 `ODOO_AUTH_REJECTED`**; una lectura de comprobacion (run 40524804481) dio 401 en todos los pasos. Ayer (2026-10-26) la misma clave funcionaba. Causa NO demostrada: la clave pudo caducar (las claves duran <= 3 meses) o haberse rotado/revocado; no se modifico ninguna credencial desde esta sesion. No hay verdictos MATCH/CREATE_SLOT/CONFLICTO contra Odoo porque no se pudo leer el estado real; no se inventan.
Desde este commit el script imprime la clasificacion de Smoobu **antes** de leer Odoo, para no perderla si Odoo falla.

### Motor y seguridad (probado en memoria con datos ficticios, 170 tests)
- `is-blocked-booking` ya no crea turnos (se ignora con motivo `BLOCKED_ENTRY_NOT_A_GUEST_STAY`); cancelaciones no generan propuestas ni liberaciones; liberar sigue `BLOCKED_UNTIL_STAGING_PROOF` (`RELEASE_UNLOCKED=false`); `writesEnabled=false`.
- Cada propuesta usa un nombre opaco (`SM-<16 hex>`), nunca el id legible; idempotente (0 propuestas tras aplicar); el filtro anti-eco reconoce bloqueos y turnos ajenos equivalentes (MATCH).
- Riesgo iCal: un turno `published` entra en el .ics de su rol y de Casa (accion 1654, cron 147 cada 5 min); si Smoobu importa ese calendario volveria como bloqueo (ignorado por el filtro, no probado de extremo a extremo).
- Cron 86 sigue inactivo (ATH-DEV-020): borrar turnos no recalcula `x_booked`; las contabilidades de 1171/1172 siguen pendientes.
