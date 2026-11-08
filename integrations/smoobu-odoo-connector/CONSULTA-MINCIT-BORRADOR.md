# BORRADOR (no enviado) — Consulta al MinCIT sobre la integración PMS de la TRA

**Para:** Centro de Gestión de Incidentes TRA (https://gestion.mincit.gov.co/siat/login.php)
**Asunto:** Integración PMS (Resolución 409 de 2022) — software propio del prestador, catálogos y respuestas
**RNT:** [completar por Marlon] · **Prestador:** [completar] · **Contacto:** [completar]

Respetados señores:

Somos prestadores de alojamiento turístico con RNT activo y deseamos transmitir la Tarjeta de Registro de Alojamiento con nuestro propio sistema de gestión, siguiendo el *Manual de integración para prestadores con PMS (Resolución 409 de 2022, versión 02-02-2023)*. Agradecemos confirmar:

1. **Software propio.** ¿Un prestador con RNT activo puede integrarse en el Grupo 1 usando un sistema desarrollado por él mismo, sin un proveedor de PMS comercial?
2. **Ambiente de pruebas.** ¿Existe un ambiente de pruebas o un procedimiento para validar la integración sin registrar huéspedes reales?
3. **`tipo_identificacion`.** ¿Cuál es la lista exacta de valores aceptados (el manual muestra "C.C" y "Pasaporte")? ¿Se aceptan T.I, C.E, Registro Civil, PEP y PPT? ¿Con qué texto?
4. **`motivo`.** ¿Cuál es la lista exacta de valores aceptados?
5. **`tipo_acomodacion`.** ¿Cuál es la lista exacta de valores aceptados? Para una vivienda turística que se alquila por habitaciones o completa, ¿qué valor corresponde?
6. **`costo`.** ¿Es el valor total pagado por toda la estancia del grupo o por noche? ¿Incluye impuestos? ¿Formato numérico sin separadores?
7. **`numero_habitacion`.** Para la casa completa (cinco habitaciones), ¿se reporta la habitación de cada huésped o un valor único?
8. **Ciudades.** ¿`cuidad_residencia` y `cuidad_procedencia` admiten texto libre o requieren un código o catálogo (DANE u otro)? ¿Cómo se reportan ciudades del exterior?
9. **Respuestas y errores.** Además de `{"code": N}` en éxito, ¿qué códigos HTTP y cuerpos de error devuelve la API? ¿El `code` del huésped principal es el identificador definitivo del registro?
10. **Confirmación y consulta.** ¿Cómo se confirma oficialmente un registro enviado por API? ¿La *Consulta de huéspedes (Resolución 409)* muestra el identificador devuelto?
11. **Corrección.** ¿Cómo se corrige o anula un registro enviado con error? ¿Hay endpoint para modificar o se hace por el portal?
12. **Salida.** ¿El `check_out` enviado al registrar es suficiente o debe reportarse la salida real por separado?
13. **Token.** ¿Cuál es la vigencia del token? ¿Solicitar uno nuevo invalida el anterior?
14. **Reintentos.** Si la respuesta no llega (tiempo de espera agotado), ¿cómo verificar si el registro quedó guardado antes de reenviar?

Cordialmente,
[Nombre y cargo]

---
Notas internas (no enviar): fuentes ya revisadas — manual PMS Res. 409 (24-08-2022 y 02-02-2023), presentación pública de capacitación de la Gobernación del Quindío (formulario Grupo 2). El emisor permanece desactivado hasta tener estas respuestas.
