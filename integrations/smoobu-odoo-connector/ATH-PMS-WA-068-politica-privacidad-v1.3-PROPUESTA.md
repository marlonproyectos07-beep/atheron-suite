# ATH-PMS-WA-068 — Propuesta de actualización de la política de privacidad (v1.2 → v1.3)

**Estado: PROPUESTA. NO publicada.** No se modificó `src/pages/politica-de-privacidad.astro`. Requiere aprobación expresa de gerencia
y revisión jurídica antes de publicarse. No es asesoría legal.

## Qué dice hoy la v1.2 y por qué hay que cambiarla
- Punto 5: «La recepción de mensajes de esta línea aún no ha sido validada mediante una prueba real. No hay respuestas automáticas,
  asistentes de inteligencia artificial ni reservas automáticas activas.» → **ya no es exacto**: la recepción está validada y existe un
  asistente automatizado en modo borrador.
- Punto 5: «cuando entre en operación, los mensajes se recibirán en Odoo y los gestionará nuestro equipo» → hoy además los lee un
  programa automatizado para preparar borradores.
- Punto 4: «La conexión entre Smoobu y Odoo está en desarrollo…» → se mantiene; el asistente consulta Smoobu **solo para leer disponibilidad**.
- Punto 6 (proveedores): falta GitHub (plataforma donde se ejecuta el programa) como proveedor tecnológico.

## Hechos técnicos verificados que la política debe reflejar
- El asistente es un **programa de reglas**, no un modelo de inteligencia artificial generativa. No decide solo.
- Lee el texto, el teléfono y la fecha de los mensajes entrantes de la línea +57 301 803 5593 desde Odoo.
- Consulta a Smoobu la disponibilidad de las habitaciones (solo lectura) con las fechas y el número de huéspedes del mensaje.
- Deja un **borrador interno** en un canal privado de Odoo que revisa una persona. No envía mensajes por sí mismo, no crea reservas,
  pedidos, pagos ni facturas.
- Los registros técnicos del programa guardan el teléfono enmascarado (solo los últimos 4 dígitos).
- Un mensaje solo se envía por WhatsApp tras autorización expresa de una persona de ATHERON S.A.S.

## Texto propuesto — punto 5 (reemplaza los dos últimos párrafos sustantivos)
> **5. WhatsApp Business Platform (Cloud API) y línea +57 301 803 5593**
>
> Además del WhatsApp Business de recepción actual (+57 318 898 3167), ATHERON S.A.S. atiende consultas de disponibilidad y reservas
> por la línea +57 301 803 5593 con la WhatsApp Business Platform (Cloud API) de Meta. Los mensajes que usted envía a esta línea se
> reciben y se almacenan en Odoo.
>
> **Asistente automatizado de apoyo.** Para agilizar la atención usamos un asistente automatizado (un programa de reglas, no un
> sistema de inteligencia artificial generativa) que lee su mensaje, identifica fechas y número de personas, consulta en Smoobu la
> disponibilidad de nuestras habitaciones y prepara un **borrador de respuesta**. Una persona de nuestro equipo revisa ese borrador
> antes de que se le envíe cualquier mensaje. El asistente no crea reservas, no registra pagos ni emite facturas.
>
> **Respuestas.** Por ahora las respuestas por esta línea las envía una persona de nuestro equipo. Si más adelante activamos respuestas
> automáticas o plantillas, se lo informaremos y actualizaremos esta política **antes** de usarlas con sus datos.
>
> Sus mensajes, su número de teléfono y el nombre de perfil de WhatsApp pueden quedar almacenados en Odoo y en WhatsApp/Meta.
> WhatsApp/Meta trata los datos de la conversación según sus propias condiciones y políticas; nosotros no controlamos ese tratamiento.
> Si no desea que su mensaje sea procesado por el asistente, indíquelo por los canales del punto 1 y lo atenderá una persona.

## Texto propuesto — punto 6 (añadir a la lista de proveedores)
> …Smoobu como gestor de reservas, Odoo como sistema de gestión, **GitHub (Microsoft) como plataforma donde se ejecutan los programas
> de automatización del asistente**, y Google (Analytics)…

## Texto propuesto — encabezado
> Versión 1.3 · Vigente desde **[fecha que decida gerencia]**

## Decisiones que son de gerencia (no las tomé yo)
1. Fecha de vigencia y aprobación del texto (idealmente con revisión jurídica).
2. Si se ofrece a los titulares la opción de «no ser procesado por el asistente» (el texto propuesto la ofrece).
3. Si se agrega una referencia de conservación/retención de los mensajes (hoy la política no fija plazos; no se inventó ninguno).
4. Publicar **antes** de habilitar cualquier respuesta automática o de procesar mensajes de terceros.
