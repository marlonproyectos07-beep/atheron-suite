# BORRADOR (no enviado, pendiente de aprobación de Marlon) — Consulta al MinCIT sobre la integración PMS de la TRA

**Para:** Centro de Gestión de Incidentes TRA (https://gestion.mincit.gov.co/siat/login.php)
**Asunto:** Integración PMS (Resolución 409 de 2022) — software propio del prestador, valores de la API, confirmación y corrección de registros
**RNT:** 235267 · **Prestador:** [completar] · **Contacto:** [completar]

Respetados señores:

Somos prestadores de alojamiento turístico con RNT activo y queremos transmitir la Tarjeta de Registro de Alojamiento con nuestro propio sistema de gestión, siguiendo el *Manual de integración para prestadores con PMS (Resolución 409 de 2022, versión 02-02-2023)*. Los manuales públicos no responden los puntos siguientes; agradecemos confirmarlos.

**A. Habilitación**
1. **Software propio.** ¿Un prestador con RNT activo puede integrarse en el Grupo 1 con un sistema desarrollado por él mismo, sin proveedor de PMS comercial?
2. **Ambiente de pruebas.** ¿Existe un ambiente de pruebas o un procedimiento para validar la integración sin registrar huéspedes reales?
3. **Token.** ¿Cuál es su vigencia? ¿Solicitar uno nuevo invalida el anterior?

**B. Valores que acepta la API** (los campos se declaran como texto y el manual no publica listas)
4. **`tipo_identificacion`.** ¿Cuál es la lista exacta? El manual del formulario web (Grupo 2) lista Pasaporte, T.I, C.C y C.E para el principal y añade Registro Civil solo para acompañantes; el manual en Excel usa "R.C". ¿La API usa esos mismos textos? ¿Se aceptan PEP, PPT y DNI, y con qué texto? ¿Un principal puede ser menor con T.I?
5. **`motivo`.** ¿Cuál es la lista exacta? ¿Coincide al pie de la letra con la lista desplegable del formulario web? ¿La API rechaza valores fuera de la lista?
6. **`tipo_acomodacion`.** ¿Cuál es la lista exacta? ¿Qué valor corresponde a una habitación de hotel (sencilla, doble, suite…) y cuál a la casa completa de cinco habitaciones?
7. **`costo`.** La norma pide el valor por unidad de alojamiento ocupada, pero la API recibe un solo `costo` por huésped principal. ¿Es el total de la reserva o el de la habitación del principal? ¿Total de la estancia o por noche? ¿Incluye impuestos? ¿Qué formato numérico?
8. **`numero_habitacion`.** Para la casa completa (cinco habitaciones), ¿se reporta la habitación de cada huésped o un valor único?
9. **Ciudades.** ¿`cuidad_residencia` y `cuidad_procedencia` admiten texto libre o requieren un código o catálogo? ¿Cómo se reportan ciudades del exterior?

**C. Respuestas y confirmación**
10. **Respuestas y errores.** Además de `{"code": N}` en éxito, ¿qué códigos HTTP y cuerpos de error devuelve la API? ¿El `code` del principal es el identificador definitivo del registro?
11. **Consulta de huéspedes.** El reporte de *Mis Huéspedes* (archivo Excel, hoja "Usuarios PMS") trae 13 columnas: tipo de identificación, documento, nombres, apellidos, ciudad de residencia, ciudad de procedencia, número de habitación, motivo, número de acompañantes, check-in, check-out, tipo de acomodación y valor total pagado. No incluye el `code` devuelto por la API, un estado ni una constancia, y no indica el origen del registro. ¿Cómo se confirma oficialmente que un registro enviado por API quedó recibido? ¿Existe alguna constancia descargable? ¿Los acompañantes aparecen como filas propias o solo como conteo, y los registros por API se ven igual que los cargados a mano?
12. **Reintentos.** Si la respuesta no llega (tiempo de espera agotado), ¿cómo verificar si el registro quedó guardado antes de reenviar, dado que la consulta no muestra el código?

**D. Corrección y cambios de fechas**
13. **Corrección o anulación.** ¿Cómo se corrige o anula un registro enviado con error? ¿Hay endpoint para modificarlo o debe hacerse por el portal? ¿Tiene costo o plazo?
14. **Prórroga o salida anticipada.** El `check_out` se envía al registrar la llegada, con la fecha prevista. Si después la estancia se prolonga o el huésped sale antes, ¿se debe corregir ese registro? ¿Cómo (reenvío, modificación o consulta al soporte), con qué plazo y con qué costo? ¿Enviar de nuevo genera un registro duplicado?
15. **Salida real.** ¿Debe reportarse la salida real por separado, o basta el `check_out` enviado al registrar?

Cordialmente,
[Nombre y cargo]

---
Notas internas (no enviar):
- Estado: el emisor TRA sigue desactivado y el sistema solo muestra la alerta "Discrepancia de fechas" ante una prórroga o salida anticipada; no corrige nada en el portal hasta que se responda la pregunta 14.
- Reporte de prueba: un día (2026-11-08) sin registros; solo se leyeron los encabezados y el archivo se descartó. No sirve para saber cómo se ven los registros por API ni los acompañantes (pregunta 11).
- Preguntas fusionadas respecto del borrador anterior (14 → 15 con la nueva sobre cambios de fechas): se reunieron en cuatro grupos; ninguna se descartó porque ninguna tiene aún respuesta oficial.
- Fuentes ya revisadas: Res. 409 de 2022 (art. 2), proyecto de la Res. 700 de 2021, manual PMS Res. 409 (24-08-2022 y 02-02-2023), manual Grupo 2, manual de no conectados, presentación pública de la Gobernación del Quindío y una guía no oficial; observación del portal en `TRA-CATALOGOS-FUENTES.md` §1.
