# ATH-PMS-WA-059 — piloto conversacional en sombra, cinco habitaciones

Este PR depende del PR #107 (consulta rates de solo lectura). No fusionar independientemente ni activar envíos.

## Flujo implementado — simulación aislada
1. Mensaje entrante simulado de la cuenta ID 7 (Atheron Hotels).
2. Extractor determinista y acotado de **fechas ISO**, “hoy/mañana/pasado mañana”, noches y personas. Los datos ambiguos se derivan a humano.
3. Estado de conversación opcional y deduplicación por messageId, sin base de datos todavía.
4. Si faltan datos, prepara borrador de saludo/pregunta. **No envía**.
5. Si está completa, entrega una **propuesta de lectura de Smoobu** para exactamente cinco IDs. **No ejecuta la consulta**.
6. Con una respuesta simulada de rates, produce borrador PRELIMINAR para revisión humana. Nunca muestra precio comercial final ni promete disponibilidad.
7. No se habilita enviar, escribir en Odoo ni reservar en Smoobu. Casa Completa, Carrera 19 y otras propiedades no se consultan.

## Comprobación local / CI
`npm test` (unitario sin red); `node scripts/whatsapp-shadow-demo.mjs` (ejecución demostrable con datos ficticios).

## Puertas pendientes para una integración real
- Probar `GET /api/rates` con parámetros reales, autenticar HMAC y validar forma, disponibilidad, moneda, precios y restricciones.
- Verificar capacidad por habitación, reglas de ocupación, impuestos, extras y tarifas finales.
- Conectar eventos a través de **un solo** mecanismo autorizado de Odoo/WhatsApp; no generar webhook paralelo ni poner una URL pública nueva sin diseño. Confirmar deduplicación y persistencia segura.
- Probar reservas Smoobu → Odoo en modo sombra, respetando el bloqueo #101; no crear pedidos, slots o pagos hasta autorización explícita.
- Antes de envíos automáticos, configurar la atención según la ventana de servicio y política de Meta/WhatsApp, con aprobación de gerencia y controles de salida.
