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
