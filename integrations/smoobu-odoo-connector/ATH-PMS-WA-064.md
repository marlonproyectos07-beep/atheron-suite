# ATH-PMS-WA-064 — Agente conectado a Odoo y Smoobu (solo borradores)

Apilado sobre PR #110 (incluye #107–#109 y el agente en sombra de WA-063). No fusionar ni desplegar sin autorizacion.

## Evento que se procesa
No se crea webhook nuevo. Meta ya entrega al webhook existente de Odoo (`/whatsapp/webhook`); Odoo registra cada mensaje como `whatsapp.message` con `message_type=inbound`, `wa_account_id=7`, `msg_uid` (wamid), `mobile_number`, `body`. El agente lee esos registros (JSON-2, solo lectura) en lugar de recibir un segundo webhook.

## Flujo (`src/whatsapp-agent-runner.mjs`)
1. Lee entrantes de la cuenta 7 de las ultimas 48 h (y descarta por codigo cualquier otra cuenta).
2. Reconstruye el estado releyendo la conversacion (sin base de datos propia) y deduplica por `msg_uid`.
3. Falta informacion -> pregunta; ambiguo/fuera de alcance -> derivar a recepcion; completo -> `getCurrentUser` + `checkApartmentAvailability` (5 habitaciones fijas).
4. Capacidad (1 huesped) y precios: se respetan; sin precio verificado no se cotiza.
5. Publica el BORRADOR como nota en un canal interno de Odoo (`message_post`), con etiquetas `ATH-AGENT msg=<wamid>` para deduplicar. Se rechaza un canal de WhatsApp. Telefono enmascarado.
6. Nunca envia WhatsApp, no escribe `whatsapp.message`, no crea reservas, pedidos, pagos ni facturas.

## Puesta en marcha (requiere autorizacion y accion de Marlon)
1. Odoo -> Conversaciones -> crear canal interno privado «Borradores Agente» (solo gerencia). Anotar su ID.
2. GitHub -> Settings -> Variables: `WHATSAPP_AGENT_DRAFT_CHANNEL_ID` = ID del canal.
3. Ejecutar el modo `whatsapp-agent-draft` de `smoobu-odoo-diagnose` (primero con `post_drafts` vacio = simulacion; luego `1`). Para que aparezca el boton el workflow debe estar en `main` (o usar el disparador temporal por commit usado en #109/#110): ambas opciones requieren autorizacion.
4. Sin `WHATSAPP_AGENT_ARM` el script no hace nada (`NOT_ARMED`).

## Excepciones de guardia que revisar
- `test/p0.test.mjs`: se agrega `odoo-draft-writer.mjs` a los archivos autorizados a usar `_request` (unica escritura: `message_post` en un canal interno verificado).
- El workflow `smoobu-odoo-diagnose.yml` gana un modo y una entrada; no cambia disparadores ni secretos.

## No verificado
- Que la clave `ODOO_API_KEY` tenga permiso de lectura sobre `whatsapp.message` y de publicar en el canal (JSON-2 depende del plan de Odoo).
- Que Odoo reciba el campo `msg_uid` relleno en cada entrante.
