# ATH-ODOO-HOTEL-011 — relevo Codex (2026-09-30)

## Checkpoint

- Rama: `feature/ath-odoo-hotel-011-whatsapp-controlled-pilot`.
- Inicio: `5d952eb` (informe de Claude en `AI/ATH-ODOO-HOTEL-011_GATEWAY-RENDER-LIVE_2026-09-30.md`).
- El informe previo documenta una cadena real Vercel Preview -> Render -> Odoo STAGING, quote y un HOLD TEST `22232` liberado. Codex no repitió el HOLD.
- `PROJECT_STATE.md` y `TASKS.md` no existen en la raíz. Este archivo es el relevo vigente.

## Verificado por Codex

- Render STAGING público: `https://atheron-hotel-gateway-staging.onrender.com/health` respondió 200 `status:ok`; `/ready` respondió 200 `ready:true`; POST con credenciales inválidas respondió 401 `UNAUTHORIZED`.
- Vercel Preview `https://atheron-suite-pl20ktei7-marlon-atheron.vercel.app`: `/api/hotel/health` respondió 200, `/api/hotel/availability` respondió 200 con `requested_available:true` para 201, 2026-11-03 a 2026-11-04, 2 huéspedes. GET del webhook con token inválido respondió 403; POST sin firma respondió 401. Esta es evidencia nueva de lectura a través de Preview, pero no demuestra por sí sola el alcance exacto de las variables de entorno en Production.
- Gateway: `npm test` 311/311 después del cambio; simulador WhatsApp v2 30/30. Build web completo con `ASTRO_TELEMETRY_DISABLED=1`. El primer intento de build fue bloqueado por el sandbox, los siguientes tuvieron éxito con permiso para escribir archivos generados en la raíz.
- Respaldo `AI/staging-backup/`: 13 JSON válidos con los conteos documentados y ZIP de Studio con 6 entradas legibles. No se realizó una restauración en una base nueva. El README contiene una discrepancia menor: dice 69 acciones de servidor en la clasificación, pero el archivo y la tabla registran 81.
- Modo Ángela: los tests locales de Kanban, disponibilidad, reserva, finanzas y bloqueo cruzado pasaron dentro de la suite. No se repitió un ciclo operacional en Odoo STAGING. El script de creación de usuario existe, pero requiere el correo real de Ángela.

## Cambio de código

`WhatsAppCloudProvider.receiveMessage()` y el orquestador consultaban el mismo `Set` de deduplicación. El proveedor marcaba el primer mensaje antes de entregarlo, y el orquestador lo descartaba. Ahora el proveedor mantiene un registro de reintentos de transporte independiente. Prueba integrada: primer mensaje llega al orquestador una vez; segundo payload idéntico se descarta; no hay llamada a Meta. El adaptador también rechaza respuestas HTTP fallidas de Meta sin mostrar su cuerpo.

El webhook de Astro ahora devuelve 503 antes de procesar un POST firmado si falta la salida Meta o la configuración del Gateway. El envío requiere `WHATSAPP_TEST_SEND_ENABLED=true` y las credenciales server-side `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`; ninguna de ellas se añadió. GET de verificación continúa disponible.

## Pendientes y límites

- El cambio de código es local hasta que se publique en la rama/Preview. No afirmar que la corrección está desplegada.
- Meta no está conectado: faltan credenciales y el interruptor de prueba está apagado. El POST local ahora falla cerrado con 503 antes de recibir mensajes; el Preview publicado sigue ejecutando el commit anterior hasta un nuevo despliegue. Después de conectar Meta, el ACK tras un error de envío y la persistencia de deduplicación/conversación entre instancias serverless aún requieren una decisión técnica para un piloto con HOLD; no basta la memoria del proceso. Limitar el primer mensaje TEST a una consulta sin HOLD. El handler `HUMAN_REQUIRED` aún no tiene canal operativo para avisar a Ángela.
- Verificar por panel/API de Vercel que `HOTEL_GATEWAY_BASE_URL` y las credenciales se aplican solo a Preview; no se pudo auditar el alcance de las variables con las herramientas disponibles. No tocar Production.
- Quote por Render y cleanup del HOLD constan en `AI/ATH-ODOO-HOTEL-011_GATEWAY-RENDER-LIVE_2026-09-30.md`; no se repitieron con credencial válida en este relevo. `DRAFT_PR = PENDING_NON_BLOCKING` (GitHub CLI no disponible).
- La expiración de Odoo STAGING fue advertida como aproximadamente 7 días el 2026-09-30. El respaldo reduce pérdida de artefactos, pero no equivale a una restauración completa. No se compró suscripción ni se migró a Production.
- `.playwright-mcp/` era una carpeta preexistente sin seguimiento; conservarla.

## Próximo gate

1. Publicar el commit de esta corrección solo en Vercel Preview y verificar su POST sin credenciales (503). Revisar el alcance de variables de Preview. Resolver persistencia y ACK antes de habilitar HOLD por WhatsApp.
2. CEO: acceso/autorización Meta TEST y aprobación explícita antes del primer mensaje real. Correo real de Ángela solo para crear su usuario. Decisión separada sobre preservación de STAGING antes de la expiración.
3. Nunca usar Production, clientes/números reales, Booking/Airbnb ni otras OTAs para esta prueba.
