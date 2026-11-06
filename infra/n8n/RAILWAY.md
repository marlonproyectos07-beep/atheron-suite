# ATH-AI-004 — Evaluación de Railway

Estado: conexión de Railway a ChatGPT pendiente. No se ha creado servicio ni facturación.

## Diferencia entre entornos

El archivo compose.yaml de esta carpeta está diseñado para un servidor Linux con Docker Compose. **Railway utiliza servicios y volúmenes propios**; no se debe asumir que Railway ejecutará ese archivo automáticamente.

## Ruta en Railway (solo después de confirmar acceso y costes)

1. Revisar en Railway los proyectos y servicios existentes, región, estado, volúmenes, límites de consumo y alertas de seguridad.
2. Comparar reutilización de servicio existente con la plantilla oficial de n8n de Railway; no crear recursos si hay coste sin autorización.
3. Separar n8n y PostgreSQL como servicios gestionados por Railway, con red interna y almacenamiento persistente.
4. Almacenar configuración sensible mediante la herramienta segura de variables de Railway. No introducir valores reales en GitHub.
5. Exponer el editor por HTTPS solamente después de establecer autenticación, copias de seguridad y revisión de acceso. Evitar webhooks públicos en pruebas iniciales.
6. Importar ATH-AI-004-smoke.json como flujo inactivo y ejecutarlo manualmente con datos ficticios.
7. Verificar que el resultado sea OK_STAGING antes de estudiar credenciales Odoo de solo lectura.

No habilitar reservas, cobros, contabilidad, OTA ni WhatsApp.

Fuentes:
- https://docs.railway.com/guides/n8n
- https://docs.railway.com/volumes/reference
- https://docs.n8n.io/hosting/installation/server-setups/docker-compose/
