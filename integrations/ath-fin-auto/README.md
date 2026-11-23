# ATH-FIN-AUTO-001 — piloto bancario móvil, solo lectura

**Estado: prototipo en rama y PR borrador. No instalado, ni fusionado, ni conectado a Odoo.**

Objetivo final: desde el celular (ChatGPT como canal principal), recibir alertas bancarias,
identificar cuál operación corresponde a ATHERON, verificarla contra bancos y Odoo,
solicitar concepto y aprobación del responsable, y devolver el enlace del documento.

## Primera entrega (este PR)

Módulo puro `src/alert-readonly.mjs` que recibe texto de una alerta ya consultada
por un canal autorizado y devuelve un registro mínimo de revisión:

- Tipo: transferencia saliente, QR entrante, retiro, ingreso o aviso no financiero.
- Importe COP y últimos cuatro dígitos solo cuando son explícitos.
- Etiqueta tentativa de cuenta empresarial *0136, no confirmación de titularidad.
- Fecha **de recepción de Gmail**, no fecha certificada por el banco.
- La operación nunca aparece como PAGADA, CONFIRMADA o CONTABILIZADA.
- Huella SHA-256 del ID de Gmail para identificar la misma alerta repetida.
- Colisiones por cuenta/importe/día únicamente como *posibles* duplicados;
  no descartar ni unir movimientos distintos sin referencia bancaria oficial.
- No devuelve cuerpos, nombres de contrapartes, direcciones de correo, enlaces,
  fotos, extractos ni saldos.
- **No realiza llamadas a Gmail, bancos, Odoo ni Smoobu. No escribe nada.**

Las pruebas usan **exclusivamente textos ficticios**, no datos de clientes.

## Siguiente integración (no incluida y no autorizada para escrituras)

1. Conectar Gmail de manera autenticada y con mínimos permisos; consultar un lote pequeño.
2. Separar remitente verificado de simple texto de correo; detectar avisos engañosos o sin cuenta.
3. Cruzar con **extracto bancario oficial** y mayor Odoo, inicialmente solo lectura.
4. Preparar bandeja móvil de revisión: origen, cuenta, dirección, importe, verificación,
   duplicados posibles, concepto pendiente y **cero escrituras**.
5. Incorporar aprobaciones específicas y servicio escritor aislado *solo después*
   de nueva autorización explícita de gerencia.
6. Conservar **Hotels / Security** separados y excluir cuentas personales.

## Seguridad crítica

`PAYMENT_REPORTED != PAYMENT_CONFIRMED != ACCOUNTED`

La alerta de Gmail y el comprobante de WhatsApp **no prueban el recaudo efectivo**.
No asumir que *0136 basta para certificar titularidad del mensaje.
Nunca compensar, contabilizar en transitorias, acreditar a Marlon o marcar pago
recibido por heurística. No registrar facturas DIAN ni emitir pagos.

No publicar muestras reales bancarias en GitHub Actions, logs ni artefactos.
No persistir credenciales ni datos financieros en el repositorio.

## Ejecutar pruebas locales

```sh
cd integrations/ath-fin-auto
npm test
```

El CI ejecuta estas pruebas sin secretos ni acceso a red.


## ATH-WA-INGEST-002 — lector directo de mensajes Odoo (noviembre 2026)

El piloto WhatsApp Hotels ha confirmado en vivo que `whatsapp.message` recibe mensajes entrantes y que se puede identificar el mensaje exacto de prueba mediante `search_count`, sin lectura de conversaciones privadas en logs.

Nuevos módulos:

- `src/whatsapp-classify-readonly.mjs`: clasifica mensajes autorizados como consulta de huésped, prueba, reporte Caja Hotels/Security; **nunca contabiliza**.
- `src/odoo-whatsapp-poller.mjs`: limita toda búsqueda en Odoo desde el servidor usando ID de cuenta explícito, teléfonos de trabajadores autorizados, dirección inbound y fecha UTC. Si faltan cuenta/remitentes, **no consulta cuerpos**. Comprueba otra vez el alcance de cada fila; errores detienen el ciclo sin resultados.
- `src/odoo-whatsapp-reader.mjs`: adaptador JSON-2 con destino fijo `atheron1.odoo.com`, modelo `whatsapp.message`, único método `search_read`, campos y dominio restringidos. No hay operaciones de escritura.
- `test/odoo-whatsapp-poller.test.mjs`, `test/odoo-whatsapp-reader.test.mjs`: pruebas sintéticas, sin credenciales reales.

**No se activa un polling continuo ni se crea una bandeja de datos privados en este PR.** El receptor es invocable, pero aún no tiene un programador y no puede almacenar/consultar resultados desde ChatGPT.

### Requisitos para encender el ciclo automático

1. Configuración cifrada de las cuentas Odoo IDs exactas (Hotels / Security) y lista de teléfonos de remitentes **internos** autorizados en formato exacto como figure en `whatsapp.message.mobile_number`. No extraer teléfonos de huéspedes por heurísticas.
2. Servicio privado persistente o programador autenticado, fuera del repositorio público. La llave Odoo debe tener permisos mínimos de lectura.
3. Registro privado durable de mensajes recibidos y huellas idempotentes, cursor persistente, reintentos, alarmas por falta de cobertura y paginación de lotes.
4. Conexión privada de ChatGPT al registro de eventos, con permisos por negocio.
5. Prueba controlada de dos reportes ficticios desde teléfonos autorizados; cotejar resultado en la bandeja, **cero escrituras**.
6. Solo después de nueva autorización y un ambiente de pruebas: propuesta de asiento, cotejo de Caja Hotels/Odoo y publicación controlada.

La Cloud API de Odoo está probada para **mensajes individuales**. La ingestión del grupo nativo WhatsApp `Cartera Atheron` **NO está conectada** y requiere una solución aparte; no afirmar que el grupo se está monitoreando.

No introducir nunca datos financieros reales, teléfonos, nombres, textos de clientes ni claves en archivos GitHub, artefactos o logs de Actions.
