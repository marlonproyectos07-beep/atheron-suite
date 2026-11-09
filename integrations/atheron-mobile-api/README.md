# ATHERON MOBILE — pasarela HTTPS segura (PR de prueba)

Estado: **implementado en rama de pruebas, NO desplegado ni activado**. No equivale a una sesión móvil conectada con ChatGPT o Claude.

## Diseño
- Proyecto Vercel SEPARADO del sitio web público; rootDirectory: `integrations/atheron-mobile-api`.
- GET /api/health: sin información privada, no anuncia servicios vivos ni secretos.
- GET /api/status: requiere encabezado `Authorization: Bearer <token>` y variables secretas; consulta realmente Smoobu y Odoo con los clientes existentes **solo lectura**; devuelve conteos anonimizados, fecha/hora, ventana y alertas, nunca huéspedes ni saldos.
- Métodos de escritura: rechazados. Sin CORS. No incluir ningún token en JS de navegador, URL ni repositorio.
- Falta completar autorización OAuth/MCP para clientes ChatGPT y Claude. **No distribuir el token Bearer en chats.** Operación de móviles exige canal autenticado y HTTPS.
- En preview, si no se han configurado variables, devuelve `CONFIGURACION_PENDIENTE`; el estado HTTP no significa que la API real funcione.

## Variables de entorno SOLO en el proyecto de backend
`ATHERON_MOBILE_READ_TOKEN` (nuevo token aleatorio, mínimo 32 caracteres);
`SMOOBU_API_KEY`, `SMOOBU_API_SECRET`, `ODOO_API_KEY`, `ODOO_BASE_URL`, `ODOO_DATABASE`.

Los valores de GitHub Actions ya existentes **no se trasladan automáticamente a Vercel**. No leerlos ni copiarlos por conversación; pasar únicamente por almacén seguro, permisos de mínimo privilegio. Las dos variables Smoobu históricamente intercambiadas en GitHub NO se deben intercambiar a ciegas en Vercel: introducir el par con nombres correctos.

## Probar
```sh
node --test test/*.test.mjs
```
Además, desde `../smoobu-odoo-connector`: `node --test test/mobile-readonly.test.mjs test/mobile-intent.test.mjs`.

## Pasos pendientes para prueba real desde teléfono
1. Aprobar revisión de seguridad y crear proyecto de backend separado en el equipo Vercel Hobby, sin alterar el sitio público.
2. Configurar secretos exclusivamente en Vercel (preview). No mostrar ni guardar valores en GitHub ni conversaciones.
3. Verificar GET health desde la nube, luego GET status con autentificación y comprobar fecha/hora real y cero escrituras.
4. Instalar conexión privada compatible (OAuth/MCP) en ChatGPT y Claude: requiere autorización interactiva del propietario, no se puede asumir.
5. Añadir consultas detalladas por reserva/disponibilidad con controles de permisos, sin PII pública.
6. Crear después un PR independiente para escrituras, solo tras pruebas y autorización de gerencia.

**No fusionar a main, no activar escrituras, no importar movimientos bancarios automáticamente.**

## Piloto intermedio real desde ChatGPT y Claude (GitHub Actions)

Mientras se configuran las credenciales de Vercel, existe una vía **sin navegador remoto ni portátil** de lectura bajo demanda mediante GitHub Actions:

- Workflow: `.github/workflows/ath-mobile-readonly-live.yml` (solo push de `requests/consulta.json` en esta rama).
- Archivo de petición: `requests/consulta.json` con `operacion=CONSULTAR_OCUPACION`, una fecha ISO `YYYY-MM-DD` y un `idSolicitud` técnico. **Nunca** nombres, documentos, correos ni montos.
- GitHub Actions utiliza los secretos ya configurados para efectuar GET de Smoobu y `search_read` de Odoo. La salida `ATHERON_MOBILE_READONLY_RESULT` solo incluye las cinco habitaciones, estado de reservas activas listadas, alertas agregadas y hora de consulta.
- **No** afirma disponibilidad para vender; un cuarto sin reserva listada puede estar bloqueado o tener una discrepancia de canal. Debe consultarse disponibilidad oficial antes de nuevas ventas.
- El flujo no tiene métodos de escritura y no altera reservas, pagos, cotizaciones ni contabilidad. Los logs del repositorio son públicos y solo deben contener códigos de habitación, fechas y estados genéricos.

Pruebas en vivo efectuadas desde ChatGPT el 09/11/2026:
- [Consulta del 10/11 — success](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/42661918780)
- [Consulta del 11/11 — success](https://github.com/marlonproyectos07-beep/atheron-suite/actions/runs/42662312716)

**Limitación:** es una ruta provisional basada en GitHub Actions, no el conector MCP final de ChatGPT ni el endpoint seguro configurado de Vercel. Claude podrá consultar los mismos resultados y reutilizar el workflow de solo lectura existente, pero su capacidad de activar nuevas peticiones desde su sesión depende de su acceso GitHub. No almacenar claves o respuestas con PII en issues/commits/logs.

