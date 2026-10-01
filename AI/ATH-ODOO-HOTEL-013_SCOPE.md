# ATH-ODOO-HOTEL-013 — WHATSAPP NATURAL CONVERSATION

Estado: INICIADO
Entorno permitido: Preview + Odoo STAGING + Meta TEST
Producción: BLOQUEADA
Base: cierre HOTEL-011, commit 19ad4277bdf82dc0375b02b12f4a9f59ab70d00d

## Objetivo

Evolucionar HOTEL-011 desde frases exactas de allowlist hacia conversación natural por WhatsApp, sin perder control operativo ni autoridad de Odoo.

Principio rector:

> La IA conversa. Odoo decide.

La conversación puede interpretar lenguaje natural, pedir datos faltantes y presentar disponibilidad real. Odoo sigue siendo la fuente de verdad para disponibilidad y, cuando se autorice en un gate futuro, tarifas y reservas.

## Alcance del gate

Permitido:
- Meta TEST
- remitente TEST autorizado
- Preview de la rama HOTEL-013
- Odoo STAGING
- consultar disponibilidad
- mantener contexto conversacional
- pedir al cliente fechas faltantes
- pedir número de huéspedes faltante
- entender variantes naturales equivalentes
- responder opciones confirmadas por Odoo
- deduplicar eventos de WhatsApp
- observabilidad sin PII innecesaria

No permitido:
- Production
- clientes reales
- HOLD
- crear reserva
- cobrar
- registrar pagos
- descuentos autónomos
- cancelar reservas
- modificar tarifas
- cambiar inventario manualmente
- publicar la app Meta
- ampliar a Atheron Security

## Conversaciones mínimas que deben pasar

### Caso A — mensaje completo
Cliente:
"Necesito una habitación para dos personas del 10 al 12 de noviembre."

Esperado:
1. interpretar fechas + 2 huéspedes;
2. consultar Odoo STAGING;
3. responder solo opciones reales disponibles.

### Caso B — falta salida
Cliente:
"Necesito habitación para dos mañana."

Esperado:
1. detectar check-in y huéspedes;
2. NO inventar checkout;
3. preguntar cuántas noches o fecha de salida;
4. al recibirla, consultar Odoo.

### Caso C — falta huéspedes
Cliente:
"Quiero alojamiento del 10 al 12 de noviembre."

Esperado:
1. conservar fechas;
2. preguntar cuántas personas;
3. al recibir huéspedes, consultar Odoo.

### Caso D — lenguaje coloquial
Cliente:
"Somos una pareja y queremos quedarnos este fin de semana."

Esperado:
1. resolver huéspedes=2;
2. resolver fechas solo si la interpretación es inequívoca;
3. si hay ambigüedad, preguntar;
4. nunca inventar fechas.

### Caso E — mensaje desconocido
Cliente:
"Hola, necesito información."

Esperado:
- respuesta corta de aclaración;
- ninguna consulta a Odoo hasta reunir datos mínimos.

## Criterios de aceptación

1. Ya no depende de coincidencia exacta de una frase permitida.
2. El gate de seguridad sigue limitando remitente, Phone Number ID, Preview y TEST.
3. Una conversación multi-turn conserva datos ya confirmados.
4. Odoo solo se consulta cuando existen:
   - check-in,
   - check-out,
   - número de huéspedes.
5. Cada consulta real registra:
   - ODOO_STEP started
   - ODOO_STEP success/error
6. La respuesta saliente registra HTTP sin secretos.
7. No se registra payload Meta completo, token, firma, teléfono completo ni PII innecesaria.
8. Duplicados de Meta no provocan una segunda consulta Odoo.
9. Tests y build deben pasar antes de prueba real.
10. Una única prueba end-to-end TEST debe demostrar conversación natural multi-turn.

## Diseño recomendado

Separar dos gates:

### Gate de transporte/seguridad
Debe seguir siendo estricto:
- Preview HOTEL-013
- número TEST autorizado
- phone_number_id autorizado
- firma Meta válida
- outbound TEST habilitado

### Gate de lenguaje
No usar allowlist por frase exacta.
El texto autorizado del remitente TEST pasa a NLU/conversation-engine.
La NLU puede reconocer variantes; si falta información, pregunta.
No se amplían permisos comerciales.

## Persistencia

Para este gate puede mantenerse el estado conversacional actual solo si la prueba se hace en una misma instancia y se documenta la limitación.

Antes de producción, el estado conversacional debe persistirse externamente para tolerar cold starts/múltiples instancias.

## Plan de ejecución

1. Auditar el gate exacto de HOTEL-011 y separar seguridad de contenido.
2. Sustituir la allowlist de texto por autorización basada en remitente + entorno.
3. Ampliar tests de NLU para lenguaje natural y turnos incompletos.
4. Mantener availability-only.
5. Ejecutar tests + build.
6. Crear Preview HOTEL-013.
7. Hacer pruebas sintéticas.
8. Autorizar una sola conversación real TEST multi-turn.
9. Cerrar gate con evidencia.

## Definition of Done

HOTEL-013 termina cuando un usuario TEST puede escribir una solicitud natural no preacordada, el asistente pide de forma segura lo que falte, consulta Odoo STAGING al completar los datos y responde una opción real, sin HOLD/reserva/pago ni intervención manual.
