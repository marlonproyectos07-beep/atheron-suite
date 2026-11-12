# ATH-MOBILE-002 — Conexión privada ChatGPT–Atheron (solo lectura)

Estado de esta fase: código MCP y pruebas en rama de trabajo. No fusionado ni desplegado a producción.

## Herramientas MCP expuestas

- `get_atheron_status`: conteos y alertas anonimizados de conciliación Smoobu–Odoo.
- `get_room_occupancy(date)`: estado de ocupación de las cinco habitaciones físicas para una fecha.
- Ambas herramientas se marcan `readOnlyHint=true` y `destructiveHint=false`.
- No hay herramientas para crear, modificar o cancelar reservas, clientes, pedidos, pagos, facturas, asientos ni mensajes.
- La consulta de ocupación no certifica disponibilidad para vender. Antes de ofrecer una habitación debe verificarse la disponibilidad oficial de Smoobu.

## Seguridad de la prueba

- Endpoint: `POST /api/mcp`, transporte MCP Streamable HTTP sin estado.
- Solo se habilita cuando `VERCEL_ENV=preview`; en producción responde 404.
- Vercel Deployment Protection permanece habilitada.
- El header `x-vercel-protection-bypass` es verificado dos veces: primero por Vercel y luego por el recurso MCP.
- El endpoint nunca devuelve PII, documentos de huéspedes, valores de reservas, pagos ni saldos bancarios.
- `GET /api/pair` existe solo en Preview y está detrás de Vercel SSO; revela la clave de conexión al propietario autenticado para copiarla al conector privado.
- La clave se puede revocar desde Vercel; no se guarda en el repositorio ni en el paquete del plugin.
- La configuración de credenciales de Smoobu/Odoo en Vercel Preview es independiente de GitHub Actions. Los secretos de GitHub no se copian automáticamente.

## Configuración de Preview pendiente

Variables requeridas:
- `SMOOBU_API_KEY`
- `SMOOBU_API_SECRET`
- `ODOO_API_KEY`
- `ODOO_BASE_URL`
- `ODOO_DATABASE`
- `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel lo inyecta cuando se habilita el bypass como variable de entorno).

La rama Preview debe tener las credenciales reales de lectura. No se deben copiar a Production para esta prueba.

## Criterios de aceptación

1. CI valida el servidor MCP y sus dos herramientas.
2. El endpoint Preview está protegido por Vercel SSO más clave de acceso.
3. ChatGPT descubre las herramientas y ejecuta consultas reales sin modificar datos.
4. Las respuestas contienen únicamente resúmenes anónimos.
5. Production sigue respondiendo 404 en `/api/mcp`; no se promueve ni fusiona nada sin autorización adicional.

## Prueba desde ChatGPT

Después de instalar el plugin privado:
1. Abrir `/api/pair` en el dominio Preview, autenticarse con Vercel SSO y copiar la clave.
2. Configurar esa clave como API key con header personalizado `x-vercel-protection-bypass`.
3. Consultar estado general y ocupación por fecha.
4. Verificar que no hay herramientas de escritura disponibles.

No introducir la clave en el chat, prompts, issues, commits ni logs.
