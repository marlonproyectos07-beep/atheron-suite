# ATH-MOBILE-002 — Conexión privada ChatGPT–Atheron (solo lectura)

## Estado

- Servidor MCP Streamable HTTP y API REST de lectura en rama de trabajo.
- PR #117 sigue en borrador y se apila sobre PR #115 (ATH-MOBILE-001).
- CI de la rama: 24/24 pruebas aprobadas en la última ejecución.
- No fusionado a `main`; no se habilitaron escrituras ni operaciones productivas.
- La conexión de extremo a extremo requiere credenciales seguras en el backend y el plugin privado de ChatGPT.

## Interfaces

### MCP
- `POST /api/mcp`
- `get_atheron_status`: resumen anonimizado de conciliación Smoobu–Odoo.
- `get_room_occupancy(date)`: estado anonimizado de las cinco habitaciones para una fecha.
- Herramientas marcadas `readOnlyHint=true`, `destructiveHint=false`.

### REST para plugin privado
- `GET /api/status`: conteos y alertas de conciliación.
- `GET /api/occupancy?date=YYYY-MM-DD`: ocupación anonimizada por habitación.
- Ambas rutas requieren `Authorization: Bearer` y configuración completa del backend.
- Las respuestas no incluyen nombres, correos, teléfonos, documentos, importes, pagos ni saldos bancarios.

## Seguridad y alcance

- Vercel Preview permanece separado de producción y protegido por Deployment Protection.
- La clave Bearer de aplicación es independiente de cualquier bypass de Vercel.
- Las credenciales Smoobu/Odoo deben residir en un almacén cifrado del backend; nunca en el repositorio, frontend, issues, logs ni conversaciones.
- Smoobu se consulta solo por GET con firma HMAC.
- Odoo JSON-2 se consulta únicamente mediante `fields_get` y `search_read`.
- `runDaily` mantiene `WRITES_ENABLED=false` y `RELEASE_UNLOCKED=false`.
- La ocupación no certifica disponibilidad comercial; antes de vender se debe verificar la disponibilidad oficial en Smoobu.
- No existen herramientas para crear, modificar o cancelar reservas, clientes, pedidos, pagos, facturas, asientos ni mensajes.

## Configuración requerida

Variables secretas del backend:
- `SMOOBU_API_KEY`: API key real de Smoobu.
- `SMOOBU_API_SECRET`: secreto HMAC real de Smoobu.
- `ODOO_API_KEY`: clave API JSON-2 de Odoo.
- `ATHERON_MOBILE_CHATGPT_TOKEN`: token Bearer exclusivo para la conexión privada de ChatGPT.

Valores no secretos fijados por el conector:
- Odoo base URL: `https://atheron1.odoo.com`.
- Odoo database: `atheron1`.
- Smoobu base URL: `https://login.smoobu.com`.

Nota: los secretos Smoobu existentes en GitHub Actions están históricamente intercambiados por nombre. Al introducirlos en el backend, se deben colocar por su significado real, no copiar los nombres históricos literalmente.

## Criterios de aceptación

1. CI de código y pruebas de seguridad aprobadas.
2. Backend con secretos cifrados y token de ChatGPT configurado.
3. Consultas reales Smoobu/Odoo exitosas, de solo lectura.
4. Plugin privado descubre ambas operaciones REST.
5. Primera consulta desde ChatGPT ejecutada y verificada sin escrituras.
6. Producción permanece intacta. Cualquier operación de escritura exige autorización específica posterior.
