# BORRADOR (no enviado) — Consulta al MinCIT sobre la integración PMS de la TRA

**Para:** Centro de Gestión de Incidentes TRA (https://gestion.mincit.gov.co/siat/login.php)
**Asunto:** Integración PMS (Resolución 409 de 2022) — software propio del prestador, catálogos y respuestas
**RNT:** 235267 · **Prestador:** [completar] · **Contacto:** [completar]

Respetados señores:

Somos prestadores de alojamiento turístico con RNT activo y deseamos transmitir la Tarjeta de Registro de Alojamiento con nuestro propio sistema de gestión, siguiendo el *Manual de integración para prestadores con PMS (Resolución 409 de 2022, versión 02-02-2023)*. Agradecemos confirmar:

1. **Software propio.** ¿Un prestador con RNT activo puede integrarse en el Grupo 1 usando un sistema desarrollado por él mismo, sin un proveedor de PMS comercial?
2. **Ambiente de pruebas.** ¿Existe un ambiente de pruebas o un procedimiento para validar la integración sin registrar huéspedes reales?
3. **`tipo_identificacion`.** ¿Cuál es la lista exacta de valores aceptados por la API (el manual muestra "C.C")? El manual del formulario web (Grupo 2) lista Pasaporte, T.I, C.C y C.E para el principal y añade Registro Civil para acompañantes; el manual en Excel usa "R.C". ¿La API usa esos mismos textos? ¿Se aceptan PEP, PPT y DNI, y con qué texto? ¿Un principal puede tener T.I o Registro Civil?
4. **`motivo`.** ¿Cuál es la lista exacta de valores aceptados? ¿Coincide al pie de la letra con la lista desplegable del formulario web (por ejemplo "Vacaciones, recreo y ocio")? ¿La API rechaza valores fuera de la lista?
5. **`tipo_acomodacion`.** ¿Cuál es la lista exacta de valores aceptados? ¿Qué valor corresponde a una habitación de hotel (sencilla, doble, suite…) y cuál a la casa completa de cinco habitaciones?
6. **`costo`.** La Resolución 409 pide el valor por unidad de alojamiento ocupada, pero la API recibe un solo `costo` por huésped principal. ¿Es el total de la reserva o el de la habitación del principal? ¿Total de la estancia o por noche? ¿Incluye impuestos? ¿Formato numérico sin separadores?
7. **`numero_habitacion`.** Para la casa completa (cinco habitaciones), ¿se reporta la habitación de cada huésped o un valor único?
8. **Ciudades.** ¿`cuidad_residencia` y `cuidad_procedencia` admiten texto libre o requieren un código o catálogo (DANE u otro)? ¿Cómo se reportan ciudades del exterior?
9. **Respuestas y errores.** Además de `{"code": N}` en éxito, ¿qué códigos HTTP y cuerpos de error devuelve la API? ¿El `code` del huésped principal es el identificador definitivo del registro?
10. **Confirmación y consulta.** ¿Cómo se confirma oficialmente un registro enviado por API? ¿La *Consulta de huéspedes (Resolución 409)* muestra el `code` devuelto, distingue principal y acompañantes y ofrece alguna constancia descargable?
11. **Corrección.** ¿Cómo se corrige o anula un registro enviado con error? ¿Hay endpoint para modificar o se hace por el portal?
12. **Salida.** ¿El `check_out` enviado al registrar es suficiente o debe reportarse la salida real por separado?
13. **Token.** ¿Cuál es la vigencia del token? ¿Solicitar uno nuevo invalida el anterior?
14. **Reintentos.** Si la respuesta no llega (tiempo de espera agotado), ¿cómo verificar si el registro quedó guardado antes de reenviar?

Cordialmente,
[Nombre y cargo]

---
Notas internas (no enviar): fuentes ya revisadas — Res. 409 de 2022 (art. 2), proyecto de la Res. 700 de 2021, manual PMS Res. 409 (24-08-2022 y 02-02-2023), manual Grupo 2, manual de no conectados, presentación pública de la Gobernación del Quindío y una guía no oficial (ver TRA-CATALOGOS-FUENTES.md). El emisor permanece desactivado hasta tener estas respuestas.
