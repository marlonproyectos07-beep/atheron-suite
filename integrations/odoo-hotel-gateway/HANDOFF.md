# ATH-ODOO-HOTEL-011 — relevo Codex (2026-09-30)

## Checkpoint

- Rama: `feature/ath-odoo-hotel-011-whatsapp-controlled-pilot`.
- Inicio: `5d952eb` (informe de Claude en `AI/ATH-ODOO-HOTEL-011_GATEWAY-RENDER-LIVE_2026-09-30.md`).
- El informe previo documenta una cadena real Vercel Preview -> Render -> Odoo STAGING, quote y un HOLD TEST `22232` liberado. Codex no repitió el HOLD.
- `PROJECT_STATE.md` y `TASKS.md` no existen en la raíz. Este archivo es el relevo vigente.

## Verificado por Codex

- Render STAGING público: `https://atheron-hotel-gateway-staging.onrender.com/health` respondió 200 `status:ok`; `/ready` respondió 200 `ready:true`; POST con credenciales inválidas respondió 401 `UNAUTHORIZED`.
- Vercel Preview `https://atheron-suite-pl20ktei7-marlon-atheron.vercel.app`: `/api/hotel/health` respondió 200, `/api/hotel/availability` respondió 200 con `requested_available:true` para 201, 2026-11-03 a 2026-11-04, 2 huéspedes. GET del webhook con token inválido respondió 403; POST sin firma respondió 401. Esta es evidencia nueva de lectura a través de Preview, pero no demuestra por sí sola el alcance exacto de las variables de entorno en Production.
- Tras subir `b9fe8f9`, Vercel creó el Preview `https://atheron-suite-41yd114hv-marlon-atheron.vercel.app` (deployment `dpl_wbFxdremhPGMBxrhgit67wgm9XHf`, target Preview, estado READY). Codex confirmó nuevamente health 200, availability 200 con `requested_available:true` para la misma consulta, GET inválido 403 y POST sin firma 401. El nuevo POST firmado con Meta no se probó porque no hay credenciales/autorización Meta.
- Tras login humano de Marlon, el panel de Vercel confirmó que `HOTEL_GATEWAY_BASE_URL`, `HOTEL_WEB_AGENT_ID`, `HOTEL_WEB_AGENT_KEY`, `META_APP_SECRET`, `META_WABA_ID`, `META_PHONE_NUMBER_ID` y `META_VERIFY_TOKEN` tienen alcance **Preview** solamente. Sus valores son secretos ocultos en el panel; Codex no los reveló. En ese momento `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_TEST_SEND_ENABLED` aún no aparecían configurados. Otras variables de KV/Redis son compartidas Production+Preview, pero son ajenas a HOTEL-011 y no se tocaron. El deployment `f52f4f7` también llegó a READY.
- El ajuste de alias quedó en `d6ffe29` (Preview READY). El ajuste de versión Meta quedó en `844f25d`: Preview `https://atheron-suite-4ttwzb2bk-marlon-atheron.vercel.app`, estado READY, `/api/hotel/health` 200. Vercel seguía mostrando Production en `c0a577` (`main`), sin cambio por este trabajo.
- El cambio de alcance estricto quedó en `ac4723e`: mensaje exacto y remitente TEST autorizados, `META_PHONE_NUMBER_ID` TEST y herramientas de solo disponibilidad. En Vercel, el CEO guardó `WHATSAPP_ACCESS_TOKEN` como Secret para Preview de esta rama, actualizó `META_PHONE_NUMBER_ID` con el ID TEST como Secret Preview y guardó `WHATSAPP_TEST_ALLOWED_FROM` como Secret Preview. Codex verificó únicamente los nombres, tipos y alcances en el panel, sin leer valores. Codex configuró `WHATSAPP_TEST_SEND_ENABLED=true` como Config solo para Preview de esta rama. Falta un nuevo despliegue Preview para que esas variables entren en la función.
- Draft PR [#73](https://github.com/marlonproyectos07-beep/atheron-suite/pull/73) abierto de HOTEL-011 hacia la rama HOTEL-009; no se hizo merge.
- Gateway: `npm test` 311/311 después del cambio; simulador WhatsApp v2 30/30. Build web completo con `ASTRO_TELEMETRY_DISABLED=1`. El primer intento de build fue bloqueado por el sandbox, los siguientes tuvieron éxito con permiso para escribir archivos generados en la raíz.
- Respaldo `AI/staging-backup/`: 13 JSON válidos con los conteos documentados y ZIP de Studio con 6 entradas legibles. No se realizó una restauración en una base nueva. El README contiene una discrepancia menor: dice 69 acciones de servidor en la clasificación, pero el archivo y la tabla registran 81.
- Modo Ángela: los tests locales de Kanban, disponibilidad, reserva, finanzas y bloqueo cruzado pasaron dentro de la suite. No se repitió un ciclo operacional en Odoo STAGING. El script de creación de usuario existe, pero requiere el correo real de Ángela.

## Cambio de código

`WhatsAppCloudProvider.receiveMessage()` y el orquestador consultaban el mismo `Set` de deduplicación. El proveedor marcaba el primer mensaje antes de entregarlo, y el orquestador lo descartaba. Ahora el proveedor mantiene un registro de reintentos de transporte independiente. Prueba integrada: primer mensaje llega al orquestador una vez; segundo payload idéntico se descarta; no hay llamada a Meta. El adaptador también rechaza respuestas HTTP fallidas de Meta sin mostrar su cuerpo.

El webhook de Astro ahora devuelve 503 antes de procesar un POST firmado si falta la salida Meta o la configuración del Gateway. El envío requiere `WHATSAPP_TEST_SEND_ENABLED=true`, `WHATSAPP_ACCESS_TOKEN` server-side y un ID de número. Tras auditar Preview se ajustó el código para aceptar el `META_PHONE_NUMBER_ID` ya configurado, además de `WHATSAPP_PHONE_NUMBER_ID`; no se duplicó ni reveló su valor. Las variables TEST fueron guardadas después del último despliegue y requieren uno nuevo. GET de verificación continúa disponible.

La [tabla oficial de Meta](https://developers.facebook.com/docs/graph-api/changelog/versions/) indica que Graph API `v20.0` caducó el 2026-09-24. La [referencia oficial de WhatsApp Message API](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api) presenta `v25.0` como versión seleccionada. Se actualizó la ruta del adaptador de `v20.0` a `v25.0`; su prueba focalizada pasó 12/12 y el build web local pasó. No hubo llamada real a Meta.

## Pendientes y límites

- El código de `ac4723e` está desplegado en un Preview READY anterior al guardado de las variables Meta TEST. La ruta protegida con firma válida todavía no fue comprobada por HTTP.
- Meta aún no está conectado: las variables se guardaron en Vercel Preview, pero el nuevo despliegue, la suscripción del webhook y las pruebas reales siguen pendientes. Después de conectar Meta, el ACK tras un error de envío y la persistencia de deduplicación/conversación entre instancias serverless aún requieren una decisión técnica para un piloto con HOLD; no basta la memoria del proceso. Limitar el primer mensaje TEST a una consulta sin HOLD. El handler `HUMAN_REQUIRED` aún no tiene canal operativo para avisar a Ángela.
- El texto TEST anterior de la habitación 201 quedó reemplazado por el mensaje exacto autorizado por el CEO en el próximo gate. No se ha enviado ningún mensaje real. Usar solamente números emisor/destinatario TEST autorizados.
- El alcance Preview de las variables HOTEL-011 quedó verificado en el panel autenticado. El valor exacto de `HOTEL_GATEWAY_BASE_URL` no es visible (Vercel lo trata como Secret); la cadena real de availability del Preview hacia STAGING se verificó por HTTP. No tocar Production.
- Quote por Render y cleanup del HOLD constan en `AI/ATH-ODOO-HOTEL-011_GATEWAY-RENDER-LIVE_2026-09-30.md`; no se repitieron con credencial válida en este relevo. El PR #73 es Draft y sigue sin merge.
- La expiración de Odoo STAGING fue advertida como aproximadamente 7 días el 2026-09-30. El respaldo reduce pérdida de artefactos, pero no equivale a una restauración completa. No se compró suscripción ni se migró a Production.
- `.playwright-mcp/` era una carpeta preexistente sin seguimiento; conservarla.

## Próximo gate

1. El CEO autorizó el 2026-09-30 un único primer mensaje real de disponibilidad: `Hola, necesito alojamiento del 10 al 12 de noviembre para 2 personas.`. La NLU anterior no entendía ese rango; ahora lo resuelve como 2026-11-10 a 2026-11-12, 2 huéspedes. El webhook del piloto usa solo `checkAvailability`; no expone `quote`, `createHold` ni `status`. Rechaza por alcance cualquier texto, remitente o `phone_number_id` distinto del TEST autorizado. Suite local: 316/316; build web: PASS. Ningún mensaje real se envió.
2. Publicar un nuevo despliegue de esta rama en Preview y verificar que es Preview antes de cualquier prueba. El CEO ya ingresó token, Phone Number ID TEST y remitente TEST en los campos correspondientes; Codex verificó sus alcances y activó el interruptor exclusivamente para Preview de esta rama. Después, acceder a Meta TEST para suscribir/probar el webhook. Si Meta pide login, 2FA o reingresar un secreto, detenerse en ese campo y guiar una acción humana a la vez. No mostrar ni copiar secretos en chat/logs. Probar GET válido, POST firmado real, deduplicación y el único mensaje autorizado cuando el flujo esté listo.
3. Resolver persistencia y ACK antes de habilitar HOLD por WhatsApp. Correo real de Ángela solo para crear su usuario. Decisión separada sobre preservación de STAGING antes de la expiración.
4. Nunca usar Production, clientes/números reales, Booking/Airbnb ni otras OTAs para esta prueba.
