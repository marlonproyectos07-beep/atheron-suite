# ATH-PMS-WA-068 — Primera respuesta real por WhatsApp (preparación, SIN envío)

## Mecanismo
`src/whatsapp-agent-sender.mjs` (`OdooWhatsAppSendOnce`) envía **un** mensaje por la cuenta WhatsApp 7 (Odoo), a través de la
conversación existente con el teléfono autorizado (canal Odoo 256, número terminado en 9866). Es el mismo camino que usó el envío
manual de ATH-056/057 (mensaje de tipo `whatsapp_message` en ese canal), por lo que no requiere token de Meta en el repositorio.

- `planSend()` es **solo lectura**: ejecuta las verificaciones, consulta Smoobu (1 solicitud) y devuelve el texto exacto, su SHA-256
  y la llamada que haría. Nunca envía.
- `sendOnce()` está **desarmado**: exige a la vez (1) la frase exacta de autorización de gerencia, (2) el SHA-256 del texto aprobado,
  (3) todas las verificaciones en verde, (4) que el texto regenerado coincida con el aprobado y (5) reservar un marcador
  `ATH-SEND once=<wamid>` en el canal interno 257 **antes** de enviar. Si falla el envío no se reintenta solo.
- El workflow solo expone la **simulación** (`whatsapp-agent-send-sim`). No existe modo de envío real en el workflow ni en scripts.

## Controles (todos deben estar en verde)
canal de WhatsApp de la cuenta 7 · número destino = +57 320 285 9866 (único permitido) · ventana de 24 h vigente según Odoo y según el
último entrante, con 30 min de margen · el último entrante es exactamente el mensaje aprobado (wamid) · ningún saliente posterior a
ese entrante · sin marcador de envío previo · disponibilidad Smoobu sin precio verificado (no se cita ninguna tarifa) · texto sin cifras de precio.

## Reglas de Meta consideradas
Mensaje de texto libre dentro de la ventana de servicio de 24 h iniciada por el cliente; sin plantilla, sin contenido promocional,
sin enlaces; destinatario que ya escribió primero. Fuera de la ventana no se envía (se bloquea el control).

## Pruebas
`test/whatsapp-agent-sender.test.mjs` (5 pruebas): redacción, simulación sin escrituras, negativas de `sendOnce`, 9 controles que
bloquean, y envío autorizado simulado (marcador + un único envío). Total del conector: 420/420.
