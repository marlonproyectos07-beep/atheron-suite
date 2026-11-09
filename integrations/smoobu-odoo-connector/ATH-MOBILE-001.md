# ATH-MOBILE-001 — Primer prototipo de consulta móvil (solo lectura)

**Estado:** implementación local propuesta para revisión de PR. **No desplegado**, no integrado todavía en ChatGPT, no conectado a bancos y sin operaciones de escritura.

## Qué hace

- Reutiliza SmoobuClient, OdooJson2Client y runDaily existentes en el conector Smoobu–Odoo.
- Permite GET /v1/status autorizado mediante un token propio. Devuelve fecha UTC, ventana de revisión y **conteos anonimizados** de conciliación y alertas; nunca devuelve nombres, documentos, detalles de reservas, precios o saldos.
- Rechaza cualquier otra ruta o método, incluidos POST/PUT/PATCH/DELETE. No tiene funciones para registrar reservas, facturas o pagos.
- Solo escucha en 127.0.0.1; no hay acceso desde Internet ni desde el celular hasta que se diseñe un frente autenticado y HTTPS aprobado.
- No registra tokens, correos, nombres de huéspedes ni cuerpos de respuesta. En el repositorio público no deben almacenarse datos reales.

## Pruebas

Desde integrations/smoobu-odoo-connector: `node --test test/mobile-readonly.test.mjs` (sin credenciales). Las pruebas verifican token, ruta/método, ausencia de lecturas no autorizadas, lista blanca de campos, y fallo seguro.

## Ejecución local de prueba con APIs reales — exclusivamente con permiso de gerencia

El operador configura **fuera del repositorio**, en el almacén seguro, estas variables: ATHERON_MOBILE_READ_TOKEN (mínimo 32 caracteres aleatorios), SMOOBU_API_KEY, SMOOBU_API_SECRET, ODOO_API_KEY, ODOO_BASE_URL, ODOO_DATABASE y opcionalmente SMOOBU_BASE_URL. Proteger las credenciales y el token independiente. Revisar el estado de las claves del conector, ya que algunas variables históricas estaban intercambiadas; **no invertir automáticamente ni reescribir secretos**. El usuario de Odoo debe poder leer exclusivamente las entidades necesarias. Usar un usuario técnico de mínimo privilegio cuando sea viable.

Comando: `node scripts/mobile-readonly-server.mjs`. El servidor anuncia únicamente ATHERON_MOBILE_READONLY_LOCAL_READY. La llamada local es GET http://127.0.0.1:4317/v1/status con encabezado Authorization: Bearer <token>. La prueba fallará de manera cerrada si las credenciales o los servicios no están disponibles.

**Importante:** no introducir credenciales en la terminal compartida, los logs o chats. No realizar una conexión pública sin HTTPS, autenticación, control de abuso, revocación del token, aislamiento de la red y revisión de seguridad. El prototipo no es un plugin de ChatGPT todavía.

## Camino al celular

1. Verificar pruebas y acceso de solo lectura Smoobu/Odoo (sin modificar entornos ni secretos).
2. Añadir una pasarela segura HTTPS con tokens revocables y controles de tasa, vinculada a usuario autorizado. No exponer el servidor local.
3. Crear el complemento privado de ChatGPT o interfaz móvil aprobada que consuma esa pasarela; habilitar primero consultas de estado, después disponibilidad confirmada con lectura fresca.
4. Probar con datos sintéticos y una reserva de prueba: concurrencia, no-show, cambios de tarifa, idempotencia, desconexiones y permisos.
5. Solo con nueva autorización, diseñar **acciones de escritura** en otro PR, con aprobación de gerencia, libro de transacciones y prevención de duplicados. Nunca inferir pago confirmado de una notificación de Gmail.

## Limitaciones explícitas

- Este endpoint **no muestra disponibilidad certificada** ni saldo de Bancolombia/Nequi/efectivo. Los bancos aún carecen de extracto integrado.
- El runDaily actual consulta a Smoobu y Odoo y puede fallar por permisos o claves; el prototipo devuelve FUENTE_NO_VERIFICABLE en lugar de inventar estados.
- La ejecución programada de smoobu-odoo-sync-scheduled.yml cada dos horas **no significa** que los bancos se sincronicen ni que se creen reservas nuevas en producción.
- No publicar ni fusionar a main sin revisión del PR y autorización.
