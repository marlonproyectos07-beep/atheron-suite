# TRA — aceptación del reporte y catálogos: fuentes y contraste (2026-11-08)

Frente TRA del proyecto ATH-HOTELS-SIRE-TRA-001. Solo lectura de fuentes públicas y pruebas con simulador en la copia `atheron1-pruebas-20261108`. Ningún envío al MinCIT, ningún token solicitado ni renovado, emisor real apagado, producción sin tocar.

## 1. Consulta de huéspedes del portal PMS (RNT 235267)

| Punto | Estado |
|---|---|
| Portal | `https://pms.mincit.gov.co/login/` ("CONSULTA PMS"). Formulario: RNT, contraseña y reCAPTCHA. Enlace "Solicitar contraseña" (`/solicitud`): no se tocó. |
| Sesión | **BLOQUEADO.** La pestaña compartida mostraba el formulario de ingreso, sin sesión abierta. Se pidió a Marlon que ingresara (requiere contraseña y reCAPTCHA, que Claude no diligencia). No se ingresó durante esta tarea. |
| Qué confirma la aceptación | **Pendiente de ver en el portal.** Lo único documentado oficialmente es la respuesta de la API: `POST /one/` devuelve `{"code": N}` y ese `code` se usa como `padre` de los acompañantes en `POST /two/`; el `code` de `/two/` es "solo informativo" según el manual. No se pudo comprobar si la consulta muestra ese `code`, un estado o un comprobante descargable. |

Cómo lo trata hoy el sistema (sin cambios): un intento es `aceptado` solo con HTTP 2xx y `code` entero. El `code` del principal queda en `x_tra_external_id` de la línea y en `x_external_id` del intento; el de cada acompañante, en su intento. 2xx sin `code` = `incierto` (no se reenvía a ciegas). Mientras no se vea la consulta, "aceptado" significa "la API respondió con código", no "el MinCIT lo muestra en su consulta".

Para cerrar este punto, con Marlon dentro del portal: anotar columnas y filtros de la consulta, si aparece el `code` devuelto por la API, si distingue principal y acompañantes, y si ofrece constancia. Sin registrar, editar ni borrar nada.

## 2. Fuentes revisadas

| Fuente | Tipo | Acceso | Qué aporta |
|---|---|---|---|
| Res. 409 de 2022 (MinCIT), art. 2, que sustituye el art. 7 de la Res. 700 de 2021 (texto en el régimen legal de Bogotá) | Norma oficial | Leída | Lista de **campos**: tipo de acomodación, valor total pagado por el servicio de alojamiento y número de habitación (por unidad ocupada); por huésped: tipo y número de identificación, nombre, ciudad de residencia y de procedencia, motivo principal del viaje y fechas. **No enumera valores.** |
| Proyecto de la Res. 700 de 2021 (PDF en mincit.gov.co) | Borrador oficial | Leído completo en el navegador | Igual: campos sin lista de valores. El borrador fija el registro "en línea o a más tardar el mismo día" y una conservación de 5 años desde la salida; la Res. 409 de 2022 remitió la conservación a las normas del Archivo General de la Nación. |
| Manual de integración PMS, Res. 409 (24-08-2022; versión 02-02-2023 revisada antes) | Manual oficial de la API | Extractos | Ejemplos `"tipo_identificacion":"C.C"`, `"motivo":"Trabajo"`, `"tipo_acomodacion":"Casa"`, `"costo":"1212"`. Declara `tipo_identificacion`, `motivo`, `tipo_acomodacion`, `costo` y `numero_habitacion` como **texto**. No publica listas de valores. |
| Manual Grupo 2, usuarios directos conectados (formulario web) | Manual oficial | Extractos (tramincit.gov.co da error de certificado en el navegador; no se omitió la advertencia) | 4.1: principal con lista **Pasaporte, T.I, C.C, C.E**. 5.1: acompañante con esas cuatro **y Registro Civil**. 4.7 y 4.11: motivo y tipo de acomodación son listas desplegables, **sin enumerarlas**; para vivienda turística completa: apartamento, casa o finca. 4.12: valor en pesos colombianos. |
| Manual de usuarios no conectados (Excel) | Manual oficial | Extractos de la ronda anterior | Abrevia el registro civil como "R.C". |
| Guía de un tercero (trabis.co, 2023-2024) con capturas del formulario | **No oficial** | Leída | Principal: Pasaporte, C.C, C.E, P.E.P, D.N.I (sin T.I). Acompañante: Pasaporte, T.I, C.C, C.E, Registro Civil, P.E.P, D.N.I. Motivo: "Negocios y motivos profesionales", "Vacaciones, recreo y ocio", "Visitas a familiares y a amigos", "Educación y..." (cortado). Tipo: "Apartamento", "Hamaca", "Camping", "Otro..." (cortado). Valor: total pagado por la estancia, en COP. |

## 3. Contraste con `tra-catalog.json` (PR #112)

| Valor del catálogo | Respaldo | Resultado |
|---|---|---|
| `national_citizen_id` → `C.C` | Oficial (ejemplo de la API y manual Grupo 2) | Coincide |
| `passport` → `Pasaporte` | Oficial (manual Grupo 2) | Coincide |
| `id_card` → `T.I` | Oficial (manual Grupo 2); la guía no oficial ya no lo muestra para el principal | Coincide; dudoso como principal |
| `foreign_resident_card` → `C.E` | Oficial (manual Grupo 2) | Coincide |
| `civil_registration` → `Registro Civil` | Oficial (manual Grupo 2, 5.1, solo acompañantes); el manual Excel dice "R.C" | Coincide con el formulario web. **Nuevo:** `mainDocTypes` impide enviarlo como principal |
| PEP, PPT, D.N.I | Sin respaldo oficial | Sin mapear: el emisor deja la línea en error previo |
| `reasons` (vacío) | Sin lista oficial | Se mantiene vacío. Las opciones de la encuesta ("Vacaciones, recreación u ocio", "Visita a familiares o amigos", "Negocios o motivos profesionales"...) no coinciden al pie de la letra con los rótulos no oficiales ("Vacaciones, recreo y ocio", "Visitas a familiares y a amigos"...) |
| `tipo_acomodacion` (configuración del establecimiento) | Sin lista oficial | Sigue sin verificar |

`verified` sigue en `false`: la API declara los campos como texto libre y nadie ha confirmado qué valores acepta ni si los valida.

## 4. Cambio de código

- `tra-emitter.mjs`: `mainDocTypes` en el catálogo. Si el principal tiene un tipo fuera de esa lista, el intento queda en `error_previo` con código `DATO_NO_ADMITIDO:tipo_identificacion`, sin llamada a la API y con la línea de nuevo en `pendiente`. Si el catálogo no trae `mainDocTypes`, no hay restricción (compatible con versiones anteriores).
- `tra-catalog.json`: `mainDocTypes`, fuentes por valor y nota corregida (manual de la Res. 409 de 2022, versión 02-02-2023).
- Prueba unitaria nueva. `npm test`: 401/401.

## 5. Prueba en la copia aislada (datos sintéticos, simulador)

Paquete del emisor ejecutado en la sesión de la copia; sha256 `f80e0023b52b44fa…3bf70784`, igual al construido desde la rama. Reserva sintética COT/2026/03877 (22 huéspedes, cancelada, todas las líneas validadas y con llegada). Motivo de prueba `SINTETICO-NO-OFICIAL`, solo para pasar la validación; no es un valor del MinCIT.

| Prueba | Resultado |
|---|---|
| A. Principal con Registro Civil | `DATO_NO_ADMITIDO:tipo_identificacion`, 0 llamadas, línea en `pendiente` |
| B. Acompañante con Registro Civil (resto C.C y Pasaporte) | Principal `C.C` aceptado (code 101); 21 acompañantes aceptados con `padre` 101; rótulos enviados: C.C 14, Pasaporte 7, Registro Civil 1 |
| C. Repetición | 0 llamadas, 0 reenvíos |
| D. Modo real sin token ni catálogo verificado | Bloqueado: `TRA_ENABLED_APAGADO`, `SIN_TOKEN`, `CATALOGO_NO_VERIFICADO`, `CONFIG_ESTABLECIMIENTO_NO_VERIFICADA` |

Intentos creados: 1 `error_previo` y 22 `aceptado`, todos con canal `simulador`. Los tipos de documento de las líneas 6 y 22 se cambiaron solo para la prueba y se restauraron. La copia sigue aislada: servidor de correo `invalid` y regla de automatización 48 inactiva.

## 6. Pendiente sin respaldo oficial

1. Qué muestra la consulta de huéspedes y qué constancia ofrece: requiere el ingreso de Marlon.
2. Valores exactos de la API para `tipo_identificacion`, `motivo` y `tipo_acomodacion`, y si los valida.
3. PEP, PPT y D.N.I: si existen en la API y con qué texto.
4. T.I como huésped principal.
5. `costo`: la norma lo pide por unidad ocupada, pero la API manda un solo `costo` por principal. Falta saber si es por reserva o por habitación y si lleva impuestos.
6. `tipo_acomodacion` para habitaciones de hotel (Atheron no es vivienda turística completa, salvo Casa Completa).
7. Ciudades: si son texto libre o un catálogo.
8. Corrección o anulación de un registro enviado.

Las preguntas quedan en `CONSULTA-MINCIT-BORRADOR.md`, sin enviar.
